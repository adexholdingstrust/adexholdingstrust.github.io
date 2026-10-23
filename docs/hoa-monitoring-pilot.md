# HOA monitoring pilot — Oxford Place

Status: implementation specification only; **no live checks or emails enabled**.

## Guardrails
- Read-only access to HOA portals. Never initiate, retry, schedule, or modify payments.
- Keep usernames/passwords in a dedicated secret store, not GitHub, HTML, browser console logs, or KV records.
- Isolate Cloudflare account/project credentials from other projects on the same Mac.
- Treat a login error, missing data, stale statement, or portal change as **Unable to verify**, never **Unpaid**.
- Require a confirmed posted transaction or an authoritative zero balance before marking Paid; a pending ACH is not Paid.
- Retain only minimal account identifiers, balances, timestamps, and transaction references; redact personal information in logs.
- Do not bypass CAPTCHA, access controls, or portal automation restrictions.

## Oxford Place pilot
- Portal: LCM Property Management (user-supplied).
- Monthly HOA assessment observed in October 2026: $635.03 (historical; do not assume future assessments are unchanged).
- Assessment due: first of each month.
- Desired confirmation cutoff: seventh.
- Monitoring days: 1, 3, 5, 6, 7; daily 8–15 only if not confirmed.
- Notification recipients: tenantservices@adexholdings.com, ahmedadeyemi@gmail.com.
- Alert types: pending confirmation, unpaid balance, failed/reversed payment, late charge/interest, portal unavailable.
- Late charges can begin near the tenth; never assume an HOA grace period.

## Proposed architecture (not yet deployed)
1. Scheduled job triggers checks per portal using a permitted authenticated browser session.
2. Portal-specific adapter extracts assessment, outstanding balance, posted payment, and transaction status.
3. Validator classifies Paid / Unpaid / Payment Failed / Unable to Verify and stores check evidence with timestamp.
4. Cloudflare Worker exposes Access-protected read-only status to finance.html.
5. Email sender notifies both recipients on actionable changes, with idempotency keys to avoid duplicates.
6. Dashboard shows last successful check, last attempted check, amount, deadline, status, and manual portal link.

## Before activation
- Verify portal terms and supported login automation, secure secret handling, and account access.
- Confirm whether existing Cloudflare Worker and email sender are deployed from this repository or elsewhere.
- Test against a non-production fixture and compare to a real statement manually.
- Review alert content and retention, and explicitly authorize the first live scheduled run.

## Acceptance criteria
- Existing financial records, HOA metadata, and finance calculations are unchanged.
- A failed login never creates an overdue claim.
- A posted payment clears a warning; a returned/failed payment triggers an alert.
- Duplicate checks do not send duplicate notifications.
- Both recipients receive a test email before scheduling is enabled.
