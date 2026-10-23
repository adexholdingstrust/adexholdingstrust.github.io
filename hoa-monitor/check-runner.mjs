import { evaluateHOAPayment, notificationKey } from "./payment-evaluator.mjs";

/**
 * Read-only orchestration. A trusted portal adapter supplies snapshots.
 * Delivery and deduplication are injected; no secrets or live portal login here.
 */
export async function runHOACheck({ snapshots, todayISO, wasSent, send, markSent }) {
  const results = [];
  for (const snapshot of snapshots) {
    const result = evaluateHOAPayment(snapshot, todayISO);
    results.push(result);
    const notify = new Set([
      "account_clear", "payment_returned", "payment_posted_balance_due",
      "payment_unconfirmed_after_target", "verification_unavailable"
    ]);
    if (!notify.has(result.status)) continue;
    const key = notificationKey(result, result.status === "payment_returned"
      ? (snapshot.transactions || []).filter(t => ["returned", "reversed", "nsf"].includes(t.type))
          .map(t => t.id || t.date || "").join(",")
      : "");
    if (await wasSent(key)) continue;
    // Only mark sent after delivery confirms success to both recipients.
    await send({
      key, result,
      recipients: ["tenantservices@adexholdings.com", "ahmedadeyemi@gmail.com"]
    });
    await markSent(key);
  }
  return results;
}
