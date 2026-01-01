/* =========================================================
   ADEX HOLDINGS TRUST — app.js
========================================================= */
"use strict";

const CFG = {
  WORKER_BASE: "/api",

  MAPBOX_TOKEN: null,
  GOOGLE_MAPS_KEY: null,
  GOOGLE_PLACES_KEY: null,

  MAPBOX_STYLE_STREETS: "mapbox://styles/mapbox/streets-v12",
  MAPBOX_STYLE_SAT: "mapbox://styles/mapbox/satellite-streets-v12",
  MAPBOX_STYLE_TERRAIN: "mapbox://styles/mapbox/outdoors-v12"
};
const ADMIN_ANALYTICS_CFG = {
  EVENTS_LIMIT: 5000,          // how many events to pull for analytics views
  DWELL_MIN_MS: 3000,          // ignore < 3s dwell (accidental bounces)
  FUNNEL_SESSION_GAP_MS: 30 * 60 * 1000, // 30 min session boundary
  SSE_PATH: "/admin/stream",   // will be accessed as `${CFG.WORKER_BASE}${SSE_PATH}`
  ANOMALY_BUCKET_MIN: 60,      // bucket size for anomaly scan (minutes)
  DEFAULT_Z: 3.0
};
/* ============================================================
   GLOBAL CONFIG LOADER (Cloudflare-backed)
   ============================================================ */

window.ADEX_CONFIG = {
  loaded: false,
  MAPBOX_TOKEN: null,
  GOOGLE_MAPS_KEY: null,
  GOOGLE_PLACES_KEY: null
};

async function loadAdexConfig() {
  // Prevent duplicate loads
  if (window.ADEX_CONFIG.loaded) {
    return window.ADEX_CONFIG;
  }

  try {
    const res = await fetch("/api/config", {
  method: "GET",
  credentials: "omit",
  cache: "no-store",
  headers: {
    "Accept": "application/json"
  }
});

   if (!res.ok) {
  console.error("Config endpoint unavailable:", res.status);
  return window.ADEX_CONFIG;
}

    const cfg = await res.json();

    window.ADEX_CONFIG = {
      loaded: true,
      MAPBOX_TOKEN: cfg.MAPBOX_TOKEN || null,
      GOOGLE_MAPS_KEY: cfg.GOOGLE_MAPS_KEY || null,
      GOOGLE_PLACES_KEY: cfg.GOOGLE_PLACES_KEY || null
    };

// ✅ ADD this instead
if (window.ADEX_CONFIG.MAPBOX_TOKEN && window.mapboxgl) {
  mapboxgl.accessToken = window.ADEX_CONFIG.MAPBOX_TOKEN;
}

    return window.ADEX_CONFIG;
  } catch (err) {
    console.error("ADEX config load failed:", err);
    return window.ADEX_CONFIG;
  }
}

/* =======================
   HELPERS
======================= */

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];

/* =======================
   MOBILE / TOUCH HELPERS
======================= */
const IS_TOUCH =
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0 ||
  navigator.msMaxTouchPoints > 0;

let IS_MOBILE = window.matchMedia("(max-width: 768px)").matches;
window.addEventListener("resize", () => {
  IS_MOBILE = window.matchMedia("(max-width: 768px)").matches;
});

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const escapeHtml = s =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function accessRedirected(res) {
  return (
    res.type === "opaqueredirect" ||
    res.status === 401 ||
    res.status === 403
  );
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

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function currencySymbol(code) {
  return code === "NGN" ? "₦" : "$";
}

function formatMoney(amount, currencyCode) {
  if (amount == null || amount === "") return "—";
  const sym = currencySymbol(currencyCode);
  const num = Number(amount);
  if (!Number.isFinite(num)) return `${sym}${amount}`;
  return `${sym}${num.toLocaleString()}`;
}

function rentLabel(rent) {
  if (!rent) return "";
  const period = rent.period === "year" ? "/yr" : "/mo";
  const amt = rent.amount == null ? "—" : rent.amount;
  return `${amt === "—" ? "Rent: —" : `Rent: ${amt}`}${period}`;
}
const __trackedViews = new Set();

function initPropertyEditor() {
  const sel = qs("#editorPropertySelect");
  if (!sel) return;

  const rentals = window.ADEX_DATA?.rentals || [];
  sel.innerHTML = rentals
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");

  sel.addEventListener("change", () => loadPropertyIntoEditor(sel.value));
  loadPropertyIntoEditor(sel.value);
}

function loadPropertyIntoEditor(id) {
  const p = window.ADEX_DATA.rentals.find(x => x.id === id);
  if (!p) return;

  qs("#editorSummary").value = p.summary || "";
  qs("#editorDetails").value = p.details || "";
  qs("#editorPhotos").value = (p.photos || []).join("\n");
  qs("#editorVideoType").value = p.video?.type || "";
  qs("#editorVideoUrl").value = p.video?.url || "";
}
async function bindPropertyEditorSave() {
  const btn = qs("#savePropertyContent");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const id = qs("#editorPropertySelect").value;

    const payload = {
      id,
      summary: qs("#editorSummary").value.trim(),
      details: qs("#editorDetails").value.trim(),
      photos: qs("#editorPhotos").value
        .split("\n")
        .map(x => x.trim())
        .filter(Boolean),
      video: qs("#editorVideoType").value
        ? {
            type: qs("#editorVideoType").value,
            url: qs("#editorVideoUrl").value.trim()
          }
        : null
    };

    try {
      await accessFetch("/admin/property/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      notify("Property content saved ✓");
    } catch (e) {
      notify("Failed to save property content", true);
    }
  });
}
function makeBtnLink(label, href) {
  if (!href || href === "#") return "";
  return `
    <a class="btn"
       href="${escapeHtml(href)}"
       target="_blank"
       rel="noopener">
       ${escapeHtml(label)}
    </a>
  `;
}
function initLandDetailMap(l) {
  const el = qs("#landMap");
  if (!el || !CFG.MAPBOX_TOKEN || !window.mapboxgl || !l.geo) return;

  mapboxgl.accessToken = CFG.MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: el,
  style: CFG.MAPBOX_STYLE_SAT,
  center: l.center || [-115, 36],
  zoom: 13
});

if (!map.__resizeBound) {
  map.__resizeBound = true;
  window.addEventListener("resize", () => safeMapResize(map));
  window.addEventListener("orientationchange", () => safeMapResize(map));
}

  map.on("load", () => {
     safeMapResize(map);
    map.addSource("parcel", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: l.geo.geometry,
          properties: {}
        }]
      }
    });

    map.addLayer({
      id: "parcel-fill",
      type: "fill",
      source: "parcel",
      paint: { "fill-opacity": 0.25 }
    });

    map.addLayer({
      id: "parcel-outline",
      type: "line",
      source: "parcel",
      paint: { "line-width": 2 }
    });

    // Fit bounds
    const extractCoords = geom => {
  if (geom.type === "Polygon") return geom.coordinates.flat();
  if (geom.type === "MultiPolygon") return geom.coordinates.flat(2);
  return [];
};

const coords = extractCoords(l.geo.geometry);
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(coords[0], coords[0])
    );
    map.fitBounds(bounds, { padding: 40 });
  });
}
/* ================================
   PROPERTY CONTEXT RESOLUTION
   (Single Source of Truth)
================================ */

(function resolvePropertyContext() {
  // Do not overwrite if already set explicitly
  if (window.PROPERTY_ID && window.PROPERTY_NAME) return;

  const params = new URLSearchParams(location.search);
  const idFromUrl = params.get("id");

  // Only property / land detail pages should resolve context
  const isPropertyPage = location.pathname.includes("property.html");
  const isLandPage = location.pathname.includes("land.html");

  if (!idFromUrl || (!isPropertyPage && !isLandPage)) return;
  if (!window.ADEX_DATA) return;

  if (isPropertyPage) {
    const p = window.ADEX_DATA.rentals?.find(x => x.id === idFromUrl);
    if (!p) return;

    window.PROPERTY_ID = p.id;
    window.PROPERTY_NAME = p.name;
    window.PROPERTY_TYPE = "rental";
    return;
  }

  if (isLandPage) {
    const l = window.ADEX_DATA.lands?.find(x => x.id === idFromUrl);
    if (!l) return;

    window.PROPERTY_ID = l.id;
    window.PROPERTY_NAME = l.name;
    window.PROPERTY_TYPE = "land";
  }
})();

/* ================================
   PROPERTY ID RESOLUTION
================================ */

(function resolvePropertyId() {
  // Already set? Respect it.
  if (window.PROPERTY_ID) return;

  const path = location.pathname.toLowerCase();

  // Rental pages
  const rental = window.ADEX_DATA?.rentals?.find(r =>
    path.includes(r.slug || r.id)
  );
  if (rental) {
    window.PROPERTY_ID = rental.id;
    window.PROPERTY_TYPE = "rental";
    return;
  }

  // Land pages
  const land = window.ADEX_DATA?.lands?.find(l =>
    path.includes(l.slug || l.id)
  );
  if (land) {
    window.PROPERTY_ID = land.id;
    window.PROPERTY_TYPE = "land";
    return;
  }
})();
/* ================================
   PROPERTY PAGE ENTER (DWELL START)
================================ */

(function trackPageEnter() {
  if (!window.PROPERTY_ID) return;

  try {
    fetch("/api/track-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventType: "page_enter",
        path: location.pathname,
        id: window.PROPERTY_ID
      })
    });
  } catch {}
})();
/* ================================
   PROPERTY PAGE EXIT (DWELL END)
================================ */

