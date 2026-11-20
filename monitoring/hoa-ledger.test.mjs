import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lcmSnapshot,ledgerDate,ledgerMoney} from './hoa-ledger.js';
const now=new Date('2026-11-02T19:00:00.000Z');
test('LCM current assessment is verified without allocating unreferenced credits',()=>{
 const result=lcmSnapshot([['11/01/2026','Monthly assessment','$635.03',''],['11/02/2026','Payment','','635.03']],now);
 assert.equal(result.amountDue,635.03);assert.equal(result.dueDate,'2026-11-01');assert.deepEqual(result.payments,[]);assert.equal(result.balanceDue,null);
});
test('missing and ambiguous assessments fail closed',()=>{
 for(const rows of [[],[['11/01/2026','Assessment','635.03',''],['11/02/2026','Assessment','635.03','']]])assert.throws(()=>lcmSnapshot(rows,now));
});
test('ledger parsing rejects invalid dates and ambiguous money',()=>{
 assert.equal(ledgerDate('11/1/2026'),'2026-11-01');assert.equal(ledgerMoney('$1,234.56'),1234.56);
 for(const value of ['1,23.00','NaN','(120.00)','120.001'])assert.throws(()=>ledgerMoney(value));
 assert.throws(()=>ledgerDate('02/30/2026'));
});

test('FrontSteps identifies the property and preserves balance without inventing assessment or payment',async()=>{
 const {frontStepsSnapshot}=await import('./hoa-ledger.js');
 const data={payments:[{unit_street_1:'464 Calabrese St',balance:-605,service_unavailable:false,last_updated_at:'2026-10-23T12:00:00Z',accounting_errors:[]}]};
 const snapshot=frontStepsSnapshot(data,now);assert.equal(snapshot.balanceDue,-605);assert.equal(snapshot.amountDue,null);assert.equal(snapshot.dueDate,null);assert.deepEqual(snapshot.payments,[]);
 assert.throws(()=>frontStepsSnapshot({payments:[{...data.payments[0],unit_street_1:'Other unit'}]},now));
 assert.throws(()=>frontStepsSnapshot({payments:[{...data.payments[0],service_unavailable:true}]},now));
});

test('LCM only accepts explicit, unambiguous account balance labels',async()=>{
 const {lcmDashboardBalance}=await import('./hoa-ledger.js');
 assert.equal(lcmDashboardBalance([['Balance Due:','$684.28']]),684.28);
 assert.equal(lcmDashboardBalance([['Current Balance','($725.00)']]),-725);
 assert.equal(lcmDashboardBalance([['Assessment','$635.03']]),null);
 assert.equal(lcmDashboardBalance([['Balance Due','$684.28'],['Current Balance','$700.00']]),null);
 assert.equal(lcmDashboardBalance([['Balance Due','unknown']]),null);
 const result=lcmSnapshot([['11/01/2026','Monthly assessment','635.03','']],new Date('2026-11-02T12:00:00Z'),684.28);assert.equal(result.balanceDue,684.28);assert.deepEqual(result.payments,[]);
});
test('LCM reads the explicit Balance Due label when label and value share a cell',async()=>{
 const {lcmDashboardBalance,lcmBalancePairsFromText}=await import('./hoa-ledger.js');
 const read=text=>lcmDashboardBalance(lcmBalancePairsFromText(text));
 assert.equal(read('Financials and Payments\nBalance Due: $45.23\nPay Online!\nTransaction History\n11/01/2026 Assessment-Monthly $600.00'),45.23);
 assert.equal(read('Balance Due:\n$45.23\nPay Online!'),45.23);
 assert.equal(read('Balance Due: ($25.00)'),-25);
 assert.equal(read('Balance Due: $0.00'),0);
 assert.equal(read('Balance Due: unavailable\nTransaction History\nAssessment $600.00'),null);
 assert.equal(read('Previous Balance Due: $600.00\nCharge $600.00'),null);
 assert.equal(read('Balance Due: $45.23\nBalance Due: $46.23'),null);
 assert.equal(read('Balance Due: $45.231'),null);
 assert.equal(lcmDashboardBalance([['Balance Due','$5.00'],...lcmBalancePairsFromText('Balance Due: $45.23')]),null);
});

