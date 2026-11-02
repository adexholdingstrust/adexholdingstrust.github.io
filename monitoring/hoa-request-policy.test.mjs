import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowPortalWrite} from './hoa-request-policy.js';
test('only observed sign-in writes are permitted',()=>{
 assert.equal(allowPortalWrite({provider:'LCM',url:'https://lcmpropertymanagement.com/Account/Login/40583',method:'POST'}),true);
 assert.equal(allowPortalWrite({provider:'FrontSteps',url:'https://horsecreekridge.frontsteps.com/users/one_click_login',method:'POST'}),true);
 for(const path of ['/payments/authorize','/accounts/delete','/users/change_password','/token/payment'])assert.equal(allowPortalWrite({provider:'FrontSteps',url:'https://fspay-api.frontsteps.com'+path,method:'POST'}),false);
});
test('payer initialization is blocked without explicit authorization and exact account binding',()=>{
 const input={provider:'FrontSteps',url:'https://fspay-api.frontsteps.com/api/v1/Payers',method:'POST',expectedAccountNumber:'own-account',payload:{accountNumber:'own-account',isNewPayer:false}};
 assert.equal(allowPortalWrite(input),false);
 assert.equal(allowPortalWrite({...input,allowProfileInit:true}),true);
 for(const payload of [{...input.payload,accountNumber:'other'},{...input.payload,isNewPayer:true},{...input.payload,paymentMethod:'bank'}])assert.equal(allowPortalWrite({...input,allowProfileInit:true,payload}),false);
});
test('payment and bank-method writes remain blocked even with profile initialization authorized',()=>{
 for(const path of ['/api/v1/Payers/own/payments','/api/v1/Payers/own/paymentmethods','/api/v1/SecurityDeposits/own/release'])assert.equal(allowPortalWrite({provider:'FrontSteps',url:'https://fspay-api.frontsteps.com'+path,method:'POST',allowProfileInit:true}),false);
});
