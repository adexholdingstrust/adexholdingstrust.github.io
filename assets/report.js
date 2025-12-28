/* =========================================================
   ADEX HOLDINGS TRUST — report.js
   - Cloudflare Access safe fetch (redirect manual detection)
   - SAFE JSON parsing (fixes: Unexpected end of input)
   - KPI deltas (7d/30d + QoQ/YoY best-effort)
   - Trend arrows
   - Line + bar chart (canvas)
   - Geo demand map (canvas lat/lon plotting)
   - Funnel conversion modeling
   - GPT exec summary (optional endpoint)
   - NEW: Controls & Segmentation
   - NEW: Top content, referrers, UA mix
   - NEW: Anomalies watchlist
   - NEW: Data quality/coverage panel
   - NEW: Download JSON + Print/PDF + Auth helper button
========================================================= */

(function () {
  "use strict";

  const CFG = {
    WORKER_BASE: "/api",
    // endpoints (same-origin)
    KPI: (days) => `/admin/kpi?days=${encodeURIComponent(String(days))}`,
    EVENTS: (limit) => `/admin/events?limit=${encodeURIComponent(String(limit))}`,
    HEATMAP: (days, minSeverity = 1) => {
      const q = new URLSearchParams();
      if (days != null && days !== "") {
        const since = new Date(Date.now() - Number(days) * 86400000).toISOString();
        q.set("since", since);
      }
      q.set("minSeverity", String(minSeverity));
      return `/admin/heatmap?${q.toString()}`;
    },
    // optional (if you add it in your worker)
    EXEC_SUMMARY: `/admin/exec-summary`,
  };

  const $ = (sel, root = document) => root.querySelector(sel);

  const ui = {
    statusPill: $("#statusPill"),
    statusDot: $("#statusDot"),
    statusText: $("#statusText"),
    refreshBtn: $("#refreshBtn"),
    execBtn: $("#execBtn"),
    authBtn: $("#authBtn"),
    csvBtn: $("#csvBtn"),
    jsonBtn: $("#jsonBtn"),
    printBtn: $("#printBtn"),

    noticeCard: $("#noticeCard"),
    noticeBox: $("#noticeBox"),

    kpiGrid: $("#kpiGrid"),
    kpiFoot: $("#kpiFoot"),

    execBox: $("#execBox"),

    engagementChart: $("#engagementChart"),
    engagementNote: $("#engagementNote"),

    funnelTableBody: $("#funnelTable tbody"),

    geoChart: $("#geoChart"),
    geoNote: $("#geoNote"),

    // NEW: controls
    daysKpi: $("#daysKpi"),
    daysCharts: $("#daysCharts"),
    eventLimit: $("#eventLimit"),
    minSeverity: $("#minSeverity"),
    segment: $("#segment"),
    applyBtn: $("#applyBtn"),
    activeFilters: $("#activeFilters"),

    // NEW: insights tables
    refTableBody: $("#refTable tbody"),
    refNote: $("#refNote"),

    uaTableBody: $("#uaTable tbody"),
    uaNote: $("#uaNote"),

    contentTableBody: $("#contentTable tbody"),
    contentNote: $("#contentNote"),

    anomTableBody: $("#anomTable tbody"),
    anomNote: $("#anomNote"),

    dqTableBody: $("#dqTable tbody"),
    dqNote: $("#dqNote"),

    // NEW: logo robustness
    logoImg: $("#logoImg"),
    logoFallback: $("#logoFallback"),
  };

  // ------------------------
  // State
  // ------------------------

  const state = {
    // defaults (match HTML defaults)
    kpiDays: 30,
    chartDays: 30,
    eventLimit: 2000,
    minSeverity: 1,
    segment: "all",

    lastLoadedAt: null,
    lastPayload: null,
  };

  // ------------------------
  // UI helpers
  // ------------------------

  function setStatus(stateName, msg) {
    ui.statusText.textContent = msg || stateName;

    ui.statusDot.classList.remove("ok", "bad");
    if (stateName === "ok") ui.statusDot.classList.add("ok");
    if (stateName === "bad") ui.statusDot.classList.add("bad");
  }

  function showNotice(html) {
    ui.noticeCard.style.display = "block";
    ui.noticeBox.innerHTML = html;
  }
  function hideNotice() {
    ui.noticeCard.style.display = "none";
    ui.noticeBox.innerHTML = "";
  }

  function fmt(n) {
    if (n == null || n === "" || Number.isNaN(Number(n))) return "—";
    const num = Number(n);
    return num.toLocaleString();
  }

  function fmtPct(p) {
    if (p == null || !Number.isFinite(p)) return "—";
    const sign = p >= 0 ? "+" : "";
    return `${sign}${p.toFixed(1)}%`;
  }

  function pct(a, b) {
    const A = Number(a), B = Number(b);
    if (!Number.isFinite(A) || !Number.isFinite(B) || B === 0) return null;
    return ((A - B) / B) * 100;
  }

  function arrowFromPct(p) {
    if (p == null || !Number.isFinite(p)) return { arrow: "—", cls: "" };
    if (p > 0.2) return { arrow: "↑", cls: "up" };
    if (p < -0.2) return { arrow: "↓", cls: "down" };
    return { arrow: "→", cls: "" };
  }

  function kpiCard(label, value, deltaText) {
    const div = document.createElement("div");
    div.className = "kpi";
    div.innerHTML = `
      <div class="label">${escapeHtml(label)}</div>
      <div class="val">${escapeHtml(fmt(value))}</div>
      <div class="delta">${deltaText || ""}</div>
    `;
    return div;
  }

  function deltaLine(current, prior, label) {
    const p = pct(current, prior);
    const a = arrowFromPct(p);
    if (p == null) return `<span class="mono">${escapeHtml(label)}: —</span>`;
    return `<span class="arrow ${a.cls}">${a.arrow}</span> <span class="mono">${escapeHtml(label)}: ${escapeHtml(fmtPct(p))}</span>`;
  }

  function renderActiveFilters() {
    const chips = [];
    chips.push({ k: "KPI Days", v: String(state.kpiDays) });
    chips.push({ k: "Chart Days", v: String(state.chartDays) });
    chips.push({ k: "Event Limit", v: String(state.eventLimit) });
    chips.push({ k: "Min Severity", v: String(state.minSeverity) });
    chips.push({ k: "Segment", v: state.segment });

    ui.activeFilters.innerHTML = chips.map(c => `
      <span class="chip"><b>${escapeHtml(c.k)}:</b> ${escapeHtml(c.v)}</span>
    `).join("");
  }

  // ------------------------
  // Logo fallback logic
  // ------------------------

  function initLogo() {
    // Try a few common paths automatically if /assets/logo.png fails
    const candidates = [
      "/assets/logo.png",
      "/assets/logo.webp",
      "/assets/logo.jpg",
      "/logo.png",
      "/favicon.ico",
    ];

    let idx = 0;
    const img = ui.logoImg;

    const showFallback = () => {
      if (ui.logoFallback) ui.logoFallback.style.display = "flex";
      if (img) img.style.display = "none";
    };

    const tryNext = () => {
      idx += 1;
      if (idx >= candidates.length) {
        showFallback();
        return;
      }
      img.src = candidates[idx];
    };

    img.addEventListener("error", tryNext);
    img.addEventListener("load", () => {
      if (ui.logoFallback) ui.logoFallback.style.display = "none";
      img.style.display = "block";
    });

    // set initial (keeps your original, but still allows fallback)
    img.src = candidates[0];

    // if it never loads, fallback triggers
    setTimeout(() => {
      if (!img.complete || img.naturalWidth === 0) showFallback();
    }, 1200);
  }

  // ------------------------
  // Networking (Cloudflare Access safe)
  // ------------------------

  async function fetchSameOrigin(path, opts = {}) {
    const res = await fetch(`${CFG.WORKER_BASE}${path}`, {
      method: "GET",
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      headers: { "Accept": "application/json" },
      ...opts,
    });

    // Detect Access redirect patterns
    const ct = res.headers.get("content-type") || "";
    const redirectedLike =
      res.type === "opaqueredirect" ||
      res.status === 302 ||
      (ct.includes("text/html") && res.status >= 200 && res.status < 400);

    if (redirectedLike) {
      const err = new Error("ACCESS_REQUIRED");
      err.code = "ACCESS_REQUIRED";
      throw err;
    }

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      const err = new Error(`HTTP_${res.status}`);
      err.code = `HTTP_${res.status}`;
      err.body = t;
      throw err;
    }

    return res;
  }

  async function safeReadJson(res) {
    // Fixes: "Unexpected end of input" when body is empty or non-JSON
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text().catch(() => "");
    if (!text || !text.trim()) return {};

    // If Cloudflare Access HTML sneaks in (or any HTML), do not JSON.parse it
    if (ct.includes("text/html") || /^\s*</.test(text)) {
      const err = new Error("NON_JSON_RESPONSE");
      err.code = "NON_JSON_RESPONSE";
      err.body = text.slice(0, 300);
      throw err;
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      const err = new Error("JSON_PARSE_FAILED");
      err.code = "JSON_PARSE_FAILED";
      err.body = text.slice(0, 300);
      throw err;
    }
  }

  async function getJson(path) {
    const res = await fetchSameOrigin(path);
    return safeReadJson(res);
  }

  // ------------------------
  // Rendering: KPIs + deltas
  // ------------------------

  function renderKpis(kpi7, kpi7p, kpi30, kpi30p, kpiQ, kpiQp, kpiY, kpiYp) {
    ui.kpiGrid.innerHTML = "";

    const cur7 = kpi7 || {};
    const pri7 = kpi7p || {};
    const cur30 = kpi30 || {};
    const pri30 = kpi30p || {};

    const total7 = cur7.totalEvents ?? cur7.total ?? cur7.events ?? null;
    const total7p = pri7.totalEvents ?? pri7.total ?? pri7.events ?? null;

    const views7 = cur7.views ?? cur7.totalViews ?? null;
    const views7p = pri7.views ?? pri7.totalViews ?? null;

    const hi7 = cur7.highSeverity ?? cur7.high ?? null;
    const hi7p = pri7.highSeverity ?? pri7.high ?? null;

    const uniq7 = cur7.uniqueProperties ?? cur7.unique ?? null;
    const uniq7p = pri7.uniqueProperties ?? pri7.unique ?? null;

    ui.kpiGrid.appendChild(kpiCard("Total Events (7d)", total7, deltaLine(total7, total7p, "vs prior 7d")));
    ui.kpiGrid.appendChild(kpiCard("Views (7d)", views7, deltaLine(views7, views7p, "vs prior 7d")));
    ui.kpiGrid.appendChild(kpiCard("High Severity (7d)", hi7, deltaLine(hi7, hi7p, "vs prior 7d")));
    ui.kpiGrid.appendChild(kpiCard("Unique Properties (7d)", uniq7, deltaLine(uniq7, uniq7p, "vs prior 7d")));

    const qcur = kpiQ || null, qpri = kpiQp || null;
    const ycur = kpiY || null, ypri = kpiYp || null;

    const qTxt = qcur && qpri
      ? `QoQ: ${deltaLine((qcur.totalEvents ?? qcur.total ?? qcur.events), (qpri.totalEvents ?? qpri.total ?? qpri.events), "events")}`
      : `QoQ: —`;

    const yTxt = ycur && ypri
      ? `YoY: ${deltaLine((ycur.totalEvents ?? ycur.total ?? ycur.events), (ypri.totalEvents ?? ypri.total ?? ypri.events), "events")}`
      : `YoY: —`;

    ui.kpiFoot.innerHTML = `
      <span class="mono">30d vs prior 30d: ${
        deltaLine((cur30.totalEvents ?? cur30.total ?? cur30.events), (pri30.totalEvents ?? pri30.total ?? pri30.events), "events")
      }</span>
      &nbsp; · &nbsp;
      <span class="mono">${qTxt}</span>
      &nbsp; · &nbsp;
      <span class="mono">${yTxt}</span>
    `;
  }

  // ------------------------
  // Charts (Canvas)
  // ------------------------

  function clearCanvas(c) {
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    return ctx;
  }

  function drawAxes(ctx, w, h, pad) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;

    const rows = 4;
    for (let i = 0; i <= rows; i++) {
      const y = pad + ((h - pad * 2) * i) / rows;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  }

  function drawLineBarChart(canvas, series) {
    const ctx = clearCanvas(canvas);
    const w = canvas.width, h = canvas.height;
    const pad = 46;

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "12px ui-monospace, monospace";

    drawAxes(ctx, w, h, pad);

    if (!Array.isArray(series) || !series.length) {
      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.fillText("No engagement data.", pad + 10, pad + 20);
      return;
    }

    const maxEvents = Math.max(...series.map(d => Number(d.events) || 0), 1);
    const maxViews = Math.max(...series.map(d => Number(d.views) || 0), 1);
    const maxY = Math.max(maxEvents, maxViews);

    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    const step = plotW / Math.max(1, series.length - 1);

    // Bars (views)
    for (let i = 0; i < series.length; i++) {
      const v = Number(series[i].views) || 0;
      const x = pad + i * step;
      const barW = Math.max(6, step * 0.55);
      const barH = (v / maxY) * plotH;
      const bx = x - barW / 2;
      const by = pad + (plotH - barH);

      ctx.fillStyle = "rgba(61,220,151,.25)";
      ctx.strokeStyle = "rgba(61,220,151,.35)";
      ctx.lineWidth = 1;
      ctx.fillRect(bx, by, barW, barH);
      ctx.strokeRect(bx, by, barW, barH);
    }

    // Line (events)
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const e = Number(series[i].events) || 0;
      const x = pad + i * step;
      const y = pad + (plotH - (e / maxY) * plotH);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(255,204,102,.75)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // points
    for (let i = 0; i < series.length; i++) {
      const e = Number(series[i].events) || 0;
      const x = pad + i * step;
      const y = pad + (plotH - (e / maxY) * plotH);
      ctx.fillStyle = "rgba(255,204,102,.95)";
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // labels (sparse)
    ctx.fillStyle = "rgba(255,255,255,.65)";
    const every = Math.ceil(series.length / 6);
    for (let i = 0; i < series.length; i += every) {
      const x = pad + i * step;
      ctx.fillText(String(series[i].label || ""), x - 10, h - 16);
    }
  }

  function centroidFromGeometry(geom) {
    if (!geom) return null;

    if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
      const [lng, lat] = geom.coordinates;
      if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    }

    const coords = [];
    const pushAll = (arr) => {
      if (!Array.isArray(arr)) return;
      if (typeof arr[0] === "number") {
        coords.push(arr);
      } else {
        arr.forEach(pushAll);
      }
    };
    pushAll(geom.coordinates);

    if (!coords.length) return null;
    let sumLng = 0, sumLat = 0, n = 0;
    coords.forEach(c => {
      const lng = Number(c[0]), lat = Number(c[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        sumLng += lng; sumLat += lat; n += 1;
      }
    });
    if (!n) return null;
    return { lng: sumLng / n, lat: sumLat / n };
  }

  function drawGeoDemand(canvas, geojson) {
    const ctx = clearCanvas(canvas);
    const w = canvas.width, h = canvas.height;
    const pad = 46;

    drawAxes(ctx, w, h, pad);

    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText("Lat/Lon demand scatter (best-effort).", pad + 10, pad + 20);

    const feats = geojson?.features || [];
    if (!feats.length) {
      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.fillText("No geo events in this window.", pad + 10, pad + 40);
      return;
    }

    const plotW = w - pad * 2;
    const plotH = h - pad * 2;

    const pts = [];
    feats.forEach(f => {
      const c = centroidFromGeometry(f.geometry);
      if (!c) return;
      pts.push({
        lng: c.lng,
        lat: c.lat,
        w: Number(f.properties?.weight) || 1
      });
    });

    if (!pts.length) {
      ctx.fillText("GeoJSON had no usable coordinates.", pad + 10, pad + 40);
      return;
    }

    const maxW = Math.max(...pts.map(p => p.w), 1);

    pts.forEach(p => {
      const x = pad + ((p.lng + 180) / 360) * plotW;
      const y = pad + (plotH - ((p.lat + 90) / 180) * plotH);
      const r = 2.5 + (p.w / maxW) * 9;

      ctx.beginPath();
      ctx.fillStyle = "rgba(61,220,151,.22)";
      ctx.strokeStyle = "rgba(61,220,151,.35)";
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText("-180°", pad, h - 16);
    ctx.fillText("180°", w - pad - 30, h - 16);
    ctx.fillText("90°", 12, pad + 12);
    ctx.fillText("-90°", 12, h - pad);
  }

  // ------------------------
  // Funnel modeling + segmentation
  // ------------------------

  function normalizeType(t) {
    return String(t || "").trim().toLowerCase();
  }

  function eventMatchesSegment(e) {
    const seg = state.segment;
    if (seg === "all") return true;

    const t = normalizeType(e.eventType);
    const sev = Number(e.severity ?? e.level ?? e.risk ?? 0);

    if (seg === "property") return t.includes("property");
    if (seg === "land") return t.includes("land");
    if (seg === "high_sev") return Number.isFinite(sev) && sev >= 4;

    return true;
  }

  function buildFunnel(events) {
    const stages = [
      { key: "page_view", label: "Page Views" },
      { key: "property_click", label: "Property Clicks" },
      { key: "view_property_detail", label: "Property Detail Views" },
      { key: "land_click", label: "Land Clicks" },
      { key: "view_land_detail", label: "Land Detail Views" },
    ];

    const counts = {};
    stages.forEach(s => (counts[s.key] = 0));

    (events || []).forEach(e => {
      if (!eventMatchesSegment(e)) return;
      const t = normalizeType(e.eventType);
      if (counts[t] != null) counts[t] += 1;
    });

    const funnel = [
      { stage: "Page Views", key: "page_view", count: counts.page_view },
      { stage: "Property Clicks", key: "property_click", count: counts.property_click },
      { stage: "Property Detail Views", key: "view_property_detail", count: counts.view_property_detail },
      { stage: "Land Clicks", key: "land_click", count: counts.land_click },
      { stage: "Land Detail Views", key: "view_land_detail", count: counts.view_land_detail },
    ];

    for (let i = 0; i < funnel.length; i++) {
      if (i === 0) { funnel[i].conv = null; continue; }
      const prev = funnel[i - 1].count;
      const cur = funnel[i].count;
      funnel[i].conv = prev > 0 ? (cur / prev) * 100 : null;
    }

    return funnel;
  }

  function renderFunnel(funnel) {
    ui.funnelTableBody.innerHTML = "";

    if (!Array.isArray(funnel) || !funnel.length) {
      ui.funnelTableBody.innerHTML = `<tr><td colspan="3">No funnel data.</td></tr>`;
      return;
    }

    funnel.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.stage)}</td>
        <td class="mono">${escapeHtml(fmt(row.count))}</td>
        <td class="mono">${i === 0 ? "—" : (row.conv == null ? "—" : `${row.conv.toFixed(1)}%`)}</td>
      `;
      ui.funnelTableBody.appendChild(tr);
    });
  }

  // ------------------------
  // Exec Summary (GPT optional) + local
  // ------------------------

  function localExecSummary(kpi7, kpi7p, funnel, geo, insights) {
    const total7 = (kpi7?.totalEvents ?? kpi7?.total ?? kpi7?.events) ?? 0;
    const total7p = (kpi7p?.totalEvents ?? kpi7p?.total ?? kpi7p?.events) ?? 0;

    const views7 = (kpi7?.views ?? kpi7?.totalViews) ?? 0;
    const views7p = (kpi7p?.views ?? kpi7p?.totalViews) ?? 0;

    const dEv = pct(total7, total7p);
    const dVw = pct(views7, views7p);

    const topGeo = (() => {
      const feats = geo?.features || [];
      if (!feats.length) return null;
      const buckets = new Map();
      feats.forEach(f => {
        const c = centroidFromGeometry(f.geometry);
        if (!c) return;
        const k = `${Math.round(c.lat)}°, ${Math.round(c.lng)}°`;
        const w = Number(f.properties?.weight) || 1;
        buckets.set(k, (buckets.get(k) || 0) + w);
      });
      const sorted = [...buckets.entries()].sort((a,b)=>b[1]-a[1]);
      return sorted[0] ? { where: sorted[0][0], score: sorted[0][1] } : null;
    })();

    const propDetail = funnel?.find(r => r.key === "view_property_detail")?.conv ?? null;
    const landDetail = funnel?.find(r => r.key === "view_land_detail")?.conv ?? null;

    const evTxt = dEv == null
      ? "Events were not comparable to the prior period."
      : `Events ${dEv >= 0 ? "increased" : "decreased"} by ${Math.abs(dEv).toFixed(1)}% versus the prior 7 days.`;

    const vwTxt = dVw == null
      ? "Views were not comparable to the prior period."
      : `Views ${dVw >= 0 ? "increased" : "decreased"} by ${Math.abs(dVw).toFixed(1)}% versus the prior 7 days.`;

    const funnelTxt =
      `Funnel signals: property-detail conversion is ${propDetail == null ? "—" : propDetail.toFixed(1) + "%"} and land-detail conversion is ${landDetail == null ? "—" : landDetail.toFixed(1) + "%"} (stage-to-stage).`;

    const geoTxt = topGeo
      ? `Geographic demand clustered around approximately ${topGeo.where} (relative intensity score ${topGeo.score.toFixed(0)}).`
      : "No geographic demand points were available for this reporting window.";

    const topSourceTxt = insights?.topReferrer
      ? `Top traffic source: ${insights.topReferrer.name} (${insights.topReferrer.share.toFixed(1)}% share).`
      : "Traffic source data was not available in the sampled events.";

    const topItemTxt = insights?.topContent
      ? `Top demand driver: ${insights.topContent.item} (${insights.topContent.views} views, ${insights.topContent.clicks} clicks).`
      : "Top content could not be determined from event metadata.";

    const anomalyTxt = insights?.anomalyCount
      ? `Watchlist: ${insights.anomalyCount} anomaly day(s) detected in the selected window.`
      : "Watchlist: no significant anomaly days detected in the selected window.";

    return `
      <b>Executive Summary</b><br/><br/>
      • ${escapeHtml(evTxt)}<br/>
      • ${escapeHtml(vwTxt)}<br/>
      • ${escapeHtml(funnelTxt)}<br/>
      • ${escapeHtml(geoTxt)}<br/>
      • ${escapeHtml(topSourceTxt)}<br/>
      • ${escapeHtml(topItemTxt)}<br/>
      • ${escapeHtml(anomalyTxt)}<br/><br/>
      <span class="small">This summary is locally generated from KPI + event + geo data. If you add an exec-summary endpoint, this button can return GPT output.</span>
    `;
  }

  async function tryFetchExecSummary(payload) {
    try {
      const res = await fetch(`${CFG.WORKER_BASE}${CFG.EXEC_SUMMARY}`, {
        method: "POST",
        credentials: "include",
        redirect: "manual",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
      });

      const ct = res.headers.get("content-type") || "";
      const redirectedLike =
        res.type === "opaqueredirect" ||
        res.status === 302 ||
        (ct.includes("text/html") && res.status >= 200 && res.status < 400);

      if (redirectedLike) {
        const err = new Error("ACCESS_REQUIRED");
        err.code = "ACCESS_REQUIRED";
        throw err;
      }

      if (!res.ok) return null;
      const out = await safeReadJson(res);
      return out?.summaryHtml || out?.summaryText || null;
    } catch {
      return null;
    }
  }

  // ------------------------
  // CSV / JSON URLs
  // ------------------------

  function csvUrl() {
    const params = new URLSearchParams(location.search);
    params.set("format", "csv");
    // keep compatibility with your endpoint style
    return `${CFG.WORKER_BASE}/admin/events?${params.toString()}`;
  }

  function jsonUrl() {
    const params = new URLSearchParams(location.search);
    params.set("format", "json");
    return `${CFG.WORKER_BASE}/admin/events?${params.toString()}`;
  }

  // ------------------------
  // Build daily series
  // ------------------------

  function buildDailySeries(events, daysBack) {
    const now = Date.now();
    const start = now - daysBack * 86400000;

    const buckets = new Map();
    const toDay = (ts) => {
      const d = new Date(ts);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    (events || []).forEach(e => {
      if (!eventMatchesSegment(e)) return;

      const ts = Date.parse(e.ts || e.timestamp || e.time || e.createdAt || "");
      if (!Number.isFinite(ts)) return;
      if (ts < start || ts > now) return;

      const day = toDay(ts);
      if (!buckets.has(day)) buckets.set(day, { events: 0, views: 0 });

      const row = buckets.get(day);
      row.events += 1;

      const t = normalizeType(e.eventType);
      if (t.includes("view_") || t === "property_click" || t === "land_click") {
        row.views += 1;
      }
    });

    const out = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = toDay(d);
      const row = buckets.get(key) || { events: 0, views: 0 };
      out.push({ label: key.slice(5), dateKey: key, events: row.events, views: row.views });
    }
    return out;
  }

  // ------------------------
  // NEW: Insights
  // ------------------------

  function domainFromReferrer(r) {
    try {
      if (!r) return null;
      const u = new URL(r);
      return u.hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  function uaCategory(ua) {
    const s = String(ua || "").toLowerCase();
    if (!s) return "Unknown";

    const isMobile = /iphone|android|mobile|ipad|ipod/.test(s);
    const isBot = /bot|spider|crawl|slurp|headless/.test(s);

    if (isBot) return "Bot/Headless";
    if (isMobile) return "Mobile/Tablet";
    return "Desktop";
  }

  function uaBrowser(ua) {
    const s = String(ua || "").toLowerCase();
    if (!s) return "Unknown";
    if (s.includes("firefox")) return "Firefox";
    if (s.includes("edg/") || s.includes("edge")) return "Edge";
    if (s.includes("chrome") && !s.includes("chromium") && !s.includes("edg/")) return "Chrome";
    if (s.includes("safari") && !s.includes("chrome")) return "Safari";
    return "Other";
  }

  function summarizeReferrers(events) {
    const m = new Map();
    let total = 0;

    (events || []).forEach(e => {
      if (!eventMatchesSegment(e)) return;

      const ref = e.referrer || e.referer || e.ref || e.pageRef || e.sourceUrl || "";
      const dom = domainFromReferrer(ref) || (ref ? "Other" : "Direct/None");
      m.set(dom, (m.get(dom) || 0) + 1);
      total += 1;
    });

    const rows = [...m.entries()].map(([k, v]) => ({ name: k, count: v, share: total ? (v / total) * 100 : 0 }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 10);

    return { total, rows };
  }

  function summarizeUA(events) {
    const cat = new Map();
    const br = new Map();
    let total = 0;

    (events || []).forEach(e => {
      if (!eventMatchesSegment(e)) return;

      const ua = e.ua || e.userAgent || e.user_agent || "";
      const c = uaCategory(ua);
      const b = uaBrowser(ua);

      cat.set(c, (cat.get(c) || 0) + 1);
      br.set(b, (br.get(b) || 0) + 1);
      total += 1;
    });

    const rows = [
      ...[...cat.entries()].map(([k,v]) => ({ label: `Device: ${k}`, count: v })),
      ...[...br.entries()].map(([k,v]) => ({ label: `Browser: ${k}`, count: v })),
    ].sort((a,b)=>b.count-a.count).slice(0, 10)
     .map(r => ({ ...r, share: total ? (r.count/total)*100 : 0 }));

    return { total, rows };
  }

  function summarizeTopContent(events) {
    // Attempts to identify a "content item" from common fields:
    // propertyId, landId, page, path, url, title, listingId, etc.
    const m = new Map();

    function contentKey(e) {
      const t = normalizeType(e.eventType);

      const propertyId = e.propertyId || e.property_id || e.listingId || e.listing_id;
      const landId = e.landId || e.land_id;
      const page = e.page || e.path || e.pathname || e.url || e.href;

      if (propertyId) return { key: `property:${propertyId}`, type: "Property", label: String(propertyId) };
      if (landId) return { key: `land:${landId}`, type: "Land", label: String(landId) };
      if (page) {
        // normalize to path-ish
        const label = (() => {
          try {
            const u = new URL(page, location.origin);
            return u.pathname || page;
          } catch {
            return String(page);
          }
        })();
        return { key: `page:${label}`, type: "Page", label };
      }

      // fallback to event type
      return { key: `event:${t || "unknown"}`, type: "Event", label: t || "unknown" };
    }

    (events || []).forEach(e => {
      if (!eventMatchesSegment(e)) return;

      const t = normalizeType(e.eventType);
      const { key, type, label } = contentKey(e);

      if (!m.has(key)) m.set(key, { item: label, type, views: 0, clicks: 0 });

      const row = m.get(key);

      // define view/click by event type patterns
      const isView = t.includes("view_") || t === "page_view";
      const isClick = t.includes("click") || t.endsWith("_click");

      if (isView) row.views += 1;
      if (isClick) row.clicks += 1;

      // If unknown, still count as views for "engagement"
      if (!isView && !isClick) row.views += 1;
    });

    const rows = [...m.values()]
      .sort((a,b) => (b.views + b.clicks) - (a.views + a.clicks))
      .slice(0, 15);

    const top = rows[0] ? { item: rows[0].item, views: rows[0].views, clicks: rows[0].clicks } : null;

    return { rows, top };
  }

  function computeAnomalies(dailySeries) {
    // z-score on events
    const vals = (dailySeries || []).map(d => Number(d.events) || 0);
    if (!vals.length) return { rows: [], count: 0 };

    const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
    const variance = vals.reduce((a,b)=>a + Math.pow(b-mean,2), 0) / vals.length;
    const sd = Math.sqrt(variance) || 0;

    const rows = dailySeries.map(d => {
      const v = Number(d.events) || 0;
      const z = sd > 0 ? (v - mean) / sd : 0;
      const flagged = Math.abs(z) >= 2.0 && v > 0; // threshold
      let note = "";
      if (flagged) note = z > 0 ? "Spike" : "Dip";
      return {
        date: d.dateKey || d.label,
        events: v,
        z,
        flagged,
        note
      };
    });

    const flaggedRows = rows.filter(r => r.flagged).slice(-10); // show most recent anomalies
    return { rows: flaggedRows, count: rows.filter(r => r.flagged).length };
  }

  function renderTableRows(tbody, rowsHtml, emptyHtml) {
    tbody.innerHTML = rowsHtml || emptyHtml || `<tr><td colspan="3">No data.</td></tr>`;
  }

  function renderReferrers(ref) {
    ui.refTableBody.innerHTML = "";

    if (!ref || !ref.rows || !ref.rows.length) {
      ui.refTableBody.innerHTML = `<tr><td colspan="3">No referrer data found in events.</td></tr>`;
      ui.refNote.textContent = "If you want this to work well, include `referrer` (document.referrer) on the event payload in your tracker.";
      return;
    }

    ref.rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.name)}</td>
        <td class="mono">${escapeHtml(fmt(r.count))}</td>
        <td class="mono">${escapeHtml(fmtPct(r.share))}</td>
      `;
      ui.refTableBody.appendChild(tr);
    });

    ui.refNote.textContent = `Top ${ref.rows.length} referrers based on sampled events. Total events scanned: ${ref.total}.`;
  }

  function renderUA(ua) {
    ui.uaTableBody.innerHTML = "";

    if (!ua || !ua.rows || !ua.rows.length) {
      ui.uaTableBody.innerHTML = `<tr><td colspan="3">No user-agent data found in events.</td></tr>`;
      ui.uaNote.textContent = "If you want this to work well, include `ua` (navigator.userAgent) on the event payload in your tracker.";
      return;
    }

    ua.rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.label)}</td>
        <td class="mono">${escapeHtml(fmt(r.count))}</td>
        <td class="mono">${escapeHtml(fmtPct(r.share))}</td>
      `;
      ui.uaTableBody.appendChild(tr);
    });

    ui.uaNote.textContent = `Breakdown based on sampled events. Total events scanned: ${ua.total}.`;
  }

  function renderTopContent(content) {
    ui.contentTableBody.innerHTML = "";

    if (!content || !content.rows || !content.rows.length) {
      ui.contentTableBody.innerHTML = `<tr><td colspan="4">No content metadata found in events.</td></tr>`;
      ui.contentNote.textContent = "To improve this: include `propertyId`/`landId`/`path`/`url`/`title` fields in your event payload.";
      return;
    }

    content.rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${escapeHtml(String(r.item))}</td>
        <td>${escapeHtml(r.type)}</td>
        <td class="mono">${escapeHtml(fmt(r.views))}</td>
        <td class="mono">${escapeHtml(fmt(r.clicks))}</td>
      `;
      ui.contentTableBody.appendChild(tr);
    });

    ui.contentNote.textContent = `Top ${content.rows.length} items (views + clicks) for the selected segment.`;
  }

  function renderAnomalies(anom) {
    ui.anomTableBody.innerHTML = "";

    if (!anom || !anom.rows || !anom.rows.length) {
      ui.anomTableBody.innerHTML = `<tr><td colspan="4">No anomalies detected (or not enough data).</td></tr>`;
      ui.anomNote.textContent = "Anomalies are computed using a basic z-score on daily event counts. You can tighten/loosen the threshold in report.js.";
      return;
    }

    anom.rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${escapeHtml(r.date)}</td>
        <td class="mono">${escapeHtml(fmt(r.events))}</td>
        <td class="mono">${escapeHtml((r.z ?? 0).toFixed(2))}</td>
        <td>${escapeHtml(r.note || "")}</td>
      `;
      ui.anomTableBody.appendChild(tr);
    });

    ui.anomNote.textContent = `Detected ${anom.count} anomaly day(s) in the selected window; showing up to the 10 most recent.`;
  }

  function renderDataQuality(dq) {
    ui.dqTableBody.innerHTML = "";

    (dq || []).forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.check)}</td>
        <td class="mono">${escapeHtml(row.result)}</td>
        <td>${escapeHtml(row.details)}</td>
      `;
      ui.dqTableBody.appendChild(tr);
    });

    ui.dqNote.textContent = "These checks are computed from the sampled event payload plus the heatmap response.";
  }

  function computeDataQuality(events, geo, dailySeries) {
    const total = (events || []).filter(eventMatchesSegment).length;

    let badTs = 0;
    let missingGeo = 0;
    let hasGeo = 0;
    let hasRef = 0;
    let hasUA = 0;

    let minTs = Infinity;
    let maxTs = -Infinity;

    (events || []).forEach(e => {
      if (!eventMatchesSegment(e)) return;

      const ts = Date.parse(e.ts || e.timestamp || e.time || e.createdAt || "");
      if (!Number.isFinite(ts)) badTs += 1;
      else { minTs = Math.min(minTs, ts); maxTs = Math.max(maxTs, ts); }

      const geoOk = !!(e.geo || e.lat || e.lng || e.location || e.geometry);
      if (geoOk) hasGeo += 1;
      else missingGeo += 1;

      const ref = e.referrer || e.referer || e.ref || e.pageRef || "";
      if (ref) hasRef += 1;

      const ua = e.ua || e.userAgent || e.user_agent || "";
      if (ua) hasUA += 1;
    });

    const geoFeatures = geo?.features?.length || 0;

    const spanTxt = (Number.isFinite(minTs) && Number.isFinite(maxTs) && minTs !== Infinity)
      ? `${new Date(minTs).toISOString()} to ${new Date(maxTs).toISOString()}`
      : "—";

    const seriesNonZeroDays = (dailySeries || []).filter(d => (Number(d.events)||0) > 0).length;

    const rows = [
      { check: "Sample size (events scanned)", result: String(total), details: "Based on selected segment + event limit." },
      { check: "Time coverage (min..max event timestamp)", result: spanTxt === "—" ? "—" : "OK", details: spanTxt },
      { check: "Bad timestamps", result: String(badTs), details: badTs ? "Some events had missing/invalid ts fields." : "No invalid timestamps detected." },
      { check: "Geo coverage (events with geo fields)", result: total ? `${((hasGeo/total)*100).toFixed(1)}%` : "—", details: `Events with geo fields: ${hasGeo}. Missing: ${missingGeo}.` },
      { check: "Heatmap features returned", result: String(geoFeatures), details: geoFeatures ? "Heatmap provided features for plotting." : "No features returned from heatmap endpoint." },
      { check: "Referrer coverage", result: total ? `${((hasRef/total)*100).toFixed(1)}%` : "—", details: "Add document.referrer to improve traffic source analysis." },
      { check: "User-Agent coverage", result: total ? `${((hasUA/total)*100).toFixed(1)}%` : "—", details: "Add navigator.userAgent to improve device/browser breakdown." },
      { check: "Active days in chart window", result: String(seriesNonZeroDays), details: "Number of days with at least 1 event in the chart window." },
      { check: "Data freshness (page load)", result: state.lastLoadedAt ? new Date(state.lastLoadedAt).toLocaleString() : "—", details: "When this report last successfully loaded." },
    ];

    return rows;
  }

  // ------------------------
  // Auth helper
  // ------------------------

  function openAuthTab() {
    // Purpose: open a same-origin authenticated endpoint in a NEW TAB.
    // Cloudflare Access will show its login UI there and set cookies.
    // Then user comes back and hits Refresh.
    const target = `${CFG.WORKER_BASE}/admin/kpi?days=7`;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  // ------------------------
  // Data assembly
  // ------------------------

  async function loadAll() {
    hideNotice();
    setStatus("warn", "Loading…");

    ui.csvBtn.href = csvUrl();
    ui.jsonBtn.href = jsonUrl();

    renderActiveFilters();

    // Use fixed windows for KPI comparisons (still matches your original intent)
    let kpi7, kpi30, kpi90, kpi365;
    let kpi7p = null, kpi30p = null, kpi90p = null, kpi365p = null;

    try {
      [kpi7, kpi30] = await Promise.all([
        getJson(CFG.KPI(7)),
        getJson(CFG.KPI(30)),
      ]);

      try { kpi90 = await getJson(CFG.KPI(90)); } catch { kpi90 = null; }
      try { kpi365 = await getJson(CFG.KPI(365)); } catch { kpi365 = null; }

      // prior windows attempt (requires backend support; safe to fail)
      try { kpi7p = await getJson(`/admin/kpi?days=7&offset=7`); } catch { kpi7p = null; }
      try { kpi30p = await getJson(`/admin/kpi?days=30&offset=30`); } catch { kpi30p = null; }
      try { kpi90p = kpi90 ? await getJson(`/admin/kpi?days=90&offset=90`) : null; } catch { kpi90p = null; }
      try { kpi365p = kpi365 ? await getJson(`/admin/kpi?days=365&offset=365`) : null; } catch { kpi365p = null; }

    } catch (e) {
      if (e.code === "ACCESS_REQUIRED") {
        setStatus("bad", "Auth required");
        showNotice(`
          <b>Cloudflare Access login required.</b>
          This report calls authenticated endpoints (e.g., <span class="mono">/api/admin/kpi</span>).
          Your browser is being redirected to Cloudflare Access, which cannot be fetched via JS due to CORS.<br/><br/>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <a class="btn" href="/admin.html">Open Admin Dashboard</a>
            <button class="btn" onclick="window.open('/api/admin/kpi?days=7','_blank','noopener,noreferrer')">Authenticate in New Tab</button>
          </div>
          <div class="muted">After signing in, return here and click <b>Refresh</b>.</div>
        `);
        return;
      }

      if (e.code === "NON_JSON_RESPONSE" || e.code === "JSON_PARSE_FAILED") {
        setStatus("bad", "Failed");
        showNotice(`
          <b>Report endpoint returned a non-JSON response.</b>
          <div class="muted">This often happens when an endpoint returns HTML (login page) or an empty response.</div>
          <div class="muted mono">${escapeHtml(e.code)}</div>
          <div class="muted" style="margin-top:8px;">Try clicking <b>Authenticate</b>, complete login, then Refresh.</div>
        `);
        return;
      }

      setStatus("bad", "Failed");
      showNotice(`
        <b>Failed to load report data.</b>
        <div class="muted">Error: <span class="mono">${escapeHtml(String(e.code || e.message || e))}</span></div>
      `);
      return;
    }

    // Events
    let events = [];
    try {
      const out = await getJson(CFG.EVENTS(state.eventLimit));
      events = out.events || out.log || out.items || out.data || [];
      if (!Array.isArray(events)) events = [];
    } catch (e) {
      // Events failure should not kill the whole page
      events = [];
    }

    // Heatmap
    let geo = null;
    try {
      geo = await getJson(CFG.HEATMAP(state.chartDays, state.minSeverity));
      if (!geo || typeof geo !== "object") geo = { type: "FeatureCollection", features: [] };
      if (!Array.isArray(geo.features)) geo.features = [];
    } catch {
      geo = { type: "FeatureCollection", features: [] };
    }

    // KPI render
    renderKpis(kpi7, kpi7p, kpi30, kpi30p, kpi90, kpi90p, kpi365, kpi365p);

    // Charts + series
    const daily = buildDailySeries(events, state.chartDays);
    drawLineBarChart(ui.engagementChart, daily);
    ui.engagementNote.textContent =
      daily.length
        ? `Showing last ${daily.length} day(s) from event timestamps (client aggregated) for segment "${state.segment}".`
        : "No engagement events available.";

    // Funnel
    const funnel = buildFunnel(events);
    renderFunnel(funnel);

    // Geo
    drawGeoDemand(ui.geoChart, geo);
    ui.geoNote.textContent =
      geo?.features?.length
        ? `Plotted ${geo.features.length} geo feature(s) (centroids). Segment "${state.segment}".`
        : "No geo features returned from heatmap endpoint.";

    // NEW: insights
    const refs = summarizeReferrers(events);
    renderReferrers(refs);

    const ua = summarizeUA(events);
    renderUA(ua);

    const content = summarizeTopContent(events);
    renderTopContent(content);

    const anom = computeAnomalies(daily);
    renderAnomalies(anom);

    state.lastLoadedAt = Date.now();

    const dq = computeDataQuality(events, geo, daily);
    renderDataQuality(dq);

    // Exec summary includes new insight callouts
    const insightsForSummary = {
      topReferrer: refs?.rows?.[0] ? { name: refs.rows[0].name, share: refs.rows[0].share } : null,
      topContent: content?.top ? { item: content.top.item, views: content.top.views, clicks: content.top.clicks } : null,
      anomalyCount: anom?.count || 0
    };

    ui.execBox.innerHTML = localExecSummary(kpi7, kpi7p, funnel, geo, insightsForSummary);

    // store last payload (for future enhancements)
    state.lastPayload = {
      kpi7, kpi7p, kpi30, kpi30p, kpi90, kpi90p, kpi365, kpi365p,
      eventsSampled: events.slice(0, 50),
      daily,
      funnel,
      geoMeta: { features: geo?.features?.length || 0 },
      refs,
      ua,
      content,
      anom
    };

    setStatus("ok", "Loaded");
    hideNotice();
  }

  async function generateExecSummary() {
    setStatus("warn", "Summarizing…");

    // If you add EXEC_SUMMARY endpoint, it can call OpenAI server-side and return text safely.
    // We'll pass a compact payload (avoid sending raw huge logs).
    const payload = {
      kpis: {
        kpi7: state.lastPayload?.kpi7 || null,
        kpi7p: state.lastPayload?.kpi7p || null,
        kpi30: state.lastPayload?.kpi30 || null,
        kpi30p: state.lastPayload?.kpi30p || null
      },
      funnel: state.lastPayload?.funnel || null,
      insights: {
        topReferrer: state.lastPayload?.refs?.rows?.[0] || null,
        topContent: state.lastPayload?.content?.rows?.[0] || null,
        anomalies: state.lastPayload?.anom || null,
        segment: state.segment,
        chartDays: state.chartDays
      },
      geo: { features: state.lastPayload?.geoMeta?.features || 0 }
    };

    const out = await tryFetchExecSummary(payload);

    if (out) {
      ui.execBox.innerHTML = String(out);
      setStatus("ok", "Loaded");
      return;
    }

    // fallback: keep local summary and append note
    ui.execBox.innerHTML = ui.execBox.innerHTML + `
      <br/><br/>
      <span class="small">GPT exec-summary endpoint was not available. Showing local summary.</span>
    `;
    setStatus("ok", "Loaded");
  }

  // ------------------------
  // Controls wiring
  // ------------------------

  function applyControlsFromUI() {
    state.kpiDays = Number(ui.daysKpi?.value || 30);
    state.chartDays = Number(ui.daysCharts?.value || 30);
    state.eventLimit = Number(ui.eventLimit?.value || 2000);
    state.minSeverity = Number(ui.minSeverity?.value || 1);
    state.segment = String(ui.segment?.value || "all");

    renderActiveFilters();
  }

  // ------------------------
  // Security: minimal HTML escape
  // ------------------------

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ------------------------
  // Wire UI
  // ------------------------

  ui.refreshBtn.addEventListener("click", () => loadAll());
  ui.execBtn.addEventListener("click", () => generateExecSummary());
  ui.authBtn.addEventListener("click", () => openAuthTab());
  ui.printBtn.addEventListener("click", () => window.print());

  ui.applyBtn.addEventListener("click", () => {
    applyControlsFromUI();
    loadAll();
  });

  // Init
  setStatus("warn", "Idle");
  ui.csvBtn.href = csvUrl();
  ui.jsonBtn.href = jsonUrl();

  initLogo();
  applyControlsFromUI();
  renderActiveFilters();

  loadAll().catch((e) => {
    setStatus("bad", "Failed");
    showNotice(`<b>Unexpected failure.</b><div class="muted mono">${escapeHtml(String(e?.message || e))}</div>`);
  });

})();
