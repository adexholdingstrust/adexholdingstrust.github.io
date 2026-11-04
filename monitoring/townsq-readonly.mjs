/* Contract observed in TownSq's public web client: rest/login and resident account GETs.
 * Password SHA1 matches the client's authentication protocol; never log it or any tokens.
 */
import {createHash} from 'node:crypto';
import {townSqSnapshot,hoyeAccount} from './townsq-snapshot.mjs';
const community='672048ef610bb549fcae2a41';
const shape=(v,d=0)=>v===null?'null':Array.isArray(v)?{type:'array',count:v.length,item:d<5?shape(v[0],d+1):typeof v[0]}:typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>/^[A-Za-z_][A-Za-z_0-9]{0,45}$/.test(k)).slice(0,45).map(([k,x])=>[k,d<5?shape(x,d+1):typeof x])):typeof v;
export async function checkTownSq(username,password,{onSnapshot,inspectLedger=true}={}) {
 const headers={'content-type':'application/json',accept:'application/json','accept-language':'en-US','xx-sc-l':'en','X-Townsq-Application':'communities/1.0.0 webapp/1 chrome',origin:'https://app.townsq.io','user-agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'};
 const request=async(path,options={})=>{
  const url=new URL(path,'https://api.townsq.io');
  const method=options.method||'GET';
  if(url.origin!=='https://api.townsq.io'||!(url.pathname==='/rest/login'&&method==='POST'||url.pathname===`/rest/login/gotoCondo/${community}`&&method==='PUT'||(url.pathname==='/api/v1/accounts'||/^\/api\/v1\/accounts\/[^/]+\/transactions$/.test(url.pathname))&&method==='GET'))throw Error('Read endpoint rejected');
  const response=await fetch(url,{...options,headers,redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok){const body=await response.text();const e=Error('TownSq request rejected');e.httpStatus=response.status;e.stage=url.pathname==='/rest/login'?'sign_in':url.pathname.includes('/gotoCondo/')?'community_selection':url.pathname.endsWith('/transactions')?'ledger':'own_accounts';e.responseFormat=response.headers.get('content-type')?.includes('json')?'json':response.headers.get('content-type')?.includes('html')?'html':'other';e.reason=/captcha|challenge-platform|verify you are human/i.test(body)?'interactive_challenge':/cloudfront|request could not be satisfied|request blocked/i.test(body)?'edge_request_rejected':response.status===403?'access_denied':'provider_rejected';throw e;}
  return response.json();
 };
 const login=await request('/rest/login',{method:'POST',body:JSON.stringify({fb_user:null,last_name:'',linkedToAssociaAccount:false,properties:[],userProperties:[],roles:[],vehicles:[],phones:[],canEditPassword:true,email:username.trim(),password:createHash('sha1').update(password).digest('hex'),login_type:'CMN',platform:'webapp'})});
 if(login.success!==true||typeof login.jwt!=='string'||!login.user?.id)return {status:'authentication_unverified',responseShape:shape(login),reason:/^[A-Z_0-9]{1,60}$/.test(login.errorType)?login.errorType:'provider_response'};
 headers.Authorization='Bearer '+login.jwt;
 if(!Array.isArray(login.condos)||!login.condos.some(c=>c?.id===community))return {status:'community_unverified',reason:'configured_community_not_in_login'};
 if(typeof login.logon_token==='string'&&login.logon_token)headers['xx-sc-r']=login.logon_token;
 // Official sign-in context selection, pinned to this existing community only.
 await request(`/rest/login/gotoCondo/${community}`,{method:'PUT',body:'{}'});
 headers['X-Scope-Type']='COMMUNITY';headers['X-Scope-Id']=community;
 const accounts=await request(`/api/v1/accounts?condoId=${community}&page=0&size=20`);
 const report={status:'authenticated',loginShape:shape(login),accountsShape:shape(accounts)};
 let ledger=null;
 let selected;
 if(onSnapshot){try{selected=hoyeAccount(accounts);}catch{return {...report,status:'account_unverified',reason:'hoye_account_not_verified'};}}
 else if(inspectLedger&&Array.isArray(accounts.content)&&accounts.content.length===1)selected=accounts.content[0];
 if(selected?.account?.accountUuid){
  const accountId=encodeURIComponent(selected.account.accountUuid);
  const now=new Date(),from=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-3,1);
  ledger=await request(`/api/v1/accounts/${accountId}/transactions?from=${from}&to=${now.getTime()}`);
  report.ledgerShape=shape(ledger);
  if(inspectLedger)report.ledgerSignals=Array.isArray(ledger.transactions)?ledger.transactions.map(t=>({type:/^[A-Za-z_ ]{1,30}$/.test(t.type||'')?t.type:'other',assessmentLabel:/^assessment(?:[- ]monthly)?$/i.test(t.comment||''),hasReference:typeof t.reference==='string'&&!!t.reference.trim(),numericDate:typeof t.postDate==='number'&&Number.isFinite(t.postDate),positiveAmount:typeof t.amount==='number'&&t.amount>0})):[];
 }
 if(onSnapshot){
  let snapshot;try{snapshot=townSqSnapshot(accounts,new Date(),ledger);}catch{return {...report,status:'account_unverified',reason:'hoye_ledger_not_verified'};}
  report.collection=await onSnapshot(snapshot);report.assessmentObserved=snapshot.monthlyAssessment!==undefined;
 }
 return report;
}
