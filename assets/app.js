/* =========================================================
   ADEX HOLDINGS TRUST — app.js (CLOUDFLARE ACCESS SAFE)
   FINAL + PUBLIC PAGES PATCH (UPGRADED)
========================================================= */

const CFG = {
  WORKER_BASE: "/api",

  // Optional (only needed if you want Google Places Photos, Static Maps with key, etc.)
  GOOGLE_MAPS_KEY: "",     // e.g. "AIza..."
  GOOGLE_PLACES_KEY: "",   // e.g. "AIza..."

  // Optional (only needed for interactive parcel overlays + clustering map)
  MAPBOX_TOKEN: "",        // e.g. "pk.eyJ..."
  MAPBOX_STYLE_STREETS: "mapbox://styles/mapbox/streets-v12",
  MAPBOX_STYLE_SAT: "mapbox://styles/mapbox/satellite-streets-v12",
  MAPBOX_STYLE_TERRAIN: "mapbox://styles/mapbox/outdoors-v12"
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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

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
  // Keyless fallback (OpenStreetMap static render)
  // Note: public tile endpoints can rate-limit; this is best-effort.
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(
    query
  )}&zoom=14&size=900x520&markers=${encodeURIComponent(query)},red-pushpin`;
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
   EVENT TRACKING (PRIVACY-SAFE)
======================= */

function trackEvent(eventType, data = {}) {
  try {
    fetch(`${CFG.WORKER_BASE}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        path: location.pathname,
        referrer: document.referrer || null,
        userAgent: navigator.userAgent,
        language: navigator.language,
        screen: {
          w: window.screen.width,
          h: window.screen.height
        },
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...data
      })
    }).catch(() => {});
  } catch {
    // fail silently
  }
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
  const host =
    qs("#adminKPI") ||
    qs("#adminControls") ||
    qs("#adminList");

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
    const items = window.ADEX_DATA.rentals.filter(p => (country === "ALL" ? true : p.country === country));
    draw(items);
    injectSchemaJsonLd(items, "rentals");
    setupLazy();
    wireCarousels(host);
  };

  const draw = items => {
    host.innerHTML = "";

    items.forEach(p => {
      const status = avail[p.id] || p.status || "rented";
      const available = status === "available";
        const viewKey = `rental:${p.id}`;
if (!__trackedViews.has(viewKey)) {
  __trackedViews.add(viewKey);
  trackEvent("view_rental", {
    id: p.id,
    name: p.name,
    state: p.state,
    country: p.country
  });
}


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
        <div class="media"></div>
        <div class="body">
          <h3>${escapeHtml(p.name)}</h3>
          <div class="meta">${escapeHtml(p.type)} • ${escapeHtml(p.state || "—")} • ${escapeHtml(p.country || "—")}</div>
          <div class="addr">${escapeHtml(p.address || "")}</div>

          ${rentText ? `<div class="meta" style="margin-top:6px;">Rent: ${escapeHtml(rentText)}</div>` : ""}

          <span class="badge ${available ? "ok" : "bad"}" style="margin-top:10px;display:inline-block;">
            ${available ? "Available" : "Rented"}
          </span>

          <p style="margin-top:10px;">${escapeHtml(p.details || "")}</p>

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

  applyFilter();
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


const items = window.ADEX_DATA.lands.filter(l => {
  if (country !== "ALL" && l.country !== country) return false;
  if (county !== "ALL" && l.county !== county) return false;

  // Acres filter (OPTIONAL)
  if (minA !== null && Number.isFinite(l.acres) && l.acres < minA) return false;
  if (maxA !== null && Number.isFinite(l.acres) && l.acres > maxA) return false;

  return true;
});


    draw(items);
    injectSchemaJsonLd(items, "lands");
    setupLazy();
  };

  const draw = items => {
    host.innerHTML = "";

    items.forEach(l => {
       const viewKey = `land:${l.id}`;
if (!__trackedViews.has(viewKey)) {
  __trackedViews.add(viewKey);
  trackEvent("view_land", {
    id: l.id,
    parcelId: l.parcelId,
    county: l.county,
    state: l.state,
    acres: l.acres
  });
}
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

      const card = document.createElement("div");
      card.className = "propertyCard";
      card.innerHTML = `
        <div class="media"></div>
        <div class="body">
          <h3>${escapeHtml(l.name)}</h3>
          <div class="meta">${escapeHtml(String(l.acres ?? "—"))} acres • ${escapeHtml(l.state || "—")} • ${escapeHtml(l.county || "—")} • ${escapeHtml(l.country || "—")}</div>

          ${l.address ? `<div class="addr">${escapeHtml(l.address)}</div>` : ""}

          <div class="parcel" style="margin-top:10px;">
            <strong>Parcel ID:</strong> ${escapeHtml(l.parcelId || "—")}<br/>
            <strong>County:</strong> ${escapeHtml(l.county || "—")}<br/>
            ${l.legal ? `<strong>Legal:</strong> ${escapeHtml(l.legal)}<br/>` : ""}
          </div>

          <div style="margin-top:10px;">
            ${
              l.links?.parcelPdf
                ? `<a href="${escapeHtml(l.links.parcelPdf)}" target="_blank" rel="noopener">Parcel Map (PDF)</a><br/>`
                : ""
            }
            <a href="${escapeHtml(maps)}" target="_blank" rel="noopener">View on Google Maps</a><br/>
            <a href="${escapeHtml(assessor)}" target="_blank" rel="noopener">County Assessor / Parcel Lookup</a>
          </div>
        </div>

        <div class="map" style="margin-top:12px;">
          <iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade"
            data-src="${escapeHtml(mapEmbedSrc(q))}"></iframe>
          <div style="opacity:.75;font-size:12px;margin-top:6px;">Map</div>
        </div>
      `;

      const media = qs(".media", card);
      media.appendChild(img);

      host.appendChild(card);
    });
  };

  if (controls?.countrySel) controls.countrySel.addEventListener("change", applyFilter);
  if (controls?.countySel) controls.countySel.addEventListener("change", applyFilter);
  if (controls?.acreMin) controls.acreMin.addEventListener("input", applyFilter);
  if (controls?.acreMax) controls.acreMax.addEventListener("input", applyFilter);

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

    // 3) Safe fallback point
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
        coordinates: [-115.2, 36.2] // default fallback
      }
    });
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
      renderRentals(fresh);
      await loadAudit();
    } catch (e) {
      notify(e.message || "Save failed", true);
    }
  });
}
/* =======================
   EVENT REPLAY TIMELINE
======================= */

