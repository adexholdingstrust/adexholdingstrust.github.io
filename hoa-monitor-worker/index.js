/* Isolated monitoring service. No finance KV binding and no payment initiation. */
import registry from '../monitoring/county-tax-registry.json' with {type:'json'};
import {HOA_ALERT_RECIPIENTS} from '../monitoring/hoa-rules.js';
import {HOA_PROPERTIES,validateSnapshot,evaluateSnapshot,localDate} from './snapshots.js';
import {fetchValencia} from './valencia.js';
import {financeSummary,financeAccess,financeBridge} from './finance-feed.js';
const MAX_BYTES=100000;
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function readBody(request) {
  const reader=request.body?.getReader();
  if(!reader)return '';
  const chunks=[];let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('too_large');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function authorized(request,body,secret,now=Date.now()) {
  const time=request.headers.get('x-adex-timestamp'),signature=request.headers.get('x-adex-signature');
  if(!secret || !/^\d{10}$/.test(time||'') || Math.abs(now-Number(time)*1000)>300000 || !/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=Uint8Array.from(signature.slice(7).match(/../g),x=>parseInt(x,16));
  return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(time+'.'+body));
}
const snapshotKey=(kind,id)=>`monitor:snapshot:${kind}:${id}`;
async function deliver(env,key,message,now,acceptance=false) {
  if(env.NOTIFICATIONS_ENABLED!=='true' && !acceptance)return 'disabled';
  if(!env.BREVO_API_KEY || !(env.HOA_SENDER_EMAIL||env.EMAIL_FROM))throw Error('Email configuration missing');
  const storageKey='monitor:delivery:'+key;
  const previous=await env.HOA_MONITOR_KV.get(storageKey,'json');
  if(previous?.status==='sent')return 'suppressed';
  if(previous?.status==='pending' && now-Date.parse(previous.updatedAt)<900000)return 'pending';
  const record=status=>JSON.stringify({status,updatedAt:now.toISOString()});
  // KV deduplication is best effort; overlapping invocations can still race.
  await env.HOA_MONITOR_KV.put(storageKey,record('pending'));
  try {
    const res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'api-key':env.BREVO_API_KEY,'content-type':'application/json'},body:JSON.stringify({sender:{email:env.HOA_SENDER_EMAIL||env.EMAIL_FROM,name:'Adex Property Monitoring'},to:HOA_ALERT_RECIPIENTS.map(email=>({email})),subject:message.subject,textContent:message.text})});
    if(!res.ok) {
      let reason='provider_rejected';
      try {
        const data=await res.json(),message=String(data.message||'').toLowerCase();
        if(message.includes('ip') && ['unrecogn','unauthor','not author','whitelist','blocked'].some(x=>message.includes(x)))reason='source_ip_not_authorized';
        else if(['key not found','invalid api key','api key is not enabled','invalid authentication'].some(x=>message.includes(x)))reason='api_key_not_recognized_or_enabled';
      }catch{}
      const error=Error('Email rejected');error.reason=reason;throw error;
    }
    await env.HOA_MONITOR_KV.put(storageKey,record('sent'));return 'sent';
  } catch(error) {await env.HOA_MONITOR_KV.put(storageKey,record('failed'));const failure=Error('Notification delivery failed');failure.reason=error.reason||'delivery_failed';throw failure;}
}
export async function processSnapshot(env,snapshot,now=new Date(),previous=null) {
  const result=evaluateSnapshot(snapshot,now);
  let progressText=null;
  if(snapshot.kind==='hoa'&&result.status!=='stale'&&localDate(new Date(snapshot.observedAt),snapshot.zone).slice(0,7)===result.asOfDate.slice(0,7)){
    const progressKey='monitor:hoa-progress:'+snapshot.propertyId+':'+result.asOfDate.slice(0,7);
    let progress=await env.HOA_MONITOR_KV.get(progressKey,'json');
    if(!progress)progress={firstObservedAt:snapshot.observedAt,lastObservedAt:snapshot.observedAt,firstBalance:snapshot.balanceDue,observations:1,balanceChanged:false};
    else if(snapshot.observedAt>progress.lastObservedAt){progress={...progress,lastObservedAt:snapshot.observedAt,observations:progress.observations+1,balanceChanged:progress.balanceChanged||(typeof progress.firstBalance==='number'&&typeof snapshot.balanceDue==='number'&&progress.firstBalance!==snapshot.balanceDue)};}
    await env.HOA_MONITOR_KV.put(progressKey,JSON.stringify(progress));
    progressText=progress.balanceChanged?'Portal balance has changed this month; this alone does not confirm payment.':progress.observations>1&&typeof progress.firstBalance==='number'&&typeof snapshot.balanceDue==='number'?'Portal balance has not changed since '+progress.firstObservedAt+'.':'Balance change comparison is not yet available from distinct fresh observations.';
  }
  let paymentState=null,paymentStateKey=null;
  if(result.monitoringMode!=='balance_only'&&result.status!=='stale'){
    const period=snapshot.kind==='tax'?snapshot.taxYear:result.monitoringDueDate||snapshot.dueDate;
    paymentStateKey=['monitor:payment-state',snapshot.kind,snapshot.propertyId,period].join(':');
    const stored=await env.HOA_MONITOR_KV.get(paymentStateKey,'json');
    const same=previous&&previous.kind===snapshot.kind&&previous.propertyId===snapshot.propertyId&&(snapshot.kind==='tax'?previous.taxYear===snapshot.taxYear:evaluateSnapshot(previous,new Date(previous.observedAt)).monitoringDueDate===period);
    const before=stored?.confirmed??(same?evaluateSnapshot(previous,new Date(previous.observedAt)).paymentConfirmed:false);
    const ever=stored?.everConfirmed||before;
    paymentState={confirmed:result.paymentConfirmed,everConfirmed:ever||result.paymentConfirmed,pending:stored?.pending||null};
    if(before!==result.paymentConfirmed&&ever)paymentState.pending={id:crypto.randomUUID(),type:result.paymentConfirmed?'payment_reconfirmed':'payment_verification_changed'};
    if(JSON.stringify(stored)!==JSON.stringify(paymentState))await env.HOA_MONITOR_KV.put(paymentStateKey,JSON.stringify(paymentState));
    if(paymentState.pending){result.alertType=paymentState.pending.type;result.requiresHumanReview=!result.paymentConfirmed;}
  }
  if(!result.alertType)return {result,delivery:'none'};
  if(result.monitoringMode==='balance_only') {
    const signature=JSON.stringify([result.status,snapshot.balanceDue,result.priority,result.priority==='important'?result.asOfDate:'']);
    const stateKey='monitor:balance-notice:'+snapshot.propertyId;
    let state=await env.HOA_MONITOR_KV.get(stateKey,'json');
    if(!state||state.signature!==signature){state={signature,eventId:crypto.randomUUID()};await env.HOA_MONITOR_KV.put(stateKey,JSON.stringify(state));}
    const balance=snapshot.balanceDue===null?'Not available':snapshot.balanceDue<0?'Credit $'+Math.abs(snapshot.balanceDue).toFixed(2):snapshot.balanceDue===0?'$0.00 — no balance due':'Amount owed $'+snapshot.balanceDue.toFixed(2);
    const message={subject:`${result.priority==='important'?'IMPORTANT | ':''}Adex HOA | ${result.alertType.replaceAll('_',' ')} | ${snapshot.propertyId}`,text:[
      `Property: ${snapshot.propertyId}`,`Source: ${new URL(snapshot.sourceUrl).origin}`,`Dashboard balance: ${balance}`,`Monthly HOA due date: ${result.monitoringDueDate} (owner-set monitoring policy)`,`Review starts: ${result.reviewByDate}`,`Priority: ${result.priority}`,...(progressText?[progressText]:[]),
      `Observed: ${snapshot.observedAt}`,`Provider last updated: ${snapshot.sourceUpdatedAt||'Not provided'}`,`Status: ${result.status}`,
      'Monitoring basis: HOA dashboard balance. Owner-reported bank schedule: $120 every 14 days.',
      result.status==='stale'?'Dashboard retrieval is stale; a fresh check is required.':result.status==='balance_unavailable'?'Dashboard balance could not be verified; review is required.':snapshot.balanceDue>0?'The dashboard reports an amount owed; review the bank payment and HOA account.':'The dashboard reports no current amount owed.',
      'Individual bank payments are not reconciled by this balance monitor.'
    ].join('\n')};
    return {result,delivery:await deliver(env,'balance:'+snapshot.propertyId+':'+state.eventId,message,now)};
  }

  let key=[snapshot.kind,snapshot.propertyId,snapshot.taxYear||(snapshot.kind==='hoa'&&snapshot.dueDate===null?result.asOfDate.slice(0,7):''),snapshot.kind==='hoa'?result.monitoringDueDate:snapshot.dueDate,result.alertType,result.status==='stale'||result.priority==='important'?result.asOfDate:''].join(':');
  if(paymentState?.pending)key+=':event:'+paymentState.pending.id;
  const message={subject:`${result.priority==='important'?'IMPORTANT | ':''}Adex ${snapshot.kind==='hoa'?'HOA':'Property Tax'} | ${result.alertType.replaceAll('_',' ')} | ${snapshot.propertyId}`,text:[
    `Property: ${snapshot.propertyId}`,`Source: ${new URL(snapshot.sourceUrl).origin}`,
    ...(snapshot.kind==='tax'?[`Tax year: ${snapshot.taxYear}`]:[]),
    ...(snapshot.paymentOptions?[`Payment options (alternatives, not additive installments): ${snapshot.paymentOptions.map(o=>o.type.replaceAll('_',' ')+' '+o.dueDate+' $'+o.amount.toFixed(2)).join('; ')}`]:[]),
    ...(snapshot.countySettlement?.latestReceiptOn?[`Latest county recorded payment: ${snapshot.countySettlement.latestReceiptOn}`]:[]),
    `Obligation due: ${result.monitoringDueDate?result.monitoringDueDate+" (owner-set monitoring policy)":snapshot.dueDate||"Deadline not verified"}`,`${snapshot.assessmentScope==='base_tax_only'?'Reported base tax (special assessments excluded)':'Obligation amount'}: ${(snapshot.kind==='hoa'?result.monitoringAmountDue:snapshot.amountDue)===null?'Not verified':'$'+(snapshot.kind==='hoa'?result.monitoringAmountDue:snapshot.amountDue).toFixed(2)}`,
    ...(snapshot.kind==='hoa'?[`Priority: ${result.priority}`,`Important review starts: ${result.reviewByDate}`,...(progressText?[progressText]:[]),...(result.priority==='important'?['IMPORTANT: Payment or account coverage requires review. A missing confirmation or unchanged balance does not establish that payment failed.']:[])]:[]),
    `Last portal balance: ${snapshot.balanceDue===null?"Not verified":"$"+snapshot.balanceDue.toFixed(2)}`,`Observed: ${snapshot.observedAt}`, ...(snapshot.sourceUpdatedAt!==undefined?[`Provider last updated: ${snapshot.sourceUpdatedAt||'Not verified'}`]:[]),`Check date: ${result.asOfDate}`,
    `Status: ${result.status}`,result.paymentConfirmed?(result.evidence==='county_account_and_bill'?'County account ledger and tax bill reconcile paid annual assessment and zero account balance.':result.evidence==='county_ledger_and_receipts'?'County tax ledger, tax breakdown and recorded receipt totals reconcile the annual assessment with zero account balance.':result.evidence==='hoa_account_ledger'?'HOA account ledger shows posted payments allocated to this assessment. No HOA email receipt is required.':'Posted payment evidence allocated to this obligation confirms payment.'):'Payment is NOT confirmed by this notice.',
    ...(snapshot.propertyId==='apache-az-464'&&result.paymentConfirmed?['County records show the payment applied; check payments remain subject to final bank clearance.']:[]),
    'Scheduled autopay and credit balances alone do not confirm payment. Review the source portal. No payment has been initiated.'
  ].join('\n')};
  const delivery=await deliver(env,key,message,now);
  if(paymentState?.pending&&['sent','suppressed'].includes(delivery)){
    const current=await env.HOA_MONITOR_KV.get(paymentStateKey,'json');
    if(current?.pending?.id===paymentState.pending.id)await env.HOA_MONITOR_KV.put(paymentStateKey,JSON.stringify({...current,pending:null}));
  }
  return {result,delivery};
}
export async function runScheduled(env,now=new Date()) {
  if(!env.HOA_MONITOR_KV)throw Error('Monitoring storage missing');
  const expected=[...Object.keys(HOA_PROPERTIES).map(propertyId=>({kind:'hoa',propertyId})),...registry.properties.map(p=>({kind:'tax',propertyId:p.propertyId}))];
  let checked=0,failed=0,missing=0;const missingRecords=[];
  for(const {kind,propertyId} of expected) {
    try {
      const snapshot=await env.HOA_MONITOR_KV.get(snapshotKey(kind,propertyId),'json');
      if(snapshot)await processSnapshot(env,snapshot,now);
      else {
        missing++;
        missingRecords.push(kind+': '+propertyId);
      }
      checked++;
    }catch{failed++;}
  }
  if(missingRecords.length) {
    try {await deliver(env,`missing:${now.toISOString().slice(0,10)}`,{subject:'Adex monitoring coverage incomplete',text:'No current collector observation is available for the following properties. Payment status is unknown.\n'+missingRecords.join('\n')+'\nNo payment has been initiated.'},now);}catch{failed++;}
  }
  const summary={checked,missing,failed,lastScheduledAt:now.toISOString()};
  await env.HOA_MONITOR_KV.put('monitor:health',JSON.stringify(summary));
  if(failed)throw Error(`Monitoring failed for ${failed} records`);
  return summary;
}
export default {
  async fetch(request,env,ctx={}) {
    const path=new URL(request.url).pathname;
    if(path==='/internal/finance-summary'&&request.method==='GET'){
      if(!await authorized(request,'',env.HOA_INGEST_SECRET))return reply({error:'Unauthorized'},401);
      try{return reply(await financeSummary(env));}catch{return reply({error:'Monitoring data unavailable'},503);}
    }
    if(path.startsWith('/finance/')) {
      if(!await financeAccess(ctx,env))return reply({error:'Authenticated finance access required'},403);
      if(request.method!=='GET')return reply({error:'Method not allowed'},405);
      try{
        if(path==='/finance/summary')return reply(await financeSummary(env));
        if(path==='/finance/bridge')return financeBridge(await financeSummary(env),new URL(request.url).searchParams.get('nonce'));
      }catch{return reply({error:'Monitoring data unavailable'},503);}
      return reply({error:'Not found'},404);
    }
    if(path==='/internal/collect-valencia'){
      if(request.method!=='POST')return reply({error:'Method not allowed'},405);
      if(!env.HOA_MONITOR_KV||!env.HOA_INGEST_SECRET)return reply({error:'Not configured'},503);
      let body;try{body=await readBody(request);}catch{return reply({error:'Invalid body'},400);}
      if(!await authorized(request,body,env.HOA_INGEST_SECRET))return reply({error:'Unauthorized'},401);
      let input;try{input=JSON.parse(body);}catch{return reply({error:'Invalid JSON'},400);}
      if(!input||Object.keys(input).length!==1||!['valencia-nm-rge-1','valencia-nm-rancho-215'].includes(input.propertyId))return reply({error:'Invalid county property'},400);
      try{
        const snapshot=validateSnapshot(await fetchValencia(input.propertyId),registry.properties);
        const key=snapshotKey('tax',snapshot.propertyId),previous=await env.HOA_MONITOR_KV.get(key,'json');
        if(previous&&previous.observedAt>snapshot.observedAt)return reply({error:'Older observation rejected'},409);
        await env.HOA_MONITOR_KV.put(key,JSON.stringify(snapshot));
        return reply({ok:true,...await processSnapshot(env,snapshot)});
      }catch(error){return reply({ok:false,error:'County collection failed',stage:error.stage||'county_reconciliation_or_delivery',countyHttpStatus:error.httpStatus||null},502);}
    }
    if(path==='/health' && request.method==='GET')return reply({service:'adex-hoa-monitor',version:2,storageConfigured:!!env.HOA_MONITOR_KV,signingConfigured:!!env.HOA_INGEST_SECRET,notificationsEnabled:env.NOTIFICATIONS_ENABLED==='true'});
    if(path==='/status' && request.method==='GET') {
      if(!await authorized(request,'',env.HOA_INGEST_SECRET))return reply({error:'Unauthorized'},401);
      return reply({health:env.HOA_MONITOR_KV?await env.HOA_MONITOR_KV.get('monitor:health','json'):null});
    }
    if(!['/ingest','/test-email'].includes(path) || request.method!=='POST')return reply({error:'Not found'},404);
    if(!env.HOA_MONITOR_KV||!env.HOA_INGEST_SECRET)return reply({error:'Not configured'},503);
    let body;try{body=await readBody(request);}catch(e){return reply({error:e.message==='too_large'?'Payload too large':'Invalid encoding'},e.message==='too_large'?413:400);}
    if(!await authorized(request,body,env.HOA_INGEST_SECRET))return reply({error:'Unauthorized'},401);
    if(path==='/test-email') {
      let input;try{input=JSON.parse(body);}catch{return reply({error:'Invalid JSON'},400);}
      if(!input || Object.keys(input).length!==1 || typeof input.testId!=='string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(input.testId))return reply({error:'Invalid test ID'},400);
      if(!env.BREVO_API_KEY || !(env.HOA_SENDER_EMAIL||env.EMAIL_FROM))return reply({error:'Email configuration missing'},503);
      try {
        const delivery=await deliver(env,'acceptance:'+input.testId,{subject:'Adex property monitoring: test notification',text:'This is a test of Adex Holdings HOA and property tax monitoring email delivery from the Cloudflare monitoring Worker. No payment was made or requested. Monitoring coverage and payment status must be verified separately.'},new Date(),true);
        return reply({ok:true,delivery,notificationsEnabled:env.NOTIFICATIONS_ENABLED==='true'});
      }catch(error){return reply({ok:false,error:'Email delivery failed',reason:error.reason||'delivery_failed'},502);}
    }
    let snapshot;try{snapshot=validateSnapshot(JSON.parse(body),registry.properties);}catch{return reply({error:'Invalid snapshot'},400);}
    const key=snapshotKey(snapshot.kind,snapshot.propertyId);
    try {
      const previous=await env.HOA_MONITOR_KV.get(key,'json');
      if(previous && previous.observedAt>snapshot.observedAt)return reply({error:'Older observation rejected'},409);
      await env.HOA_MONITOR_KV.put(key,JSON.stringify(snapshot));
      const outcome=await processSnapshot(env,snapshot,new Date(),previous);
      return reply({ok:true,...outcome});
    }catch{return reply({ok:false,error:'Monitoring processing failed'},502);}
  },
  async scheduled(controller,env,ctx) {ctx.waitUntil(runScheduled(env,new Date(controller.scheduledTime)));}
};
