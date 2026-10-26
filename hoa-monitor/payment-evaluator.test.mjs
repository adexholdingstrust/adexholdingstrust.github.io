import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHOAPayment, notificationKey } from "./payment-evaluator.mjs";

const base = {
  propertyId: "co-condo", billingMonth: "2026-11", assessmentAmount: 635.03,
  balance: 635.03, portalOk: true, verifiedAt: "2026-11-05T12:00:00Z", transactions: []
};
test("scheduled autopay does not imply posted payment", () => {
  const result = evaluateHOAPayment({...base, autopayScheduled: true}, "2026-11-05");
  assert.equal(result.status, "payment_pending");
});
test("payment posting and zero balance confirms clear", () => {
  const result = evaluateHOAPayment({...base, balance: 0, transactions: [
    { type: "credit", posted: true, amount: 635.03, billingMonth: "2026-11" }
  ]}, "2026-11-05");
  assert.equal(result.status, "account_clear");
});
test("outstanding fees keep payment unresolved", () => {
  const result = evaluateHOAPayment({...base, balance: 25, transactions: [
    { type: "credit", posted: true, amount: 635.03, billingMonth: "2026-11" },
    { type: "late_fee", amount: 25, billingMonth: "2026-11" }
  ]}, "2026-11-05");
  assert.equal(result.status, "payment_posted_balance_due");
});
test("returned payment requires action", () => {
  const result = evaluateHOAPayment({...base, transactions: [
    { type: "returned", billingMonth: "2026-11" }
  ]}, "2026-11-05");
  assert.equal(result.status, "payment_returned");
});
test("unavailable portal never reports paid", () => {
  assert.equal(evaluateHOAPayment({...base, portalOk: false}, "2026-11-05").status, "verification_unavailable");
});
test("after seventh is unconfirmed", () => {
  assert.equal(evaluateHOAPayment({...base, verifiedAt: "2026-11-08T12:00:00Z"}, "2026-11-08").status, "payment_unconfirmed_after_target");
});
test("notification keys are stable", () => {
  const r = evaluateHOAPayment(base, "2026-11-05");
  assert.equal(notificationKey(r), notificationKey(r));
});
