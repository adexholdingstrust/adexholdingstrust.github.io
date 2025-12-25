/* =========================================================
   ADEX HOLDINGS TRUST — app.js (CLOUDFLARE ACCESS SAFE)
   FINAL + PUBLIC PAGES PATCH
========================================================= */

const CFG = {
  WORKER_BASE: "/api"
};

/* =======================
   HELPERS
======================= */

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];

const escapeHtml = s =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function accessRedirected(res) {
  return res.type === "opaqueredirect" || res.status === 302;
}

function notify(msg, bad = false) {
  const t = qs("#toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.style.borderColor = bad ? "#ff6b6b" : "#3ddc97";
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => (t.style.display = "none"), 4000);
}

/* =======================
   MAP HELPERS (PUBLIC)
======================= */

function mapImage(query) {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(
    query
  )}&zoom=15&size=640x360&maptype=roadmap&markers=color:red|${encodeURIComponent(
    query
  )}`;
}

function mapEmbed(query) {
  return `
    <iframe
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      src="https://www.google.com/maps?q=${encodeURIComponent(
        query
      )}&output=embed">
    </iframe>
  `;
}

/* =======================
   SAFE FETCH (ACCESS)
======================= */

async function accessFetch(path, opts = {}) {
  const res = await fetch(`${CFG.WORKER_BASE}${path}`, {
    credentials: "include",
    redirect: "manual",
    ...opts
  });

  if (accessRedirected(res)) {
    notify("Session expired. Please refresh and sign in again.", true);
    throw new Error("Access redirect");
  }

  return res;
}

/* =======================
   AVAILABILITY
======================= */

async function fetchAvailability() {
  try {
    const res = await accessFetch("/availability");
    if (!res.ok) throw new Error("availability fetch failed");
    return await res.json();
  } catch {
    return {};
  }
}

async function saveAvailability(updates) {
  const res = await accessFetch("/availability/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Save failed");
  }
}

/* =======================
   WHOAMI
======================= */

async function loadWhoAmI() {
  try {
    const res = await accessFetch("/whoami");
    const who = await res.json();
    const badge = qs("#whoami");
    if (badge) badge.textContent = `Logged in as ${who.email}`;
    return who;
  } catch {
    const badge = qs("#whoami");
    if (badge) badge.textContent = "Not authenticated";
    return null;
  }
}

/* =======================
   AUDIT LOG
======================= */

async function loadAudit() {
  try {
    const res = await accessFetch("/admin/audit");
    const out = await res.json();
    renderAudit(out.log || []);
  } catch {
    renderAudit([]);
  }
}

function renderAudit(rows) {
  const body = qs("#auditTable tbody");
  if (!body) return;

  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `
      <tr><td colspan="4" style="opacity:.7">
        No admin activity yet.
      </td></tr>`;
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.ts)}</td>
      <td>${escapeHtml(r.email)}</td>
      <td>${escapeHtml(r.action)}</td>
      <td>${escapeHtml((r.properties || []).join(", "))}</td>
    `;
    body.appendChild(tr);
  });
}

/* =======================
   RENTALS (ADMIN + SIMPLE PUBLIC)
======================= */

