/* =========================================================
   ADEX HOLDINGS TRUST — app.js (CLOUDFLARE ACCESS SAFE)
   FINAL + PUBLIC PAGES PATCH (FILTERS + CAROUSELS + SEO)
========================================================= */

const CFG = {
  WORKER_BASE: "/api",

  // OPTIONAL (only needed if you want Google Places Photos API)
  // 1) set window.ADEX_PLACES_API_KEY = "YOUR_KEY" before app.js loads (recommended)
  // 2) set googlePlaceId on properties you want photos for
  PLACES_KEY: () => (window.ADEX_PLACES_API_KEY || "")
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

function currencySymbol(code) {
  if (code === "NGN") return "₦";
  return "$";
}

function formatMoney(amount, currency) {
  if (!amount || Number(amount) <= 0) return "";
  const sym = currencySymbol(currency);
  // keep it simple; no Intl assumptions for NGN formatting
  return `${sym}${Number(amount).toLocaleString()}`;
}

function rentLabel(rent, currency) {
  if (!rent || !rent.amount) return "";
  const amt = formatMoney(rent.amount, currency);
  if (!amt) return "";
  const period = rent.period === "year" ? " / year" : " / month";
  return `${amt}${period}`;
}

function normalizeCountry(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return "";
  if (s === "us" || s === "usa" || s === "united states" || s === "united states of america") return "USA";
  if (s === "nigeria" || s === "ng") return "Nigeria";
  return v;
}

/* =======================
   LAZY LOADING
======================= */

function setupLazyLoading() {
  const els = qsa("[data-lazy-src], [data-lazy-iframe]");
  if (!els.length) return;

  const io = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;

        const imgSrc = el.getAttribute("data-lazy-src");
        if (imgSrc) {
          el.setAttribute("src", imgSrc);
          el.removeAttribute("data-lazy-src");
        }

        const ifSrc = el.getAttribute("data-lazy-iframe");
        if (ifSrc) {
          el.setAttribute("src", ifSrc);
          el.removeAttribute("data-lazy-iframe");
        }

        io.unobserve(el);
      });
    },
    { rootMargin: "200px 0px" }
  );

  els.forEach(el => io.observe(el));
}

/* =======================
   MAP HELPERS (PUBLIC)
   - No API key required.
   - Use OSM static map for thumbnails (free).
   - Use Google embed for interactive map.
======================= */

function osmStaticMap(query) {
  // free static map provider; good enough for thumbnails
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(
    query
  )}&zoom=14&size=640x360&maptype=mapnik&markers=${encodeURIComponent(query)},red-pushpin`;
}

function googleMapEmbed(query, mapType = "m") {
  // m=map, k=satellite
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&t=${encodeURIComponent(
    mapType
  )}&output=embed`;
}

function mapEmbedIframe(query, mapType = "m") {
  return `
    <iframe
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      data-lazy-iframe="${googleMapEmbed(query, mapType)}">
    </iframe>
  `;
}

function streetViewEmbedIframe(streetViewEmbedUrl) {
  // user-provided embed URL; no key needed
  return `
    <iframe
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      data-lazy-iframe="${streetViewEmbedUrl}">
    </iframe>
  `;
}

/* =======================
   GOOGLE PLACES PHOTOS (OPTIONAL)
   Works only if:
   - window.ADEX_PLACES_API_KEY set
   - property.googlePlaceId set
   This fetches via Places Photo endpoint using photo_reference.
======================= */