window.addEventListener("pagehide", () => {
  if (!window.PROPERTY_ID) return;

  try {
    navigator.sendBeacon(
      "/api/track-public",
      JSON.stringify({
        eventType: "page_exit",
        path: location.pathname,
        id: window.PROPERTY_ID
      })
    );
  } catch {}
});

/* ================================
   PROPERTY PAGE EXIT (DWELL END)
   ================================ */
window.addEventListener("beforeunload", () => {
  try {
    navigator.sendBeacon(
      "/api/track-public",
      JSON.stringify({
        eventType: "page_exit",
        path: location.pathname,
        id: window.PROPERTY_ID || null
      })
    );
  } catch (e) {}
});

/* =======================
   MAPBOX RESIZE FIX (MOBILE)
======================= */
function safeMapResize(map) {
  if (!map || typeof map.resize !== "function") return;
  setTimeout(() => map.resize(), 250);
}
/* =======================
   LAZY LOADING
======================= */

function setupLazy() {
  const io = new IntersectionObserver(
    entries => {
      entries.forEach(ent => {
        if (!ent.isIntersecting) return;
        const el = ent.target;

        // Lazy images
        if (el.tagName === "IMG" && el.dataset.src) {
          el.src = el.dataset.src;
          el.removeAttribute("data-src");
        }

        // Lazy iframes
        if (el.tagName === "IFRAME" && el.dataset.src) {
          el.src = el.dataset.src;
          el.removeAttribute("data-src");
        }

        io.unobserve(el);
      });
    },
    { rootMargin: "300px" }
  );

  qsa("img[data-src], iframe[data-src]").forEach(el => io.observe(el));
}

/* =======================
   RESPONSIVE EMBEDS & MAPS
======================= */
function resizeEmbeds() {
  qsa("iframe").forEach(f => {
    if (!f.parentElement) return;

    const w = f.parentElement.clientWidth;
    const h = Math.min(420, Math.round(w * 0.6));

    f.style.width = "100%";
    f.style.height = `${h}px`;
  });
}

// Handle orientation change & resize
let __resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(__resizeTimer);
  __resizeTimer = setTimeout(resizeEmbeds, 120);
});

window.addEventListener("orientationchange", () => {
  setTimeout(resizeEmbeds, 250);
});
/* =======================
   MAP HELPERS (PUBLIC)
   - fallback chain: Street View -> satellite -> static map
======================= */

function googleStaticMap(query, maptype = "roadmap") {
  // Works without a key sometimes, but Google may rate-limit.
  // If you provide a key, it becomes reliable.
  const base = "https://maps.googleapis.com/maps/api/staticmap";
  const q = encodeURIComponent(query);
  const keyPart = CFG.GOOGLE_MAPS_KEY ? `&key=${encodeURIComponent(CFG.GOOGLE_MAPS_KEY)}` : "";
  return `${base}?center=${q}&zoom=15&size=900x520&maptype=${maptype}&markers=color:red|${q}${keyPart}`;
}

function osmStaticFallback(query) {
  const q = encodeURIComponent(query || "");
  return `https://www.openstreetmap.org/export/embed.html?bbox=&layer=mapnik&marker=${q}`;
}

function mapEmbedSrc(query) {
  // Keyless embed
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function safeImgWithFallbacks(imgEl, fallbacks) {
  let idx = 0;
  const tryNext = () => {
    idx += 1;
    if (idx >= fallbacks.length) return;
    imgEl.src = fallbacks[idx];
  };
  imgEl.addEventListener("error", tryNext);
  imgEl.src = fallbacks[0];
}
function buildHeatmapQuery(params = {}) {
  const q = new URLSearchParams();

  if (params.days) {
    const since = new Date(Date.now() - params.days * 86400000).toISOString();
    q.set("since", since);
  }

  if (params.minSeverity) {
    q.set("minSeverity", params.minSeverity);
  }

  return q.toString();
}
async function initAdminEventHeatmap() {
  const el = qs("#adminHeatmap");
  if (!el || !CFG.MAPBOX_TOKEN || !window.mapboxgl) return;

  mapboxgl.accessToken = CFG.MAPBOX_TOKEN;

  let currentDays = 7;
  let currentSeverity = 1;
  let map, sourceReady = false;

  const fetchGeo = async () => {
    const qs = buildHeatmapQuery({
      days: currentDays,
      minSeverity: currentSeverity
    });
    const res = await accessFetch(`/admin/heatmap?${qs}`);
   const data = await res.json();
   return data.features ? data : { type: "FeatureCollection", features: [] };

  };

  const controls = document.createElement("div");
  controls.className = "heatmapControls";
  controls.style.cssText =
    "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;";

  controls.innerHTML = `
    <select id="heatDays">
      <option value="7">Last 7 days</option>
      <option value="30">Last 30 days</option>
      <option value="">All time</option>
    </select>

    <select id="heatSeverity">
      <option value="1">All severity</option>
      <option value="3">Severity ≥ 3</option>
      <option value="4">Severity ≥ 4</option>
      <option value="5">Severity ≥ 5</option>
    </select>
  `;

  el.parentElement.insertBefore(controls, el);

  map = new mapboxgl.Map({
    container: el,
    style: CFG.MAPBOX_STYLE_STREETS,
    center: [-98, 38],
    zoom: 3
  });

  map.on("load", async () => {
    const geo = await fetchGeo();
     if (!geo.features.length) {
  el.insertAdjacentHTML(
    "beforebegin",
    `<div class="small muted">No events recorded for this time range.</div>`
  );
}

    map.addSource("events", {
      type: "geojson",
      data: geo
    });

    map.addLayer({
      id: "event-heat",
      type: "heatmap",
      source: "events",
      paint: {
        "heatmap-weight": ["get", "weight"],
        "heatmap-intensity": 1,
        "heatmap-radius": 20,
        "heatmap-opacity": 0.85
      }
    });

    sourceReady = true;
  });

  const reload = async () => {
    if (!sourceReady) return;
    const geo = await fetchGeo();
    map.getSource("events").setData(geo);
  };

  controls.addEventListener("change", e => {
    if (e.target.id === "heatDays") {
      currentDays = e.target.value ? Number(e.target.value) : null;
    }
    if (e.target.id === "heatSeverity") {
      currentSeverity = Number(e.target.value);
    }
    reload();
  });
}

/* =======================
   Add Street View photo fallback for houses (Google Maps images)
======================= */
function googleStreetViewImage(query) {
  const base = "https://maps.googleapis.com/maps/api/streetview";
  const q = encodeURIComponent(query);
  const key = CFG.GOOGLE_MAPS_KEY ? `&key=${encodeURIComponent(CFG.GOOGLE_MAPS_KEY)}` : "";
  return `${base}?size=900x520&location=${q}&fov=80&heading=70&pitch=0${key}`;
}
/* =======================
   SAFE FETCH (ACCESS)
======================= */

async function accessFetch(path, opts = {}) {
  const { silent = false, ...fetchOpts } = opts;

  const res = await fetch(`${CFG.WORKER_BASE}${path}`, {
    credentials: "include",
    redirect: "manual",
    ...fetchOpts
  });

  if (accessRedirected(res)) {
    // Only whoami determines session validity
    if (path === "/whoami") {
      notify("Session expired. Please refresh and sign in again.", true);
      throw new Error("Auth expired");
    }

    // All other admin endpoints fail softly
    return res;
  }

  // ✅ NORMAL SUCCESS PATH (THIS WAS MISSING)
  return res;
}
/* =======================
   EVENT TRACKING (PRIVACY-SAFE)
======================= */
function trackEvent(eventType, data = {}) {
  try {
    const payload = JSON.stringify({
      eventType,
      path: location.pathname,
      property: window.PROPERTY_ID || null,
      propertyName: window.PROPERTY_NAME || null,
      propertyType: window.PROPERTY_TYPE || null,
      referrer: document.referrer || null,
      userAgent: navigator.userAgent,
      language: navigator.language,
      screen: {
        w: window.screen.width,
        h: window.screen.height
      },
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,

      // ALL custom fields must be inside `data`
      data
    });

    const isAdmin = document.body.classList.contains("admin");
    const url = isAdmin
      ? `${CFG.WORKER_BASE}/track`
      : `${CFG.WORKER_BASE}/track-public`;

    // Best for unload/navigation
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        url,
        new Blob([payload], { type: "application/json" })
      );
      return;
    }

    // Fallback
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    }).catch(() => {});
  } catch {
    // fail silently
  }
}
/* ================================
   PROPERTY DWELL / EXIT TRACKING
   ================================ */

window.addEventListener("beforeunload", () => {
  try {
    navigator.sendBeacon(
      "/api/track-public",
      JSON.stringify({
        eventType: "page_exit",
        path: location.pathname,
        id: window.PROPERTY_ID || null
      })
    );
  } catch (e) {
    // fail silently – unload must never block navigation
  }
});

