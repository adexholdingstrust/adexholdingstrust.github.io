/**
 * Pure HOA ledger assessment engine. No network, secrets, or payment operations.
 * Input is a normalized, read-only portal snapshot from a trusted connector.
 * Dates must be YYYY-MM-DD; amounts in USD. Never infer payment from autopay status.
 */
export function evaluateHOAPayment(snapshot, todayISO) {
  const { propertyId, billingMonth, assessmentAmount, transactions = [], balance,
    verifiedAt, portalOk = false } = snapshot;
  if (!propertyId || !/^\d{4}-\d{2}$/.test(billingMonth || "")) throw new Error("Invalid property/month");
  const today = String(todayISO).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("Invalid date");
  const due = billingMonth + "-01";
  const target = billingMonth + "-07";
  const amount = Number(assessmentAmount);
  const valid = portalOk && verifiedAt && !Number.isNaN(Date.parse(verifiedAt)) &&
    (Date.parse(today + "T23:59:59Z") - Date.parse(verifiedAt) <= 36 * 3600000) &&
    (Date.parse(verifiedAt) <= Date.parse(today + "T23:59:59Z")) &&
    Number.isFinite(amount) && amount >= 0 && Number.isFinite(Number(balance));
  if (!valid) return { propertyId, billingMonth, status: "verification_unavailable", verifiedAt: verifiedAt || null };
  const period = transactions.filter(t => t.billingMonth === billingMonth);
  const hasReturn = period.some(t => ["returned", "reversed", "nsf"].includes(t.type));
  const lateFee = period.some(t => ["late_fee", "late_interest"].includes(t.type));
  const postedCredits = period.filter(t => t.type === "credit" && t.posted === true)
    .reduce((sum,t) => sum + Math.max(0, Number(t.amount) || 0), 0);
  const outstanding = Number(balance) > 0.005;
  let status;
  if (hasReturn) status = "payment_returned";
  else if (postedCredits + 0.005 >= amount && !outstanding && !lateFee) status = "account_clear";
  else if (postedCredits > 0) status = outstanding || lateFee ? "payment_posted_balance_due" : "payment_posted_partial";
  else if (today > target) status = "payment_unconfirmed_after_target";
  else status = "payment_pending";
  return { propertyId, billingMonth, status, dueDate: due, targetDate: target,
    postedCredits: Math.round(postedCredits * 100) / 100, balance: Number(balance),
    verifiedAt, lateFee, hasReturn };
}
export function notificationKey(result, eventId = "") {
  return [result.propertyId, result.billingMonth, result.status, eventId].map(encodeURIComponent).join(":");
}
