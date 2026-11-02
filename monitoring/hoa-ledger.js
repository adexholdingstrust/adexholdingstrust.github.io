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
export function lcmSnapshot(rows,now=new Date()) {
 const today=localDate(now,'America/Denver');
 const entries=rows.filter(row=>row.length===4&&/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(row[0])).map(row=>({date:ledgerDate(row[0]),description:row[1],charge:ledgerMoney(row[2]),credit:ledgerMoney(row[3])}));
 const assessments=entries.filter(e=>/assessment/i.test(e.description)&&e.date.slice(0,7)===today.slice(0,7)&&e.date<=today&&e.charge>0);
 if(assessments.length!==1)throw Error('Current assessment cannot be identified uniquely');
 const assessment=assessments[0];
 // Credits in this four-column view lack an allocation reference. Never invent one.
 return {kind:'hoa',propertyId:'aurora-oxford-co',provider:'LCM',sourceUrl:'https://lcmpropertymanagement.com/AccountStatus/40583~10533163/?type=Account&active=0',observedAt:now.toISOString(),dueDate:assessment.date,amountDue:assessment.charge,monthlyAssessment:assessment.charge,balanceDue:null,payments:[]};
}
