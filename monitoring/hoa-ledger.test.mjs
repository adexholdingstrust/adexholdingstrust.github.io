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
