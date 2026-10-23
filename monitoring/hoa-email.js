/* Email composition only. Sending must be performed by a protected Worker. */
import {HOA_ALERT_RECIPIENTS} from "./hoa-rules.js";
const TYPES=Object.freeze({
  upcoming_assessment:"Upcoming HOA assessment",
  unconfirmed_by_seventh:"HOA payment unconfirmed by the 7th",
  payment_problem:"HOA payment problem detected",
  payment_confirmed:"HOA payment confirmation"
});
function safe(value){return String(value??"").replace(/[\r\n\t]+/g," ").trim().slice(0,200);}
export function buildHOAEmail(evaluation, propertyLabel) {
  if(!evaluation || !Object.hasOwn(TYPES,evaluation.alertType) || !evaluation.propertyId ||
     !/^\d{4}-\d{2}-\d{2}$/.test(evaluation.dueDate||"")) throw new Error("Invalid HOA alert");
  const title=TYPES[evaluation.alertType], name=safe(propertyLabel)||safe(evaluation.propertyId);
  const amount=Number(evaluation.balanceDue);
  if(!Number.isFinite(amount)||amount<0) throw new Error("Invalid balance");
  const money=n=>"$"+n.toFixed(2);
  const lines=[
    title,
    "Property: "+name,
    "Assessment due: "+evaluation.dueDate,
    "Portal balance at last check: "+money(amount),
    "Last checked: "+safe(evaluation.observedOn),
    "Status: "+evaluation.alertType.replace(/_/g," "),
    evaluation.paymentConfirmed===true?"Payment marked confirmed after verified ledger review.":"Payment is NOT confirmed by this alert.",
    "Review the HOA portal before taking action. This notice does not initiate a payment."
  ];
  return {to:[...HOA_ALERT_RECIPIENTS],subject:"Adex HOA | "+title+" | "+name,text:lines.join("\n")};
}
