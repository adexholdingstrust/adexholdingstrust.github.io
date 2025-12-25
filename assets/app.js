/* ================================
   ADEX HOLDINGS TRUST – app.js
   Cloudflare Access–Safe (FINAL)
================================ */

/* ---------- CONFIG ---------- */
/**
 * CRITICAL:
 * - WORKER_BASE MUST be empty string
 * - Same-origin requests preserve Access cookies
 */
const CFG = {
  WORKER_BASE: "", // DO NOT CHANGE
  TURNSTILE_SITE_KEY: "0x4AAAAAAC186yCKmFT74NN1",
  ADMIN_UI_PASSCODE: "AdexAdmin2025!"
};

/* ---------- FETCH WRAPPER ---------- */
/**
 * Single safe fetch helper:
 * - same-origin
 * - credentials included
 * - no Access redirect explosions
 */
async function apiFetch(path, options = {}) {
  return fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
}

/* ---------- DOM HELPERS ---------- */

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- TOAST ---------- */

function toast(msg, bad = false) {
  const el = qs("#toast");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.style.display = "block";
  el.style.borderColor = bad ? "#ff6b6b" : "#3ddc97";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.style.display = "none", 3500);
}

/* ---------- AVAILABILITY ---------- */

function defaultsFromData() {
  const out = {};
  (window.ADEX_DATA?.rentals || []).forEach(p => {
    out[p.id] = p.status || "rented";
  });
  return out;
}

async function fetchAvailability() {
  try {
    const res = await apiFetch("/api/availability");
    if (!res.ok) throw new Error();
    const kv = await res.json();
    return { ...defaultsFromData(), ...(kv || {}) };
  } catch {
    return defaultsFromData();
  }
}

async function updateAvailability(updates) {
  const res = await apiFetch("/api/availability/update", {
    method: "POST",
    body: JSON.stringify({ updates })
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Save failed");
  return out;
}

/* ---------- WHOAMI ---------- */

async function fetchWhoAmI() {
  try {
    const res = await apiFetch("/api/whoami");
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return null;
  }
}

function renderWhoAmI(who) {
  const el = qs("#whoami");
  if (!el) return;
  el.textContent = who?.email
    ? `Logged in as ${who.email}`
    : "Authenticated via Cloudflare Access";
}

/* ---------- AUDIT ---------- */

async function fetchAudit() {
  try {
    const res = await apiFetch("/api/admin/audit");
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return { log: [] };
  }
}

function renderAuditTable(audit) {
  const tbody = qs("#auditTable tbody");
  if (!tbody) return;

  const rows = audit.log || [];
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `
      <tr><td colspan="4" style="opacity:.7">
        No admin activity yet
      </td></tr>`;
    return;
  }

  rows.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e.ts)}</td>
      <td>${escapeHtml(e.email)}</td>
      <td>${escapeHtml(e.action)}</td>
      <td>${escapeHtml((e.properties || []).join(", "))}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------- RENTALS ---------- */

function renderRentals(availability) {
  const host = qs("#rentalsGrid");
  if (!host) return;
  host.innerHTML = "";

  (window.ADEX_DATA?.rentals || []).forEach(p => {
    const status = availability[p.id] || "rented";
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div>${escapeHtml(p.address)}</div>
      <div class="badge ${status === "available" ? "ok" : "bad"}">
        ${status}
      </div>
    `;
    host.appendChild(tile);
  });
}

/* ---------- ADMIN ---------- */

function renderAdmin(availabilityRef) {
  const host = qs("#adminList");
  const saveBtn = qs("#saveBtn");
  if (!host || !saveBtn) return;

  host.innerHTML = "";

  window.ADEX_DATA.rentals.forEach(p => {
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <b>${escapeHtml(p.name)}</b>
      <select data-id="${p.id}">
        <option value="rented">Rented</option>
        <option value="available">Available</option>
      </select>
    `;
    row.querySelector("select").value =
      availabilityRef[p.id] || "rented";
    host.appendChild(row);
  });

  if (saveBtn.dataset.bound) return;
  saveBtn.dataset.bound = "true";

  saveBtn.addEventListener("click", async () => {
    const updates = {};
    qsa("select[data-id]").forEach(s => {
      updates[s.dataset.id] = s.value;
    });

    try {
      await updateAvailability(updates);
      const fresh = await fetchAvailability();
      renderAdmin(fresh);
      renderRentals(fresh);

      const audit = await fetchAudit();
      renderAuditTable(audit);

      toast("Saved ✓");
    } catch (e) {
      toast(e.message, true);
    }
  });
}

/* ---------- LOG VISIT (SILENT) ---------- */

async function logVisit() {
  try {
    await apiFetch("/api/log", {
      method: "POST",
      body: JSON.stringify({
        page: document.title,
        path: location.pathname,
        referrer: document.referrer
      })
    });
  } catch {}
}

/* ---------- INIT ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  await logVisit();

  const availability = await fetchAvailability();
  renderRentals(availability);
  renderAdmin(availability);

  const who = await fetchWhoAmI();
  renderWhoAmI(who);

  const audit = await fetchAudit();
  renderAuditTable(audit);
});
