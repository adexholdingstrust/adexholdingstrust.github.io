# Adex HOA and property tax monitoring

Implementation state, October 23, 2026: code is prepared and locally tested.
**Cloudflare deployment, authenticated HOA collection, and live email delivery are not verified.**
No payment initiation is implemented. No existing finance KV records are modified.

## Components

- `hoa-monitor-worker/`: isolated `adex-hoa-monitor` Worker in Adex account
  `8956c5a630c91f81296ffb3e8f9a7532`. Separate storage binding `HOA_MONITOR_KV`.
  It has no routes over the production website and no binding to its finance KV.
- `POST /ingest`: signed version 2 normalized HOA/county observations. Strict
  property, source host, timestamp, amount, date, and payment validation. Credentials,
  cookies, arbitrary additional fields, and stale observations are rejected.
- HMAC SHA-256 signature: sign `UNIX_SECONDS + '.' + RAW_JSON_BODY` with the
  dedicated `HOA_INGEST_SECRET`. Headers `X-Adex-Timestamp` and
  `X-Adex-Signature: sha256=HEX`. Five minute transport window. Previously stored
  newer observations reject older data. KV is eventually consistent, so this is
  not a transaction or an exact-once replay guarantee.
- `GET /health`: configuration flags only, no financial/account values.
- `GET /status`: HMAC on timestamp plus `.` plus empty body; returns last scheduled
  check summary. Do not expose the signing secret in the website or browser.
- Worker checks stored observations at 14:15 and 21:15 UTC daily. These checks
  **do not log into portals**. They evaluate current evidence, detect stale data
  after 48 hours, and report missing collectors. Property-local dates handle DST.
- Brevo notifications address both `tenantservices@adexholdings.com` and
  `ahmedadeyemi@gmail.com`. `NOTIFICATIONS_ENABLED=false` until acceptance.
  Failed sends remain retryable. Pending sends retry after 15 minutes on a later
  ingestion/check. KV notification suppression is best effort; simultaneous runs
  or an ambiguous email-provider timeout can cause duplicate delivery.
- `collect-county-tax.py`: public Elko account retrieval plus fresh-token PDF
  download and reconciliation. Two account/bill totals must match before a tax
  confirmation is accepted. Does not fabricate missing due dates or payment dates.
- GitHub county collector workflow: daily 13:45/20:45 UTC, disabled unless repository
  variable `ADEX_MONITOR_COLLECTORS_ENABLED=true`. Manual dry-run is available.
- Existing Nye PDF extractor and other county registry entries remain source data,
  **not connected recurring collectors**.
- Finance modal, monthly results, and portfolio stress summary use the same HOA
  assessment and annual county-tax overrides. Bank contributions/prepayments stay
  separate. Calabrese assessment is $205/month; $120/14 days is $3,120/year and
  $260/month average cash outflow, not an increased HOA expense.

## Verification

Node 24+, Python 3.12+, and Poppler `pdftotext` for live PDF collection:

```bash
node --test monitoring/*.test.mjs hoa-monitor-worker/*.test.mjs
python -m unittest discover -s monitoring -p 'test_*.py'
node --check finance.js
git diff --check
npx --yes wrangler@4.86.0 deploy --dry-run --config hoa-monitor-worker/wrangler.toml --outdir /tmp/adex-monitor-build
python monitoring/collect-county-tax.py --dry-run
```

## Deployment and activation prerequisites

1. Authenticate Wrangler to the Adex account and verify account identity. Do not
   reuse another organization's login or alter `adex-trust-security`.
2. Create a dedicated KV namespace; add its actual ID under `[[kv_namespaces]]`
   with binding `HOA_MONITOR_KV` in the standalone Wrangler config.
3. Provision a new high-entropy `HOA_INGEST_SECRET` through secure secret entry.
   For the GitHub collector, put the same signing value in repository Actions
   secret `ADEX_MONITOR_INGEST_SECRET`. Never commit or print it.
4. Configure the verified Brevo sender (`HOA_SENDER_EMAIL` or `EMAIL_FROM`) and
   `BREVO_API_KEY` for this Worker securely. Existing Worker secrets cannot be
   read back by Wrangler. Do not copy passwords into source or dashboard scripts.
5. Deploy with `npx --yes wrangler@4.86.0 deploy --config hoa-monitor-worker/wrangler.toml`.
   Verify `/health`, unsigned ingestion 401, signed valid ingestion, invalid-data
   rejection, and signed `/status`. Verify only the new Worker changed.
6. Set GitHub variable `ADEX_MONITOR_URL` to the verified Worker origin. Run the
   collector manually in dry-run, then delivery mode with emails disabled. Read
   back dedicated monitoring storage; verify no finance writes occurred.
7. Connect provider-specific read-only collectors for LCM Oxford Place, TownSq
   Hoye Drive, and FrontSteps Calabrese. **These are not implemented:** authenticated
   sessions/API contracts must be inspected and validated first. MFA or interactive
   challenges require account-holder involvement. No guessed login endpoints.
8. Validate remaining county account mappings and allowed retrieval methods:
   Navajo, Iron (email verification), Valencia (special assessments), Los Angeles
   (AIN and prior-year delinquency), Nye, and Apache (alternative payment options,
   not additive installments). Do not guess dates or infer paid from zero balances.
9. Enable notifications and send a clearly labelled acceptance message to both
   configured recipients; verify provider acceptance and inbox receipt. Test failed
   delivery recovery and duplicate suppression. Enable collector repository variable
   only after acceptance. A full run reports 14 expected property records (3 HOA,
   11 county); missing collectors must remain visible.
10. Verify the next scheduled executions in Cloudflare and GitHub. Deployment of
    a cron configuration alone does not establish that collection is operational.

## Payment evidence and source handling

HOA confirmations require posted positive payment references allocated to the
specific due date, less reversals. Scheduled autopay, a credit balance, and a
payment description alone are insufficient. County annual confirmation may use
reconciled current-year account and bill totals with zero overall balance.
Tax reminders with unknown deadlines stay unverified. Source paths/account IDs
are not included in email; the originating host and property label identify the
record. No authentication/session payload belongs in normalized snapshots.

## Remaining blockers at preparation time

The available Cloudflare browser was signed out and no Wrangler credentials were
present. Dedicated KV, signing/email secrets, deployments, recurring execution,
HOA portal sessions, remaining county readers, and real email receipt require
verification. Production services have not been modified by this branch.
