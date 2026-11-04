import {test} from 'node:test';
import assert from 'node:assert/strict';
import {townSqSnapshot} from './townsq-snapshot.mjs';
import {validateSnapshot,evaluateSnapshot} from '../hoa-monitor-worker/snapshots.js';
const account=(overrides={})=>({condo:{id:'672048ef610bb549fcae2a41'},account:{accountNumber:'706729',accountUuid:'private-reference',allowInquiry:true,currentBalance:125.25,...overrides}});
test('TownSq binds observation to Hoye and does not claim settlement from balance',()=>{
 const now=new Date('2026-11-04T16:00:00.000Z');
 for(const balance of [125.25,0,-25]){
  const snapshot=townSqSnapshot({content:[account({currentBalance:balance}),account({accountNumber:'other'})]},now);
  assert.equal(snapshot.balanceDue,balance);assert.equal(snapshot.dueDate,null);assert.deepEqual(snapshot.payments,[]);
  assert.doesNotMatch(JSON.stringify(snapshot),/private-reference|706729|other/);
  validateSnapshot(snapshot,[],now);assert.equal(evaluateSnapshot(snapshot,now).paymentConfirmed,false);
 }
});
test('TownSq refuses wrong, ambiguous, inaccessible and invalid account balances',()=>{
 for(const content of [[{...account(),condo:{id:'another-community'}}],[],[account({accountNumber:'other'})],[account(),account()],[account({allowInquiry:false})],[account({currentBalance:'125.25'})],[account({currentBalance:NaN})],[account({currentBalance:1.001})]])assert.throws(()=>townSqSnapshot({content}));
});
test('TownSq accepts a unique current portal assessment without allocating ledger credits',()=>{
 const now=new Date('2026-11-04T19:00:00.000Z'),accounts={content:[account()]};
 const assessment={type:'Assessment',comment:'Assessment',amount:100,postDate:Date.parse('2026-11-01T05:00:00.000Z')};
 const ledger={account:accounts.content[0],transactions:[assessment,{type:'Payment',amount:-100,postDate:Date.parse('2026-11-03T05:00:00.000Z')}]};
 const snapshot=townSqSnapshot(accounts,now,ledger);assert.equal(snapshot.monthlyAssessment,100);assert.equal(snapshot.amountDue,100);assert.equal(snapshot.dueDate,'2026-11-01');assert.deepEqual(snapshot.payments,[]);
 assert.equal(townSqSnapshot(accounts,now,{...ledger,transactions:[assessment,assessment]}).monthlyAssessment,undefined);
 assert.throws(()=>townSqSnapshot(accounts,now,{...ledger,account:{...ledger.account,condo:{id:'other'}}}));
 assert.throws(()=>townSqSnapshot(accounts,now,{...ledger,account:{...ledger.account,account:{...ledger.account.account,currentBalance:999}}}));
});