function initPerPropertyDwellTracking() {
  // Only on property/land detail pages
  const isProperty = !!qs("#propertyDetail");
  const isLand = !!qs("#landTitle");

  if (!isProperty && !isLand) return;

  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (!id) return;

  const kind = isProperty ? "rental" : "land";
  const key = `dwell:${kind}:${id}:${Date.now()}`;
  const start = Date.now();

  const flush = (reason) => {
    const ms = Date.now() - start;
    if (ms < ADMIN_ANALYTICS_CFG.DWELL_MIN_MS) return;

    // Send as an event (same pipeline you already have)
    trackEvent("dwell", {
      kind,
      id,
      ms,
      reason: reason || "unknown",
      path: location.pathname
    });
  };

  // Flush on hide/unload
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush("hidden");
  });

  window.addEventListener("pagehide", () => flush("pagehide"));
  window.addEventListener("beforeunload", () => flush("unload"));

  // Optional: heartbeat (helps when tabs stay open)
  setInterval(() => {
    if (document.hidden) return;
    const ms = Date.now() - start;
    // emit heartbeat-style dwell updates every 60s (optional)
    // trackEvent("dwell_ping", { kind, id, ms });
  }, 60000);
}
/* =======================
   AVAILABILITY
======================= */

async function fetchAvailability() {
  try {
    const res = await accessFetch("/availability", { silent: true });
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

async function loadAdminUIHelpers() {
   if (!document.querySelector("#adminControls") &&
    !document.querySelector("#adminKPI") &&
    !document.querySelector("#eventsTable")) {
  return;
}
  try {
    const res = await accessFetch("/admin/ui.js");
    if (!res.ok) return;
    const js = await res.text();
    const s = document.createElement("script");
    s.textContent = js;
    document.body.appendChild(s);
  } catch {
    // fail silently
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
   EVENT REPLAY TIMELINE
======================= */

async function loadEventReplay() {
  const host = qs("#replayTimeline");
  if (!host) return;

  const res = await accessFetch("/admin/events?limit=200");
  const out = await res.json();

  renderEventReplay(out.events || []);
}

function renderEventReplay(events) {
  const host = qs("#replayTimeline");
  if (!host) return;

  host.innerHTML = "";

  if (!events.length) {
    host.innerHTML = `<div class="muted">No events to replay.</div>`;
    return;
  }

  events.forEach(e => {
    const row = document.createElement("div");
    row.className = "replayItem" + (e.severity >= 4 ? " high" : "");

    row.innerHTML = `
      <div class="replayTime">${escapeHtml(e.ts)}</div>
      <div class="replayBody">
        <b>${escapeHtml(e.eventType)}</b><br/>
        ${escapeHtml(e.data?.name || e.data?.parcelId || e.path || "—")}<br/>
        <span style="opacity:.7">
          ${[e.city, e.region, e.country].filter(Boolean).join(", ")}
        </span>
      </div>
    `;

    host.appendChild(row);
  });
}
/* =======================
   ADMIN KPI SUMMARY
   - Last 7 days
   - Last 30 days
======================= */

async function loadAdminKPI(days) {
  const res = await accessFetch(`/admin/kpi?days=${days}`);
  if (!res.ok) throw new Error("KPI fetch failed");
  return res.json();
}

function renderAdminKPICards(data7, data30) {
  const host = qs("#adminKPI");
  if (!host) return;

  host.innerHTML = `
    <div class="kpiGrid">
      <div class="kpiCard">
        <h4>Last 7 Days</h4>
        <div><b>Total Events:</b> ${data7.totalEvents}</div>
        <div><b>Property Views:</b> ${data7.views}</div>
        <div><b>High Severity:</b> ${data7.highSeverity}</div>
        <div><b>Unique Properties:</b> ${data7.uniqueProperties}</div>
      </div>

      <div class="kpiCard">
        <h4>Last 30 Days</h4>
        <div><b>Total Events:</b> ${data30.totalEvents}</div>
        <div><b>Property Views:</b> ${data30.views}</div>
        <div><b>High Severity:</b> ${data30.highSeverity}</div>
        <div><b>Unique Properties:</b> ${data30.uniqueProperties}</div>
      </div>
    </div>
  `;
}

async function initAdminKPI() {
  try {
    const [kpi7, kpi30] = await Promise.all([
      loadAdminKPI(7),
      loadAdminKPI(30)
    ]);

    renderAdminKPICards(kpi7, kpi30);
  } catch (err) {
    console.warn("Admin KPI failed:", err);
  }
}
/* =======================
   ADMIN CSV EXPORT
======================= */

function buildAdminCSVUrl() {
  const params = new URLSearchParams(location.search);
  params.set("format", "csv");
  return `${CFG.WORKER_BASE}/admin/events?${params.toString()}`;
}

function initAdminCSVButton() {
const host = qs("#adminControls") || qs("#adminKPI");

  if (!host) return;

  // Prevent duplicates
  if (qs("#adminCsvBtn")) return;

  const btn = document.createElement("a");
  btn.id = "adminCsvBtn";
  btn.textContent = "Download CSV";
  btn.href = buildAdminCSVUrl();
  btn.target = "_blank";
  btn.rel = "noopener";

  btn.style.cssText = `
    display:inline-block;
    padding:8px 12px;
    border:1px solid #333;
    border-radius:6px;
    font-size:14px;
    font-weight:500;
    text-decoration:none;
    background:#fff;
    cursor:pointer;
  `;

  // Keep URL in sync with filters
  btn.addEventListener("click", () => {
    btn.href = buildAdminCSVUrl();
  });

  // Insert logically near KPIs or admin controls
  host.appendChild(btn);
}
async function fetchAdminEventsForAnalytics(days) {
  const q = new URLSearchParams();
  q.set("limit", String(ADMIN_ANALYTICS_CFG.EVENTS_LIMIT));
  if (days) {
    const since = new Date(Date.now() - Number(days) * 86400000).toISOString();
    q.set("since", since);
  }
  const res = await accessFetch(`/admin/events?${q.toString()}`, { silent: true });
  if (!res.ok) throw new Error("admin events fetch failed");
  const out = await res.json();
  return out.events || [];
}

function msToHuman(ms) {
  if (!Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function median(nums) {
  const a = nums.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

async function renderDwellTable() {
  const tbody = qs("#dwellTable tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" style="opacity:.7;text-align:center">Loading…</td></tr>`;

  try {
    const days = qs("#dwellWindow")?.value || "";
    const events = await fetchAdminEventsForAnalytics(days);

    // dwell events you emitted: eventType === "dwell"
    const dwell = events.filter(e => (e.eventType || e.type) === "dwell");

    const byProp = new Map();
    for (const e of dwell) {
      const d = e.data || {};
      const pid = d.id || e.property || "—";
      if (!byProp.has(pid)) byProp.set(pid, []);
      byProp.get(pid).push({ ms: Number(d.ms), ts: e.ts });
    }

    const rows = [...byProp.entries()].map(([pid, arr]) => {
      const msArr = arr.map(x => x.ms).filter(Number.isFinite);
      const avg = msArr.length ? msArr.reduce((a, b) => a + b, 0) / msArr.length : null;
      const med = median(msArr);
      const last = arr.reduce((m, x) => (x.ts > m ? x.ts : m), arr[0]?.ts || "");
      return { pid, avg, med, n: msArr.length, last };
    }).sort((a, b) => (b.avg || 0) - (a.avg || 0));

    tbody.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${escapeHtml(propertyLabel(r.pid))}</td>
        <td>${escapeHtml(msToHuman(r.avg))}</td>
        <td>${escapeHtml(msToHuman(r.med))}</td>
        <td>${escapeHtml(String(r.n))}</td>
        <td>${escapeHtml(fmtPST(r.last))}</td>
      </tr>
    `).join("") : `<tr><td colspan="5" style="opacity:.7;text-align:center">No dwell data yet</td></tr>`;
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="5" style="color:#ff6b6b;text-align:center">Failed to load dwell data</td></tr>`;
  }
}

function funnelPresets() {
  return {
    rental_interest: [
      { name: "Viewed rental", match: (e) => (e.eventType || e.type) === "view_rental" },
      { name: "Clicked Maps", match: (e) => (e.eventType || e.type) === "click_maps" },
      { name: "Contact intent", match: (e) => (e.eventType || e.type) === "contact_intent" }
    ],
    land_interest: [
      { name: "Viewed land", match: (e) => (e.eventType || e.type) === "view_land" },
      { name: "Clicked Maps", match: (e) => (e.eventType || e.type) === "click_maps" },
      { name: "Assessor click", match: (e) => (e.eventType || e.type) === "click_assessor" }
    ],
    tenant_intent: [
      { name: "Viewed site", match: (e) => (e.eventType || e.type) === "page_view" },
      { name: "Opened tenant portal", match: (e) => (e.eventType || e.type) === "tenant_portal_open" },
      { name: "Submitted request", match: (e) => (e.eventType || e.type) === "tenant_submit" }
    ]
  };
}

function stableUserKey(e) {
  // Best: you should add a pseudonymous visitorId in trackEvent data (recommended).
  // Fallback: IP (admin-only visibility) + UA (still imperfect).
  return (e.ip || "ip?") + "|" + (e.userAgent || e.ua || "ua?");
}

async function renderFunnel() {
  const tbody = qs("#funnelTable tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" style="opacity:.7;text-align:center">Loading…</td></tr>`;

  try {
    const presetKey = qs("#funnelPreset")?.value || "rental_interest";
    const days = qs("#funnelWindow")?.value || "";
    const steps = funnelPresets()[presetKey] || [];

    const events = await fetchAdminEventsForAnalytics(days);

    // Group by user
    const groups = new Map();
    for (const e of events) {
      const k = stableUserKey(e);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }

    // Sort each user timeline by ts
    for (const arr of groups.values()) {
      arr.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    }

    // Count users reaching each step in order
    const reached = new Array(steps.length).fill(0);

    for (const arr of groups.values()) {
      let idx = 0;
      for (const ev of arr) {
        if (idx >= steps.length) break;
        if (steps[idx].match(ev)) {
          reached[idx] += 1;
          idx += 1;
        }
      }
    }

    const top = reached[0] || 0;
    tbody.innerHTML = steps.map((s, i) => {
      const users = reached[i] || 0;
      const prev = i === 0 ? users : (reached[i - 1] || 0);
      const conv = prev ? (users / prev) * 100 : 0;
      const drop = prev ? ((prev - users) / prev) * 100 : 0;
      return `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(String(users))}</td>
          <td>${escapeHtml(i === 0 ? "—" : `${conv.toFixed(1)}%`)}</td>
          <td>${escapeHtml(i === 0 ? "—" : `${drop.toFixed(1)}%`)}</td>
        </tr>
      `;
    }).join("");
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="4" style="color:#ff6b6b;text-align:center">Failed to load funnel</td></tr>`;
  }
}

function bindDwellAndFunnelUI() {
  const dBtn = qs("#dwellRefresh");
  if (dBtn && !dBtn.dataset.bound) {
    dBtn.dataset.bound = "1";
    dBtn.addEventListener("click", renderDwellTable);
  }
  const fBtn = qs("#funnelRefresh");
  if (fBtn && !fBtn.dataset.bound) {
    fBtn.dataset.bound = "1";
    fBtn.addEventListener("click", renderFunnel);
  }

  const dw = qs("#dwellWindow");
  if (dw && !dw.dataset.bound) {
    dw.dataset.bound = "1";
    dw.addEventListener("change", renderDwellTable);
  }

  const fw = qs("#funnelWindow");
  if (fw && !fw.dataset.bound) {
    fw.dataset.bound = "1";
    fw.addEventListener("change", renderFunnel);
  }

  const fp = qs("#funnelPreset");
  if (fp && !fp.dataset.bound) {
    fp.dataset.bound = "1";
    fp.addEventListener("change", renderFunnel);
  }
}
function loadAlertCfg() {
  try {
    return JSON.parse(localStorage.getItem("adexAlertCfgV1") || "{}");
  } catch {
    return {};
  }
}

function saveAlertCfg(cfg) {
  localStorage.setItem("adexAlertCfgV1", JSON.stringify(cfg));
}

function bucketKey(ts, bucketMin) {
  const d = new Date(ts);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(m - (m % bucketMin));
  return d.toISOString();
}

function zScore(x, mean, sd) {
  if (!Number.isFinite(sd) || sd <= 0) return 0;
  return (x - mean) / sd;
}

async function runAnomalyDetection() {
  const tbody = qs("#anomalyTable tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="opacity:.7;text-align:center">Scanning…</td></tr>`;

  try {
    const zT = Number(qs("#zThresh")?.value || ADMIN_ANALYTICS_CFG.DEFAULT_Z);
    const bucketMin = ADMIN_ANALYTICS_CFG.ANOMALY_BUCKET_MIN;

    const events = await fetchAdminEventsForAnalytics(30); // scan last 30d by default

    // Example signal: views per property per hour
    const views = events.filter(e => {
      const t = (e.eventType || e.type);
      return t === "view_rental" || t === "view_land";
    });

    const series = new Map(); // key: property -> map(bucket->count)
    for (const e of views) {
      const prop = e.property || e.data?.id || e.data?.parcelId || "—";
      const bk = bucketKey(e.ts, bucketMin);
      if (!series.has(prop)) series.set(prop, new Map());
      const m = series.get(prop);
      m.set(bk, (m.get(bk) || 0) + 1);
    }

    const anomalies = [];

    for (const [prop, buckets] of series.entries()) {
      const vals = [...buckets.values()];
      if (vals.length < 10) continue;

      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / vals.length);

      for (const [bk, v] of buckets.entries()) {
        const z = zScore(v, mean, sd);
        if (z >= zT) {
          anomalies.push({ ts: bk, prop, v, mean, z });
        }
      }
    }

    anomalies.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));

    tbody.innerHTML = anomalies.length ? anomalies.slice(0, 120).map(a => `
      <tr>
        <td>${escapeHtml(fmtPST(a.ts))}</td>
        <td>Views spike</td>
        <td>${escapeHtml(propertyLabel(a.prop))}</td>
        <td>${escapeHtml(String(a.v))}</td>
        <td>${escapeHtml(a.mean.toFixed(2))}</td>
        <td class="warn">${escapeHtml(a.z.toFixed(2))}</td>
      </tr>
    `).join("") : `<tr><td colspan="6" style="opacity:.7;text-align:center">No anomalies detected</td></tr>`;
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ff6b6b;text-align:center">Anomaly scan failed</td></tr>`;
  }
}

function bindAlertUI() {
  const btnSave = qs("#saveAlertCfg");
  const btnScan = qs("#runAnomalyScan");
  if (!btnSave || !btnScan) return;

  // hydrate
  const cfg = loadAlertCfg();
  if (cfg.zThresh != null) qs("#zThresh").value = cfg.zThresh;
  if (cfg.alertWindowMin != null) qs("#alertWindowMin").value = cfg.alertWindowMin;
  if (cfg.sevCountThresh != null) qs("#sevCountThresh").value = cfg.sevCountThresh;

  if (!btnSave.dataset.bound) {
    btnSave.dataset.bound = "1";
    btnSave.addEventListener("click", () => {
      const next = {
        zThresh: Number(qs("#zThresh")?.value || 3),
        alertWindowMin: Number(qs("#alertWindowMin")?.value || 10),
        sevCountThresh: Number(qs("#sevCountThresh")?.value || 5)
      };
      saveAlertCfg(next);
      notify("Alert thresholds saved ✓");
    });
  }

  if (!btnScan.dataset.bound) {
    btnScan.dataset.bound = "1";
    btnScan.addEventListener("click", runAnomalyDetection);
  }
}

/* =======================
   FILTER UI (PUBLIC)
======================= */

function ensureFilterBar(hostId, items, kind) {
  // kind: "rentals" | "lands"
  const host = qs(hostId);
  if (!host) return null;
   
  // Insert filter bar if not present
  let bar = qs(".filterBar", host.parentElement);
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "filterBar";
    bar.style.display = "flex";
    bar.style.gap = "10px";
    bar.style.flexWrap = "wrap";
    bar.style.margin = "12px 0 18px";
    bar.innerHTML = `
      <select class="countrySel">
        <option value="ALL">All Countries</option>
      </select>
      <select class="countySel" style="display:${kind === "lands" ? "inline-flex" : "none"}">
        <option value="ALL">All Counties</option>
      </select>
      <input class="acreMin" style="display:${kind === "lands" ? "inline-flex" : "none"}" type="number" min="0" step="0.01" placeholder="Min acres" />
      <input class="acreMax" style="display:${kind === "lands" ? "inline-flex" : "none"}" type="number" min="0" step="0.01" placeholder="Max acres" />
    `;
    host.parentElement.insertBefore(bar, host);
  }

  const countrySel = qs(".countrySel", bar);
  const countySel = qs(".countySel", bar);
  const acreMin = qs(".acreMin", bar);
  const acreMax = qs(".acreMax", bar);

  // Populate options
  const countries = uniq(items.map(x => x.country));
  countrySel.innerHTML =
    `<option value="ALL">All Countries</option>` +
    countries.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  if (kind === "lands") {
    const counties = uniq(items.map(x => x.county));
    countySel.innerHTML =
      `<option value="ALL">All Counties</option>` +
      counties.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  return { bar, countrySel, countySel, acreMin, acreMax };
}

/* =======================
   SEO STRUCTURED DATA
======================= */

function injectSchemaJsonLd(items, type) {
  // type: "rentals" or "lands"
  const id = `schema-${type}`;
  const old = qs(`#${id}`);
  if (old) old.remove();

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = id;

  const baseOrg = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: window.ADEX_DATA?.trustName || "Adex Holdings Trust",
    email: window.ADEX_DATA?.contact?.email || undefined,
    telephone: window.ADEX_DATA?.contact?.phone || undefined
  };

  const entries =
    type === "rentals"
      ? items.map(p => ({
          "@type": "Residence",
          name: p.name,
          address: {
            "@type": "PostalAddress",
            streetAddress: p.address || undefined,
            addressLocality: p.city || undefined,
            addressRegion: p.state || undefined,
            addressCountry: p.country || undefined
          }
        }))
      : items.map(l => ({
          "@type": "Landform",
          name: l.name,
          address: {
            "@type": "PostalAddress",
            streetAddress: l.address || undefined,
            addressRegion: l.state || undefined,
            addressCountry: l.country || undefined
          },
          additionalProperty: [
            l.parcelId ? { "@type": "PropertyValue", name: "Parcel ID", value: l.parcelId } : null,
            l.county ? { "@type": "PropertyValue", name: "County", value: l.county } : null,
            l.acres != null ? { "@type": "PropertyValue", name: "Acres", value: String(l.acres) } : null
          ].filter(Boolean)
        }));

  script.textContent = JSON.stringify(
    {
      ...baseOrg,
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: type === "rentals" ? "Rental Properties" : "Land Holdings",
        itemListElement: entries
      }
    },
    null,
    2
  );

  document.head.appendChild(script);
}
/* =======================
   SEO + OPENGRAPH (PROPERTY DETAIL)
======================= */

function setPropertySEO(p) {
  if (!p) return;

  const baseUrl = location.origin;
  const url = `${baseUrl}/property.html?id=${encodeURIComponent(p.id)}`;

  const title = `${p.name} | ${p.city || ""} ${p.state || ""} | Adex Holdings Trust`;
  const description =
    p.summary ||
    p.details ||
    `Rental property located in ${p.city || ""}, ${p.state || ""}.`;

  // Pick best image for previews
  const image =
    (p.photos && p.photos[0]) ||
    googleStreetViewImage(p.embedQuery || p.address || p.name);

  /* ---------- <title> ---------- */
  document.title = title;

  /* ---------- helpers ---------- */
  const upsertMeta = (attr, key, value) => {
    if (!value) return;
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", value);
  };

  /* ---------- BASIC SEO ---------- */
  upsertMeta("name", "description", description);

  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  /* ---------- OPENGRAPH ---------- */
  upsertMeta("property", "og:type", "article");
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:image", image);
  upsertMeta("property", "og:url", url);

  /* ---------- TWITTER ---------- */
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", description);
  upsertMeta("name", "twitter:image", image);

  /* ---------- JSON-LD ---------- */
  const old = document.getElementById("property-schema");
  if (old) old.remove();

  const schema = {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: p.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: p.address,
      addressLocality: p.city,
      addressRegion: p.state,
      addressCountry: p.country
    },
    image: image,
    url: url,
    offers: p.rent
      ? {
          "@type": "Offer",
          price: p.rent.amount,
          priceCurrency: p.currency,
          availability:
            p.status === "available"
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock"
        }
      : undefined
  };

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "property-schema";
  script.textContent = JSON.stringify(schema, null, 2);
  document.head.appendChild(script);
}

function setLandSEO(l) {
  const baseUrl = location.origin;
  const url = `${baseUrl}/land.html?id=${encodeURIComponent(l.id)}`;

  const title = `${l.name} | ${l.county || ""}, ${l.state || ""} | Adex Holdings Trust`;
  const description =
    `${l.acres ?? "—"} acre land parcel located in ${l.county || ""}, ${l.state || ""}.`;

  const image = googleStaticMap(
    l.address || `${l.county} ${l.state}`,
    "satellite"
  );

  document.title = title;

  const upsert = (attr, key, val) => {
    if (!val) return;
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", val);
  };

  upsert("name", "description", description);
  upsert("property", "og:type", "article");
  upsert("property", "og:title", title);
  upsert("property", "og:description", description);
  upsert("property", "og:image", image);
  upsert("property", "og:url", url);

  upsert("name", "twitter:card", "summary_large_image");
  upsert("name", "twitter:title", title);
  upsert("name", "twitter:description", description);
  upsert("name", "twitter:image", image);
}

/* =======================
   PHOTO CAROUSEL (DATA-DRIVEN)
======================= */

function buildCarouselHtml(photos, alt) {
  const list = (photos || []).filter(Boolean);
  if (!list.length) return "";

  const slides = list
    .map(
      (u, i) => `
      <div class="slide" data-i="${i}" style="min-width:100%;max-width:100%;">
        <img loading="lazy" data-src="${escapeHtml(u)}" alt="${escapeHtml(alt)} photo ${i + 1}" />
      </div>`
    )
    .join("");

  return `
    <div class="carousel" style="position:relative;overflow:hidden;border-radius:16px;">
      <div class="track" style="display:flex;transition:transform .25s ease;will-change:transform;">
        ${slides}
      </div>
      <button class="carPrev" type="button" aria-label="Previous photo"
        style="position:absolute;left:10px;top:50%;transform:translateY(-50%);z-index:2;">‹</button>
      <button class="carNext" type="button" aria-label="Next photo"
        style="position:absolute;right:10px;top:50%;transform:translateY(-50%);z-index:2;">›</button>
    </div>
  `;
}

function wireCarousels(scope = document) {
  qsa(".carousel", scope).forEach(car => {
    const track = qs(".track", car);
    const prev = qs(".carPrev", car);
    const next = qs(".carNext", car);
    if (!track || !prev || !next) return;

    let i = 0;
    const slides = qsa(".slide", track);
    const max = Math.max(0, slides.length - 1);

    const go = n => {
      i = Math.max(0, Math.min(max, n));
      track.style.transform = `translateX(${-i * 100}%)`;
    };

    prev.addEventListener("click", () => go(i - 1));
    next.addEventListener("click", () => go(i + 1));
     if (IS_TOUCH) {
  let startX = 0;

  track.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
  });

  track.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 40) return;
    dx < 0 ? go(i + 1) : go(i - 1);
  });
}

  });
}

