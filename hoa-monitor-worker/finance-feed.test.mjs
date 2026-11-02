import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';
import {financeSummary,financeAccess,financeBridge} from './finance-feed.js';
const now=new Date();
const account={kind:'hoa',propertyId:'fallbrook-ca',provider:'FrontSteps',sourceUrl:'https://horsecreekridge.frontsteps.com/dashboard',observedAt:now.toISOString(),zone:'America/Los_Angeles',dueDate:null,amountDue:null,balanceDue:-725,payments:[],password:'MUST_NOT_EXPORT'};
const env={MONITOR_FINANCE_ACCESS_AUD:'test-aud',HOA_MONITOR_KV:{async get(key){return key==='monitor:snapshot:hoa:fallbrook-ca'?account:null;}}};
test('private summary exposes only normalized observations and explicit missing coverage',async()=>{
 const result=await financeSummary(env,now);assert.equal(result.records.length,14);const r=result.records.find(x=>x.propertyId==='fallbrook-ca');assert.equal(r.balanceDue,-725);assert.equal(r.status,'credit_balance');assert.equal(r.paymentConfirmed,false);assert.equal(r.financeId,'ca-sfh-fallbrook');assert.equal(r.monthlyAssessment,undefined);assert.equal(result.records.filter(x=>x.status==='missing').length,13);assert.doesNotMatch(JSON.stringify(result),/MUST_NOT_EXPORT|password|payments|dashboard/);
});
test('finance access requires platform-authenticated context, expected audience and identity',async()=>{
 assert.equal(await financeAccess({},env),false);assert.equal(await financeAccess({access:{aud:'other',getIdentity:async()=>({email:'owner@example.test'})}},env),false);assert.equal(await financeAccess({access:{aud:'test-aud',getIdentity:async()=>({})}},env),false);assert.equal(await financeAccess({access:{aud:'test-aud',getIdentity:async()=>({email:'owner@example.test'})}},env),true);
});
test('forged Access headers cannot read private data and no configuration fails closed',async()=>{
 const req=new Request('https://monitor.test/finance/summary',{headers:{'cf-access-authenticated-user-email':'owner@example.test','cf-access-jwt-assertion':'forged'}});
 assert.equal((await worker.fetch(req,env)).status,403);assert.equal((await worker.fetch(req,{...env,MONITOR_FINANCE_ACCESS_AUD:undefined},{access:{aud:'test-aud',getIdentity:async()=>({email:'owner@example.test'})}})).status,403);
 const res=await worker.fetch(req,env,{access:{aud:'test-aud',getIdentity:async()=>({email:'owner@example.test'})}});assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);assert.equal((await res.json()).records.length,14);
 assert.equal((await worker.fetch(new Request('https://monitor.test/internal/finance-summary'),env)).status,401);
});
test('bridge pins the receiving origin, escapes script data and rejects arbitrary nonce input',async()=>{
 const res=financeBridge({records:[{status:'</script><script>bad()</script>'}]},'a'.repeat(64));const html=await res.text();assert.ok(html.includes('https://adexholdings.com'));assert.ok(!html.includes('</script><script>bad'));assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(financeBridge({},'bad<script>').status,400);
});
