/* Read back the private feed without printing any account amounts or credentials. */
import {createHmac} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function verifyTownSqObservation({token,secret,now=Date.now(),request=fetch}) {
 const key=secret||(token?createHmac('sha256',token).update('adex-hoa-monitor-ingestion-v2').digest('hex'):null);
 if(!key)throw Error('Monitoring signing configuration missing');
 const timestamp=String(Math.floor(now/1000));
 const signature=createHmac('sha256',key).update(timestamp+'.').digest('hex');
 const response=await request('https://adex-hoa-monitor.tenantservices.workers.dev/internal/finance-summary',{redirect:'error',signal:AbortSignal.timeout(25000),headers:{'X-Adex-Timestamp':timestamp,'X-Adex-Signature':'sha256='+signature}});
 if(!response.ok)throw Error('Private monitoring readback rejected');
 const data=await response.json(),records=data.records?.filter(r=>r.propertyId==='aurora-hoye-co'&&r.kind==='hoa'&&r.financeId==='co-townhouse');
 if(data.schemaVersion!==1||records?.length!==1)throw Error('Hoye observation unavailable');
 const record=records[0],observed=Date.parse(record.observedAt);
 if(!record.fresh||record.status==='missing'||!Number.isFinite(observed)||now-observed>300000||observed>now+60000||typeof record.balanceDue!=='number'||!Number.isFinite(record.balanceDue)||record.paymentConfirmed!==false)throw Error('Hoye observation is not a fresh verified balance');
 return {propertyId:'aurora-hoye-co',privateFinanceReadback:'verified',balanceObserved:true,observedAt:record.observedAt,paymentConfirmed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await verifyTownSqObservation({token:process.env.CLOUDFLARE_API_TOKEN,secret:process.env.ADEX_MONITOR_INGEST_SECRET})));}
 catch{console.error('Fresh Hoye observation readback failed');process.exitCode=1;}
}
