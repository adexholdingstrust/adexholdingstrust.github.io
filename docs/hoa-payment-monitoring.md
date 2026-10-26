# HOA payment monitoring — implementation foundation

Status: **not deployed**. This branch contains a monitoring foundation only. It does not log in to HOA websites or send live emails.

## Rules
- Assessment due: first of each month.
- Target receipt: by the 7th.
- Potential late charges: from the 10th onward; exact policy varies by association.
- Recipients: tenantservices@adexholdings.com, ahmedadeyemi@gmail.com.
- Monitor all configured properties independently; never infer that one property's payment covers another.
- Never treat a scheduled autopay or an initiated debit as proof of payment.
- Confirm **posted payment** only when a matching credit is visible in the ledger.
- Mark **account clear** only when posted credits satisfy the assessment and the verified remaining balance is zero, with no unresolved fees.
- If portal access fails or records are stale, report **verification unavailable**, not **paid**.
- Notify separately for returned payments, NSF, late charges and unexpected remaining balances.
- Deduplicate alerts by property, billing month, event type and transaction identifier.
- Never store credentials, session cookies or account numbers in the public GitHub Pages repository, frontend JavaScript or Cloudflare KV in plaintext.

## Proposed secure architecture
1. Private Cloudflare Worker with scheduled trigger and server-side access controls.
2. Encrypted per-property portal credentials managed through an approved secret store; no credentials in source control.
3. Per-portal read-only connector, subject to portal terms and access requirements. Browser automation may need a controlled remote browser rather than Workers.
4. Persist normalized assessments, credits, balance snapshots, verification timestamps and alert history in private storage.
5. Send transactional email through configured Brevo credentials to both recipients.
6. Expose a protected summary endpoint for finance.html; no sensitive HOA ledger data in the public page.

## Initial pilot
Oxford Place / LCM Property Management. Verify the portal's assessment date, posted credits, current balance and any returned-payment transactions. A screenshot alone is not a live integration.

## Acceptance checks
- Future assessment without posted credit => pending, not confirmed.
- Posted credit matching the assessment => payment posted notification.
- Posted credit plus outstanding late fee => payment posted, balance still due.
- Reversed or returned credit => urgent action required.
- Zero verified balance with settled assessment => account clear.
- Duplicate scan => no duplicate email.
- Failed login / unavailable portal => verification unavailable alert.
- Scheduled checks continue after the 7th until confirmed or resolved.
- Both recipient addresses receive each configured alert.

## Deployment gates
Do not deploy an automatic portal login or payment operation without approved access, secure credential handling, audit logging, and a successful pilot test. No automatic payments are authorized.
