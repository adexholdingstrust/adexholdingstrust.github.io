/* ================================
   ADEX HOLDINGS TRUST – app.js
   Access-only Admin (Cloudflare)
================================ */

const CFG = {
  WORKER_BASE: "https://adexholdings.com/api",
  TURNSTILE_SITE_KEY: "0x4AAAAAAC186yCKmFT74NN1",
  ADMIN_UI_PASSCODE: "AdexAdmin2025!"
};

/* ---------- Utilities ---------- */

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function toMapsLink(urlOrQuery) {
  if (!urlOrQuery) return "#";
  if (String(urlOrQuery).startsWith("http")) return urlOrQuery;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(urlOrQuery);
}

function mapsEmbedSrc(query) {
  return "https://www.google.com/maps?q=" + encodeURIComponent(query) + "&output=embed";
}

/* ---------- Toast ---------- */

function toast(msg, isBad = false) {
  const t = qs("#toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.style.borderColor = isBad ? "rgba(255,107,107,.35)" : "rgba(61,220,151,.35)";
  t.style.background = isBad ? "rgba(255,107,107,.08)" : "rgba(61,220,151,.08)";
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => { t.style.display = "none"; }, 3800);
}

/* ---------- Availability (DEFAULTS + KV MERGE) ---------- */

function getLocalAvailability() {
  try { return JSON.parse(localStorage.getItem("adexAvailabilityV1") || "{}"); }
  catch { return {}; }
}

function setLocalAvailability(obj) {
  localStorage.setItem("adexAvailabilityV1", JSON.stringify(obj || {}));
}

/**
 * Build availability defaults from data.js
 * This prevents the {} / blank state problem permanently.
 */
function getDefaultAvailabilityFromData() {
  const out = {};
  const data = window.ADEX_DATA;
  if (!data?.rentals) return out;

  data.rentals.forEach(p => {
    if (!p?.id) return;
    out[p.id] = p.status || "rented";
  });

  return out;
}

async function fetchAvailability() {
  const defaults = getDefaultAvailabilityFromData();

  if (!CFG.WORKER_BASE) {
    return { ...defaults, ...getLocalAvailability() };
  }

  try {
    const res = await fetch(`${CFG.WORKER_BASE}/availability`, { credentials: "omit" });
    if (!res.ok) throw new Error("availability fetch failed");

    const kv = await res.json().catch(() => ({}));
    const local = getLocalAvailability();

    return { ...defaults, ...(kv || {}), ...local };
  } catch {
    return { ...defaults, ...getLocalAvailability() };
  }
}

async function updateAvailability(updates) {
  if (!CFG.WORKER_BASE) {
    const cur = getLocalAvailability();
    setLocalAvailability({ ...cur, ...updates });
    return { ok: true, mode: "localStorage" };
  }

  const res = await fetch(`${CFG.WORKER_BASE}/availability/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates })
  });

  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || "Update failed");
  return out;
}

/* ---------- Access / Audit ---------- */

async function fetchWhoAmI() {
  if (!CFG.WORKER_BASE) return null;
  const res = await fetch(`${CFG.WORKER_BASE}/whoami`, { credentials: "omit" });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || "whoami failed");
  return out;
}

async function fetchAudit() {
  if (!CFG.WORKER_BASE) return { log: [] };
  const res = await fetch(`${CFG.WORKER_BASE}/admin/audit`, { credentials: "omit" });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || "audit failed");
  return out;
}

function renderWhoAmI(who) {
  const badge = qs("#whoami");
  if (!badge) return;
  badge.textContent = who?.email ? `Logged in as ${who.email}` : "Not authenticated";
}

function applyMaintenanceUI(who) {
  const banner = qs("#maintenanceBanner");
  const saveBtn = qs("#saveBtn");

  if (who?.maintenance === true) {
    banner && (banner.style.display = "block");
    saveBtn && (saveBtn.disabled = true);
  } else {
    banner && (banner.style.display = "none");
    saveBtn && (saveBtn.disabled = false);
  }
}

function renderAuditTable(resp) {
  const tbody = qs("#auditTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  const rows = Array.isArray(resp?.log) ? resp.log : [];

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="opacity:.7">No admin activity yet.</td></tr>`;
    return;
  }

  rows.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e.ts || "")}</td>
      <td>${escapeHtml(e.email || "")}</td>
      <td>${escapeHtml(e.action || "")}</td>
      <td>${escapeHtml((e.properties || []).join(", "))}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------- Visitor Logging ---------- */

async function logVisit() {
  if (!CFG.WORKER_BASE) return;
  try {
    await fetch(`${CFG.WORKER_BASE}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: location.pathname,
        page: document.title || "",
        referrer: document.referrer || ""
      })
    });
  } catch {}
}

/* ---------- Rentals ---------- */

function renderRentals(availability) {
  const host = qs("#rentalsGrid");
  if (!host) return;
  host.innerHTML = "";

  window.ADEX_DATA.rentals.forEach(p => {
    const status = availability[p.id] || p.status || "rented";
    const isAvailable = status === "available";

    host.insertAdjacentHTML("beforeend", `
      <div class="tile">
        <div class="kicker">Rental property</div>
        <h3>${escapeHtml(p.name)}</h3>
        <div class="meta"><b>${escapeHtml(p.type)}</b> • ${escapeHtml(p.address || "")}</div>
        <iframe src="${mapsEmbedSrc(p.address || p.name)}" width="100%" height="170" style="border-radius:12px" loading="lazy"></iframe>
        <div class="badgeRow">
          <span class="badge ${isAvailable ? "ok" : "bad"}">${isAvailable ? "Available" : "Rented"}</span>
        </div>
      </div>
    `);
  });
}

/* ---------- Admin ---------- */

function renderAdmin(availabilityRef) {
  const host = qs("#adminList");
  if (!host) return;

  host.innerHTML = "";

  window.ADEX_DATA.rentals.forEach(p => {
    const status = availabilityRef[p.id] || p.status || "rented";
    host.insertAdjacentHTML("beforeend", `
      <div class="card">
        <div class="kicker">Rental</div>
        <b>${escapeHtml(p.name)}</b>
        <select class="statusSelect" data-id="${escapeHtml(p.id)}">
          <option value="rented" ${status === "rented" ? "selected" : ""}>Rented</option>
          <option value="available" ${status === "available" ? "selected" : ""}>Available</option>
        </select>
      </div>
    `);
  });

  const saveBtn = qs("#saveBtn");
  if (!saveBtn || saveBtn.dataset.bound) return;
  saveBtn.dataset.bound = "true";

  saveBtn.addEventListener("click", async () => {
    const updates = {};
    qsa(".statusSelect").forEach(s => updates[s.dataset.id] = s.value);

    try {
      await updateAvailability(updates);
      const fresh = await fetchAvailability();
      renderAdmin(fresh);
      renderAuditTable(await fetchAudit());
      toast("Availability saved ✓");
    } catch (e) {
      toast(`Save failed: ${e.message}`, true);
    }
  });
}

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  await logVisit();

  const availability = await fetchAvailability();
  renderRentals(availability);
  renderAdmin(availability);

  try {
    const who = await fetchWhoAmI();
    renderWhoAmI(who);
    applyMaintenanceUI(who);
    renderAuditTable(await fetchAudit());
  } catch {
    qs("#whoami") && (qs("#whoami").textContent = "Identity unavailable");
  }
});
