import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkTownSq} from './townsq-readonly.mjs';
test('TownSq authenticates using observed client protocol and reads only own accounts and ledger',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(new URL(url).origin,'https://api.townsq.io');
  if(calls===1){assert.equal(new URL(url).pathname,'/rest/login');assert.deepEqual(JSON.parse(options.body),{fb_user:null,last_name:'',linkedToAssociaAccount:false,properties:[],userProperties:[],roles:[],vehicles:[],phones:[],canEditPassword:true,email:'owner@example.test',password:createHash('sha1').update('test-password').digest('hex'),login_type:'CMN',platform:'webapp'});return Response.json({success:true,jwt:'private-token',user:{id:'own-user'}});}
  assert.equal(options.headers.Authorization,'Bearer private-token');assert.ok(!options.method||options.method==='GET');
  if(calls===2){assert.equal(new URL(url).pathname,'/api/v1/users/own-user/accounts');return Response.json({content:[{account:{accountUuid:'own-account'}}]});}
  assert.equal(new URL(url).pathname,'/api/v1/users/own-user/accounts/own-account/transactions');return Response.json({transactions:[{amount:120}]});
 };
 try{const report=await checkTownSq('owner@example.test','test-password');assert.equal(report.status,'authenticated');assert.equal(calls,3);assert.doesNotMatch(JSON.stringify(report),/private-token|test-password|owner@example|own-user|own-account/);}finally{globalThis.fetch=previous;}
});
test('TownSq failed login never fetches accounts or exposes response values',async()=>{const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({success:false,errorType:'INVALID_CREDENTIALS',errorMessage:'private provider body'});};try{const report=await checkTownSq('test','test');assert.equal(report.status,'authentication_unverified');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(report),/private provider body/);}finally{globalThis.fetch=previous;}});
test('TownSq does not arbitrarily select among multiple accounts',async()=>{const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>Response.json(++calls===1?{success:true,jwt:'test',user:{id:'test'}}:{content:[{account:{accountUuid:'a'}},{account:{accountUuid:'b'}}]});try{const report=await checkTownSq('test','test');assert.equal(calls,2);assert.equal(report.ledgerShape,undefined);}finally{globalThis.fetch=previous;}});