/* =======================
   RENTALS (ADMIN + SIMPLE PUBLIC)
======================= */

  function renderRentals(avail) {
  const host = qs("#rentalsGrid");

  // Do NOT render simple rentals if full properties page exists
  if (
    !host ||
    qs("#propertyList") ||
    qs("#propertiesList") ||
    qs("#properties")
  ) {
    return;
  }

  if (!window.ADEX_DATA?.rentals) return;


  host.innerHTML = "";

  window.ADEX_DATA.rentals.forEach(p => {
    const status = avail[p.id] || p.status || "rented";
    const available = status === "available";

    const div = document.createElement("div");
    div.className = "tile";
    div.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div>${escapeHtml(p.address || "")}</div>
      <div style="opacity:.8;margin-top:4px;">
        ${escapeHtml(p.country || "")}${p.country ? " • " : ""}${escapeHtml(p.state || "")}
      </div>
      ${
        p.rent
          ? `<div style="opacity:.85;margin-top:6px;">
              ${escapeHtml(formatMoney(p.rent.amount, p.currency))}${p.rent.period === "year" ? "/yr" : "/mo"}
            </div>`
          : ""
      }
      <span class="badge ${available ? "ok" : "bad"}" style="margin-top:8px;display:inline-block;">
        ${available ? "Available" : "Rented"}
      </span>
    `;
    host.appendChild(div);
  });
}
async function loadEngagementRanking() {
  const host = qs("#engagementRanking");
  if (!host) return;

  const res = await accessFetch("/admin/engagement");
  const out = await res.json();

  host.innerHTML = out.ranking
    .map(
      r => `
      <div class="card">
        <b>${escapeHtml(r.name)}</b><br/>
        Views: ${r.views}<br/>
        Score: ${r.score}
      </div>
    `
    )
    .join("");
}
/* =======================
   TENANT PORTAL (PROPERTY DROPDOWN)
======================= */

function initTenantPortalPropertyDropdown() {
  const sel = qs("#propertySelect");
  if (!sel) return; // Not on tenant portal page

  const rentals = window.ADEX_DATA?.rentals || [];
  if (!rentals.length) return;

  const placeholder =
    sel.querySelector("option[value='']")?.outerHTML ||
    `<option value="" disabled selected>Select a property</option>`;

  const sorted = [...rentals].sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );

  sel.innerHTML =
    placeholder +
    sorted
      .map(p => {
        const label = [
          p.name,
          p.address,
          p.city,
          p.state
        ].filter(Boolean).join(" • ");

        return `<option value="${escapeHtml(p.id)}">${escapeHtml(label)}</option>`;
      })
      .join("");
}

/* =======================
   PROPERTIES PAGE (FULL)
======================= */

function renderPropertiesPage(avail) {
  const host = qs("#propertyList") || qs("#propertiesList") || qs("#properties");
  if (!host || !window.ADEX_DATA?.rentals) return;
  host.innerHTML = "";

  const controls = ensureFilterBar(host.id ? `#${host.id}` : "#propertyList", window.ADEX_DATA.rentals, "rentals");
  const applyFilter = () => {
  const country = controls?.countrySel?.value || "ALL";

  /* 🔔 ADD THIS */
  trackEvent("properties_filter", {
    country: country === "ALL" ? null : country
  });
  /* 🔔 END ADD */

  const items = window.ADEX_DATA.rentals.filter(p =>
    (country === "ALL" ? true : p.country === country)
  );

  draw(items);
  setupLazy();
  wireCarousels(host);
};

  const draw = items => {
    host.innerHTML = "";

    items.forEach(p => {
      const status = avail[p.id] || p.status || "rented";
      const available = status === "available";

      const detailUrl = `/property.html?id=${encodeURIComponent(p.id)}`;


      const q = p.embedQuery || p.address || p.name;

      const heroImg = document.createElement("img");
      heroImg.alt = p.name;
      heroImg.loading = "lazy";

      // Fallback chain (no key required):
      // 1) satellite static map  2) roadmap static  3) osm
      const fallbacks = [
        googleStreetViewImage(q),
        googleStaticMap(q, "satellite"),
        googleStaticMap(q, "roadmap"),
        osmStaticFallback(q)
      ];
      safeImgWithFallbacks(heroImg, fallbacks);

      const streetView = p.streetViewEmbed
        ? `
          <div class="map" style="margin-top:12px;">
            <iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade"
              data-src="${escapeHtml(p.streetViewEmbed)}"></iframe>
            <div style="opacity:.75;font-size:12px;margin-top:6px;">Street View (when available)</div>
          </div>
        `
        : "";

      const carousel = buildCarouselHtml(p.photos, p.name);

      const rentText =
        p.rent
          ? `${formatMoney(p.rent.amount, p.currency)}${p.rent.period === "year" ? "/yr" : "/mo"}`
          : "";
      const card = document.createElement("div");
     
      card.className = "propertyCard";
      card.innerHTML = `
        <!-- CLICKABLE OVERLAY -->
     <a class="propertyOverlayLink"
     href="${detailUrl}"
     aria-label="View ${escapeHtml(p.name)}"></a>

     <div class="media"></div>
     <div class="body">
       <h3>${escapeHtml(p.name)}</h3>
          <div class="meta">${escapeHtml(p.type)} • ${escapeHtml(p.state || "—")} • ${escapeHtml(p.country || "—")}</div>
          <div class="addr">${escapeHtml(p.address || "")}</div>

          ${rentText ? `<div class="meta" style="margin-top:6px;">Rent: ${escapeHtml(rentText)}</div>` : ""}

          <span class="badge ${available ? "ok" : "bad"}" style="margin-top:10px;display:inline-block;">
            ${available ? "Available" : "Rented"}
          </span>

         ${available && p.summary
              ? `<p style="margin-top:10px;">${escapeHtml(p.summary)}</p>`
              : ""}

          <a href="${escapeHtml(p.mapsLink || "#")}" target="_blank" rel="noopener">
            View on Google Maps
          </a>
        </div>

        ${streetView}

        <div class="map" style="margin-top:12px;">
          <iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade"
            data-src="${escapeHtml(mapEmbedSrc(q))}"></iframe>
          <div style="opacity:.75;font-size:12px;margin-top:6px;">Map</div>
        </div>
      `;
     const overlay = card.querySelector(".propertyOverlayLink");
if (overlay) {
  overlay.addEventListener("click", () => {
    trackEvent("view_rental", {
      id: p.id,
      name: p.name,
      state: p.state,
      county: p.county,
      country: p.country,
      status: available ? "available" : "rented"
    });
  });
}
      // media area
      const media = qs(".media", card);
      if (carousel) {
        media.innerHTML = carousel;
      } else {
        // Use fallback images
        heroImg.setAttribute("data-src", heroImg.src);
        heroImg.removeAttribute("src");
        media.appendChild(heroImg);
      }

      host.appendChild(card);
    });
  };

  if (controls?.countrySel) {
    controls.countrySel.addEventListener("change", applyFilter);
  }
// Inject schema ONCE for SEO (initial render only)
injectSchemaJsonLd(window.ADEX_DATA.rentals, "rentals");

  applyFilter();
}
/* =======================
   PROPERTY DETAIL PAGE
======================= */

function renderPropertyDetailPage(avail) {
  const host = qs("#propertyDetail");
  if (!host || !window.ADEX_DATA?.rentals) return;

  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    host.innerHTML = "<p>Property not found.</p>";
    return;
  }

  const p = window.ADEX_DATA.rentals.find(x => x.id === id);
  if (!p) {
    host.innerHTML = "<p>Property not found.</p>";
    return;
  }
  setPropertySEO(p);
  const status = avail[p.id] || p.status || "rented";
  const available = status === "available";

  const carousel = buildCarouselHtml(p.photos, p.name);
  const q = p.embedQuery || p.address || p.name;

  host.innerHTML = `
    <h1>${escapeHtml(p.name)}</h1>

    ${carousel ? `<div class="propertyGallery">${carousel}</div>` : ""}
    ${renderPropertyVideo(p)}
    <div class="meta">
      ${escapeHtml(p.type)} • ${escapeHtml(p.city || "")}, ${escapeHtml(p.state || "")}
    </div>

    <p>${escapeHtml(p.details || p.summary || "")}</p>

    ${
      p.rent
        ? `<div class="rent">
            Rent: ${escapeHtml(formatMoney(p.rent.amount, p.currency))}
            ${p.rent.period === "year" ? "/yr" : "/mo"}
          </div>`
        : ""
    }

    <span class="badge ${available ? "ok" : "bad"}">
      ${available ? "Available" : "Rented"}
    </span>

    <div class="map" style="margin-top:16px;">
      <iframe loading="lazy"
        data-src="${escapeHtml(mapEmbedSrc(q))}">
      </iframe>
    </div>
  `;

  setupLazy();
  wireCarousels(host);
const viewKey = `property_view:${p.id}`;
if (!sessionStorage.getItem(viewKey)) {
  sessionStorage.setItem(viewKey, "1");
  trackEvent("view_rental", {
  id: p.id,
  name: p.name,
  state: p.state,
  county: p.county,
  country: p.country
});
}
}
/* =======================
   LAND DETAIL PAGE
======================= */
   function renderLandDetailPage() {
  // Only run on land detail page
  if (!qs("#landTitle")) return;
  if (!window.ADEX_DATA?.lands) return;

  const id = new URLSearchParams(location.search).get("id");
  if (!id) return;

  const l = window.ADEX_DATA.lands.find(x => x.id === id);
  if (!l) return;

   /* ---------- SUBTITLE ---------- */
const subtitleEl = qs("#landSubtitle");
if (subtitleEl) {
  subtitleEl.textContent = [
    l.county,
    l.state,
    l.country
  ].filter(Boolean).join(", ");
}


  /* ---------- SEO ---------- */
  setLandSEO(l);

  /* ---------- TITLE ---------- */
  const titleEl = qs("#landTitle");
  if (titleEl) titleEl.textContent = l.name || "Land Parcel";
/* ---------- MEDIA (GALLERY → MAPBOX → EMBED FALLBACK) ---------- */
const mapEl = qs("#landMap");
if (mapEl) {
  mapEl.innerHTML = ""; // reset once

  // 1) Photo gallery (highest priority)
  if (Array.isArray(l.photos) && l.photos.length) {
    mapEl.innerHTML = buildCarouselHtml(l.photos, l.name);
    wireCarousels(mapEl);
    setupLazy();
  }

  // 2) Mapbox parcel overlay (only if no photos)
  else if (l.geo && CFG.MAPBOX_TOKEN && window.mapboxgl) {
    initLandDetailMap(l);
  }

  // 3) Google Maps iframe fallback
  else {
    const q = l.address || `${l.county} ${l.state}`.trim();
    mapEl.innerHTML = `
      <iframe
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        src="${mapEmbedSrc(q)}"
        style="width:100%;height:100%;border:0;border-radius:16px;"
        aria-label="Parcel map"
      ></iframe>
    `;
  }
}

  /* ---------- FACTS ---------- */
const factsEl = qs("#landFacts");
if (factsEl) {
const zoningArr = l.assessor?.zoning
  ? Array.isArray(l.assessor.zoning)
    ? l.assessor.zoning
    : [l.assessor.zoning]
  : [];

const zoning = zoningArr
  .map(z =>
    `<span class="badge ok" style="margin-right:6px">${escapeHtml(z)}</span>`
  )
  .join("");
   
const landUseArr = l.assessor?.landUse
  ? Array.isArray(l.assessor.landUse)
    ? l.assessor.landUse
    : [l.assessor.landUse]
  : [];

const landUse = landUseArr
  .map(u =>
    `<span class="badge" style="margin-right:6px">${escapeHtml(u)}</span>`
  )
  .join("");

  factsEl.innerHTML = `
    <div><b>Acreage:</b> ${escapeHtml(String(l.acres ?? "—"))}</div>
    <div><b>Parcel ID:</b> ${escapeHtml(l.parcelId || "—")}</div>
    <div><b>County:</b> ${escapeHtml(l.county || "—")}</div>
    <div><b>State:</b> ${escapeHtml(l.state || "—")}</div>
    <div><b>Country:</b> ${escapeHtml(l.country || "—")}</div>

    ${zoning ? `<div><b>Zoning:</b><br/>${zoning}</div>` : ""}
    ${landUse ? `<div><b>Land Use:</b><br/>${landUse}</div>` : ""}
  `;
}
/* ---------- DESCRIPTION ---------- */
const descEl = qs("#landDescription");
if (descEl) {
  descEl.textContent =
    l.description ||
    `Approximately ${l.acres ?? "—"} acres located in ${l.county || ""}, ${l.state || ""}.`;
}
  /* ---------- LINKS ---------- */
  const linksEl = qs("#landLinks");
  if (linksEl) {
    const assessor = assessorLinkFor(l);
    const maps =
      l.links?.maps ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        l.address || `${l.county} ${l.state}`
      )}`;

    linksEl.innerHTML = `
      ${makeBtnLink("View on Google Maps", maps)}
      ${makeBtnLink("County Assessor", assessor)}
    `;
  }

  /* ---------- TRACK ---------- */
  const viewKey = `land_view:${l.id}`;
  if (!sessionStorage.getItem(viewKey)) {
    sessionStorage.setItem(viewKey, "1");
    trackEvent("view_land", {
  id: l.id,
  name: l.name,
  county: l.county,
  state: l.state,
  acres: l.acres,
  parcelId: l.parcelId
});
  }
}
/* =======================
   END LAND DETAIL PAGE
======================= */
/* =======================
   Video Rendering
======================= */
function renderPropertyVideo(p) {
  if (!p.video || !p.video.url) return "";

  if (p.video.type === "youtube") {
    const id = p.video.url.split("v=")[1]?.split("&")[0];
    if (!id) return "";
    return `
      <div class="map" style="margin-top:16px;">
        <iframe
          loading="lazy"
          data-src="https://www.youtube.com/embed/${id}"
          allowfullscreen
        ></iframe>
        <div class="small">Property video</div>
      </div>
    `;
  }

  if (p.video.type === "vimeo") {
    const id = p.video.url.split("/").pop();
    return `
      <div class="map" style="margin-top:16px;">
        <iframe
          loading="lazy"
          data-src="https://player.vimeo.com/video/${id}"
          allowfullscreen
        ></iframe>
        <div class="small">Property video</div>
      </div>
    `;
  }

  if (p.video.type === "mp4") {
    return `
      <div style="margin-top:16px;">
        <video controls style="width:100%;border-radius:12px;">
          <source src="${escapeHtml(p.video.url)}" type="video/mp4">
        </video>
        <div class="small">Property video</div>
      </div>
    `;
  }

  return "";
}
/* =======================
   LANDS PAGE (FULL)
   - Restores land cards
   - Adds county + acreage filters
   - Assessor deep links
======================= */

function assessorLinkFor(land) {
  // Use per-parcel override if present
  if (land.assessor?.deepLink) return land.assessor.deepLink;

  // County-based best-effort templates (you can refine these)
  const county = (land.county || "").toLowerCase();
  const state = (land.state || "").toUpperCase();
  const pid = land.parcelId ? encodeURIComponent(land.parcelId) : "";

  // Examples (replace with your verified endpoints):
  if (state === "CA" && county.includes("los angeles") && pid) {
    return `https://portal.assessor.lacounty.gov/parceldetail/${pid}`;
  }
  if (state === "NV" && county.includes("nye") && pid) {
    return `https://nyecounty.net/?s=${pid}`;
  }
  // Fallback: Google search
  if (land.parcelId) {
    return `https://www.google.com/search?q=${encodeURIComponent(`${land.county} ${land.state} assessor parcel ${land.parcelId}`)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`${land.county} ${land.state} assessor`)}`;
}

