import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{authorized,runScheduled,processSnapshot} from './index.js';
const now=new Date();
const store=()=>{const values=new Map();return {values,async get(k,type){const v=values.get(k);return v?(type==='json'?JSON.parse(v):v):null;},async put(k,v){values.set(k,v);}};};
async function signed(body,secret='test-only',time=String(Math.floor(Date.now()/1000))){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const hash=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(time+'.'+body));return new Request('https://example.test/ingest',{method:'POST',body,headers:{'x-adex-timestamp':time,'x-adex-signature':'sha256='+[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}});}
const snapshot={kind:'hoa',propertyId:'aurora-oxford-co',provider:'LCM',sourceUrl:'https://lcmpropertymanagement.com/AccountStatus/40583~10533163/',observedAt:now.toISOString(),dueDate:now.toISOString().slice(0,8)+'01',amountDue:205,balanceDue:205,payments:[],zone:'America/Los_Angeles'};
test('HMAC binds timestamp and body; expired signed requests rejected',async()=>{assert.equal(await authorized(await signed('{}'),'{}','test-only'),true);assert.equal(await authorized(await signed('{}'),'{"tampered":true}','test-only'),false);assert.equal(await authorized(await signed('{}','test-only','1000000000'),'{}','test-only'),false);});
test('authenticated ingestion stores only permitted schema and rejects old observations',async()=>{const kv=store(),env={HOA_MONITOR_KV:kv,HOA_INGEST_SECRET:'test-only'};const {zone,...input}=snapshot;let r=await worker.fetch(await signed(JSON.stringify(input)),env);assert.equal(r.status,200);assert.equal((await r.json()).delivery,'disabled');assert.ok(kv.values.has('monitor:snapshot:hoa:aurora-oxford-co'));r=await worker.fetch(await signed(JSON.stringify({...input,observedAt:new Date(now-1000).toISOString()})),env);assert.equal(r.status,409);});
test('notification success deduplicates, sends both recipients and masks source path',async()=>{const previous=globalThis.fetch;const kv=store(),env={HOA_MONITOR_KV:kv,NOTIFICATIONS_ENABLED:'true',BREVO_API_KEY:'test-only',EMAIL_FROM:'sender@example.test'};let count=0;globalThis.fetch=async(u,opts)=>{count++;const body=JSON.parse(opts.body);assert.deepEqual(body.to.map(x=>x.email),['tenantservices@adexholdings.com','ahmedadeyemi@gmail.com']);assert.ok(!body.textContent.includes('/dashboard'));return new Response('{}',{status:201});};try{const failed={...snapshot,payments:[{reference:'fail-1',amount:205,dueDate:snapshot.dueDate,postedOn:snapshot.dueDate,status:'failed',evidence:'hoa_account_ledger'}]};assert.equal((await processSnapshot(env,failed,now)).delivery,'sent');assert.equal((await processSnapshot(env,failed,now)).delivery,'suppressed');assert.equal(count,1);}finally{globalThis.fetch=previous;}});
test('failed email is retryable and not marked sent',async()=>{const previous=globalThis.fetch;const kv=store(),env={HOA_MONITOR_KV:kv,NOTIFICATIONS_ENABLED:'true',BREVO_API_KEY:'test-only',EMAIL_FROM:'sender@example.test'};globalThis.fetch=async()=>new Response('',{status:503});try{const failed={...snapshot,payments:[{reference:'fail-1',amount:205,dueDate:snapshot.dueDate,postedOn:snapshot.dueDate,status:'failed',evidence:'hoa_account_ledger'}]};await assert.rejects(()=>processSnapshot(env,failed,now));globalThis.fetch=async()=>new Response('{}',{status:201});assert.equal((await processSnapshot(env,failed,now)).delivery,'sent');}finally{globalThis.fetch=previous;}});
test('cron records missing collectors; disabled emails send nothing',async()=>{const kv=store();const result=await runScheduled({HOA_MONITOR_KV:kv},now);assert.equal(result.checked,14);assert.equal(result.missing,14);assert.equal(result.failed,0);assert.ok(await kv.get('monitor:health','json'));});
test('status requires authentication and health never exposes financial records',async()=>{assert.equal((await worker.fetch(new Request('https://example.test/status'),{})).status,401);const res=await worker.fetch(new Request('https://example.test/health'),{});assert.deepEqual(Object.keys(await res.json()).sort(),['notificationsEnabled','service','signingConfigured','storageConfigured','version']);});
test('unverified county balance email remains explicit and never asserts payment',async()=>{const previous=globalThis.fetch;const kv=store(),env={HOA_MONITOR_KV:kv,NOTIFICATIONS_ENABLED:'true',BREVO_API_KEY:'test-only',EMAIL_FROM:'sender@example.test'};let message;globalThis.fetch=async(_u,opts)=>{message=JSON.parse(opts.body);return new Response('{}',{status:201});};try{const bill={kind:'tax',propertyId:'pahrump-nv-232',provider:'Nye County',sourceUrl:'https://nyenv-assessor.devnetwedge.com/bill',observedAt:now.toISOString(),dueDate:now.toISOString().slice(0,10),amountDue:48,balanceDue:null,payments:[],taxYear:'2026/2027',zone:'America/Los_Angeles'};const result=await processSnapshot(env,bill,now);assert.equal(result.delivery,'sent');assert.match(message.textContent,/Last portal balance: Not verified/);assert.match(message.textContent,/Payment is NOT confirmed/);}finally{globalThis.fetch=previous;}});
test('email acceptance is authenticated, uses fixed recipients and leaves live notifications disabled',async()=>{const prior=globalThis.fetch;const kv=store(),env={HOA_MONITOR_KV:kv,HOA_INGEST_SECRET:'test-only',BREVO_API_KEY:'test-only',EMAIL_FROM:'sender@example.test'};let sends=0;globalThis.fetch=async(_url,options)=>{sends++;const mail=JSON.parse(options.body);assert.deepEqual(mail.to.map(p=>p.email),['tenantservices@adexholdings.com','ahmedadeyemi@gmail.com']);assert.equal(mail.subject,'Adex property monitoring: test notification');return new Response('{}',{status:201});};try{const body=JSON.stringify({testId:'acceptance-test-1'});const auth=await signed(body);const request=()=>new Request('https://example.test/test-email',{method:'POST',headers:auth.headers,body});let res=await worker.fetch(new Request('https://example.test/test-email',{method:'POST',body}),env);assert.equal(res.status,401);res=await worker.fetch(request(),env);assert.equal(res.status,200);assert.deepEqual(await res.json(),{ok:true,delivery:'sent',notificationsEnabled:false});res=await worker.fetch(request(),env);assert.equal((await res.json()).delivery,'suppressed');assert.equal(sends,1);}finally{globalThis.fetch=prior;}});
test('email acceptance rejects caller-supplied content or recipients',async()=>{const body=JSON.stringify({testId:'acceptance-test-2',to:'unrequested@example.test'});const auth=await signed(body);const res=await worker.fetch(new Request('https://example.test/test-email',{method:'POST',headers:auth.headers,body}),{HOA_MONITOR_KV:store(),HOA_INGEST_SECRET:'test-only',BREVO_API_KEY:'test-only',EMAIL_FROM:'sender@example.test'});assert.equal(res.status,400);});
test('email acceptance reports provider IP restriction without leaking its response',async()=>{const prior=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({message:'Unrecognised IP address SECRET',code:'unauthorized'}),{status:401,headers:{'content-type':'application/json'}});try{const body=JSON.stringify({testId:'acceptance-test-3'});const auth=await signed(body);const res=await worker.fetch(new Request('https://example.test/test-email',{method:'POST',headers:auth.headers,body}),{HOA_MONITOR_KV:store(),HOA_INGEST_SECRET:'test-only',BREVO_API_KEY:'test-only',EMAIL_FROM:'sender@example.test'});assert.equal(res.status,502);const text=await res.text();assert.match(text,/source_ip_not_authorized/);assert.doesNotMatch(text,/SECRET/);}finally{globalThis.fetch=prior;}});

