// Collector contract. Never accept credentials or infer payment from an account balance.
import {classifyHOAPayment} from '../monitoring/hoa-rules.js';
export const HOA_PROPERTIES = Object.freeze({
  'aurora-oxford-co': {provider:'LCM', host:'lcmpropertymanagement.com', zone:'America/Denver'},
  'aurora-hoye-co': {provider:'TownSq', host:'app.townsq.io', zone:'America/Denver'},
  'fallbrook-ca': {provider:'FrontSteps', host:'horsecreekridge.frontsteps.com', zone:'America/Los_Angeles'}
});
export function localDate(now, zone) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validDate(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
const money = value => typeof value==='number' && Number.isFinite(value) && value>=0 && value<=100000000 && Math.abs(value*100-Math.round(value*100))<0.00001;
function keys(value, allowed) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k))) throw Error('Invalid fields');
}
export function validateSnapshot(value, taxProperties, now = new Date()) {
  keys(value,['kind','propertyId','provider','sourceUrl','observedAt','dueDate','amountDue','balanceDue','payments','monthlyAssessment','annualAssessment','taxYear','autopayScheduled','countySettlement']);
  const hoa=HOA_PROPERTIES[value.propertyId];
  const tax=taxProperties.find(p=>p.propertyId===value.propertyId);
  if(!['hoa','tax'].includes(value.kind) || (value.kind==='hoa'?!hoa:!tax)) throw Error('Unknown property');
  const zone=value.kind==='hoa'?hoa.zone:tax.state==='AZ'?'America/Phoenix':tax.state==='CA'||tax.state==='NV'?'America/Los_Angeles':'America/Denver';
  const observed=Date.parse(value.observedAt);
  if(typeof value.observedAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.observedAt) || !Number.isFinite(observed) || observed>now.getTime()+60000 || now-observed>48*3600000) throw Error('Stale observation');
  const host=value.kind==='hoa'?hoa.host:new URL(tax.taxPortalUrl).hostname;
  const url=new URL(value.sourceUrl);
  if(url.protocol!=='https:' || url.hostname!==host || url.username || url.password || url.hash) throw Error('Invalid source');
  if(value.kind==='hoa' && value.provider!==hoa.provider) throw Error('Provider mismatch');
  if(!(validDate(value.dueDate) || value.kind==='tax' && value.dueDate===null) || !money(value.amountDue) || typeof value.balanceDue!=='number' || !Number.isFinite(value.balanceDue) || Math.abs(value.balanceDue)>100000000 || !Array.isArray(value.payments) || value.payments.length>1000) throw Error('Invalid obligation');
  if(value.monthlyAssessment!==undefined && !money(value.monthlyAssessment)) throw Error('Invalid assessment');
  if(value.annualAssessment!==undefined && !money(value.annualAssessment)) throw Error('Invalid assessment');
  if(value.kind==='tax' && !/^20\d{2}(\/20\d{2})?$/.test(value.taxYear||'')) throw Error('Invalid tax year');
  if(value.autopayScheduled!==undefined && typeof value.autopayScheduled!=='boolean') throw Error('Invalid autopay');
  if(value.countySettlement!==undefined) {
    const proof=value.countySettlement;
    keys(proof,['method','postedTotal','currentYearBalance','billPreviousPayments']);
    if(value.kind!=='tax' || proof.method!=='county_account_and_bill' || !money(value.annualAssessment) || value.annualAssessment<=0 || !money(proof.postedTotal) || !money(proof.currentYearBalance) || !money(proof.billPreviousPayments) || proof.postedTotal!==proof.billPreviousPayments) throw Error('Invalid county settlement');
  }
  const references=new Set();
  for(const p of value.payments) {
    keys(p,['reference','amount','dueDate','postedOn','status']);
    if(typeof p.reference!=='string' || !/^[a-zA-Z0-9._:-]{1,120}$/.test(p.reference) || references.has(p.reference) || !money(p.amount) || p.amount<=0 || !validDate(p.dueDate) || !validDate(p.postedOn) || p.postedOn>localDate(new Date(observed),zone) || !['posted','scheduled','failed','returned','nsf','reversed'].includes(p.status)) throw Error('Invalid payment evidence');
    references.add(p.reference);
  }
  return {...value,zone};
}
export function evaluateSnapshot(snapshot, now = new Date()) {
  const asOfDate=localDate(now,snapshot.zone);
  if(now-Date.parse(snapshot.observedAt)>48*3600000) return {status:'stale',paymentConfirmed:false,asOfDate,alertType:'monitor_stale'};
  const proof=snapshot.countySettlement;
  if(snapshot.kind==='tax' && proof && proof.postedTotal>=snapshot.annualAssessment && proof.currentYearBalance===0 && snapshot.balanceDue===0)
    return {status:'paid',paymentConfirmed:true,asOfDate,alertType:'payment_confirmed',evidence:'county_account_and_bill'};
  if(snapshot.dueDate===null)return {status:'deadline_unverified',paymentConfirmed:false,asOfDate,alertType:null};
  const result=classifyHOAPayment({...snapshot,asOfDate});
  const daysUntilDue=Math.round((Date.parse(snapshot.dueDate+'T00:00:00Z')-Date.parse(asOfDate+'T00:00:00Z'))/86400000);
  const paymentConfirmed=result.status==='paid';
  const alertType=paymentConfirmed?'payment_confirmed':result.status==='payment_failed'?'payment_problem':
    result.status==='overdue' && snapshot.kind==='hoa' && asOfDate>=snapshot.dueDate.slice(0,7)+'-07'?'unconfirmed_by_seventh':result.status==='overdue'?'overdue':daysUntilDue>=0&&daysUntilDue<=(snapshot.kind==='tax'?30:5)&&snapshot.amountDue>0?'upcoming_assessment':null;
  return {...result,asOfDate,paymentConfirmed,daysUntilDue,alertType};
}
