/* Standalone Cloudflare Worker for authenticated, read-only HOA snapshot ingestion.
   Deployment requires separate Wrangler configuration and secrets.
   Never send portal credentials, cookies, or session tokens here. */
import {evaluateLCMSnapshot} from "../monitoring/lcm-evaluate.js";
import {buildHOAEmail} from "../monitoring/hoa-email.js";
import {planHOANotification,recordHOADelivery} from "../monitoring/hoa-notifications.js";
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
function hex(bytes){return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function validSignature(body,signature,secret){
  if(!signature||!secret||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const actual="sha256="+hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));
  const a=new TextEncoder().encode(actual),b=new TextEncoder().encode(signature);
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
async function sendBrevo(env,email){
  const sender=env.HOA_SENDER_EMAIL||env.EMAIL_FROM;
  if(!env.BREVO_API_KEY||!sender)throw new Error("Email service not configured");
  const res=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":env.BREVO_API_KEY,"content-type":"application/json"},body:JSON.stringify({sender:{email:sender,name:env.BREVO_SENDER_NAME||"Adex HOA Monitoring"},to:email.to.map(address=>({email:address})),subject:email.subject,textContent:email.text})});
  if(!res.ok)throw new Error("Email provider rejected delivery: "+res.status);
}
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path!=="/ingest"||request.method!=="POST")return reply({error:"Not found"},404);
  if(!env.HOA_MONITOR_KV||!env.HOA_INGEST_SECRET)return reply({error:"Not configured"},503);
  const body=await request.text();
  if(body.length>100000)return reply({error:"Payload too large"},413);
  if(!await validSignature(body,request.headers.get("x-adex-signature"),env.HOA_INGEST_SECRET))return reply({error:"Unauthorized"},401);
  let input;try{input=JSON.parse(body)}catch{return reply({error:"Invalid JSON"},400)}
  let evaluation;try{
    if(!input||typeof input!=="object"||!Array.isArray(input.transactions)||input.transactions.length>1000||typeof input.propertyLabel!=="string")throw new Error("Invalid input");
    evaluation=evaluateLCMSnapshot(input);
  }catch{return reply({error:"Invalid snapshot"},400)}
  const key="hoa:snapshot:"+encodeURIComponent(evaluation.propertyId);
  await env.HOA_MONITOR_KV.put(key,JSON.stringify({evaluation,receivedAt:new Date().toISOString()}));
  if(!evaluation.alertType)return reply({ok:true,alert:"none"});
  const dedupKey="hoa:notification:"+encodeURIComponent(evaluation.propertyId)+":"+evaluation.dueDate+":"+evaluation.alertType;
  const previous=await env.HOA_MONITOR_KV.get(dedupKey,"json");
  const plan=planHOANotification(evaluation,previous);
  if(!plan.send)return reply({ok:true,alert:"suppressed",reason:plan.reason});
  // KV is eventually consistent: this is best-effort deduplication, not an atomic lock.
  await env.HOA_MONITOR_KV.put(dedupKey,JSON.stringify(recordHOADelivery(plan,new Date().toISOString(),"pending")));
  try{
    await sendBrevo(env,buildHOAEmail(evaluation,input.propertyLabel));
    await env.HOA_MONITOR_KV.put(dedupKey,JSON.stringify(recordHOADelivery(plan,new Date().toISOString(),"sent")));
    return reply({ok:true,alert:"sent"});
  }catch(err){
    await env.HOA_MONITOR_KV.put(dedupKey,JSON.stringify(recordHOADelivery(plan,new Date().toISOString(),"failed")));
    console.error("HOA notification delivery failure",String(err));
    return reply({ok:false,error:"Notification delivery failed"},502);
  }
}};
