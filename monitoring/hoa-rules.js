/* Read-only HOA monitoring decisions. No portal credentials or network access. */
export const HOA_ALERT_RECIPIENTS = Object.freeze([
  "tenantservices@adexholdings.com",
  "ahmedadeyemi@gmail.com"
]);
export const HOA_POLICY = Object.freeze({
  dueDay: 1,
  verifyByDay: 7,
  warningDays: [1, 3, 5, 7]
});
const dayNumber = (iso) => {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(iso + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === iso ? ms / 86400000 : null;
};
/* Supply asOfDate in the property's local calendar date (YYYY-MM-DD). */
export function classifyHOAPayment({ amountDue, dueDate, payments = [], asOfDate, autopayScheduled = false }) {
  const dueDay = dayNumber(dueDate), today = dayNumber(asOfDate);
  const amount = Number(amountDue);
  if (dueDay === null || today === null || !Number.isFinite(amount) || amount < 0 || !Array.isArray(payments))
    return { status: "unknown", reason: "Missing or invalid verified inputs" };
  const valid = payments.filter(p => p && p.dueDate === dueDate && Number.isFinite(Number(p.amount)) && Number(p.amount) > 0);
  const posted = valid.filter(p => p.status === "posted").reduce((n,p) => n + Number(p.amount),0);
  const reversed = valid.filter(p => p.status === "reversed").reduce((n,p) => n + Number(p.amount),0);
  const confirmed = Math.max(0, posted - reversed);
  const failed = valid.some(p => ["failed","returned","nsf"].includes(p.status));
  const daysPastDue = today - dueDay;
  let status;
  if (amount === 0) status = "no_balance";
  else if (confirmed >= amount && !failed) status = "paid";
  else if (failed) status = "payment_failed";
  else if (daysPastDue > 0) status = "overdue";
  else if (autopayScheduled) status = "scheduled_unconfirmed";
  else status = "pending";
  return { status, amountDue: amount, confirmed, daysPastDue, requiresAttention: ["payment_failed","overdue"].includes(status) || (status !== "paid" && status !== "no_balance" && new Date(dueDate+"T00:00:00Z").getUTCDate() === HOA_POLICY.dueDay && Number(asOfDate.slice(8)) >= HOA_POLICY.verifyByDay && asOfDate.slice(0,7) === dueDate.slice(0,7)) };
}
export function notificationKey(propertyId, dueDate, status) {
  if (!propertyId || dayNumber(dueDate) === null || !status) throw new Error("Invalid notification key");
  return [propertyId,dueDate,status].map(encodeURIComponent).join(":");
}
