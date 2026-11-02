# Adex HOA and property tax monitoring

Implementation state, November 2, 2026: the isolated Worker is deployed and its health/authentication acceptance checks passed. Both Elko public account/bill observations and the validated Nye tax bill were delivered live.
**County email notifications are enabled after Cloudflare runtime acceptance and Gmail inbox verification. LCM assessment collection and FrontSteps balance-only collection are connected. TownSq access, complete HOA payment-allocation evidence, remaining county readers, and live finance reconciliation remain incomplete.**
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
  `ahmedadeyemi@gmail.com`. `NOTIFICATIONS_ENABLED=true` after acceptance.
  Failed sends remain retryable. Pending sends retry after 15 minutes on a later
  ingestion/check. KV notification suppression is best effort; simultaneous runs
  or an ambiguous email-provider timeout can cause duplicate delivery.
- `collect-county-tax.py`: public Elko account retrieval plus fresh-token PDF
  download and reconciliation. Two account/bill totals must match before a tax
  confirmation is accepted. Does not fabricate missing due dates or payment dates.
- GitHub county collector workflow: enabled daily 13:45/20:45 UTC. A live activation run is also triggered by workflow-file updates; manual dry-run remains available.
- The Nye County bill is collected on the same schedule. Its installment amounts and dates are captured; account balance and payment status remain unverified because the bill alone does not prove settlement. Past installments are flagged for review, not labeled unpaid or delinquent. Other county registry entries are not yet connected recurring collectors.
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
   Hoye Drive, and FrontSteps Calabrese. LCM and FrontSteps authentication is verified;
   TownSq currently rejects API authentication with HTTP 403. MFA or interactive
   challenges require account-holder involvement. No guessed login endpoints.
8. Validate remaining county account mappings and allowed retrieval methods:
   Navajo, Iron (email verification), Valencia (special assessments), Los Angeles
   (AIN and prior-year delinquency), Nye, and Apache (alternative payment options,
   not additive installments). Do not guess dates or infer paid from zero balances.
