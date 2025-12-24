/* Adex Holdings Trust - Site JS
   - Interlinked pages
   - Rental availability driven by Cloudflare Worker (recommended) with fallback
   - Simple visit logging (privacy-aware): sends page + referrer + user agent to Worker
*/
const CFG = {
  // Set this to your Cloudflare Worker base URL after you deploy it, e.g.:
  // WORKER_BASE: "https://adex-trust-security.<your-subdomain>.workers.dev"
  WORKER_BASE: "https://adex-trust-security.tenantservices.workers.dev",
  // If you use Turnstile in the Tenant Portal form, set your public site key here:
  TURNSTILE_SITE_KEY: "0x4AAAAAACI86yCKmFT74NN1"
};

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function toMapsLink(query){
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
}

function getLocalAvailability(){
  try{ return JSON.parse(localStorage.getItem("adexAvailabilityV1")||"{}"); }catch(e){ return {}; }
}
function setLocalAvailability(obj){
  localStorage.setItem("adexAvailabilityV1", JSON.stringify(obj||{}));
}

async function fetchAvailability(){
  if(!CFG.WORKER_BASE) return getLocalAvailability();
  try{
    const res = await fetch(`${CFG.WORKER_BASE}/availability`, { credentials:"omit" });
    if(!res.ok) throw new Error("availability fetch failed");
    return await res.json();
  }catch(e){
    return getLocalAvailability();
  }
}

async function updateAvailability(updates, adminToken){
  // updates: { [id]: "available" | "rented" }
  if(!CFG.WORKER_BASE){
    const cur = getLocalAvailability();
    setLocalAvailability({ ...cur, ...updates });
    return { ok:true, mode:"localStorage" };
  }
  const res = await fetch(`${CFG.WORKER_BASE}/availability/update`, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization": `Bearer ${adminToken}`
    },
    body: JSON.stringify({ updates })
  });
  const out = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(out?.error || "update failed");
  return out;
}

async function logVisit(){
  if(!CFG.WORKER_BASE) return;
  try{
    await fetch(`${CFG.WORKER_BASE}/log`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        path: location.pathname,
        page: document.title || "",
        referrer: document.referrer || ""
      })
    });
  }catch(e){ /* ignore */ }
}

function renderLands(){
  const data = window.ADEX_DATA;
  const host = qs("#landsGrid");
  if(!host) return;
  host.innerHTML = "";
  data.lands.forEach(l => {
    const maps = toMapsLink(`${l.name} ${l.acres} acres ${l.county} ${l.state}`);
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="kicker">Land holding</div>
      <h3>${escapeHtml(l.name)}</h3>
      <div class="meta"><b>${l.acres}</b> acres • ${escapeHtml(l.county)} • ${escapeHtml(l.state)}</div>
      <div class="meta">${escapeHtml(l.notes||"")}</div>
      <div class="btnRow">
        <a class="btn primary" href="${maps}" target="_blank" rel="noopener">Open in Google Maps</a>
      </div>
      <div class="badgeRow">
        <span class="badge">Parcel link</span>
        <span class="badge">Rural</span>
      </div>
    `;
    host.appendChild(tile);
  });
}

function renderRentals(availability){
  const data = window.ADEX_DATA;
  const host = qs("#rentalsGrid");
  if(!host) return;
  host.innerHTML = "";

  data.rentals.forEach(p => {
    const effectiveStatus = availability?.[p.id] || p.status || "rented";
    const isAvailable = effectiveStatus === "available";
    const badgeClass = isAvailable ? "ok" : "bad";
    const badgeText  = isAvailable ? "Available" : "Rented";

    const maps = toMapsLink(p.mapQuery || `${p.name} ${p.state}`);
    const applyHref = `tenant-portal.html?property=${encodeURIComponent(p.id)}`;

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="kicker">Rental property</div>
      <h3>${escapeHtml(p.name)}</h3>
      <div class="meta">${escapeHtml(p.type)} • ${escapeHtml(p.state)}</div>
      <div class="meta">${escapeHtml(p.details||"")}</div>
      <div class="badgeRow">
        <span class="badge ${badgeClass}">${badgeText}</span>
        <span class="badge">${escapeHtml(p.type)}</span>
      </div>
      <div class="btnRow">
        <a class="btn" href="${maps}" target="_blank" rel="noopener">View area on Maps</a>
        ${isAvailable
          ? `<a class="btn primary" href="${applyHref}">Inquire / Apply</a>`
          : `<button class="btn primary disabled" disabled title="Currently rented">Currently Rented</button>`
        }
      </div>
      <div class="small">Status can be updated by admin in <a href="admin.html">Admin</a>.</div>
    `;
    host.appendChild(tile);
  });
}

