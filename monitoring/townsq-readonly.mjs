/* Contract observed in TownSq's public web client: rest/login and own-user account GETs.
 * Password SHA1 matches the client's authentication protocol; never log it or any tokens.
 */
import {createHash} from 'node:crypto';
const community='672048ef610bb549fcae2a41';
const shape=(v,d=0)=>v===null?'null':Array.isArray(v)?{type:'array',count:v.length,item:d<5?shape(v[0],d+1):typeof v[0]}:typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>/^[A-Za-z_][A-Za-z_0-9]{0,45}$/.test(k)).slice(0,45).map(([k,x])=>[k,d<5?shape(x,d+1):typeof x])):typeof v;
export async function checkTownSq(username,password) {
 const headers={'content-type':'application/json',accept:'application/json','accept-language':'en-US','xx-sc-l':'en','X-Townsq-Application':'communities/1.0.0 webapp/1 chrome',origin:'https://app.townsq.io','user-agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'};
 const request=async(path,options={})=>{
  const url=new URL(path,'https://api.townsq.io');
  if(url.origin!=='https://api.townsq.io'||!(url.pathname==='/rest/login'||/^\/api\/v1\/users\/[^/]+\/accounts(?:\/[^/]+\/transactions)?$/.test(url.pathname)))throw Error('Read endpoint rejected');
  const response=await fetch(url,{...options,headers,redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok){const body=await response.text();const e=Error('TownSq request rejected');e.httpStatus=response.status;e.reason=/captcha|challenge-platform|verify you are human/i.test(body)?'interactive_challenge':/cloudfront|request could not be satisfied|request blocked/i.test(body)?'edge_request_rejected':response.status===403?'access_denied':'provider_rejected';throw e;}
  return response.json();
 };
 const login=await request('/rest/login',{method:'POST',body:JSON.stringify({email:username.trim(),password:createHash('sha1').update(password).digest('hex'),login_type:'CMN',platform:'webapp'})});
 if(login.success!==true||typeof login.jwt!=='string'||!login.user?.id)return {status:'authentication_unverified',responseShape:shape(login),reason:/^[A-Z_0-9]{1,60}$/.test(login.errorType)?login.errorType:'provider_response'};
 headers.Authorization='Bearer '+login.jwt;
 headers['X-Scope-Type']='COMMUNITY';headers['X-Scope-Id']=community;
 if(login.user.logonToken)headers['xx-sc-r']=login.user.logonToken;
 const userId=encodeURIComponent(login.user.id);
 const accounts=await request(`/api/v1/users/${userId}/accounts?condoId=${community}&page=0&size=20`);
 const report={status:'authenticated',loginShape:shape(login),accountsShape:shape(accounts)};
 if(Array.isArray(accounts.content)&&accounts.content.length===1&&accounts.content[0]?.account?.accountUuid){
  const accountId=encodeURIComponent(accounts.content[0].account.accountUuid);
  const now=new Date(),from=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-3,1);
  const ledger=await request(`/api/v1/users/${userId}/accounts/${accountId}/transactions?from=${from}&to=${now.getTime()}`);
  report.ledgerShape=shape(ledger);
 }
 return report;
}