test('balance-only HOA notice states unknown amount and provider freshness, without paid claim',async()=>{
 const previous=globalThis.fetch;let mail;
 globalThis.fetch=async(_u,options)=>{mail=JSON.parse(options.body);return new Response('{}',{status:201});};
 try{const observation={...snapshot,dueDate:null,amountDue:null,balanceDue:-605,sourceUpdatedAt:null};const result=await processSnapshot({HOA_MONITOR_KV:store(),NOTIFICATIONS_ENABLED:'true',BREVO_API_KEY:'test',EMAIL_FROM:'sender@example.test'},observation,now);assert.equal(result.delivery,'sent');assert.match(mail.textContent,/Obligation amount: Not verified/);assert.match(mail.textContent,/Provider last updated: Not verified/);assert.match(mail.textContent,/Payment is NOT confirmed/);}finally{globalThis.fetch=previous;}
});

test('Calabrese sends balance changes, suppresses repeats, and alerts when the same debt recurs',async()=>{
 const prior=globalThis.fetch;const kv=store(),env={HOA_MONITOR_KV:kv,NOTIFICATIONS_ENABLED:'true',BREVO_API_KEY:'test',EMAIL_FROM:'sender@example.test'};const messages=[];
 globalThis.fetch=async(_u,options)=>{messages.push(JSON.parse(options.body));return new Response('{}',{status:201});};
 const observation={...snapshot,propertyId:'fallbrook-ca',provider:'FrontSteps',sourceUrl:'https://horsecreekridge.frontsteps.com/dashboard',amountDue:null,dueDate:null,sourceUpdatedAt:now.toISOString(),payments:[]};
 try{
  const run=balanceDue=>processSnapshot(env,{...observation,balanceDue},now);
  assert.equal((await run(-725)).delivery,'sent');assert.equal((await run(-725)).delivery,'suppressed');
  assert.match(messages[0].textContent,/Dashboard balance: Credit \$725.00/);
  assert.doesNotMatch(messages[0].textContent,/Payment is NOT confirmed|payment verification|Obligation amount/);
  assert.equal((await run(120)).delivery,'sent');assert.match(messages[1].subject,/balance due/);
  assert.equal((await run(0)).delivery,'sent');assert.match(messages[2].textContent,/no balance due/);
  assert.equal((await run(120)).delivery,'sent');assert.equal(messages.length,4);
 }finally{globalThis.fetch=prior;}
});
test('Calabrese failed balance email retries the same event',async()=>{
 const prior=globalThis.fetch;const kv=store(),env={HOA_MONITOR_KV:kv,NOTIFICATIONS_ENABLED:'true',BREVO_API_KEY:'test',EMAIL_FROM:'sender@example.test'};
 const observation={...snapshot,propertyId:'fallbrook-ca',provider:'FrontSteps',sourceUrl:'https://horsecreekridge.frontsteps.com/dashboard',amountDue:null,dueDate:null,balanceDue:-725,payments:[]};
 try{globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(()=>processSnapshot(env,observation,now));const first=await kv.get('monitor:balance-notice:fallbrook-ca','json');globalThis.fetch=async()=>new Response('{}',{status:201});assert.equal((await processSnapshot(env,observation,now)).delivery,'sent');assert.equal((await kv.get('monitor:balance-notice:fallbrook-ca','json')).eventId,first.eventId);}finally{globalThis.fetch=prior;}
});

