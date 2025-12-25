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

/* ---------- Availability (local fallback) ---------- */

function getLocalAvailability() {
  try { return JSON.parse(localStorage.getItem("adexAvailabilityV1") || "{}"); }
  catch { return {}; }
}

function setLocalAvailability(obj) {
  localStorage.setItem("adexAvailabilityV1", JSON.stringify(obj || {}));
}

/**
 * Build defaults from ADEX_DATA so you never see a blank {} experience.
 * If KV is empty, rentals still show their base status from data.js.
 */
function getDefaultAvailabilityFromData() {
  const out = {};
  const data = window.ADEX_DATA;
  if (!data?.rentals) return out;
  data.rentals.forEach(p => {
    if (!p?.id) return;
    out[p.id] = (p.status || "rented");
  });
  return out;
}

async function fetchAvailability() {
  // If no Worker base, use local storage merged with defaults
  const defaults = getDefaultAvailabilityFromData();
  if (!CFG.WORKER_BASE) return { ...defaults, ...getLocalAvailability() };

  try {
    const res = await fetch(`${CFG.WORKER_BASE}/availability`, { credentials: "omit" });
    if (!res.ok) throw new Error(`availability fetch failed (${res.status})`);
    const kv = await res.json().catch(() => ({}));

    // Merge: defaults -> kv -> local overrides (optional)
    // (local overrides only used if you want it; harmless if empty)
    const local = getLocalAvailability();
    return { ...defaults, ...(kv || {}), ...local };
  } catch {
    // Offline / blocked: use defaults + local
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
  if (!res.ok) throw new Error(out?.error || `Update failed (${res.status})`);
  return out;
}

/* ---------- Audit + WhoAmI ---------- */

async function fetchWhoAmI() {
  if (!CFG.WORKER_BASE) return null;
  const res = await fetch(`${CFG.WORKER_BASE}/whoami`, { credentials: "omit" });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || `whoami failed (${res.status})`);
  return out;
}

async function fetchAudit() {
  if (!CFG.WORKER_BASE) return { ok: true, log: [] };
  const res = await fetch(`${CFG.WORKER_BASE}/admin/audit`, { credentials: "omit" });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || `audit failed (${res.status})`);
  return out;
}

function renderWhoAmI(who) {
  const badge = qs("#whoami");
  if (!badge) return;

  if (!who?.email) {
    badge.textContent = "Not authenticated";
    return;
  }

  badge.textContent = `Logged in as ${who.email}`;
}

function applyMaintenanceUI(who) {
  const banner = qs("#maintenanceBanner");
  const saveBtn = qs("#saveBtn");

  if (who?.maintenance === true) {
    if (banner) banner.style.display = "block";
    if (saveBtn) saveBtn.disabled = true;
  } else {
    if (banner) banner.style.display = "none";
    if (saveBtn) saveBtn.disabled = false;
  }
}

function renderAuditTable(auditResp) {
  const tbody = qs("#auditTable tbody");
  if (!tbody) return;

  const rows = Array.isArray(auditResp?.log) ? auditResp.log : [];
  tbody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="4" style="opacity:.8">
        No audit entries yet. Make a change and click “Save availability”.
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  rows.forEach(e => {
    const details =
      (Array.isArray(e?.properties) && e.properties.length)
        ? e.properties.join(", ")
        : (e?.details || "");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e?.ts || "")}</td>
      <td>${escapeHtml(e?.email || "")}</td>
      <td>${escapeHtml(e?.action || "")}</td>
      <td>${escapeHtml(details)}</td>
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

  const data = window.ADEX_DATA;
  if (!data?.rentals?.length) return;

  data.rentals.forEach(p => {
    const status = availability?.[p.id] || p.status || "rented";
    const isAvailable = status === "available";

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="kicker">Rental property</div>
      <h3>${escapeHtml(p.name)}</h3>
      <div class="meta"><b>${escapeHtml(p.type)}</b> • ${escapeHtml(p.address || "")}</div>

      <iframe
        title="Map"
        src="${mapsEmbedSrc(p.address || p.name)}"
        width="100%" height="170"
        style="border:0;border-radius:12px"
        loading="lazy"></iframe>

      <div class="badgeRow">
        <span class="badge ${isAvailable ? "ok" : "bad"}">
          ${isAvailable ? "Available" : "Rented"}
        </span>
      </div>

      <div class="btnRow">
        <a class="btn" href="${toMapsLink(p.address || p.name)}" target="_blank" rel="noopener">Map</a>
        ${isAvailable
          ? `<a class="btn primary" href="tenant-portal.html?property=${encodeURIComponent(p.id)}">Inquire</a>`
          : `<button class="btn primary disabled" disabled>Unavailable</button>`
        }
      </div>
    `;
    host.appendChild(tile);
  });
}

/* ---------- Lands ---------- */

function renderLands() {
  const host = qs("#landsGrid");
  if (!host) return;
  host.innerHTML = "";

  const data = window.ADEX_DATA;
  if (!data?.lands?.length) return;

  data.lands.forEach(l => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="kicker">Land</div>
      <h3>${escapeHtml(l.name)}</h3>
      <div class="meta">${escapeHtml(l.acres)} acres • ${escapeHtml(l.state || "")}</div>

      <iframe
        title="Map"
        src="${mapsEmbedSrc(l.address || l.name)}"
        width="100%" height="170"
        style="border:0;border-radius:12px"
        loading="lazy"></iframe>

      <div class="btnRow">
        <a class="btn primary" href="${toMapsLink(l.address || l.name)}" target="_blank" rel="noopener">Map</a>
      </div>
    `;
    host.appendChild(tile);
  });
}

