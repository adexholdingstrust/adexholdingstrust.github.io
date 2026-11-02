/* Convert verified portal ledger rows without inventing payment allocation. */
import {localDate,validDate} from '../hoa-monitor-worker/snapshots.js';
export function ledgerDate(value) {
 const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
 if(!match)throw Error('Unsupported ledger date');
 const iso=`${match[3]}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`;
 if(!validDate(iso))throw Error('Invalid ledger date');
 return iso;
}
export function ledgerMoney(value) {
 if(value==='')return 0;
 if(typeof value!=='string'||!/^\$?\s*(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?$/.test(value))throw Error('Invalid ledger amount');
 return Number(value.replace(/[$,\s]/g,''));
}
export function lcmSnapshot(rows,now=new Date(),balanceDue=null) {
 if(balanceDue!==null&&(typeof balanceDue!=='number'||!Number.isFinite(balanceDue)||Math.abs(balanceDue)>100000000))throw Error('Invalid account balance');
 const today=localDate(now,'America/Denver');
 const entries=rows.filter(row=>row.length===4&&/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(row[0])).map(row=>({date:ledgerDate(row[0]),description:row[1],charge:ledgerMoney(row[2]),credit:ledgerMoney(row[3])}));
 const assessments=entries.filter(e=>/assessment/i.test(e.description)&&e.date.slice(0,7)===today.slice(0,7)&&e.date<=today&&e.charge>0);
 if(assessments.length!==1)throw Error('Current assessment cannot be identified uniquely');
 const assessment=assessments[0];
 // Credits in this four-column view lack an allocation reference. Never invent one.
 return {kind:'hoa',propertyId:'aurora-oxford-co',provider:'LCM',sourceUrl:'https://lcmpropertymanagement.com/AccountStatus/40583~10533163/?type=Account&active=0',observedAt:now.toISOString(),dueDate:assessment.date,amountDue:assessment.charge,monthlyAssessment:assessment.charge,balanceDue,payments:[]};
}

export function frontStepsSnapshot(data,now=new Date()) {
 const units=data?.payments?.filter(p=>/\b464\b.*\bcalabrese\b/i.test(p.unit_street_1||''));
 if(units?.length!==1)throw Error('Property identity not unique');
 const unit=units[0];
 if(unit.service_unavailable || unit.accounting_errors?.length || typeof unit.balance!=='number' || !Number.isFinite(unit.balance) || Math.abs(unit.balance)>100000000 || Math.abs(unit.balance*100-Math.round(unit.balance*100))>0.00001)throw Error('Account balance unavailable');
 const sourceUpdatedAt=unit.last_updated_at?new Date(unit.last_updated_at).toISOString():null;
 return {kind:'hoa',propertyId:'fallbrook-ca',provider:'FrontSteps',sourceUrl:'https://horsecreekridge.frontsteps.com/dashboard',observedAt:now.toISOString(),sourceUpdatedAt,dueDate:null,amountDue:null,balanceDue:unit.balance,payments:[]};
}

export function lcmDashboardBalance(pairs) {
 const values=[];
 for(const [label,value] of pairs){
  if(!/^(?:(?:current|account|total)\s+)?balance(?:\s+due)?\s*:?$/i.test(String(label).trim()))continue;
  const text=String(value).trim();
  if(!/^(?:-?\$?-?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?|\(\$?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?\))$/.test(text))continue;
  const number=Number(text.replace(/[$,()]/g,''))*(text.startsWith('(')?-1:1);
  if(Number.isFinite(number)&&Math.abs(number)<=100000000)values.push(number);
 }
 return values.length&&values.every(x=>x===values[0])?values[0]:null;
}
