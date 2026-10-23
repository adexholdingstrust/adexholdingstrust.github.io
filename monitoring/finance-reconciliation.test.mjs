import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../finance.js',import.meta.url),'utf8');
test('modal and monthly P&L use assessment expense, not biweekly cash outflow or old KV',()=>{
  const nodes={modalTitle:{},modalContent:{},propertyModal:{style:{},classList:{add(){}}}};
  const context=vm.createContext({console,document:{body:{dataset:{page:'finance'}},getElementById:id=>nodes[id]??null,addEventListener(){}}});
  vm.runInContext(source,context);
  vm.runInContext(`HOA_ASSESSMENT_ACTUALS.set('ca-sfh-fallbrook',205);COUNTY_TAX_ACTUALS.set('ca-sfh-fallbrook',1200);FINANCIALS['ca-sfh-fallbrook']={hoa:100,tax:120,rent:3000,mortgage:1000};`,context);
  const result=vm.runInContext(`computeMonthlyPL({id:'ca-sfh-fallbrook'}, FINANCIALS['ca-sfh-fallbrook'],'2026-11')`,context);
  assert.equal(result.hoa,205);assert.equal(result.tax,100);assert.equal(result.expenses,1305);
  vm.runInContext(`openPropertyModal({id:'ca-sfh-fallbrook',name:'Calabrese'})`,context);
  assert.match(nodes.modalContent.innerHTML,/\$205\.00/);assert.match(nodes.modalContent.innerHTML,/\$100\.00/);
  assert.equal(vm.runInContext(`FINANCIALS['ca-sfh-fallbrook'].hoa`,context),100);
});
