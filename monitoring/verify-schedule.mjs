/* Read the protected summary written only by the deployed scheduled handler. */
import {createHmac} from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN;
const key=process.env.ADEX_MONITOR_INGEST_SECRET||(token?createHmac('sha256',token).update('adex-hoa-monitor-ingestion-v2').digest('hex'):null);
if(!key)throw Error('Monitoring signing configuration missing');
const timestamp=String(Math.floor(Date.now()/1000));
const signature=createHmac('sha256',key).update(timestamp+'.').digest('hex');
const res=await fetch('https://adex-hoa-monitor.tenantservices.workers.dev/status',{redirect:'error',signal:AbortSignal.timeout(25000),headers:{'X-Adex-Timestamp':timestamp,'X-Adex-Signature':'sha256='+signature}});
if(!res.ok)throw Error('Protected schedule status rejected');
const {health}=await res.json();
const lastRun=Date.parse(health?.lastScheduledAt);
const observed=Number.isFinite(lastRun)&&lastRun<=Date.now()+60000&&Date.now()-lastRun<27*3600000;
console.log(JSON.stringify({scheduledExecutionObserved:observed,lastScheduledAt:Number.isFinite(lastRun)?new Date(lastRun).toISOString():null,checked:Number.isInteger(health?.checked)?health.checked:null,missing:Number.isInteger(health?.missing)?health.missing:null,failed:Number.isInteger(health?.failed)?health.failed:null}));
if(!observed)process.exitCode=1;