test('LCM combines account-page and ledger balance evidence without substituting assessment charges', async () => {
 const {lcmDashboardBalance, lcmBalancePairsFromText} = await import('./hoa-ledger.js');
 const accountText = 'Account Status\nBalance Due:\u00a0$49.23\nPay Online';
 const ledgerText = 'Date Description Charge Credit\n11/01/2026 Assessment $635.03';
 const pairs = [...lcmBalancePairsFromText(accountText), ...lcmBalancePairsFromText(ledgerText)];
 assert.equal(lcmDashboardBalance(pairs), 49.23);
 assert.equal(lcmDashboardBalance([...pairs, ...lcmBalancePairsFromText('Balance Due: $50.00')]), null);
});

test('LCM balance labels support nested-cell text, line breaks and currency spacing', async () => {
 const {lcmDashboardBalance, lcmBalancePairsFromText} = await import('./hoa-ledger.js');
 for (const text of ['Balance Due:\n49.23', 'Balance Due\n$49.23', 'Current Balance: $ 49.23', 'Balance Due: $\u00a049.23']) {
  assert.equal(lcmDashboardBalance(lcmBalancePairsFromText(text)), 49.23);
 }
 assert.equal(lcmDashboardBalance(lcmBalancePairsFromText('Previous Balance Due: $49.23')), null);
 assert.equal(lcmDashboardBalance(lcmBalancePairsFromText('Balance Due: 49.231')), null);
});

test('LCM accepts a plain inline balance label inside a shared cell', async () => {
 const {lcmDashboardBalance, lcmBalancePairsFromText} = await import('./hoa-ledger.js');
 for (const text of ['Balance Due $49.23', 'Balance Due$49.23', 'Balance Due 49.23', 'Balance Due\n:\n$49.23']) {
  assert.equal(lcmDashboardBalance(lcmBalancePairsFromText(text)), 49.23);
 }
});

test('LCM accepts its live fractional-only balance currency format', async () => {
 const {lcmDashboardBalance, lcmBalancePairsFromText} = await import('./hoa-ledger.js');
 for (const [display, expected] of [['$.00', 0], ['$.23', 0.23], ['-$.23', -0.23], ['($.23)', -0.23]]) {
  assert.equal(lcmDashboardBalance([['Balance', display]]), expected);
  assert.equal(lcmDashboardBalance(lcmBalancePairsFromText('Balance:\n' + display)), expected);
 }
 for (const display of ['$.', '$.2', '$.234', '$.00unknown']) {
  assert.equal(lcmDashboardBalance([['Balance', display]]), null);
  assert.equal(lcmDashboardBalance(lcmBalancePairsFromText('Balance:\n' + display)), null);
 }
 assert.equal(lcmDashboardBalance([['Balance', '$.00'], ['Balance', '$.23']]), null);
});

test('reports Paylease credits since the assessment without assigning them to it',()=>{
 const snapshot=lcmSnapshot([
  ['11/01/2026','Assessment-Monthly','500',''],
  ['10/31/2026','Paylease 100','','500'],
  ['11/02/2026','Paylease 101','','25.55'],
  ['11/02/2026','Paylease 102','10',''],
  ['11/02/2026','Returned Paylease 103','','10'],
  ['11/09/2026','Paylease 104','','100']
 ],now,0);
 assert.deepEqual(snapshot.payleaseCredits,[{postedOn:'2026-11-02',amount:25.55}]);
 assert.deepEqual(snapshot.payments,[]);
});

test('Oxford early December assessment is upcoming on November 20',async()=>{
 const {evaluateSnapshot,validateSnapshot}=await import('../hoa-monitor-worker/snapshots.js');
 const {hoaEmail}=await import('../hoa-monitor-worker/hoa-email.js');
 const checked=new Date('2026-11-20T16:21:00Z');
 const rows=[['11/01/2026','Assessment-Monthly','635.03',''],['12/01/2026','Assessment-Monthly','635.03',''],['11/13/2026','Paylease 68220172','','49.23']];
 const snapshot=validateSnapshot(lcmSnapshot(rows,checked,635.03),[],checked);
 const result=evaluateSnapshot(snapshot,checked);
 const mail=hoaEmail(snapshot,result,null);
 assert.equal(result.requiresHumanReview,false);
 assert.match(mail.text,/Monthly assessment due: 2026-12-01/);
 assert.doesNotMatch(mail.text,/2026-11-10|could not match/);
 assert.doesNotMatch(mail.subject,/Review requested/);
});