async function loadEventReplay() {
  const host = document.getElementById("replayTimeline");
  if (!host) return;

  const res = await accessFetch("/admin/events?limit=25");
  const out = await res.json();

  host.innerHTML = "";

  (out.events || []).forEach(e => {
    const div = document.createElement("div");
    div.className = "replayItem" + (e.severity >= 4 ? " high" : "");
    div.innerHTML = `
      <div class="replayTime">${e.ts}</div>
      <div class="replayBody">
        <b>${e.eventType}</b><br/>
        ${e.data?.name || e.data?.parcelId || "—"}<br/>
        <span style="opacity:.7">
          ${[e.city, e.region, e.country].filter(Boolean).join(", ")}
        </span>
      </div>
    `;
    host.appendChild(div);
  });
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
  const availability = await fetchAvailability();
  const who = await loadWhoAmI();

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
  if (document.getElementById("replayTimeline")) {
  await loadEventReplay();
}
}

  if (!sessionStorage.getItem("pv:" + location.pathname)) {
  sessionStorage.setItem("pv:" + location.pathname, "1");
  trackEvent("page_view", { auth: !!who });
}

  renderRentals(availability);
  if (who?.isAdmin === true) {
  renderAdmin(availability);
}
  renderPropertiesPage(availability);
  renderLandsPage();
  initTenantPortalPropertyDropdown();

  initLandsInteractiveMap().catch(err =>
    console.warn("Interactive lands map failed:", err)
  );

  setupLazy();
});
