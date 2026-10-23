/* Annual land tax reminders; verified dates only. No guessed county deadlines. */
export function evaluateLandTax({propertyId,taxYear,dueDate,balanceDue,asOfDate,paymentStatus="unverified"}) {
  if(!propertyId||!Number.isInteger(taxYear)||taxYear<2000||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate||"")||!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate||"")||!Number.isFinite(balanceDue)||balanceDue<0)throw Error("Invalid land tax record");
  const due=Date.parse(dueDate+"T00:00:00Z"),asOf=Date.parse(asOfDate+"T00:00:00Z");
  if(!Number.isFinite(due)||!Number.isFinite(asOf)||new Date(due).toISOString().slice(0,10)!==dueDate||new Date(asOf).toISOString().slice(0,10)!==asOfDate)throw Error("Invalid dates");
  const daysUntilDue=Math.round((due-asOf)/86400000);
  const confirmed=paymentStatus==="posted"&&balanceDue===0;
  const status=confirmed?"paid_confirmed":daysUntilDue<0&&balanceDue>0?"overdue":daysUntilDue<=7&&balanceDue>0?"urgent":daysUntilDue<=30&&balanceDue>0?"upcoming":"unverified";
  return {propertyId,taxYear,dueDate,asOfDate,balanceDue,daysUntilDue,status,confirmed,notificationKey:`land-tax:${propertyId}:${taxYear}:${status}`};
}