function renderAdmin(availability){
  const data = window.ADEX_DATA;
  const host = qs("#adminList");
  if(!host) return;

  const tokenInput = qs("#adminToken");
  const modeEl = qs("#adminMode");

  function renderList(){
    host.innerHTML = "";
    data.rentals.forEach(p => {
      const status = availability?.[p.id] || p.status || "rented";
      const row = document.createElement("div");
      row.className = "card";
      row.style.padding = "14px";
      row.innerHTML = `
        <div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
          <div>
            <div class="kicker">Rental</div>
            <div style="font-weight:900;font-size:16px;margin-top:4px">${escapeHtml(p.name)}</div>
            <div class="meta">${escapeHtml(p.type)} • ${escapeHtml(p.state)} • <b>${escapeHtml(status)}</b></div>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <select data-id="${p.id}" class="statusSelect">
              <option value="rented" ${status==="rented"?"selected":""}>Rented</option>
              <option value="available" ${status==="available"?"selected":""}>Available</option>
            </select>
          </div>
        </div>
      `;
      host.appendChild(row);
    });
  }

  renderList();

  qs("#saveBtn")?.addEventListener("click", async () => {
    const selects = qsa(".statusSelect");
    const updates = {};
    selects.forEach(s => { updates[s.dataset.id] = s.value; });

    const token = tokenInput?.value?.trim() || "";
    try{
      const result = await updateAvailability(updates, token);
      modeEl.textContent = CFG.WORKER_BASE ? "Cloudflare Worker" : "LocalStorage";
      availability = await fetchAvailability();
      renderList();
      toast(`Saved ✓ (${result.mode || "ok"})`);
    }catch(e){
      toast(`Save failed: ${e.message || e}`, true);
    }
  });
}

function initTenantPortal(){
  const form = qs("#tenantForm");
  if(!form) return;

  // Populate property dropdown from data
  const select = qs("#propertySelect");
  const data = window.ADEX_DATA;
  data.rentals.forEach(p=>{
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });

  // Preselect from URL param
  const params = new URLSearchParams(location.search);
  const prop = params.get("property");
  if(prop) select.value = prop;

  // Render Turnstile widget if configured
  const tsHost = qs("#turnstile");
  if(tsHost && CFG.TURNSTILE_SITE_KEY){
    tsHost.innerHTML = `<div class="cf-turnstile" data-sitekey="${CFG.TURNSTILE_SITE_KEY}"></div>`;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }else if(tsHost){
    tsHost.innerHTML = `<div class="notice"><b>Spam protection:</b> Enable Cloudflare Turnstile by setting <span class="code">TURNSTILE_SITE_KEY</span> in <span class="code">assets/app.js</span>.</div>`;
  }

  // Formspree default action set in HTML
  form.addEventListener("submit", () => {
    // Add helpful hidden fields
    qs('input[name="page"]')?.remove();
    const page = document.createElement("input");
    page.type = "hidden";
    page.name = "page";
    page.value = location.href;
    form.appendChild(page);
  });
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function toast(msg, isBad=false){
  const t = qs("#toast");
  if(!t) return alert(msg);
  t.textContent = msg;
  t.style.borderColor = isBad ? "rgba(255,107,107,.35)" : "rgba(61,220,151,.35)";
  t.style.background = isBad ? "rgba(255,107,107,.08)" : "rgba(61,220,151,.08)";
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>{ t.style.display="none"; }, 3800);
}

document.addEventListener("DOMContentLoaded", async () => {
  // OPTIONAL: set these without editing JS by defining window.__ADEX_CFG in HTML
  if(window.__ADEX_CFG){
    Object.assign(CFG, window.__ADEX_CFG);
  }

  await logVisit();

  const availability = await fetchAvailability();
  renderLands();
  renderRentals(availability);
  renderAdmin(availability);
  initTenantPortal();
});