function renderRentals(avail) {
  const host = qs("#rentalsGrid");
  if (!host || !window.ADEX_DATA?.rentals) return;

  host.innerHTML = "";

  window.ADEX_DATA.rentals.forEach(p => {
    const status = avail[p.id] || p.status || "rented";
    const available = status === "available";

    const div = document.createElement("div");
    div.className = "tile";
    div.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div>${escapeHtml(p.address || "")}</div>
      <span class="badge ${available ? "ok" : "bad"}">
        ${available ? "Available" : "Rented"}
      </span>
    `;
    host.appendChild(div);
  });
}

/* =======================
   PROPERTIES PAGE (FULL)
======================= */

function renderPropertiesPage(avail) {
  const host = qs("#propertyList");
  if (!host || !window.ADEX_DATA?.rentals) return;

  host.innerHTML = "";

  window.ADEX_DATA.rentals.forEach(p => {
    const status = avail[p.id] || p.status || "rented";
    const available = status === "available";
    const q = p.embedQuery || p.address || p.name;

    const card = document.createElement("div");
    card.className = "propertyCard";
    card.innerHTML = `
      <img src="${mapImage(q)}" alt="${escapeHtml(p.name)}"/>
      <div class="body">
        <h3>${escapeHtml(p.name)}</h3>
        <div class="meta">${escapeHtml(p.type)} • ${escapeHtml(p.state)}</div>
        <div class="addr">${escapeHtml(p.address || "")}</div>
        <span class="badge ${available ? "ok" : "bad"}">
          ${available ? "Available" : "Rented"}
        </span>
        <p>${escapeHtml(p.details || "")}</p>
        <a href="${p.mapsLink}" target="_blank" rel="noopener">
          View on Google Maps
        </a>
      </div>
      <div class="map">
        ${mapEmbed(q)}
      </div>
    `;
    host.appendChild(card);
  });
}

/* =======================
   LANDS PAGE (FULL)
======================= */

function renderLandsPage() {
  const host = qs("#landList");
  if (!host || !window.ADEX_DATA?.lands) return;

  host.innerHTML = "";

  window.ADEX_DATA.lands.forEach(l => {
    const q = l.address || `${l.county} ${l.state}`;

    const card = document.createElement("div");
    card.className = "propertyCard";
    card.innerHTML = `
      <img src="${mapImage(q)}" alt="${escapeHtml(l.name)}"/>
      <div class="body">
        <h3>${escapeHtml(l.name)}</h3>
        <div class="meta">${escapeHtml(l.acres)} acres • ${escapeHtml(
      l.state
    )}</div>

        ${l.address ? `<div class="addr">${escapeHtml(l.address)}</div>` : ""}

        <div class="parcel">
          <strong>County:</strong> ${escapeHtml(l.county || "—")}<br/>
          <strong>Parcel ID:</strong> ${escapeHtml(l.parcelId || "—")}<br/>
          ${
            l.legal
              ? `<strong>Legal:</strong> ${escapeHtml(l.legal)}<br/>`
              : ""
          }
        </div>

        ${
          l.links?.parcelPdf
            ? `<a href="${l.links.parcelPdf}" target="_blank">Parcel Map (PDF)</a><br/>`
            : ""
        }
        ${
          l.links?.maps
            ? `<a href="${l.links.maps}" target="_blank">View on Google Maps</a>`
            : ""
        }
      </div>
      <div class="map">
        ${mapEmbed(q)}
      </div>
    `;
    host.appendChild(card);
  });
}

/* =======================
   ADMIN UI
======================= */

function renderAdmin(avail) {
  const host = qs("#adminList");
  const btn = qs("#saveBtn");
  if (!host || !btn || !window.ADEX_DATA?.rentals) return;

  host.innerHTML = "";

  window.ADEX_DATA.rentals.forEach(p => {
    const sel = document.createElement("select");
    sel.dataset.id = p.id;
    sel.innerHTML = `
      <option value="rented">Rented</option>
      <option value="available">Available</option>
    `;
    sel.value = avail[p.id] || p.status || "rented";

    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `<b>${escapeHtml(p.name)}</b>`;
    row.appendChild(sel);
    host.appendChild(row);
  });

  if (btn.dataset.bound) return;
  btn.dataset.bound = "true";

  btn.addEventListener("click", async () => {
    const updates = {};
    qsa("select[data-id]").forEach(s => (updates[s.dataset.id] = s.value));

    try {
      await saveAvailability(updates);
      notify("Availability saved ✓");
      const fresh = await fetchAvailability();
      renderAdmin(fresh);
      renderRentals(fresh);
      await loadAudit();
    } catch (e) {
      notify(e.message || "Save failed", true);
    }
  });
}

/* =======================
   INIT
======================= */

document.addEventListener("DOMContentLoaded", async () => {
  const availability = await fetchAvailability();

  renderRentals(availability);
  renderAdmin(availability);

  renderPropertiesPage(availability);
  renderLandsPage();

  await loadWhoAmI();
  await loadAudit();
});
