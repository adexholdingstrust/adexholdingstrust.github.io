const names = {
  'aurora-oxford-co': 'Oxford Place',
  'aurora-hoye-co': 'Hoye Drive',
  'fallbrook-ca': 'Calabrese'
};
const money = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export function hoaEmail(snapshot, result, progressText) {
  const property = names[snapshot.propertyId];
  const amount = snapshot.balanceDue;
  const stale = result.status === 'stale';
  let balance = 'Current balance unavailable';
  if (!stale && Number.isFinite(amount)) {
    if (amount < 0) balance = money.format(-amount) + ' account credit';
    else if (result.status==='upcoming_assessment') balance = money.format(amount) + ' account balance';
    else if (amount === 0) balance = '$0.00 due';
    else balance = money.format(amount) + ' balance due';
  }
  const month = new Intl.DateTimeFormat('en-US', {month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(result.asOfDate+'T12:00:00Z'));
  const heading = property + ' | ' + balance;
  const details = [];
  if (stale) details.push('The last portal reading is out of date.');
  if (result.status === 'payment_failed') details.push('The ledger reports a payment problem. Review the transaction in the portal.');
  else if (result.paymentConfirmed) details.push('The ledger confirms payment of the monthly assessment.');
  else if (result.requiresHumanReview && result.monitoringMode !== 'balance_only' && !stale)
    details.push('The monitor could not match a payment to this month’s assessment.');
  if (!stale && snapshot.dueDate && snapshot.provider==='LCM')
    details.push('Monthly assessment due: '+snapshot.dueDate);
  else {
    if (!stale && snapshot.dueDate && snapshot.provider==='TownSq') details.push('Assessment posted: '+snapshot.dueDate);
    details.push('Payment due date: unverified from portal.');
  }
  if (!stale && snapshot.amountDue != null) details.push('Monthly assessment: '+money.format(snapshot.amountDue));
  for (const credit of snapshot.payleaseCredits || []) details.push('Paylease payment posted '+credit.postedOn+': '+money.format(credit.amount));
  if (result.monitoringMode === 'balance_only') details.push('Bank payment schedule on file: $120 every 14 days.');
  if (progressText && amount > 0 && !stale) details.push(progressText.split(';')[0].replace(/\.?$/,'.'));
  const observed = new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:snapshot.zone}).format(new Date(snapshot.observedAt));
  if (snapshot.sourceUpdatedAt) details.push('Provider last updated: '+new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeZone:snapshot.zone}).format(new Date(snapshot.sourceUpdatedAt)));
  const footer = snapshot.provider+' portal checked '+observed+' ('+snapshot.zone+').';
  const origin = new URL(snapshot.sourceUrl).origin;
  const review = result.requiresHumanReview && result.priority === 'important';
  const subject = heading + (review?' | Review requested':'') + ' | Adex HOA';
  const text = [heading,month+' HOA summary',...details,footer,origin].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f5f6;color:#182c39;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border:1px solid #d8dfe3">
  <tr><td style="padding:18px 24px;border-bottom:3px solid #b29156"><img src="https://adexholdings.com/assets/logo.png" width="68" height="68" alt="Adex Holdings Trust" style="display:block"></td></tr>
  <tr><td style="padding:24px"><p style="margin:0;color:#506270">${escape(month)} HOA summary &middot; ${escape(property)}</p>
  <h1 style="margin:8px 0 22px;font-size:30px;line-height:1.2">${escape(balance)}</h1>
  ${details.map(line=>'<p style="margin:8px 0;line-height:1.5">'+escape(line)+'</p>').join('')}
  </td></tr><tr><td style="padding:16px 24px;background:#f6f8f9;font-size:13px;line-height:1.6">${escape(footer)}<br><a style="color:#204e69" href="${escape(origin)}">View HOA portal</a></td></tr></table></td></tr></table></body></html>`;
  return {subject,text,html};
}
