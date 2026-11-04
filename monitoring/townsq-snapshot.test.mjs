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
