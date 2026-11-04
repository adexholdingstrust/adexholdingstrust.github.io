import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkTownSq} from './townsq-readonly.mjs';
const community='672048ef610bb549fcae2a41';
const login={success:true,jwt:'private-token',logon_token:'private-logon',user:{id:'own-user'},condos:[{id:community}]};
const accounts={content:[{account:{accountNumber:'706729',accountUuid:'private-account',allowInquiry:true,currentBalance:125.25}}]};
test('TownSq follows official community selection and resident account reads',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://api.townsq.io');
  if(calls===1){assert.equal(u.pathname,'/rest/login');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{fb_user:null,last_name:'',linkedToAssociaAccount:false,properties:[],userProperties:[],roles:[],vehicles:[],phones:[],canEditPassword:true,email:'owner@example.test',password:createHash('sha1').update('test-password').digest('hex'),login_type:'CMN',platform:'webapp'});return Response.json(login);}
  assert.equal(options.headers.Authorization,'Bearer private-token');assert.equal(options.headers['xx-sc-r'],'private-logon');
  if(calls===2){assert.equal(u.pathname,`/rest/login/gotoCondo/${community}`);assert.equal(options.method,'PUT');assert.equal(options.body,'{}');return Response.json({id:'own-user'});}
  assert.ok(!options.method||options.method==='GET');assert.equal(options.headers['X-Scope-Id'],community);
  if(calls===3){assert.equal(u.pathname,'/api/v1/accounts');assert.equal(u.searchParams.get('condoId'),community);return Response.json(accounts);}
  assert.equal(u.pathname,'/api/v1/accounts/private-account/transactions');return Response.json({transactions:[{amount:120}]});
 };
 try{const report=await checkTownSq('owner@example.test','test-password');assert.equal(report.status,'authenticated');assert.equal(calls,4);assert.doesNotMatch(JSON.stringify(report),/private-token|private-logon|test-password|owner@example|own-user|private-account/);}finally{globalThis.fetch=previous;}
});
test('TownSq failed login never fetches accounts or exposes response values',async()=>{const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({success:false,errorType:'INVALID_CREDENTIALS',errorMessage:'private provider body'});};try{const report=await checkTownSq('test','test');assert.equal(report.status,'authentication_unverified');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(report),/private provider body/);}finally{globalThis.fetch=previous;}});
test('TownSq never selects a community absent from the authenticated membership list',async()=>{const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({...login,condos:[{id:'another-community'}]});};try{const report=await checkTownSq('test','test');assert.equal(report.status,'community_unverified');assert.equal(calls,1);}finally{globalThis.fetch=previous;}});
test('TownSq does not arbitrarily inspect a ledger among multiple accounts',async()=>{const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>Response.json(++calls===1?login:calls===2?{}:{content:[{account:{accountUuid:'a'}},{account:{accountUuid:'b'}}]});try{const report=await checkTownSq('test','test');assert.equal(calls,3);assert.equal(report.ledgerShape,undefined);}finally{globalThis.fetch=previous;}});
test('TownSq failure identifies the stage without exposing private response content',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>++calls===1?Response.json(login):calls===2?Response.json({}):new Response('<html>request blocked private-owner-value</html>',{status:403,headers:{'content-type':'text/html'}});
 try{await assert.rejects(checkTownSq('owner@example.test','test-password'),error=>{assert.equal(error.stage,'own_accounts');assert.equal(error.httpStatus,403);assert.equal(error.responseFormat,'html');assert.equal(error.reason,'edge_request_rejected');assert.doesNotMatch(JSON.stringify(error),/private-token|private-owner-value|own-user/);return true;});assert.equal(calls,3);}finally{globalThis.fetch=previous;}
});
test('TownSq passes only normalized Hoye data to ingestion',async()=>{
 const previous=globalThis.fetch;let calls=0,ingestions=0;globalThis.fetch=async()=>Response.json(++calls===1?login:calls===2?{}:accounts);
 try{const report=await checkTownSq('owner@example.test','test-password',{inspectLedger:false,onSnapshot:async snapshot=>{ingestions++;assert.equal(snapshot.propertyId,'aurora-hoye-co');assert.equal(snapshot.balanceDue,125.25);assert.deepEqual(snapshot.payments,[]);assert.doesNotMatch(JSON.stringify(snapshot),/private-account|private-token/);return {status:'payment_unverified',paymentConfirmed:false,delivery:'sent'};}});assert.equal(calls,3);assert.equal(ingestions,1);assert.equal(report.collection.paymentConfirmed,false);assert.doesNotMatch(JSON.stringify(report),/private-token|private-account|125\.25/);}finally{globalThis.fetch=previous;}
});
