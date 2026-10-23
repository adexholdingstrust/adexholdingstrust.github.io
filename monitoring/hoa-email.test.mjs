import {test} from "node:test";
import assert from "node:assert/strict";
import {buildHOAEmail} from "./hoa-email.js";
const evaluation={propertyId:"pier-point",dueDate:"2026-11-01",observedOn:"2026-10-23",balanceDue:684.28,alertType:"upcoming_assessment",paymentConfirmed:false};
test("both recipients included",()=>assert.deepEqual(buildHOAEmail(evaluation,"Oxford Place").to,["tenantservices@adexholdings.com","ahmedadeyemi@gmail.com"]));
test("unconfirmed notice is explicit",()=>assert.match(buildHOAEmail(evaluation,"Oxford Place").text,/NOT confirmed/));
test("subject strips injected newlines",()=>assert.doesNotMatch(buildHOAEmail(evaluation,"Oxford Place\nBcc:other@example.com").subject,/\n/));
test("invalid alert rejected",()=>assert.throws(()=>buildHOAEmail({...evaluation,alertType:"random"},"Oxford Place"),/Invalid/));
test("invalid balance rejected",()=>assert.throws(()=>buildHOAEmail({...evaluation,balanceDue:-1},"Oxford Place"),/Invalid balance/));
