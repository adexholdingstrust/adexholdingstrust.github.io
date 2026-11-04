import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSnapshot,evaluateSnapshot,localDate} from './snapshots.js';
const now=new Date('2026-11-07T16:00:00.000Z');
const base={kind:'hoa',propertyId:'aurora-oxford-co',provider:'LCM',sourceUrl:'https://lcmpropertymanagement.com/AccountStatus/40583~10533163/',observedAt:now.toISOString(),dueDate:'2026-11-01',amountDue:205,balanceDue:-605,payments:[],monthlyAssessment:205,autopayScheduled:true};
const validate=value=>validateSnapshot(value,[],now);
test('credit and scheduled autopay never prove payment',()=>{const e=evaluateSnapshot(validate(base),now);assert.equal(e.paymentConfirmed,false);assert.equal(e.status,'payment_unverified');});
test('allocated posted evidence confirms the assessment',()=>{const payments=[{reference:'posted-123',amount:205,dueDate:'2026-11-01',postedOn:'2026-11-02',status:'posted',evidence:'hoa_account_ledger'}];assert.equal(evaluateSnapshot(validate({...base,payments}),now).paymentConfirmed,true);});
test('reversal removes confirmation',()=>{const payments=[{reference:'a',amount:205,dueDate:base.dueDate,postedOn:'2026-11-02',status:'posted',evidence:'hoa_account_ledger'},{reference:'b',amount:205,dueDate:base.dueDate,postedOn:'2026-11-03',status:'reversed',evidence:'hoa_account_ledger'}];assert.equal(evaluateSnapshot(validate({...base,payments}),now).paymentConfirmed,false);});
test('stale snapshot cannot be confirmed on scheduled recheck',()=>assert.equal(evaluateSnapshot(validate(base),new Date('2026-11-10T16:00:00Z')).alertType,'monitor_stale'));
test('unknown property, source, impossible date, coercion, and secrets rejected',()=>{for(const patch of [{propertyId:'other'},{sourceUrl:'https://evil.test/'},{dueDate:'2026-02-30'},{amountDue:'205'},{password:'do-not-store'},{observedAt:'2026-11-07T16:00:00Z'}])assert.throws(()=>validate({...base,...patch}));});
test('duplicate references and future payment dates rejected',()=>{const p={reference:'a',amount:205,dueDate:base.dueDate,postedOn:'2026-11-02',status:'posted',evidence:'hoa_account_ledger'};assert.throws(()=>validate({...base,payments:[p,p]}));assert.throws(()=>validate({...base,payments:[{...p,postedOn:'2026-11-08'}]}));});
test('property calendar uses local date near midnight and DST',()=>assert.equal(localDate(new Date('2026-11-02T02:00:00Z'),'America/Los_Angeles'),'2026-11-01'));
test('tax missing deadline stays unverified, never guessed',()=>{const tax=validateSnapshot({...base,kind:'tax',propertyId:'elko',provider:'county',sourceUrl:'https://county.test/tax/123',taxYear:'2026/2027',dueDate:null},[{propertyId:'elko',state:'NV',taxPortalUrl:'https://county.test/'}],now);assert.equal(evaluateSnapshot(tax,now).status,'deadline_unverified');});
test('county confirmation requires matching ledger and bill totals, paid year and zero overall balance',()=>{const tax={...base,kind:'tax',propertyId:'elko',provider:'Elko County',sourceUrl:'https://county.test/tax/123',taxYear:'2026/2027',dueDate:null,amountDue:11.73,annualAssessment:11.73,balanceDue:0,countySettlement:{method:'county_account_and_bill',postedTotal:11.73,billPreviousPayments:11.73,currentYearBalance:0}};const properties=[{propertyId:'elko',state:'NV',taxPortalUrl:'https://county.test/'}];const good=validateSnapshot(tax,properties,now);assert.equal(evaluateSnapshot(good,now).paymentConfirmed,true);assert.equal(evaluateSnapshot({...good,balanceDue:5},now).paymentConfirmed,false);assert.equal(evaluateSnapshot({...good,countySettlement:{...good.countySettlement,currentYearBalance:1}},now).paymentConfirmed,false);assert.throws(()=>validateSnapshot({...tax,countySettlement:{...tax.countySettlement,billPreviousPayments:0}},properties,now));});
test('county tax bill with unknown balance never implies payment or overdue debt',()=>{const tax={...base,kind:'tax',propertyId:'nye',provider:'Nye County',sourceUrl:'https://county.test/bill',taxYear:'2026/2027',dueDate:'2026-11-15',amountDue:48,annualAssessment:96,balanceDue:null,installments:[{dueDate:'2026-11-15',amount:48},{dueDate:'2027-01-15',amount:48}]};const props=[{propertyId:'nye',state:'NV',taxPortalUrl:'https://county.test/'}];const snapshot=validateSnapshot(tax,props,now);const result=evaluateSnapshot(snapshot,now);assert.equal(result.status,'payment_unverified');assert.equal(result.paymentConfirmed,false);assert.equal(result.alertType,'payment_verification_due');assert.throws(()=>validateSnapshot({...tax,installments:[...tax.installments,tax.installments[0]]},props,now));});
test('past tax installment requires verification without asserting delinquency',()=>{const tax={...base,kind:'tax',propertyId:'nye',provider:'Nye County',sourceUrl:'https://county.test/bill',taxYear:'2026/2027',dueDate:'2027-01-15',amountDue:48,annualAssessment:96,balanceDue:null,installments:[{dueDate:'2026-10-05',amount:48},{dueDate:'2027-01-15',amount:48}]};const props=[{propertyId:'nye',state:'NV',taxPortalUrl:'https://county.test/'}];const result=evaluateSnapshot(validateSnapshot(tax,props,now),now);assert.equal(result.status,'payment_unverified');assert.equal(result.requiresHumanReview,true);assert.equal(result.alertType,'payment_verification_due');});

