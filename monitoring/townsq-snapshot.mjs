/* Normalize only the owner's pinned Hoye account; never allocate payments by guess. */
export const TOWNSQ_COMMUNITY='672048ef610bb549fcae2a41';
const accountNumber='706729';
const money=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=100000000&&Math.abs(value*100-Math.round(value*100))<0.00001;
export function hoyeAccount(accounts){
 if(!Array.isArray(accounts?.content))throw Error('TownSq accounts unavailable');
 const matches=accounts.content.filter(x=>String(x?.account?.accountNumber)===accountNumber&&x?.condo?.id===TOWNSQ_COMMUNITY);
 if(matches.length!==1)throw Error('Hoye account identity not unique');
 const account=matches[0].account;
 if(account.allowInquiry!==true||typeof account.accountUuid!=='string'||!account.accountUuid||!money(account.currentBalance))throw Error('Hoye account balance unavailable');
 return matches[0];
}
export function townSqSnapshot(accounts,now=new Date(),ledger=null){
 const {account}=hoyeAccount(accounts);
 const snapshot={kind:'hoa',propertyId:'aurora-hoye-co',provider:'TownSq',sourceUrl:`https://app.townsq.io/w/${TOWNSQ_COMMUNITY}/user-accounts`,observedAt:now.toISOString(),dueDate:null,amountDue:null,balanceDue:account.currentBalance,payments:[]};
 if(ledger!==null){
  if(ledger.account?.account?.accountUuid!==account.accountUuid||ledger.account?.account?.accountNumber!==account.accountNumber||ledger.account?.condo?.id!==TOWNSQ_COMMUNITY||ledger.account?.account?.currentBalance!==account.currentBalance||!Array.isArray(ledger.transactions))throw Error('Hoye ledger identity or balance mismatch');
  const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit'}).format(now);
  // The resident portal presents postDate in its UTC calendar; do not assign credits.
  const assessments=ledger.transactions.filter(t=>t.type==='Assessment'&&/^assessment(?:[- ]monthly)?$/i.test(t.comment||'')&&money(t.amount)&&t.amount>0&&typeof t.postDate==='number'&&Number.isFinite(t.postDate)&&t.postDate<=now.getTime()&&new Date(t.postDate).toISOString().slice(0,7)===month);
  if(assessments.length===1){snapshot.monthlyAssessment=assessments[0].amount;snapshot.amountDue=assessments[0].amount;snapshot.dueDate=new Date(assessments[0].postDate).toISOString().slice(0,10);}
 }
 return snapshot;
}
