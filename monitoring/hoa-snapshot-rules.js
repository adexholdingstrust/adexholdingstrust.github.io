/* HOA portal snapshot normalization. No credentials or automatic payments. */
export function normalizeHOABalance(entry) {
  if (!entry || typeof entry.propertyId!=="string" || !entry.propertyId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.observedOn||"") ||
      !Number.isFinite(entry.balance)) throw Error("Invalid HOA snapshot");
  const status=entry.balance<0?"credit_displayed":entry.balance>0?"balance_outstanding":"zero_balance_unverified";
  return {propertyId:entry.propertyId,provider:String(entry.provider||"unknown"),
    observedOn:entry.observedOn,balance:entry.balance,status,
    paymentConfirmed:false,source:"dated_portal_snapshot"};
}
export function evaluateHOASnapshot(entry,{asOfDate}={}) {
  const record=normalizeHOABalance(entry);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate||""))throw Error("Invalid check date");
  const daysOld=Math.floor((Date.parse(asOfDate+"T00:00:00Z")-Date.parse(record.observedOn+"T00:00:00Z"))/86400000);
  if(daysOld<0)throw Error("Snapshot date in future");
  return {...record,daysOld,stale:daysOld>2,
    reviewRequired:record.balance>0 || daysOld>2,
    notice:record.balance<0?"Credit displayed; verify against ledger":
      record.balance>0?"Balance shown; check assessment and settlement history":"Zero displayed balance; verify payment ledger"};
}