test('bank and email evidence cannot confirm HOA, including old stored records',()=>{
 const p={reference:'a',amount:205,dueDate:base.dueDate,postedOn:'2026-11-02',status:'posted'};
 for(const evidence of [undefined,'bank_withdrawal','email_receipt','scheduled_autopay']) {
  const payments=[{...p,...(evidence?{evidence}:{})}];
  assert.throws(()=>validate({...base,payments}));
  assert.equal(evaluateSnapshot({...base,zone:'America/Los_Angeles',payments},now).paymentConfirmed,false);
 }
});
test('partial and prior-month HOA payments cannot confirm current assessment',()=>{
 const p={reference:'a',amount:120,dueDate:base.dueDate,postedOn:'2026-11-02',status:'posted',evidence:'hoa_account_ledger'};
 assert.equal(evaluateSnapshot(validate({...base,payments:[p]}),now).paymentConfirmed,false);
 assert.equal(evaluateSnapshot(validate({...base,payments:[{...p,amount:205,dueDate:'2026-10-01'}]}),now).paymentConfirmed,false);
 assert.equal(evaluateSnapshot(validate({...base,payments:[p,{...p,reference:'b',amount:85}]}),now).evidence,'hoa_account_ledger');
});

test('HOA missing allocation is unverified and never asserts unpaid debt',()=>{
 const s=validate({...base,balanceDue:null});
 const result=evaluateSnapshot(s,now);assert.equal(result.status,'payment_unverified');assert.equal(result.alertType,'payment_verification_due');
 assert.equal(result.paymentConfirmed,false);assert.equal(result.requiresHumanReview,true);
});

test('FrontSteps balance-only observation cannot confirm an unknown assessment',()=>{
 const snapshot=validate({...base,amountDue:null,dueDate:null,balanceDue:-605,sourceUpdatedAt:'2026-10-23T12:00:00.000Z'});
 const result=evaluateSnapshot(snapshot,now);assert.equal(result.status,'payment_unverified');assert.equal(result.paymentConfirmed,false);assert.equal(result.sourceStale,true);
 assert.throws(()=>validate({...base,sourceUpdatedAt:'2027-01-01T00:00:00.000Z'}));
});

