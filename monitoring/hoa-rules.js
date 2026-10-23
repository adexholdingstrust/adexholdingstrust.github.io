/* HOA monitoring decision rules. No credentials, payments or external requests.
   This module is intentionally not connected to live notifications yet. */
export const HOA_ALERT_RECIPIENTS = [
  "tenantservices@adexholdings.com",
  "ahmedadeyemi@gmail.com"
];
export const HOA_POLICY = Object.freeze({
  dueDay: 1,
  verifyByDay: 7,
  warningDays: [1, 3, 5, 7],
  timezone: "America/Denver"
});
export function classifyHOAPayment({ amountDue, dueDate, payments = [], asOf = new Date() }) {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { status: "unknown", reason: "Missing due date" };
  const due = new Date(dueDate + "T00:00:00Z");
  const now = new Date(asOf);
  if (Number.isNaN(due.getTime()) || Number.isNaN(now.getTime())) return { status: "unknown", reason: "Invalid date" };
  const amount = Number(amountDue);
  if (!Number.isFinite(amount) || amount < 0) return { status: "unknown", reason: "Invalid amount" };
  const confirmed = payments.filter(p => p.status === "posted" && p.dueDate === dueDate)
    .reduce((sum,p) => sum + (Number(p.amount) || 0), 0);
  if (confirmed >= amount && amount > 0) return { status: "paid", confirmed, amountDue: amount };
  const daysPastDue = Math.floor((Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()) - due.getTime()) / 86400000);
  return { status: daysPastDue > 0 ? "overdue" : "pending", amountDue: amount, confirmed, daysPastDue };
}
