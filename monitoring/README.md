# HOA payment monitoring (foundation)

This folder contains **read-only decision rules**, not a working portal integration.

Run tests with Node.js 20+:

```bash
node --experimental-default-type=module --test monitoring/hoa-rules.test.mjs
```

## Intended workflow

1. An authorized connector reads a portal using a permitted, securely stored login session. Do not commit passwords, session cookies, browser network logs, or account numbers.
2. The connector normalizes an assessment to `{amountDue,dueDate,payments,asOfDate,autopayScheduled}`. The `asOfDate` must be the property's local calendar date.
3. Only an explicitly **posted** payment counts toward confirmation. Scheduled autopay is not payment confirmation; NSF, failed, returned and reversed entries require investigation.
4. Alert both configured recipients when a payment remains unconfirmed by the 7th, when overdue, or when failed. Send a confirmation only after posted payment is verified. Deduplicate by property, due date and status, and retain a timestamp/source for every check.
5. A portal balance alone cannot prove which assessment has been paid. Human review is required when the ledger is ambiguous.

## Not yet implemented

- Secure authenticated portal navigation and extraction
- Cloudflare Worker scheduled execution and alert email delivery
- Durable alert state, monitoring dashboard, payment history, and integration tests
- County tax monitoring and lease expiration email verification

**No automatic payment initiation.** Existing finance data and KV records must remain untouched until monitoring is validated.
