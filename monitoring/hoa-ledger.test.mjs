import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lcmSnapshot,ledgerDate,ledgerMoney} from './hoa-ledger.js';
const now=new Date('2026-11-02T19:00:00.000Z');
test('LCM current assessment is verified without allocating unreferenced credits',()=>{
 const result=lcmSnapshot([['11/01/2026','Monthly assessment','$635.03',''],['11/02/2026','Payment','','635.03']],now);
 assert.equal(result.amountDue,635.03);assert.equal(result.dueDate,'2026-11-01');assert.deepEqual(result.payments,[]);assert.equal(result.balanceDue,null);
});
test('missing, future and ambiguous assessments fail closed',()=>{
 for(const rows of [[],[['12/01/2026','Assessment','635.03','']],[['11/01/2026','Assessment','635.03',''],['11/02/2026','Assessment','635.03','']]])assert.throws(()=>lcmSnapshot(rows,now));
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