9. Enable notifications and send a clearly labelled acceptance message to both
   configured recipients; verify provider acceptance and inbox receipt. Test failed
   delivery recovery and duplicate suppression. The county collector is enabled after successful acceptance; verify each additional collector before enabling it. A full run reports 14 expected property records (3 HOA,
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

## Initial deployment blocker (resolved)

The initial browser login blocker was resolved with GitHub Actions and an encrypted secret in the existing `github-pages` environment. Both deployment and county collection jobs explicitly target that environment and preserve its main-branch protection. Do not move the existing token or expose its value.

Verified latest deployment and three live county deliveries: https://github.com/adexholdingstrust/adexholdingstrust.github.io/actions/runs/40515430198

Worker origin: `https://adex-hoa-monitor.tenantservices.workers.dev`. Dedicated KV: `a26688b05efe477eb9460c684dcfc08a`. The November 2 activation deploy sets live notifications on; its health check verifies storage, signing and the expected notification flag. Unsigned ingestion and status return 401; signed invalid input returns 400; signed status succeeds. Both Elko observations were delivered and classified `paid_confirmed`. The Nye bill was delivered with payment status unverified. GitHub scheduled county collection has run successfully for Elko; the expanded Nye collector was verified in the deployment run. Cloudflare cron triggers are installed for 14:15/21:15 UTC; a natural Worker cron execution was verified through protected status at 2026-11-02T14:15:41.607Z (14 checks, 11 missing records and no processing failures at that time, before the new HOA observations). Existing production Worker and finance KV were not modified.

Email credentials are now configured for the isolated Worker. The acceptance message, both real Elko payment-confirmation messages, and the Nye payment-verification notice were verified in the connected Gmail inbox, addressed to both requested recipients. Separate tenantservices inbox delivery has not been inspected. The six new HOA credentials are provided securely through the protected GitHub environment. LCM and FrontSteps authentication succeeded. LCM assessment observations and FrontSteps balance-only observations were ingested, and their verification notices were received in Gmail. TownSq access is denied with HTTP 403; full HOA payment-allocation evidence, remaining county collectors, and live finance reconciliation remain incomplete. Preserve the working Cloudflare and Brevo secrets in the existing github-pages environment.

Health and ingestion clients use `AdexPropertyMonitor/2.0 (+https://adexholdings.com)` as their truthful service identity. Python's default User-Agent was rejected with Cloudflare 1010. No security protections were disabled.


## Deployment without Cloud Browser

The `Deploy isolated Adex monitor` GitHub Actions workflow supports the account
holder's normal browser. Add an account-scoped API token as repository Actions
secret `ADEX_MONITOR_CLOUDFLARE_API_TOKEN` in the existing `github-pages` environment (repository secrets also work). The workflow pins the Adex account,
Worker name, namespace title, and explicit notification activation policy, and refuses site
routes, other account IDs, service bindings, and ambiguous storage namespaces.
Use only Workers Scripts edit, Workers KV Storage edit, and Account Settings
read permissions for this Adex account; do not supply a Global API Key.

The deployment job runs on relevant main-branch pushes or manually via Actions. It creates/reuses only
`adex-hoa-monitor-dedicated-v1`, deploys the monitoring Worker, installs its signing
secret and available Brevo key, checks health and authenticated/unauthenticated requests, and delivers
county observations. Live notifications require the configured Brevo key before deployment. It does not
configure the old production Worker or touch finance KV. A failed deploy may
leave the dedicated namespace or monitoring Worker partially provisioned; review
the job summary rather than assuming activation succeeded.

An explicit `ADEX_MONITOR_INGEST_SECRET` Actions secret is preferred. If omitted,
the pipeline derives a domain-separated HMAC key from the scoped Cloudflare API
token. The Cloudflare API token itself is never sent to ingestion. The county
collector can derive the same signing key and discover the Worker origin using
that repository token; it needs no copying of plaintext credentials through chat.
After rotating the Cloudflare token, redeploy before running collectors so the
Worker and collector use the same derived key. The optional repository secret
`ADEX_MONITOR_BREVO_API_KEY` provisions email credentials for this new Worker;
live notifications are now enabled in the checked-in configuration after acceptance. Existing encrypted Worker
secrets cannot be read back or automatically moved to the new Worker.


## Verified runtime email path (November 2, 2026)

The GitHub-hosted runner was rejected by Brevo's source-IP policy. The supplied key works from the actual Cloudflare Worker; do not replace it or disable account security based on the runner's 401. `/test-email` accepts a timestamp-bound HMAC and a validated test ID only. Content and both recipients are fixed, and duplicate tests are suppressed. The protected acceptance workflow runs after a successful isolated deployment and calls that runtime endpoint. It does not send directly from the GitHub runner.

Runtime acceptance deployment: https://github.com/adexholdingstrust/adexholdingstrust.github.io/actions/runs/41503452825

Activation deployment: https://github.com/adexholdingstrust/adexholdingstrust.github.io/actions/runs/41504140644 (latest attempt succeeded: health/authentication checks, all three county deliveries and runtime email acceptance passed; live notifications are enabled).

The worker's notification flag is separate from coverage: an enabled notification service does not mean the HOA or finance integrations are complete. No payments are initiated.

### Confirmation evidence

HOA confirmation does not depend on receipt emails. Every HOA payment observation must carry `evidence: "hoa_account_ledger"`, a stable portal transaction reference, posting date, amount, status, and the due date of the assessment to which it is allocated. Collectors must verify these fields in the authenticated HOA account. A bank debit, scheduled autopay, receipt email, or account credit alone is insufficient. Partial payments and payments allocated to another month cannot confirm the current assessment. Reversals remove the corresponding paid amount. Stored records without ledger evidence cannot generate confirmation.

Tax receipt emails acknowledge a transaction; county account/bill reconciliation independently verifies posting. Missing receipt email does not prove nonpayment. Receipt-mail ingestion is not yet connected. Secure portal access is now configured for all three providers; LCM and FrontSteps authentication is verified, while TownSq returns HTTP 403.

## Authenticated HOA monitoring, November 2 update

`Verify authenticated HOA access` runs independently for LCM, TownSq and FrontSteps using only the selected provider's protected environment credentials. The collection schedule is 14:30 and 21:30 UTC (6:30 a.m. and 1:30 p.m. Pacific Standard Time). These UTC times shift relative to Pacific daylight time. Natural executions of the new schedule are not yet verified. Existing production Worker and finance KV remain unchanged.

- LCM: account sign-in and four-column ledger retrieval verified. A uniquely identified current-month assessment is ingested. Unreferenced ledger credits are not assigned to an assessment. Current payment status is unverified; its notification was received in Gmail. An intermittent login HTTP 409 has also occurred; successful subsequent observations do not eliminate that reliability limitation.
- FrontSteps: community sign-in and unique Calabrese unit matching verified. The provider balance and update timestamp are ingested. Assessment amount, deadline and payment allocation remain unknown in this view. A credit balance is not a paid confirmation. Its verification notification was received in Gmail.
- TownSq: the public client implements SHA1 password transformation and `POST /rest/login`, followed by authenticated own-user account and transaction GETs. The API returned HTTP 403. No credentials were declared invalid based on that response. Unattended authentication retries are paused for TownSq until access is resolved; manual dispatch can explicitly test it again; its missing collector remains visible.
- FrontSteps payment history: the payment UI calls `createOrUpdatePayer` before loading history. That write remains blocked. A legacy read-only existing-payer lookup returned HTTP 400. The current provider OpenAPI describes the POST operation as lookup/create/update; it does not expose that legacy external lookup route. No broad payer-directory queries were attempted. The exact-account-bound profile initialization exception in `hoa-request-policy.js` remains disabled (`HOA_ALLOW_PROFILE_INIT` is unset). Enabling it requires account-holder authorization because it can create/update a payment-provider payer profile. It does not authorize payment methods, transfers, schedules, or payment submission; all those writes remain blocked.

Payment-unverified means evidence is insufficient; it is not an assertion of unpaid debt. No incoming tax receipt-mail collector is connected yet. Finance still uses published assessment/tax registry overrides, not private monitoring KV records.
