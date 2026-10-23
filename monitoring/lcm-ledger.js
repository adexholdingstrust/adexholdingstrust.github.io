/* LCM transaction classification: pure functions, no credentials or network. */
export function classifyLCMTransaction({description="",charge=0,credit=0,date=""}) {
  const label=String(description).trim();
  const lower=label.toLowerCase();
  const money=n=>Math.round((Number(n)||0)*100)/100;
  const kind=/assessment/.test(lower)?"assessment":
    /nsf|stp|ach acct frozen|returned|reversal|reject/.test(lower)?"payment_problem":
    /late charge|late interest/.test(lower)?"penalty":
    /paylease|direct debit|payment|credit/.test(lower)?"payment_entry":"other";
  return {date,description:label,charge:money(charge),credit:money(credit),kind};
}
export function summarizeLCM({balanceDue,transactions}) {
  if (!Array.isArray(transactions)||!Number.isFinite(Number(balanceDue))) throw new Error("Invalid ledger");
  const entries=transactions.map(classifyLCMTransaction);
  const lateFees=entries.filter(e=>e.kind==="penalty").reduce((n,e)=>n+e.charge,0);
  const paymentFailureFees=entries.filter(e=>e.kind==="payment_problem" && /charge|fee/i.test(e.description)).reduce((n,e)=>n+e.charge,0);
  const penalties=lateFees+paymentFailureFees;
  return {
    balanceDue:Number(balanceDue),
    penalties:Math.round(penalties*100)/100,
    lateFees:Math.round(lateFees*100)/100,
    paymentFailureFees:Math.round(paymentFailureFees*100)/100,
    paymentProblem:entries.some(e=>e.kind==="payment_problem"),
    latestAssessment:entries.find(e=>e.kind==="assessment")||null,
    entries,
    // Never infer a posted/settled payment from a description alone.
    verifiedPayment:false
  };
}
