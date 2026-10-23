/* Isolated monitoring service. No finance KV binding and no payment initiation. */
import registry from '../monitoring/county-tax-registry.json' with {type:'json'};
import {HOA_ALERT_RECIPIENTS} from '../monitoring/hoa-rules.js';
import {HOA_PROPERTIES,validateSnapshot,evaluateSnapshot} from './snapshots.js';
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
async function deliver(env,key,message,now) {
  if(env.NOTIFICATIONS_ENABLED!=='true')return 'disabled';
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
    if(!res.ok)throw Error('Email rejected');
    await env.HOA_MONITOR_KV.put(storageKey,record('sent'));return 'sent';
  } catch {await env.HOA_MONITOR_KV.put(storageKey,record('failed'));throw Error('Notification delivery failed');}
}
export async function processSnapshot(env,snapshot,now=new Date()) {
  const result=evaluateSnapshot(snapshot,now);
  if(!result.alertType)return {result,delivery:'none'};
  const key=[snapshot.kind,snapshot.propertyId,snapshot.taxYear||'',snapshot.dueDate,result.alertType,result.status==='stale'?result.asOfDate:''].join(':');
  const message={subject:`Adex ${snapshot.kind==='hoa'?'HOA':'Property Tax'} | ${result.alertType.replaceAll('_',' ')} | ${snapshot.propertyId}`,text:[
    `Property: ${snapshot.propertyId}`,`Source: ${new URL(snapshot.sourceUrl).origin}`,
    `Obligation due: ${snapshot.dueDate||"Deadline not verified"}`,`Obligation amount: $${snapshot.amountDue.toFixed(2)}`,
    `Last portal balance: $${snapshot.balanceDue.toFixed(2)}`,`Observed: ${snapshot.observedAt}`,`Check date: ${result.asOfDate}`,
    `Status: ${result.status}`,result.paymentConfirmed?(result.evidence==='county_account_and_bill'?'County account ledger and tax bill reconcile paid annual assessment and zero account balance.':'Posted payment evidence allocated to this obligation confirms payment.'):'Payment is NOT confirmed by this notice.',
    'Scheduled autopay and credit balances alone do not confirm payment. Review the source portal. No payment has been initiated.'
  ].join('\n')};
  return {result,delivery:await deliver(env,key,message,now)};
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
  async fetch(request,env) {
    const path=new URL(request.url).pathname;
    if(path==='/health' && request.method==='GET')return reply({service:'adex-hoa-monitor',version:2,storageConfigured:!!env.HOA_MONITOR_KV,signingConfigured:!!env.HOA_INGEST_SECRET,notificationsEnabled:env.NOTIFICATIONS_ENABLED==='true'});
    if(path==='/status' && request.method==='GET') {
      if(!await authorized(request,'',env.HOA_INGEST_SECRET))return reply({error:'Unauthorized'},401);
      return reply({health:env.HOA_MONITOR_KV?await env.HOA_MONITOR_KV.get('monitor:health','json'):null});
    }
    if(path!=='/ingest' || request.method!=='POST')return reply({error:'Not found'},404);
    if(!env.HOA_MONITOR_KV||!env.HOA_INGEST_SECRET)return reply({error:'Not configured'},503);
    let body;try{body=await readBody(request);}catch(e){return reply({error:e.message==='too_large'?'Payload too large':'Invalid encoding'},e.message==='too_large'?413:400);}
    if(!await authorized(request,body,env.HOA_INGEST_SECRET))return reply({error:'Unauthorized'},401);
    let snapshot;try{snapshot=validateSnapshot(JSON.parse(body),registry.properties);}catch{return reply({error:'Invalid snapshot'},400);}
    const key=snapshotKey(snapshot.kind,snapshot.propertyId);
    try {
      const previous=await env.HOA_MONITOR_KV.get(key,'json');
      if(previous && previous.observedAt>snapshot.observedAt)return reply({error:'Older observation rejected'},409);
      await env.HOA_MONITOR_KV.put(key,JSON.stringify(snapshot));
      const outcome=await processSnapshot(env,snapshot);
      return reply({ok:true,...outcome});
    }catch{return reply({ok:false,error:'Monitoring processing failed'},502);}
  },
  async scheduled(controller,env,ctx) {ctx.waitUntil(runScheduled(env,new Date(controller.scheduledTime)));}
};