test('Calabrese uses dashboard balance policy without requiring individual payment proof',()=>{
 const account={...base,propertyId:'fallbrook-ca',provider:'FrontSteps',sourceUrl:'https://horsecreekridge.frontsteps.com/dashboard',amountDue:null,dueDate:null,payments:[],sourceUpdatedAt:now.toISOString()};
 for(const [balanceDue,status,alertType] of [[-725,'credit_balance','balance_update'],[0,'no_balance_due','balance_update'],[120,'balance_due','balance_due'],[null,'balance_unavailable','balance_unavailable']]) {
  const result=evaluateSnapshot(validate({...account,balanceDue}),now);
  assert.equal(result.monitoringMode,'balance_only');assert.equal(result.status,status);assert.equal(result.alertType,alertType);assert.equal(result.paymentConfirmed,false);
 }
 const result=evaluateSnapshot({...account,balanceDue:-725,zone:'America/Los_Angeles'},new Date('2026-11-10T16:00:00Z'));
 assert.equal(result.monitoringMode,'balance_only');assert.equal(result.alertType,'monitor_stale');
});

test('assessor base taxes cannot confirm payment or imply a complete obligation',()=>{
 const value={...base,kind:'tax',propertyId:'valencia',provider:'Valencia County Assessor',sourceUrl:'https://county.test/tax',taxYear:'2026',dueDate:null,amountDue:4.76,annualAssessment:4.76,balanceDue:null,assessmentScope:'base_tax_only',payments:[]};
 const snapshot=validateSnapshot(value,[{propertyId:'valencia',state:'NM',taxPortalUrl:'https://county.test/'}],now);
 const result=evaluateSnapshot(snapshot,now);assert.equal(result.status,'assessment_incomplete');assert.equal(result.paymentConfirmed,false);assert.equal(result.alertType,'assessment_verification_due');assert.equal(result.requiresHumanReview,true);
 assert.throws(()=>validate({...base,assessmentScope:'base_tax_only'}));
});

