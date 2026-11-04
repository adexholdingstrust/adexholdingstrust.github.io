/* Private live observations arrive only from the authenticated monitoring window. */
(function(root){
 'use strict';
 const origin='https://adex-hoa-monitor.tenantservices.workers.dev';
 const expected={ 'aurora-oxford-co':['hoa','co-condo'],'aurora-hoye-co':['hoa','co-townhouse'],'fallbrook-ca':['hoa','ca-sfh-fallbrook'],'elko-nv-10a-1':['tax','elko-nv-10a-1'],'elko-nv-10a-2':['tax','elko-nv-10a-2'],'navajo-az-10':['tax','navajo-az-10'],'iron-ut-113':['tax','iron-ut-113'],'modena-ut-112':['tax','modena-ut-112'],'valencia-nm-rge-1':['tax','valencia-nm-rge-1'],'valencia-nm-rancho-215':['tax','valencia-nm-rancho-215'],'lancaster-ca-210':['tax','lancaster-ca-210'],'lancaster-ca-253':['tax','lancaster-ca-253'],'pahrump-nv-232':['tax','pahrump-nv-232'],'apache-az-464':['tax','apache-az-464'] };
 const statuses=['missing','unknown','payment_options_unverified','assessment_incomplete','paid','payment_unverified','payment_failed','deadline_unverified','stale','credit_balance','no_balance_due','balance_due','balance_unavailable','no_balance','pending','scheduled_unconfirmed','overdue'];
 const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x));
 const money=(x,negative=false)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=100000000&&(negative||x>=0)&&Math.abs(x*100-Math.round(x*100))<0.00001;
 function validate(summary,now=Date.now()){
  if(summary?.schemaVersion!==1||!iso(summary.generatedAt)||now-Date.parse(summary.generatedAt)>300000||Date.parse(summary.generatedAt)>now+60000||!Array.isArray(summary.records)||summary.records.length!==Object.keys(expected).length)throw Error('Invalid live data');
  const seen=new Set();const records=summary.records.map(r=>{
   const mapping=expected[r?.propertyId];
   if(!mapping||seen.has(r.propertyId)||r.kind!==mapping[0]||r.financeId!==mapping[1]||!statuses.includes(r.status)||typeof r.fresh!=='boolean'||typeof r.paymentConfirmed!=='boolean')throw Error('Invalid live record');seen.add(r.propertyId);
   const out={propertyId:r.propertyId,financeId:r.financeId,kind:r.kind,status:r.status,fresh:false,paymentConfirmed:false};
   if(r.status==='missing')return out;
   if(!iso(r.observedAt)||Date.parse(r.observedAt)>now+60000||!(r.balanceDue===null||money(r.balanceDue,true)))throw Error('Invalid observation');
   out.observedAt=r.observedAt;out.balanceDue=r.balanceDue;out.fresh=r.fresh&&now-Date.parse(r.observedAt)<=48*3600000;out.paymentConfirmed=out.fresh&&r.status==='paid'&&r.paymentConfirmed;
   if(r.dueDate!==null&&!(typeof r.dueDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)&&new Date(r.dueDate+'T00:00:00Z').toISOString().slice(0,10)===r.dueDate))throw Error('Invalid obligation date');out.dueDate=r.dueDate;
   for(const field of ['monthlyAssessment','annualAssessment'])if(r[field]!==undefined){if(!money(r[field]))throw Error('Invalid assessment');out[field]=r[field];}
   if(r.status==='payment_options_unverified'&&!r.paymentOptions)throw Error('County alternatives unavailable');
   if(r.paymentOptions!==undefined){if(!Array.isArray(r.paymentOptions)||r.paymentOptions.length!==2||r.propertyId!=='apache-az-464')throw Error('Invalid county options');const types=new Set();out.paymentOptions=r.paymentOptions.map(o=>{if(!['first_half_option','full_payment_option'].includes(o.type)||types.has(o.type)||!/^\d{4}-\d{2}-\d{2}$/.test(o.dueDate)||new Date(o.dueDate+'T00:00:00Z').toISOString().slice(0,10)!==o.dueDate||!money(o.amount))throw Error('Invalid county option');types.add(o.type);return {type:o.type,dueDate:o.dueDate,amount:o.amount};});}
   if(r.assessmentScope!==undefined){if(!['full_assessment','base_tax_only'].includes(r.assessmentScope))throw Error('Invalid assessment scope');out.assessmentScope=r.assessmentScope;}
   for(const field of ['monitoringDueDate','reviewByDate'])if(r[field]!==undefined){if(r.kind!=='hoa'||typeof r[field]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r[field])||new Date(r[field]+'T00:00:00Z').toISOString().slice(0,10)!==r[field])throw Error('Invalid HOA policy date');out[field]=r[field];}
   if(r.priority!==undefined){if(!['routine','important'].includes(r.priority))throw Error('Invalid priority');out.priority=r.priority;}
   if(r.taxYear!==undefined){if(!/^20\d{2}(\/20\d{2})?$/.test(r.taxYear))throw Error('Invalid tax year');out.taxYear=r.taxYear;}
   return out;
  });return {schemaVersion:1,generatedAt:summary.generatedAt,records};
 }
 let pending=null,onData=null,last=null,timer=null;
 const usd=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD'});
 function status(text){const n=root.document?.getElementById('monitorStatus');if(n)n.textContent=text;}
 function render(summary){const body=root.document?.getElementById('monitorRows');if(!body)return;body.replaceChildren();
  const properties=[...(root.ADEX_DATA?.rentals||[]),...(root.ADEX_DATA?.lands||[])];
  for(const r of summary.records){const row=root.document.createElement('tr');const title=properties.find(p=>p.id===r.financeId)?.name||r.financeId;
   const state=r.status==='missing'?'Not connected':!r.fresh?'Stale observation':r.status==='payment_options_unverified'?'Alternative payment options: '+r.paymentOptions.map(o=>o.type.replaceAll('_',' ')+' '+o.dueDate+' '+usd(o.amount)).join('; '):r.status==='balance_unavailable'?'Balance unavailable':r.assessmentScope==='base_tax_only'?'Special assessments unverified':r.status==='credit_balance'?'Credit balance':r.status==='no_balance_due'?'No balance due':r.paymentConfirmed?'Payment confirmed':r.status==='balance_due'?'Balance to review':'Payment unverified';
   const balance=r.status==='missing'||r.balanceDue===null?'Not verified':r.balanceDue<0?'Credit '+usd(-r.balanceDue):usd(r.balanceDue);
   const assessment=r.monthlyAssessment!==undefined?usd(r.monthlyAssessment)+' / month':r.annualAssessment!==undefined?usd(r.annualAssessment)+(r.assessmentScope==='base_tax_only'?' base tax; excludes special assessments':' / tax year'):'Published value retained';
   for(const text of [title,state+(r.monitoringDueDate?' | Due by '+r.monitoringDueDate+' (owner policy)'+(r.priority==='important'?' | IMPORTANT':''):''),balance,assessment,r.observedAt?new Date(r.observedAt).toLocaleString():'—']){const cell=root.document.createElement('td');cell.textContent=text;row.appendChild(cell);}body.appendChild(row);
  }
 }
 function receive(event){
  if(!pending||event.origin!==origin||event.source!==pending.window||event.data?.type!=='adex-monitor-summary'||event.data.nonce!==pending.nonce||Date.now()-pending.started>600000)return;
  try{const summary=validate(event.data.summary);last=summary;pending.window?.close();pending=null;if(timer){root.clearInterval(timer);timer=null;}render(summary);onData?.(summary);const fresh=summary.records.filter(r=>r.fresh).length;status(`Live monitoring loaded: ${fresh} current observations. Unconnected and stale records retain published values.`);}catch{status('Live data could not be verified. Published values are retained.');}
 }
 function refresh(){
  if(root.location?.origin!=='https://adexholdings.com'){status('Open adexholdings.com to connect private monitoring.');return;}
  const nonce=Array.from(root.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const popup=root.open(origin+'/finance/bridge?nonce='+nonce,'adex-live-monitor','width=640,height=440');
  if(!popup){status('Allow the sign-in window, then select Refresh live data again.');return;}
  if(timer)root.clearInterval(timer);pending={window:popup,nonce,started:Date.now()};if(root.setInterval)timer=root.setInterval(()=>{if(pending&&(pending.window.closed||Date.now()-pending.started>600000)){pending=null;root.clearInterval(timer);timer=null;status('Connection closed without live data. Published values are retained.');}},1000);status('Connecting to private live monitoring…');
 }
 function mount(callback){onData=callback||null;const button=root.document?.getElementById('monitorRefresh');if(button)button.onclick=refresh;if(last){render(last);onData?.(last);}}
 root.AdexMonitor={mount,refresh,validate,receive};root.addEventListener?.('message',receive);
})(typeof window==='undefined'?globalThis:window);