function renderLandsPage() {
  const host =
    qs("#landList") ||
    qs("#landsList") ||
    qs("#landsGrid") ||
    qs("#lands");

  if (!host || !window.ADEX_DATA?.lands) return;

  const controls = ensureFilterBar(host.id ? `#${host.id}` : "#landList", window.ADEX_DATA.lands, "lands");

   // Add acreage hint ONCE (outside applyFilter)
if (controls && !controls.bar.querySelector(".acreHint")) {
  const hint = document.createElement("div");
  hint.className = "small acreHint";
  hint.style.opacity = ".75";
  hint.textContent =
    "Acreage filters are optional. Leave blank to view all parcels.";
  controls.bar.appendChild(hint);
}

  const applyFilter = () => {
  const country = controls?.countrySel?.value || "ALL";
  const county = controls?.countySel?.value || "ALL";

  const minA =
    controls?.acreMin?.value !== "" && controls?.acreMin?.value != null
      ? Number(controls.acreMin.value)
      : null;

  const maxA =
    controls?.acreMax?.value !== "" && controls?.acreMax?.value != null
      ? Number(controls.acreMax.value)
      : null;

  /* 🔔 ADD THIS */
  trackEvent("lands_filter", {
    country: country === "ALL" ? null : country,
    county: county === "ALL" ? null : county,
    minA,
    maxA
  });
  /* 🔔 END ADD */

  const items = window.ADEX_DATA.lands.filter(l => {
    if (country !== "ALL" && l.country !== country) return false;
    if (county !== "ALL" && l.county !== county) return false;
    if (minA !== null && Number.isFinite(l.acres) && l.acres < minA) return false;
    if (maxA !== null && Number.isFinite(l.acres) && l.acres > maxA) return false;
    return true;
  });

  draw(items);
  setupLazy();
};
  const draw = items => {
    host.innerHTML = "";

    items.forEach(l => {
      const q = l.address || `${l.county || ""} ${l.state || ""}`.trim() || l.name;

      const img = document.createElement("img");
      img.alt = l.name;
      img.loading = "lazy";
      const fallbacks = [
        googleStaticMap(q, "satellite"),
        googleStaticMap(q, "terrain"),
        googleStaticMap(q, "roadmap"),
        osmStaticFallback(q)
      ];
      safeImgWithFallbacks(img, fallbacks);
      // keep src intact – browser handles lazy loading


      const assessor = assessorLinkFor(l);
      const maps = l.links?.maps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

const detailUrl = `/land.html?id=${encodeURIComponent(l.id)}`;

const card = document.createElement("div");
card.className = "propertyCard";

card.innerHTML = `
  <a class="propertyOverlayLink"
     href="${detailUrl}"
     aria-label="View ${escapeHtml(l.name)}"></a>

  <div class="media"></div>
  <div class="body">
    <h3>${escapeHtml(l.name)}</h3>
    <div class="meta">
      ${escapeHtml(String(l.acres ?? "—"))} acres •
      ${escapeHtml(l.state || "—")} •
      ${escapeHtml(l.county || "—")} •
      ${escapeHtml(l.country || "—")}
    </div>

    ${l.address ? `<div class="addr">${escapeHtml(l.address)}</div>` : ""}

    <div class="parcel" style="margin-top:10px;">
      <strong>Parcel ID:</strong> ${escapeHtml(l.parcelId || "—")}<br/>
      <strong>County:</strong> ${escapeHtml(l.county || "—")}
    </div>
  </div>
`;
const overlay = card.querySelector(".propertyOverlayLink");
if (overlay) {
  overlay.addEventListener("click", () => {
    trackEvent("view_land", {
  id: l.id,
  name: l.name,
  county: l.county,
  state: l.state,
  acres: l.acres,
  parcelId: l.parcelId
   });
  });
}
      const media = qs(".media", card);
      media.appendChild(img);

      host.appendChild(card);
    });
  };

  if (controls?.countrySel) controls.countrySel.addEventListener("change", applyFilter);
  if (controls?.countySel) controls.countySel.addEventListener("change", applyFilter);
  if (controls?.acreMin) controls.acreMin.addEventListener("input", applyFilter);
  if (controls?.acreMax) controls.acreMax.addEventListener("input", applyFilter);
  // Inject schema ONCE for SEO (initial render only)
   injectSchemaJsonLd(window.ADEX_DATA.lands, "lands");
  applyFilter();
}


