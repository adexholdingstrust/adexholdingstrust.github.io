import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyLCMTransaction,summarizeLCM} from "./lcm-ledger.js";
test("assessment classified",()=>assert.equal(classifyLCMTransaction({description:"Assessment-Monthly",charge:635.03}).kind,"assessment"));
test("NSF is a payment problem",()=>assert.equal(classifyLCMTransaction({description:"NSF/STP Pmt Charge",charge:20}).kind,"payment_problem"));
test("ACH frozen is a payment problem",()=>assert.equal(classifyLCMTransaction({description:"ACH ACCT FROZEN",charge:635.03}).kind,"payment_problem"));
test("payment entry is not settlement proof",()=>assert.equal(summarizeLCM({balanceDue:684.28,transactions:[{description:"Paylease 64101412",credit:635.03}]}).verifiedPayment,false));
test("penalties sum correctly",()=>assert.equal(summarizeLCM({balanceDue:684.28,transactions:[{description:"Late Interest",charge:4.25},{description:"Late Charge",charge:25},{description:"NSF/STP Pmt Charge",charge:20}]}).penalties,49.25));