test('payment verification changes and recovery notify once, with failed change email retried',async()=>{
 const priorFetch=globalThis.fetch;const kv=store(),env={HOA_MONITOR_KV:kv,NOTIFICATIONS_ENABLED:'true',BREVO_API_KEY:'test',EMAIL_FROM:'sender@example.test'};const messages=[];
 const paid={kind:'tax',propertyId:'navajo-az-10',provider:'Navajo County',sourceUrl:'https://apps.navajocountyaz.gov/NavajoWebPayments/PropertyInformation',observedAt:now.toISOString(),zone:'America/Phoenix',taxYear:'2026',amountDue:100.05,annualAssessment:100.05,balanceDue:0,dueDate:'2026-12-31',payments:[],countySettlement:{method:'county_ledger_and_receipts',postedTotal:100.05,receiptTotal:100.05,taxDetailTotal:100.05,currentYearBalance:0,interestAndFees:0,latestReceiptOn:'2026-10-01'}};
 const unverified={...paid,balanceDue:100.05,countySettlement:undefined};
 try{
  globalThis.fetch=async(_u,o)=>{messages.push(JSON.parse(o.body));return new Response('{}',{status:201});};
  assert.equal((await processSnapshot(env,paid,now)).delivery,'sent');
  globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(()=>processSnapshot(env,unverified,now,paid));
  globalThis.fetch=async(_u,o)=>{messages.push(JSON.parse(o.body));return new Response('{}',{status:201});};
  const changed=await processSnapshot(env,unverified,now);assert.equal(changed.result.alertType,'payment_verification_changed');assert.equal(changed.delivery,'sent');assert.match(messages[1].subject,/verification changed/);
  await processSnapshot(env,unverified,now);assert.equal(messages.length,2);
  const recovered=await processSnapshot(env,paid,now);assert.equal(recovered.result.alertType,'payment_reconfirmed');assert.equal(recovered.delivery,'sent');assert.match(messages[2].subject,/payment reconfirmed/);
  assert.equal((await processSnapshot(env,paid,now)).delivery,'suppressed');assert.equal(messages.length,3);
 }finally{globalThis.fetch=priorFetch;}
});
test('a new tax year does not revoke the prior year confirmation',async()=>{
 const kv=store();const previous={...snapshot,kind:'tax',taxYear:'2025',annualAssessment:100,balanceDue:0,countySettlement:{method:'county_account_and_bill',postedTotal:100,billPreviousPayments:100,currentYearBalance:0}};
 const current={...snapshot,kind:'tax',taxYear:'2026',dueDate:'2026-12-31',amountDue:100,balanceDue:100};
 const result=await processSnapshot({HOA_MONITOR_KV:kv},current,now,previous);assert.notEqual(result.result.alertType,'payment_verification_changed');
});
test('HOA important reminders start on eighth, repeat daily, and describe unchanged balance without claiming nonpayment',async()=>{
 const prior=globalThis.fetch,messages=[];const env={HOA_MONITOR_KV:store(),NOTIFICATIONS_ENABLED:'true',BREVO_API_KEY:'test',EMAIL_FROM:'sender@example.test'};
 globalThis.fetch=async(_url,options)=>{messages.push(JSON.parse(options.body));return new Response('{}',{status:201});};
 const at=day=>new Date(`2026-11-${day}T16:00:00.000Z`);
 const observation=day=>({kind:'hoa',propertyId:'aurora-hoye-co',provider:'TownSq',sourceUrl:'https://app.townsq.io',zone:'America/Denver',observedAt:at(day).toISOString(),dueDate:null,amountDue:null,balanceDue:125.25,payments:[]});
 try{
  await processSnapshot(env,observation('07'),at('07'));assert.doesNotMatch(messages[0].subject,/IMPORTANT/);assert.match(messages[0].textContent,/Obligation due: 2026-11-10 \(owner-set monitoring policy\)/);
  assert.equal((await processSnapshot(env,observation('08'),at('08'))).delivery,'sent');assert.match(messages[1].subject,/^IMPORTANT/);assert.match(messages[1].textContent,/balance has not changed since/i);assert.match(messages[1].textContent,/does not establish that payment failed/);
  assert.equal((await processSnapshot(env,observation('08'),at('08'))).delivery,'suppressed');
  assert.equal((await processSnapshot(env,observation('09'),at('09'))).delivery,'sent');assert.equal(messages.length,3);
 }finally{globalThis.fetch=prior;}
});
test('private Valencia collection endpoint requires HMAC and never accepts arbitrary URLs',async()=>{
 const env={HOA_MONITOR_KV:store(),HOA_INGEST_SECRET:'test-only',NOTIFICATIONS_ENABLED:'false'};
 assert.equal((await worker.fetch(new Request('https://example.test/internal/collect-valencia',{method:'POST',body:'{}'}),env)).status,401);
 const body=JSON.stringify({propertyId:'other'}),signedRequest=await signed(body);
 assert.equal((await worker.fetch(new Request('https://example.test/internal/collect-valencia',{method:'POST',body,headers:signedRequest.headers}),env)).status,400);
});
