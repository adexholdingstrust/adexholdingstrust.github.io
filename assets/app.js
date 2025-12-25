/* ================================
   ADEX HOLDINGS TRUST – app.js
   Access-only Admin (Cloudflare)
================================ */

const CFG = {
  WORKER_BASE: "",
  TURNSTILE_SITE_KEY: "",
  ADMIN_UI_PASSCODE: ""
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

/* ---------- Availability ---------- */

function getLocalAvailability() {
  try { return JSON.parse(localStorage.getItem("adexAvailabilityV1") || "{}"); }
  catch { return {}; }
}

function setLocalAvailability(obj) {
  localStorage.setItem("adexAvailabilityV1", JSON.stringify(obj || {}));
}

async function fetchAvailability() {
  if (!CFG.WORKER_BASE) return getLocalAvailability();
  try {
    const res = await fetch(`${CFG.WORKER_BASE}/availability`);
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return getLocalAvailability();
  }
}

async function updateAvailability(updates) {
  if (!CFG.WORKER_BASE) {
    const cur = getLocalAvailability();
    setLocalAvailability({ ...cur, ...updates });
    return;
  }

  const res = await fetch(`${CFG.WORKER_BASE}/availability/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates })
  });

  if (!res.ok) {
    const out = await res.json().catch(() => ({}));
    throw new Error(out.error || "Update failed");
  }
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

/* ---------- Rentals ---------- */

function renderRentals(availability) {
  const host = qs("#rentalsGrid");
  if (!host) return;
  host.innerHTML = "";

  window.ADEX_DATA.rentals.forEach(p => {
    const status = availability[p.id] || p.status || "rented";
    const isAvailable = status === "available";

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="kicker">Rental property</div>
      <h3>${escapeHtml(p.name)}</h3>
      <div class="meta"><b>${escapeHtml(p.type)}</b> • ${escapeHtml(p.address || "")}</div>

      <iframe src="${mapsEmbedSrc(p.address || p.name)}"
        width="100%" height="170" style="border:0;border-radius:12px"
        loading="lazy"></iframe>

      <div class="badgeRow">
        <span class="badge ${isAvailable ? "ok" : "bad"}">
          ${isAvailable ? "Available" : "Rented"}
        </span>
      </div>

      <div class="btnRow">
        <a class="btn" href="${toMapsLink(p.address)}" target="_blank">Map</a>
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

  window.ADEX_DATA.lands.forEach(l => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="kicker">Land</div>
      <h3>${escapeHtml(l.name)}</h3>
      <div class="meta">${escapeHtml(l.acres)} acres • ${escapeHtml(l.state)}</div>

      <iframe src="${mapsEmbedSrc(l.address || l.name)}"
        width="100%" height="170" style="border:0;border-radius:12px"
        loading="lazy"></iframe>

      <div class="btnRow">
        <a class="btn primary" href="${toMapsLink(l.address)}" target="_blank">Map</a>
      </div>
    `;
    host.appendChild(tile);
  });
}

/* ---------- Admin ---------- */

function renderAdmin(availability) {
  const host = qs("#adminList");
  if (!host) return;

  function render() {
    host.innerHTML = "";
    window.ADEX_DATA.rentals.forEach(p => {
      const status = availability[p.id] || "rented";
      const row = document.createElement("div");
      row.className = "card";
      row.innerHTML = `
        <div class="kicker">Rental</div>
        <b>${escapeHtml(p.name)}</b>
        <select data-id="${p.id}" class="statusSelect">
          <option value="rented" ${status === "rented" ? "selected" : ""}>Rented</option>
          <option value="available" ${status === "available" ? "selected" : ""}>Available</option>
        </select>
      `;
      host.appendChild(row);
    });
  }

  render();

  qs("#saveBtn")?.addEventListener("click", async () => {
    const updates = {};
    qsa(".statusSelect").forEach(s => updates[s.dataset.id] = s.value);

    try {
      await updateAvailability(updates);
      availability = await fetchAvailability();
      render();
      toast("Saved ✓");
    } catch (e) {
      toast(`Save failed: ${e.message}`, true);
    }
  });
}

/* ---------- Tenant Portal ---------- */

function initTenantPortal() {
  const form = qs("#tenantForm");
  if (!form) return;

  const select = qs("#propertySelect");
  window.ADEX_DATA.rentals.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.address || p.state}`;
    select.appendChild(opt);
  });

  const params = new URLSearchParams(location.search);
  if (params.get("property")) select.value = params.get("property");
}

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  if (window.__ADEX_CFG) Object.assign(CFG, window.__ADEX_CFG);

  await logVisit();
  const availability = await fetchAvailability();

  renderLands();
  renderRentals(availability);
  renderAdmin(availability);
  initTenantPortal();
});