/* =======================
   INTERACTIVE LANDS MAP (MAPBOX + GEOJSON)
   - clusters pins (requires land.center or geo centroid)
   - parcel overlay polygons (requires land.geo)
   - satellite/terrain toggle
======================= */

function buildLandGeoJSON(lands) {
  const feats = [];

  lands.forEach(l => {
    // 1) Polygon overlay
    if (l.geo && l.geo.geometry) {
      feats.push({
        type: "Feature",
        properties: {
          id: l.id,
          name: l.name,
          county: l.county || "",
          state: l.state || "",
          acres: l.acres ?? null,
          parcelId: l.parcelId || ""
        },
        geometry: l.geo.geometry
      });
      return;
    }

    // 2) Explicit center point
    if (Array.isArray(l.center) && l.center.length === 2) {
      feats.push({
        type: "Feature",
        properties: {
          id: l.id,
          name: l.name,
          county: l.county || "",
          state: l.state || "",
          acres: l.acres ?? null,
          parcelId: l.parcelId || ""
        },
        geometry: {
          type: "Point",
          coordinates: l.center
        }
      });
      return;
    }

// 3) No usable geo — skip this land
return; // exits this iteration only (forEach)

  });

  return { type: "FeatureCollection", features: feats };
}

async function initLandsInteractiveMap() {
  const el = qs("#landsMap");
  if (!el) return;

  if (!CFG.MAPBOX_TOKEN) {
    el.innerHTML =
      `<div style="opacity:.75;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:14px;">
        Mapbox token not set. Add <code>CFG.MAPBOX_TOKEN</code> in <code>assets/app.js</code> to enable interactive parcel overlays.
      </div>`;
    return;
  }

  // Expect mapbox-gl loaded by lands.html (recommended):
  // <script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
  // <link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet" />
  if (!window.mapboxgl) {
    el.innerHTML =
      `<div style="opacity:.75;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:14px;">
        Mapbox GL not loaded. Add Mapbox script+css to <code>lands.html</code>.
      </div>`;
    return;
  }

  window.mapboxgl.accessToken = CFG.MAPBOX_TOKEN;

  const lands = window.ADEX_DATA?.lands || [];
  const fc = buildLandGeoJSON(lands);

  const map = new mapboxgl.Map({
    container: el,
    style: CFG.MAPBOX_STYLE_STREETS,
    center: [-115.2, 36.2], // default (you can adjust)
    zoom: 4
  });

   window.addEventListener("orientationchange", () => safeMapResize(map));
   window.addEventListener("resize", () => safeMapResize(map));

  // Toggle UI
  const toggle = document.createElement("div");
  toggle.style.position = "absolute";
  toggle.style.top = "12px";
  toggle.style.right = "12px";
  toggle.style.zIndex = "5";
  toggle.style.display = "flex";
  toggle.style.gap = "8px";
  toggle.innerHTML = `
    <button type="button" class="btnMap" data-style="streets">Streets</button>
    <button type="button" class="btnMap" data-style="sat">Satellite</button>
    <button type="button" class="btnMap" data-style="terrain">Terrain</button>
  `;
  el.style.position = "relative";
  el.appendChild(toggle);

  toggle.addEventListener("click", e => {
    const b = e.target.closest(".btnMap");
    if (!b) return;
    const s = b.dataset.style;
    map.setStyle(
      s === "sat" ? CFG.MAPBOX_STYLE_SAT : s === "terrain" ? CFG.MAPBOX_STYLE_TERRAIN : CFG.MAPBOX_STYLE_STREETS
    );
  });

  map.on("load", () => {
     safeMapResize(map);
    map.addSource("lands", {
      type: "geojson",
      data: fc,
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: 12
    });

    // Cluster circles
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "lands",
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
        "circle-opacity": 0.85
      }
    });

    // Cluster count
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "lands",
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 12
      }
    });

    // Unclustered points
    map.addLayer({
      id: "unclustered",
      type: "circle",
      source: "lands",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 7,
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.9
      }
    });

    // Parcel polygon fill (if provided)
    map.addLayer({
      id: "parcel-fill",
      type: "fill",
      source: "lands",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-opacity": 0.18
      }
    });

    // Parcel outline
    map.addLayer({
      id: "parcel-outline",
      type: "line",
      source: "lands",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-width": 2,
        "line-opacity": 0.85
      }
    });

    // Click cluster to zoom
    map.on("click", "clusters", e => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
      const clusterId = features[0].properties.cluster_id;
      map.getSource("lands").getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({ center: features[0].geometry.coordinates, zoom });
      });
    });

    // Click point/polygon to popup
    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true });

    const showPopup = (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties || {};
      const id = props.id;
      const land = (window.ADEX_DATA?.lands || []).find(x => x.id === id);
      const assessor = land ? assessorLinkFor(land) : "#";
      const maps = land?.links?.maps || "#";

      popup
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="min-width:220px;">
            <b>${escapeHtml(props.name || "")}</b><br/>
            <span style="opacity:.8">${escapeHtml(props.county || "")}, ${escapeHtml(props.state || "")}</span><br/>
            <span style="opacity:.85">Acres: ${escapeHtml(String(props.acres ?? "—"))}</span><br/>
            <span style="opacity:.85">Parcel: ${escapeHtml(props.parcelId || "—")}</span><br/>
            <div style="margin-top:8px;">
              <a href="${escapeHtml(maps)}" target="_blank" rel="noopener">Maps</a> •
              <a href="${escapeHtml(assessor)}" target="_blank" rel="noopener">Assessor</a>
            </div>
          </div>
        `)
        .addTo(map);
    };

    map.on("click", "unclustered", showPopup);
    map.on("click", "parcel-fill", showPopup);

    map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
    map.on("mouseenter", "unclustered", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "unclustered", () => (map.getCanvas().style.cursor = ""));
    map.on("mouseenter", "parcel-fill", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "parcel-fill", () => (map.getCanvas().style.cursor = ""));
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

const wrap = document.createElement("div");
wrap.className = "availabilityItem";

const toggle = document.createElement("div");
toggle.className = "toggleWrap";
toggle.dataset.state = sel.value;

const track = document.createElement("div");
track.className = "toggleTrack";

sel.addEventListener("change", () => {
  toggle.dataset.state = sel.value;
});
     toggle.addEventListener("click", () => {
  sel.value = sel.value === "available" ? "rented" : "available";
  toggle.dataset.state = sel.value;
});


toggle.appendChild(track);
toggle.appendChild(sel);

wrap.innerHTML = `<div class="name">${escapeHtml(p.name)}</div>`;
wrap.appendChild(toggle);

host.appendChild(wrap);
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
      if (!document.body.classList.contains("admin")) {
      renderRentals(fresh);
         }

      await loadAudit();
    } catch (e) {
      notify(e.message || "Save failed", true);
    }
  });
}
let __sse = null;

function setSseStatus(text, ok) {
  const el = qs("#sseStatus");
  if (!el) return;
  el.textContent = text;
  el.style.borderColor = ok ? "#3ddc97" : "#ff6b6b";
}

function logSse(line) {
  const box = qs("#sseLog");
  if (!box) return;
  const div = document.createElement("div");
  div.textContent = line;
  box.appendChild(div);

  if (qs("#sseAutoScroll")?.checked) {
    box.scrollTop = box.scrollHeight;
  }

  // Keep last ~300 lines
  while (box.childNodes.length > 300) box.removeChild(box.firstChild);
}

function initAdminSSE() {
  const btnOn = qs("#sseConnect");
  const btnOff = qs("#sseDisconnect");

  if (!btnOn || !btnOff) return;

  const connect = () => {
    if (__sse) return;

    const url = `${CFG.WORKER_BASE}${ADMIN_ANALYTICS_CFG.SSE_PATH}`;

    // EventSource sends cookies for same-origin; with Access this should be OK
    __sse = new EventSource(url);

    setSseStatus("Connecting…", true);

    __sse.onopen = () => {
      setSseStatus("Connected", true);
      logSse(`[open] ${new Date().toISOString()}`);
    };

    __sse.onmessage = (evt) => {
      // Expect JSON per line: { ts, eventType, severity, property, ip, asn, ... }
      logSse(evt.data);

      // Optional: update tables in place without waiting for refresh
      // You can parse and append to events table:
      try {
        const e = JSON.parse(evt.data);
        appendEventRowIfVisible(e);
      } catch {}
    };

    __sse.onerror = () => {
      setSseStatus("Disconnected (error)", false);
      logSse(`[error] ${new Date().toISOString()}`);
      // Let browser auto-retry; keep object
    };
  };

  const disconnect = () => {
    if (!__sse) return;
    __sse.close();
    __sse = null;
    setSseStatus("Disconnected", false);
    logSse(`[close] ${new Date().toISOString()}`);
  };

  if (!btnOn.dataset.bound) {
    btnOn.dataset.bound = "1";
    btnOn.addEventListener("click", connect);
  }
  if (!btnOff.dataset.bound) {
    btnOff.dataset.bound = "1";
    btnOff.addEventListener("click", disconnect);
  }

  setSseStatus("Disconnected", false);
}

function appendEventRowIfVisible(e) {
  const tbody = qs("#eventsTable tbody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${escapeHtml(fmtPST(e.ts || new Date().toISOString()))}</td>
    <td>${escapeHtml(e.eventType || e.type || "—")}</td>
    <td>${escapeHtml(propertyLabel(e.property || e.data?.id || "—"))}</td>
    <td>${escapeHtml(e.location || e.data?.location || "—")}</td>
    <td class="${Number(e.severity) >= 4 ? "warn" : ""}">
      ${escapeHtml(String(e.severity ?? "—"))}
    </td>
    <td>${escapeHtml(e.ip || "—")} ${e.asn ? `(${escapeHtml(String(e.asn))})` : ""}</td>
  `;

  tbody.insertBefore(tr, tbody.firstChild);

  // Keep last 250 rows
  while (tbody.children.length > 250) tbody.removeChild(tbody.lastChild);
}
if (
  (location.pathname.includes("property.html") ||
   location.pathname.includes("land.html")) &&
  !window.PROPERTY_ID
) {
  console.warn(
    "[ADEX] Property detail page loaded without resolved PROPERTY_ID",
    location.href
  );
}

