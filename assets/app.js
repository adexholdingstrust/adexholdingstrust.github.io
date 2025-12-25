const CFG = {
  WORKER_BASE: "",
  TURNSTILE_SITE_KEY: "",
  ADMIN_UI_PASSCODE: ""
};

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function toMapsLink(urlOrQuery){
  if(!urlOrQuery) return "#";
  if(String(urlOrQuery).startsWith("http")) return urlOrQuery;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(urlOrQuery);
}
function mapsEmbedSrc(query){
  return "https://www.google.com/maps?q=" + encodeURIComponent(query) + "&output=embed";
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
  }catch(e){}
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
    const maps = toMapsLink(p.mapsLink || p.address || p.name);
    const applyHref = `tenant-portal.html?property=${encodeURIComponent(p.id)}`;

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="kicker">Rental property</div>
      <h3>${escapeHtml(p.name)}</h3>
      <div class="meta"><b>${escapeHtml(p.type)}</b> • ${escapeHtml(p.address || "")}</div>
      <div class="meta">${escapeHtml(p.details||"")}</div>

      <div style="border:1px solid var(--line);border-radius:14px;overflow:hidden;background:rgba(0,0,0,.15)">
        <iframe title="Map" src="${mapsEmbedSrc(p.embedQuery || p.address || p.name)}" width="100%" height="170" style="border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>

      <div class="badgeRow">
        <span class="badge ${badgeClass}">${badgeText}</span>
        <span class="badge">${escapeHtml(p.state)}</span>
      </div>
      <div class="btnRow">
        <a class="btn" href="${maps}" target="_blank" rel="noopener">Open in Google Maps</a>
        ${isAvailable ? `<a class="btn primary" href="${applyHref}">Inquire / Apply</a>` : `<button class="btn primary disabled" disabled>Currently Rented</button>`}
      </div>
      <div class="small">Availability is managed by Adex Holdings Trust.</div>
    `;
    host.appendChild(tile);
  });
}

function renderLands(){
  const data = window.ADEX_DATA;
  const host = qs("#landsGrid");
  if(!host) return;
  host.innerHTML = "";

  data.lands.forEach(l => {
    const maps = toMapsLink(l.links?.maps || l.address || l.name);
    const parcelPdf = l.links?.parcelPdf || "";
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="kicker">Land holding</div>
      <h3>${escapeHtml(l.name)}</h3>
      <div class="meta"><b>${Number(l.acres).toFixed(2)}</b> acres • ${escapeHtml(l.county || "")} • ${escapeHtml(l.state || "")}</div>
      ${l.address ? `<div class="meta">${escapeHtml(l.address)}</div>` : ""}
      ${l.parcelId ? `<div class="meta"><b>Parcel / APN:</b> ${escapeHtml(l.parcelId)}</div>` : ""}
      ${l.legal ? `<div class="meta"><b>Legal:</b> ${escapeHtml(l.legal)}</div>` : ""}
      ${l.notes ? `<div class="meta">${escapeHtml(l.notes)}</div>` : ""}

      <div style="border:1px solid var(--line);border-radius:14px;overflow:hidden;background:rgba(0,0,0,.15)">
        <iframe title="Map" src="${mapsEmbedSrc(l.address || l.name)}" width="100%" height="170" style="border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>

      <div class="btnRow">
        <a class="btn primary" href="${maps}" target="_blank" rel="noopener">Open in Google Maps</a>
        ${parcelPdf ? `<a class="btn" href="${parcelPdf}" target="_blank" rel="noopener">Parcel PDF</a>` : ""}
      </div>
    `;
    host.appendChild(tile);
  });
}

function adminIsAuthed(){
  if(!CFG.ADMIN_UI_PASSCODE) return true;
  return sessionStorage.getItem("adexAdminAuthedV1") === "true";
}
function requireAdminGate(){
  const gate = qs("#adminGate");
  const wrap = qs("#adminWrap");
  if(!wrap) return;

  if(adminIsAuthed()){
    if(gate) gate.style.display="none";
    wrap.style.display="block";
    return;
  }

  wrap.style.display="none";
  if(gate) gate.style.display="block";

  qs("#adminLoginBtn")?.addEventListener("click", () => {
    const pass = (qs("#adminPasscode")?.value || "").trim();
    if(!pass) return toast("Enter passcode", true);
    if(pass !== CFG.ADMIN_UI_PASSCODE) return toast("Incorrect passcode", true);
    sessionStorage.setItem("adexAdminAuthedV1","true");
    toast("Admin unlocked ✓");
    if(gate) gate.style.display="none";
    wrap.style.display="block";
  });
}

function renderAdmin(availability){
  const host = qs("#adminList");
  if(!host) return;

  const tokenInput = qs("#adminToken");
  const modeEl = qs("#adminMode");
  const data = window.ADEX_DATA;

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
    const updates = {};
    qsa(".statusSelect").forEach(s => { updates[s.dataset.id] = s.value; });

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

  const select = qs("#propertySelect");
  const data = window.ADEX_DATA;
  data.rentals.forEach(p=>{
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.address || p.state}`;
    select.appendChild(opt);
  });

  const params = new URLSearchParams(location.search);
  const prop = params.get("property");
  if(prop) select.value = prop;

  const tsHost = qs("#turnstile");
  if(tsHost && CFG.TURNSTILE_SITE_KEY){
    tsHost.innerHTML = `<div class="cf-turnstile" data-sitekey="${CFG.TURNSTILE_SITE_KEY}"></div>`;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }

  form.addEventListener("submit", () => {
    const page = document.createElement("input");
    page.type = "hidden";
    page.name = "page";
    page.value = location.href;
    form.appendChild(page);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if(window.__ADEX_CFG){ Object.assign(CFG, window.__ADEX_CFG); }
  await logVisit();
  const availability = await fetchAvailability();
  renderLands();
  renderRentals(availability);
  requireAdminGate();
  renderAdmin(availability);
  initTenantPortal();
});