async function tryFetchPlacesPhotos(placeId, maxPhotos = 6) {
  const key = CFG.PLACES_KEY();
  if (!key || !placeId) return [];

  // Places Details to get photo references
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      placeId
    )}&fields=photos&key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const photos = data?.result?.photos || [];
    const refs = photos.slice(0, maxPhotos).map(p => p.photo_reference).filter(Boolean);

    // Convert refs into photo URLs (no fetch needed; browser loads images)
    return refs.map(ref =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photoreference=${encodeURIComponent(
        ref
      )}&key=${encodeURIComponent(key)}`
    );
  } catch {
    return [];
  }
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
   FILTER UI (COUNTRY)
   Works if the page has a container:
   - #filtersHost (optional)
======================= */

function uniqueCountries(items) {
  const set = new Set();
  items.forEach(it => set.add(normalizeCountry(it.country || "USA") || "USA"));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function ensureFilters(hostId, items, onChange) {
  const host = qs(hostId);
  if (!host) return null;

  const countries = uniqueCountries(items);
  const current = new URL(location.href);
  const selected = current.searchParams.get("country") || "All";

  host.innerHTML = `
    <div class="filtersRow">
      <label>
        Country:
        <select id="countryFilter">
          <option value="All">All</option>
          ${countries.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;

  const sel = qs("#countryFilter", host);
  if (sel) {
    sel.value = selected;
    sel.addEventListener("change", () => {
      const v = sel.value;
      const u = new URL(location.href);
      if (v === "All") u.searchParams.delete("country");
      else u.searchParams.set("country", v);
      history.replaceState({}, "", u.toString());
      onChange(v);
    });
  }

  return sel;
}

function readCountryFilter() {
  const u = new URL(location.href);
  return u.searchParams.get("country") || "All";
}

function applyCountry(items) {
  const wanted = readCountryFilter();
  if (wanted === "All") return items;
  return items.filter(it => normalizeCountry(it.country || "USA") === wanted);
}

/* =======================
   PHOTO + MAP RENDERING
   - Carousel supports:
     1) p.photos (your own URLs)
     2) Google Places Photos (optional)
     3) fallback images:
        - if streetViewEmbed exists: show Street View iframe (above map)
        - else show satellite map iframe (k)
        - always show normal map iframe
======================= */

function carouselHtml(imgUrls, alt, idPrefix) {
  if (!imgUrls || !imgUrls.length) return "";

  const mainId = `${idPrefix}-main`;

  const thumbs = imgUrls
    .slice(0, 8)
    .map((u, i) => {
      const safe = escapeHtml(u);
      return `
        <button class="thumbBtn" type="button" data-target="${escapeHtml(mainId)}" data-src="${safe}" aria-label="Photo ${i + 1}">
          <img loading="lazy" data-lazy-src="${safe}" alt="${escapeHtml(alt)} photo ${i + 1}"/>
        </button>
      `;
    })
    .join("");

  const first = escapeHtml(imgUrls[0]);

  return `
    <div class="photoBlock">
      <img class="photoMain" id="${escapeHtml(mainId)}" loading="lazy" data-lazy-src="${first}" alt="${escapeHtml(alt)}"/>
      <div class="thumbRow">${thumbs}</div>
    </div>
  `;
}

function bindCarouselClicks(root = document) {
  qsa(".thumbBtn", root).forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "true";
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const src = btn.getAttribute("data-src");
      const main = targetId ? document.getElementById(targetId) : null;
      if (main && src) {
        main.setAttribute("src", src);
        main.removeAttribute("data-lazy-src");
      }
    });
  });
}

/* =======================
   RENTALS (ADMIN + SIMPLE PUBLIC)
======================= */

