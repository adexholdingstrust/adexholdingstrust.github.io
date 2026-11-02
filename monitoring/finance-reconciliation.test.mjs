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

test('fresh live assessments apply only to their period and never use credits as HOA expense',()=>{
 const context=vm.createContext({console,document:{body:{dataset:{page:'finance'}},getElementById:()=>null,addEventListener(){}}});vm.runInContext(source,context);
 vm.runInContext(`HOA_ASSESSMENT_ACTUALS.set('co-condo',600);HOA_ASSESSMENT_ACTUALS.set('ca-sfh-fallbrook',205);FINANCIALS['co-condo']={hoa:500,tax:100};LIVE_HOA_ACTUALS.set('co-condo',{value:635.03,month:'2026-11'});LIVE_TAX_ACTUALS.set('elko-nv-10a-1',{value:11.73,taxYear:'2026/2027'});`,context);
 assert.equal(vm.runInContext(`computeMonthlyPL({id:'co-condo'},FINANCIALS['co-condo'],'2026-11').hoa`,context),635.03);assert.equal(vm.runInContext(`computeMonthlyPL({id:'co-condo'},FINANCIALS['co-condo'],'2025-11').hoa`,context),600);
 assert.equal(vm.runInContext(`annualTaxFor({id:'elko-nv-10a-1'},{tax:99},'2026-11')`,context),11.73);assert.equal(vm.runInContext(`annualTaxFor({id:'elko-nv-10a-1'},{tax:99},'2026-06')`,context),99);
 assert.equal(vm.runInContext(`monthlyHOAFor({id:'ca-sfh-fallbrook'},{hoa:-725},'2026-11')`,context),205);assert.equal(vm.runInContext(`FINANCIALS['co-condo'].hoa`,context),500);
});
