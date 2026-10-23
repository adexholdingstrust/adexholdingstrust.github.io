/* Convert verified portal snapshots into notifications; no credentials or sending. */
import {summarizeLCM} from "./lcm-ledger.js";
export function evaluateLCMSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.propertyId!=="string" || !snapshot.propertyId.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.observedOn||"") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.dueDate||"") ||
      !Array.isArray(snapshot.transactions)) throw new Error("Incomplete ledger snapshot");
  const ledger=summarizeLCM(snapshot);
  const due=Date.parse(snapshot.dueDate+"T00:00:00Z");
  const seen=Date.parse(snapshot.observedOn+"T00:00:00Z");
  if (!Number.isFinite(due)||!Number.isFinite(seen)) throw new Error("Invalid snapshot dates");
  const daysUntilDue=Math.round((due-seen)/86400000);
  const dueMonth=snapshot.dueDate.slice(0,7);
  const verifyBy=`${dueMonth}-07`;
  const paymentConfirmed=snapshot.paymentConfirmation === "posted" && ledger.balanceDue <= 0 && !ledger.paymentProblem;
  const alertType=ledger.paymentProblem ? "payment_problem" :
    paymentConfirmed ? "payment_confirmed" :
    snapshot.observedOn >= verifyBy ? "unconfirmed_by_seventh" :
    daysUntilDue>=0 && daysUntilDue<=5 ? "upcoming_assessment" : null;
  return {
    propertyId:snapshot.propertyId,observedOn:snapshot.observedOn,
    dueDate:snapshot.dueDate,daysUntilDue,
    balanceDue:ledger.balanceDue,penalties:ledger.penalties,
    alertType, paymentConfirmed,
    requiresHumanReview:ledger.paymentProblem || (ledger.balanceDue>0 && daysUntilDue<0)
  };
}
