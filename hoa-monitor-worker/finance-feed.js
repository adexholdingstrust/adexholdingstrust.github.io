import registry from '../monitoring/county-tax-registry.json' with {type:'json'};
import {HOA_PROPERTIES,evaluateSnapshot} from './snapshots.js';
export const FINANCE_ORIGIN='https://adexholdings.com';
const ids={ 'aurora-oxford-co':'co-condo','aurora-hoye-co':'co-townhouse','fallbrook-ca':'ca-sfh-fallbrook' };
export async function financeSummary(env,now=new Date()) {
 if(!env.HOA_MONITOR_KV)throw Error('Monitoring storage unavailable');
 const properties=[...Object.keys(HOA_PROPERTIES).map(propertyId=>({kind:'hoa',propertyId})),...registry.properties.map(p=>({kind:'tax',propertyId:p.propertyId}))];
 const records=[];
 for(const {kind,propertyId} of properties){
  const s=await env.HOA_MONITOR_KV.get(`monitor:snapshot:${kind}:${propertyId}`,'json');
  if(!s){records.push({kind,propertyId,financeId:ids[propertyId]||propertyId,status:'missing',fresh:false,paymentConfirmed:false});continue;}
  const observed=Date.parse(s.observedAt),fresh=Number.isFinite(observed)&&now-observed<=48*3600000&&observed<=now.getTime()+60000;
  const result=evaluateSnapshot(s,now);
  const record={kind,propertyId,financeId:ids[propertyId]||propertyId,status:result.status,fresh,paymentConfirmed:fresh&&result.paymentConfirmed===true,observedAt:s.observedAt,sourceOrigin:new URL(s.sourceUrl).origin,balanceDue:s.balanceDue,dueDate:s.dueDate};
  if(s.sourceUpdatedAt!==undefined)record.sourceUpdatedAt=s.sourceUpdatedAt;
  if(s.monthlyAssessment!==undefined)record.monthlyAssessment=s.monthlyAssessment;
  if(s.annualAssessment!==undefined)record.annualAssessment=s.annualAssessment;
  if(s.taxYear!==undefined)record.taxYear=s.taxYear;
  if(s.assessmentScope!==undefined)record.assessmentScope=s.assessmentScope;
  if(s.paymentOptions)record.paymentOptions=s.paymentOptions.map(o=>({type:o.type,dueDate:o.dueDate,amount:o.amount}));
  if(result.monitoringMode)record.monitoringMode=result.monitoringMode;
  records.push(record);
 }
 return {schemaVersion:1,generatedAt:now.toISOString(),records};
}
export async function financeAccess(ctx,env) {
 if(!env.MONITOR_FINANCE_ACCESS_AUD||!ctx?.access||ctx.access.aud!==env.MONITOR_FINANCE_ACCESS_AUD)return false;
 try{const identity=await ctx.access.getIdentity();return typeof identity?.email==='string'&&identity.email.length>0;}catch{return false;}
}
export function financeBridge(summary,nonce) {
 if(!/^[a-f0-9]{64}$/.test(nonce||''))return new Response('Invalid request',{status:400});
 const scriptNonce=crypto.randomUUID();
 const payload=JSON.stringify({type:'adex-monitor-summary',nonce,summary}).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adex live monitoring</title><body><h1>Live monitoring connected</h1><p id="status">Returning the latest observations to your finance page.</p><script nonce="${scriptNonce}">if(window.opener){window.opener.postMessage(${payload},${JSON.stringify(FINANCE_ORIGIN)});window.close();}else{document.getElementById('status').textContent='Open the finance page and select Refresh live data.';}</script></body></html>`;
 return new Response(html,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store, private','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':`default-src 'none'; script-src 'nonce-${scriptNonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`}});
}