/* ================================
   PROPERTY ID SAFETY CHECK
================================ */

if (
  location.pathname.includes("/property") &&
  !window.PROPERTY_ID
) {
  console.warn(
    "[ADEX] Property page loaded without PROPERTY_ID:",
    location.pathname
  );
}
/* =======================
   ADMIN SIDEBAR
======================= */

function initAdminSidebar() {
  if (!document.body.classList.contains("admin")) return;
  if (document.querySelector(".adminSidebar")) return;

  const sidebar = document.createElement("nav");
  sidebar.className = "adminSidebar";
  sidebar.innerHTML = `
    <div class="adminBrand">Adex Admin</div>
    <a href="/admin.html">Dashboard</a>
    <a href="/admin.html#events">Events</a>
    <a href="/admin.html#heatmap">Heatmap</a>
    <a href="/admin.html#audit">Audit Log</a>
    <a href="/admin.html#availability">Availability</a>
  `;

  document.body.prepend(sidebar);
}
/* =======================
   INIT
======================= */
document.addEventListener("DOMContentLoaded", async () => {
  const secrets = await loadAdexConfig();

  CFG.MAPBOX_TOKEN = secrets.MAPBOX_TOKEN;
  CFG.GOOGLE_MAPS_KEY = secrets.GOOGLE_MAPS_KEY;
  CFG.GOOGLE_PLACES_KEY = secrets.GOOGLE_PLACES_KEY;

  if (CFG.MAPBOX_TOKEN && window.mapboxgl) {
    mapboxgl.accessToken = CFG.MAPBOX_TOKEN;
  }

  const who = await loadWhoAmI();
  const availability = await fetchAvailability();

  const onAdminPage =
    location.pathname === "/admin.html" ||
    !!document.querySelector("#eventsTable") ||
    !!document.querySelector("#adminKPI") ||
    !!document.querySelector("#adminHeatmap");

  if (who?.isAdmin === true && onAdminPage) {
    document.body.classList.add("admin");
    initAdminSidebar();
    loadAdminUIHelpers();

    if (qs("#adminKPI")) initAdminKPI();
    initAdminCSVButton();
    if (qs("#adminHeatmap")) initAdminEventHeatmap();
    if (qs("#engagementRanking")) loadEngagementRanking();
    if (qs("#auditTable")) await loadAudit();
    if (document.getElementById("replayTimeline")) await loadEventReplay();

    initPropertyEditor();
    bindPropertyEditorSave();
  }

  if (!sessionStorage.getItem("pv:" + location.pathname)) {
    sessionStorage.setItem("pv:" + location.pathname, "1");
    trackEvent("page_view", { auth: !!who });
  }

  if (!document.body.classList.contains("admin")) {
    renderRentals(availability);
  }

  if (who?.isAdmin === true) {
    renderAdmin(availability);
  }

  renderPropertyDetailPage(availability);
  renderLandDetailPage();
  renderPropertiesPage(availability);
  renderLandsPage();
  initTenantPortalPropertyDropdown();

  try {
    await initLandsInteractiveMap();
  } catch (err) {
    console.warn("Interactive lands map failed:", err);
  }

  initAdminSSE();
  bindDwellAndFunnelUI();
  renderDwellTable();
  renderFunnel();
  initPerPropertyDwellTracking();  
  setupLazy();
  resizeEmbeds();
});
