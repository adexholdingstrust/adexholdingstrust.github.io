import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyTownSqObservation} from './verify-townsq-observation.mjs';
const now=Date.parse('2026-11-04T19:00:00.000Z');
const record={propertyId:'aurora-hoye-co',kind:'hoa',financeId:'co-townhouse',observedAt:new Date(now).toISOString(),fresh:true,status:'payment_unverified',balanceDue:125.25,paymentConfirmed:false};
test('Hoye readback authenticates without forwarding Cloudflare token or returning financial values',async()=>{
 const token='private-cloudflare-token',key=createHmac('sha256',token).update('adex-hoa-monitor-ingestion-v2').digest('hex');
 const result=await verifyTownSqObservation({token,now,request:async(url,options)=>{assert.equal(new URL(url).pathname,'/internal/finance-summary');assert.equal(options.redirect,'error');assert.equal(options.headers['X-Adex-Signature'],'sha256='+createHmac('sha256',key).update(options.headers['X-Adex-Timestamp']+'.').digest('hex'));assert.doesNotMatch(JSON.stringify(options),/private-cloudflare-token/);return Response.json({schemaVersion:1,records:[record]});}});
 assert.equal(result.privateFinanceReadback,'verified');assert.doesNotMatch(JSON.stringify(result),/125\.25|private-cloudflare/);
});
test('Hoye readback rejects missing stale duplicate and mismatched records',async()=>{
 for(const records of [[],[record,record],[{...record,financeId:'wrong'}],[{...record,fresh:false}],[{...record,observedAt:new Date(now-600000).toISOString()}],[{...record,balanceDue:null}],[{...record,paymentConfirmed:true}]])await assert.rejects(verifyTownSqObservation({secret:'test',now,request:async()=>Response.json({schemaVersion:1,records})}));
});
