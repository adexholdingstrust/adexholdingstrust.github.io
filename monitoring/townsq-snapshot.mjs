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
export function townSqSnapshot(accounts,now=new Date()){
 const {account}=hoyeAccount(accounts);
 return {kind:'hoa',propertyId:'aurora-hoye-co',provider:'TownSq',sourceUrl:`https://app.townsq.io/w/${TOWNSQ_COMMUNITY}/user-accounts`,observedAt:now.toISOString(),dueDate:null,amountDue:null,balanceDue:account.currentBalance,payments:[]};
}