/* ---------- Admin ---------- */

function renderAdmin(availabilityRef) {
  const host = qs("#adminList");
  if (!host) return;

  const data = window.ADEX_DATA;
  if (!data?.rentals?.length) return;

  function render() {
    host.innerHTML = "";
    data.rentals.forEach(p => {
      const status = availabilityRef?.[p.id] || p.status || "rented";
      const row = document.createElement("div");
      row.className = "card";
      row.innerHTML = `
        <div class="kicker">Rental</div>
        <b>${escapeHtml(p.name)}</b>
        <select data-id="${escapeHtml(p.id)}" class="statusSelect">
          <option value="rented" ${status === "rented" ? "selected" : ""}>Rented</option>
          <option value="available" ${status === "available" ? "selected" : ""}>Available</option>
        </select>
      `;
      host.appendChild(row);
    });
  }

  render();

  const saveBtn = qs("#saveBtn");
  if (!saveBtn) return;

  // Prevent multiple bindings if this runs more than once
  if (saveBtn.dataset.bound === "true") return;
  saveBtn.dataset.bound = "true";

  saveBtn.addEventListener("click", async () => {
    const updates = {};
    qsa(".statusSelect").forEach(s => {
      if (!s?.dataset?.id) return;
      updates[s.dataset.id] = s.value;
    });

    try {
      const result = await updateAvailability(updates);
      const availability = await fetchAvailability();
      availabilityRef = availability; // keep reference fresh
      renderAdmin(availabilityRef);    // re-render admin list

      // refresh audit after save
      try {
        const audit = await fetchAudit();
        renderAuditTable(audit);
      } catch {}

      toast(`Saved ✓ (${result?.mode || "ok"})`);
    } catch (e) {
      toast(`Save failed: ${e?.message || e}`, true);
    }
  });
}

/* ---------- Tenant Portal ---------- */

function initTenantPortal() {
  const form = qs("#tenantForm");
  if (!form) return;

  const select = qs("#propertySelect");
  if (!select) return;

  const data = window.ADEX_DATA;
  if (!data?.rentals?.length) return;

  data.rentals.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.address || p.state || ""}`.trim();
    select.appendChild(opt);
  });

  const params = new URLSearchParams(location.search);
  const prop = params.get("property");
  if (prop) select.value = prop;
}

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  // allow overrides if you ever choose to use window.__ADEX_CFG
  if (window.__ADEX_CFG) Object.assign(CFG, window.__ADEX_CFG);

  await logVisit();

  const availability = await fetchAvailability();

  renderLands();
  renderRentals(availability);
  renderAdmin(availability);
  initTenantPortal();

  // Admin-only UI pieces (safe to call on non-admin pages too)
  try {
    const who = await fetchWhoAmI();
    renderWhoAmI(who);
    applyMaintenanceUI(who);
  } catch {
    // If Access blocks /whoami, you’ll see it here
    const badge = qs("#whoami");
    if (badge) badge.textContent = "Identity unavailable";
  }

  try {
    const audit = await fetchAudit();
    renderAuditTable(audit);
  } catch {
    // ignore on pages without audit table
  }
});
