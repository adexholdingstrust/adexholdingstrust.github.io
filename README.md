# Adex Holdings Trust — GitHub Pages Website

This folder contains a complete static site you can host on **GitHub Pages**.

## Pages Included (interlinked)
- `index.html` (Home)
- `properties.html` (Rental Properties)
- `lands.html` (Lands)
- `tenant-portal.html` (Tenant Portal with Formspree + optional CAPTCHA)
- `privacy.html` (Privacy Policy)
- `admin.html` (Admin-only availability toggle UI)

## Quick Start: Host on GitHub Pages
1. Create a GitHub repo (example: `adex-holdings-trust`).
2. Upload **all files** from this folder to the repo root.
3. In GitHub, go to **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main` (or `master`) and `/ (root)`
4. Your site will be available at:
   - `https://<your-username>.github.io/<repo-name>/`

### If you want a custom domain (adexholdings.com)
Set it in GitHub Pages settings and point your DNS (CNAME / A records) as GitHub instructs.

---

## Tenant Portal (Formspree)
The Tenant Portal posts to:
`https://formspree.io/f/xpqagapg`

In Formspree, you can:
- set the destination email (tenantservices@adexholdings.com),
- enable spam filtering,
- require confirmation, etc.

---

## CAPTCHA / Spam Protection (recommended)
Use **Cloudflare Turnstile** (free).

Steps:
1. Create a Turnstile widget in Cloudflare and get your **site key**.
2. Edit: `assets/app.js`
   - set `CFG.TURNSTILE_SITE_KEY = "YOUR_SITE_KEY"`
3. (Optional) In Formspree, ensure your plan/settings allow Turnstile or keep Turnstile purely as a UI gate.

---

## Admin Availability Toggle
### Option A (Recommended): Cloudflare Worker-backed availability (shared for all visitors)
You will deploy a Worker that stores availability and returns it to the site. Admin updates require a Bearer token.

After deploying the Worker:
1. Edit `assets/app.js`:
   - set `CFG.WORKER_BASE = "https://<your-worker>.<your-subdomain>.workers.dev"`
2. Open `admin.html`, paste your Admin Token, and click **Save availability**.

### Option B: LocalStorage fallback
If you do not configure the Worker, availability saves only to **your browser**.

---

## Visitor Logging: “Email me when anyone clicks the portal”
A static GitHub Pages site cannot securely send emails by itself (no secrets). The included Cloudflare Worker solves this.

When enabled, the site calls `POST /log` on your Worker on every page load.
The Worker can:
- record IP (as seen by Cloudflare),
- record user agent, path, referrer, timestamp,
- email a summary to you.

IMPORTANT: Update your **Privacy Policy** to reflect logging, and keep retention reasonable.

---

# Cloudflare Worker (included)

See `worker/` folder:
- `worker.js`
- `wrangler.toml` (template)

Deploy:
1. Install Wrangler: https://developers.cloudflare.com/workers/wrangler/
2. `cd worker`
3. `wrangler login`
4. Set secrets:
   - `wrangler secret put ADMIN_TOKEN`
   - `wrangler secret put EMAIL_TO`
   - `wrangler secret put EMAIL_FROM`
5. Deploy:
   - `wrangler deploy`

Then set the Worker base URL in `assets/app.js`.