function renderRentals(avail) {
  const host = qs("#rentalsGrid");
  if (!host || !window.ADEX_DATA?.rentals) return;

  const items = applyCountry(window.ADEX_DATA.rentals);

  host.innerHTML = "";

  items.forEach(p => {
    const status = avail[p.id] || p.status || "rented";
    const available = status === "available";

    const div = document.createElement("div");
    div.className = "tile";
    div.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div>${escapeHtml(p.address || "")}</div>
      <div style="opacity:.8">${escapeHtml(normalizeCountry(p.country || "USA"))}</div>
      <span class="badge ${available ? "ok" : "bad"}">
        ${available ? "Available" : "Rented"}
      </span>
    `;
    host.appendChild(div);
  });
}

/* =======================
   PROPERTIES PAGE (FULL)
   Expected host: #propertyList
   Optional filters host: #filtersHost
======================= */

async function renderPropertiesPage(avail) {
  const host = qs("#propertyList");
  if (!host || !window.ADEX_DATA?.rentals) return;

  // build filters once
  ensureFilters("#filtersHost", window.ADEX_DATA.rentals, () => {
    // re-render on change
    renderPropertiesPage(avail);
    renderRentals(avail);
    injectSchemaForRentals();
    setupLazyLoading();
    bindCarouselClicks();
  });

  const items = applyCountry(window.ADEX_DATA.rentals);

  host.innerHTML = "";

  for (const p of items) {
    const status = avail[p.id] || p.status || "rented";
    const available = status === "available";
    const q = p.embedQuery || p.address || p.name;

    // Photo sources
    let photos = Array.isArray(p.photos) ? [...p.photos] : [];

    // Optional Places photos if you provided key + placeId
    if (photos.length < 2 && p.googlePlaceId) {
      const more = await tryFetchPlacesPhotos(p.googlePlaceId, 6);
      photos = photos.concat(more);
    }

    // Always include a “nice fallback” thumbnail if no photos
    if (!photos.length) {
      photos.push(osmStaticMap(q));
    }

    const rentTxt = rentLabel(p.rent, p.currency);

    const card = document.createElement("div");
    card.className = "propertyCard";

    const sv = p.streetViewEmbed ? `
      <div class="mapBlock">
        <div class="mapTitle">Street View</div>
        ${streetViewEmbedIframe(p.streetViewEmbed)}
      </div>
    ` : "";

    const satellite = `
      <div class="mapBlock">
        <div class="mapTitle">Satellite</div>
        ${mapEmbedIframe(q, "k")}
      </div>
    `;

    const map = `
      <div class="mapBlock">
        <div class="mapTitle">Map</div>
        ${mapEmbedIframe(q, "m")}
      </div>
    `;

    card.innerHTML = `
      ${carouselHtml(photos, p.name, `prop-${p.id}`)}

      <div class="body">
        <h3>${escapeHtml(p.name)}</h3>
        <div class="meta">
          ${escapeHtml(p.type || "Property")}
          ${p.state ? ` • ${escapeHtml(p.state)}` : ""}
          ${p.country ? ` • ${escapeHtml(normalizeCountry(p.country))}` : ""}
        </div>

        <div class="addr">${escapeHtml(p.address || "")}</div>

        ${rentTxt ? `<div class="rentLine"><strong>Rent:</strong> ${escapeHtml(rentTxt)}</div>` : ""}

        <span class="badge ${available ? "ok" : "bad"}">
          ${available ? "Available" : "Rented"}
        </span>

        ${p.details ? `<p>${escapeHtml(p.details)}</p>` : ""}

        ${p.mapsLink ? `
          <a href="${escapeHtml(p.mapsLink)}" target="_blank" rel="noopener">
            View on Google Maps
          </a>` : ""}
      </div>

      <div class="map">
        ${sv || ""}
        ${!p.streetViewEmbed ? satellite : ""} 
        ${map}
      </div>
    `;

    host.appendChild(card);
  }

  setupLazyLoading();
  bindCarouselClicks(host);
  injectSchemaForRentals();
}

/* =======================
   LANDS PAGE (FULL)
   Expected host: #landList
   Optional filters host: #filtersHost
======================= */

function renderLandsPage() {
  const host = qs("#landList");
  if (!host || !window.ADEX_DATA?.lands) return;

  ensureFilters("#filtersHost", window.ADEX_DATA.lands, () => {
    renderLandsPage();
    injectSchemaForLands();
    setupLazyLoading();
  });

  const items = applyCountry(window.ADEX_DATA.lands);

  host.innerHTML = "";

  items.forEach(l => {
    const q = l.address || `${l.county || ""} ${l.state || ""}`.trim() || l.name;

    const currency = l.currency || "USD";
    const valueTxt = l.value?.amount ? formatMoney(l.value.amount, currency) : "";

    const card = document.createElement("div");
    card.className = "propertyCard";

    // Simple carousel for lands: map thumbnail + (optionally) more images later
    const photos = [osmStaticMap(q)];

    card.innerHTML = `
      ${carouselHtml(photos, l.name, `land-${l.id}`)}

      <div class="body">
        <h3>${escapeHtml(l.name)}</h3>

        <div class="meta">
          ${escapeHtml(String(l.acres ?? "—"))} acres
          ${l.state ? ` • ${escapeHtml(l.state)}` : ""}
          ${l.country ? ` • ${escapeHtml(normalizeCountry(l.country))}` : ""}
        </div>

        ${l.address ? `<div class="addr">${escapeHtml(l.address)}</div>` : ""}

        ${valueTxt ? `<div class="rentLine"><strong>Value:</strong> ${escapeHtml(valueTxt)}</div>` : ""}

        <div class="parcel">
          <strong>County:</strong> ${escapeHtml(l.county || "—")}<br/>
          <strong>Parcel ID:</strong> ${escapeHtml(l.parcelId || "—")}<br/>
          ${l.legal ? `<strong>Legal:</strong> ${escapeHtml(l.legal)}<br/>` : ""}
          ${l.notes ? `<strong>Notes:</strong> ${escapeHtml(l.notes)}<br/>` : ""}
        </div>

        ${l.links?.parcelPdf ? `<a href="${escapeHtml(l.links.parcelPdf)}" target="_blank" rel="noopener">Parcel Map (PDF)</a><br/>` : ""}
        ${l.links?.maps ? `<a href="${escapeHtml(l.links.maps)}" target="_blank" rel="noopener">View on Google Maps</a>` : ""}
      </div>

      <div class="map">
        <div class="mapBlock">
          <div class="mapTitle">Satellite</div>
          ${mapEmbedIframe(q, "k")}
        </div>
        <div class="mapBlock">
          <div class="mapTitle">Map</div>
          ${mapEmbedIframe(q, "m")}
        </div>
      </div>
    `;

    host.appendChild(card);
  });

  setupLazyLoading();
  bindCarouselClicks(host);
  injectSchemaForLands();
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
   SEO — SCHEMA.ORG JSON-LD
======================= */

function upsertJsonLd(id, obj) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(obj, null, 2);
}

function pageUrl(path) {
  try {
    const u = new URL(location.href);
    u.pathname = path;
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return path;
  }
}

function injectSchemaForRentals() {
  if (!window.ADEX_DATA?.rentals) return;

  const items = applyCountry(window.ADEX_DATA.rentals);

  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": window.ADEX_DATA.trustName,
    "url": pageUrl("/properties.html"),
    "contactPoint": {
      "@type": "ContactPoint",
      "email": window.ADEX_DATA.contact?.email,
      "telephone": window.ADEX_DATA.contact?.phone
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Rental Properties",
      "itemListElement": items.map(p => {
        const offer = (p.rent?.amount && p.currency) ? {
          "@type": "Offer",
          "priceCurrency": p.currency,
          "price": String(p.rent.amount),
          "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "priceCurrency": p.currency,
            "price": String(p.rent.amount),
            "unitText": p.rent.period === "year" ? "YEAR" : "MONTH"
          }
        } : undefined;

        return {
          "@type": "Offer",
          "name": p.name,
          ...(offer ? { "itemOffered": {
            "@type": "Accommodation",
            "name": p.name,
            "address": {
              "@type": "PostalAddress",
              "streetAddress": p.address || "",
              "addressRegion": p.state || "",
              "addressLocality": p.city || "",
              "addressCountry": normalizeCountry(p.country || "USA")
            }
          },
          ...offer } : {
            "itemOffered": {
              "@type": "Accommodation",
              "name": p.name,
              "address": {
                "@type": "PostalAddress",
                "streetAddress": p.address || "",
                "addressRegion": p.state || "",
                "addressLocality": p.city || "",
                "addressCountry": normalizeCountry(p.country || "USA")
              }
            }
          })
        };
      })
    }
  };

  upsertJsonLd("adex-jsonld", schema);
}

function injectSchemaForLands() {
  if (!window.ADEX_DATA?.lands) return;

  const items = applyCountry(window.ADEX_DATA.lands);

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Land Holdings",
    "url": pageUrl("/lands.html"),
    "isPartOf": {
      "@type": "Organization",
      "name": window.ADEX_DATA?.trustName || "Adex Holdings Trust"
    },
    "mainEntity": items.map(l => ({
      "@type": "Place",
      "name": l.name,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": l.address || "",
        "addressRegion": l.state || "",
        "addressCountry": normalizeCountry(l.country || "USA")
      },
      "additionalProperty": [
        l.county ? { "@type": "PropertyValue", "name": "County", "value": l.county } : null,
        l.parcelId ? { "@type": "PropertyValue", "name": "Parcel ID", "value": l.parcelId } : null,
        (typeof l.acres === "number") ? { "@type": "PropertyValue", "name": "Acres", "value": String(l.acres) } : null
      ].filter(Boolean)
    }))
  };

  upsertJsonLd("adex-jsonld", schema);
}

/* =======================
   INIT
======================= */

document.addEventListener("DOMContentLoaded", async () => {
  // Ensure countries normalized (safe)
  if (window.ADEX_DATA?.rentals) {
    window.ADEX_DATA.rentals.forEach(p => (p.country = normalizeCountry(p.country || "USA")));
  }
  if (window.ADEX_DATA?.lands) {
    window.ADEX_DATA.lands.forEach(l => (l.country = normalizeCountry(l.country || "USA")));
  }

  const availability = await fetchAvailability();

  renderRentals(availability);
  renderAdmin(availability);

  // Full pages (only render if the host exists)
  await renderPropertiesPage(availability);
  renderLandsPage();

  await loadWhoAmI();
  await loadAudit();

  setupLazyLoading();
  bindCarouselClicks();
});