test('Navajo confirmation requires reconciled recorded receipts, tax detail and zero balances',()=>{
 const properties=[{propertyId:'navajo-az-10',state:'AZ',taxPortalUrl:'https://apps.navajocountyaz.gov/NavajoWebPayments/PropertyInformation'}];
 const value={kind:'tax',propertyId:'navajo-az-10',provider:'Navajo County',sourceUrl:properties[0].taxPortalUrl,observedAt:now.toISOString(),dueDate:'2026-12-31',amountDue:100.05,annualAssessment:100.05,taxYear:'2026',balanceDue:0,payments:[],countySettlement:{method:'county_ledger_and_receipts',postedTotal:100.05,receiptTotal:100.05,taxDetailTotal:100.05,currentYearBalance:0,interestAndFees:0,latestReceiptOn:'2026-10-01'}};
 const snapshot=validateSnapshot(value,properties,now);assert.equal(evaluateSnapshot(snapshot,now).paymentConfirmed,true);assert.equal(evaluateSnapshot({...snapshot,balanceDue:1},now).paymentConfirmed,false);
 for(const patch of [{receiptTotal:1},{taxDetailTotal:1},{interestAndFees:2},{latestReceiptOn:'2027-01-01'}])assert.throws(()=>validateSnapshot({...value,countySettlement:{...value.countySettlement,...patch}},properties,now));
});
test('Apache alternatives retain an unknown obligation and never become additive installments',()=>{
 const properties=[{propertyId:'apache-az-464',state:'AZ',taxPortalUrl:'https://eagletreasurer.co.apache.az.us:8443/treasurer/treasurerweb/account.jsp?account=R0042800'}];
 const value={kind:'tax',propertyId:'apache-az-464',provider:'Apache County',sourceUrl:properties[0].taxPortalUrl,observedAt:now.toISOString(),dueDate:null,amountDue:null,annualAssessment:24.5,taxYear:'2026',balanceDue:null,payments:[],paymentOptions:[{type:'first_half_option',dueDate:'2026-11-02',amount:12.25},{type:'full_payment_option',dueDate:'2026-12-31',amount:24.5}]};
 const snapshot=validateSnapshot(value,properties,now);assert.equal(evaluateSnapshot(snapshot,now).status,'payment_options_unverified');assert.equal(evaluateSnapshot(snapshot,now).paymentConfirmed,false);
 assert.throws(()=>validateSnapshot({...value,paymentOptions:[value.paymentOptions[0],value.paymentOptions[0]]},properties,now));assert.throws(()=>validateSnapshot({...value,paymentOptions:undefined},properties,now));
});
test('owner HOA policy uses the tenth and escalates from the local eighth',()=>{
 for(const day of ['07','08','10','11']){
  const date=new Date(`2026-11-${day}T16:00:00.000Z`);
  const s={...base,propertyId:'aurora-hoye-co',zone:'America/Denver',observedAt:date.toISOString(),dueDate:null,amountDue:null,balanceDue:125.25,payments:[]};
  const r=evaluateSnapshot(s,date);assert.equal(r.daysUntilDue,10-Number(day));assert.equal(r.monitoringDueDate,'2026-11-10');assert.equal(r.reviewByDate,'2026-11-08');assert.equal(r.priority,day==='07'?'routine':'important');assert.equal(r.paymentConfirmed,false);assert.equal(r.pastMonitoringDueDate,day==='11');
 }
 const boundary=new Date('2026-11-08T06:30:00.000Z');
 assert.equal(evaluateSnapshot({...base,zone:'America/Denver',observedAt:boundary.toISOString()},boundary).priority,'routine');
});
test('monthly policy preserves payment allocation and resets confirmations at month rollover',()=>{
 const now=new Date('2026-11-08T16:00:00.000Z');
 const paid={...base,zone:'America/Denver',observedAt:now.toISOString(),payments:[{reference:'allocation',status:'posted',amount:205,dueDate:'2026-11-01',postedOn:'2026-11-02',evidence:'hoa_account_ledger'}]};
 const result=evaluateSnapshot(paid,now);assert.equal(result.paymentConfirmed,true);assert.equal(result.priority,'routine');assert.equal(result.monitoringDueDate,'2026-11-10');assert.equal(paid.payments[0].dueDate,'2026-11-01');
 const december=new Date('2026-12-08T16:00:00.000Z');
 const next=evaluateSnapshot({...paid,observedAt:december.toISOString()},december);assert.equal(next.paymentConfirmed,false);assert.equal(next.priority,'important');assert.equal(next.monitoringDueDate,'2026-12-10');assert.equal(next.monitoringAmountDue,null);
});
test('Calabrese credit coverage remains routine but debt or stale coverage becomes important on eighth',()=>{
 const date=new Date('2026-11-08T16:00:00.000Z');
 const s={...base,propertyId:'fallbrook-ca',zone:'America/Los_Angeles',observedAt:date.toISOString(),dueDate:null,amountDue:null,payments:[]};
 assert.equal(evaluateSnapshot({...s,balanceDue:-25},date).priority,'routine');assert.equal(evaluateSnapshot({...s,balanceDue:0},date).priority,'routine');
 assert.equal(evaluateSnapshot({...s,balanceDue:25},date).priority,'important');assert.equal(evaluateSnapshot({...s,balanceDue:null},date).priority,'important');
 const stale=evaluateSnapshot({...s,balanceDue:-25,observedAt:'2026-11-01T16:00:00.000Z'},date);assert.equal(stale.priority,'important');assert.equal(stale.alertType,'monitor_stale');
});
test('complete county ledger balance with no deadline prompts review without fabricating payment or a due date',()=>{
 const value={kind:'tax',propertyId:'valencia-nm-rge-1',provider:'Valencia County Treasurer',sourceUrl:'https://valenciacountynm-treasurerweb.tylerhost.net/treasurer/treasurerweb/account.jsp?account=R023098&action=tx',observedAt:now.toISOString(),dueDate:null,amountDue:10.75,balanceDue:10.75,payments:[],annualAssessment:10.75,taxYear:'2026',assessmentScope:'full_assessment'};
 const props=[{propertyId:value.propertyId,state:'NM',taxPortalUrl:value.sourceUrl}];
 const r=evaluateSnapshot(validateSnapshot(value,props,now),now);assert.equal(r.status,'deadline_unverified');assert.equal(r.alertType,'deadline_verification_due');assert.equal(r.paymentConfirmed,false);assert.equal(r.requiresHumanReview,true);
 assert.equal(evaluateSnapshot({...validateSnapshot(value,props,now),balanceDue:0},now).paymentConfirmed,false);
});
