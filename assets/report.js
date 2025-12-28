/* =========================================================
   ADEX HOLDINGS TRUST — report.js
   - Cloudflare Access safe fetch (redirect manual detection)
   - KPI deltas (7d/30d + QoQ/YoY best-effort)
   - Trend arrows
   - Line + bar chart (canvas)
   - Geo demand map (canvas lat/lon plotting)
   - Funnel conversion modeling
   - GPT exec summary (optional endpoint)
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
    csvBtn: $("#csvBtn"),
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
  };

  function setStatus(state, msg) {
    ui.statusText.textContent = msg || state;

    ui.statusDot.classList.remove("ok", "bad");
    if (state === "ok") ui.statusDot.classList.add("ok");
    if (state === "bad") ui.statusDot.classList.add("bad");
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

  function pct(a, b) {
    // a = current, b = prior
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

  async function fetchSameOrigin(path, opts = {}) {
    // Critical: redirect manual so we can detect Cloudflare Access redirect,
    // otherwise browser follows to adexholdings.cloudflareaccess.com and CORS fails.
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

  async function getJson(path) {
    const res = await fetchSameOrigin(path);
    return res.json();
  }

  function kpiCard(label, value, deltaText) {
    const div = document.createElement("div");
    div.className = "kpi";
    div.innerHTML = `
      <div class="label">${label}</div>
      <div class="val">${fmt(value)}</div>
      <div class="delta">${deltaText || ""}</div>
    `;
    return div;
  }

  function deltaLine(current, prior, label) {
    const p = pct(current, prior);
    const a = arrowFromPct(p);
    if (p == null) return `<span class="mono">${label}: —</span>`;
    const sign = p >= 0 ? "+" : "";
    return `<span class="arrow ${a.cls}">${a.arrow}</span> <span class="mono">${label}: ${sign}${p.toFixed(1)}%</span>`;
  }

  function renderKpis(kpi7, kpi7p, kpi30, kpi30p, kpiQ, kpiQp, kpiY, kpiYp) {
    ui.kpiGrid.innerHTML = "";

    // Use common keys if present, fallback defensively
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

    ui.kpiGrid.appendChild(
      kpiCard(
        "Total Events (7d)",
        total7,
        deltaLine(total7, total7p, "vs prior 7d")
      )
    );
    ui.kpiGrid.appendChild(
      kpiCard(
        "Views (7d)",
        views7,
        deltaLine(views7, views7p, "vs prior 7d")
      )
    );
    ui.kpiGrid.appendChild(
      kpiCard(
        "High Severity (7d)",
        hi7,
        deltaLine(hi7, hi7p, "vs prior 7d")
      )
    );
    ui.kpiGrid.appendChild(
      kpiCard(
        "Unique Properties (7d)",
        uniq7,
        deltaLine(uniq7, uniq7p, "vs prior 7d")
      )
    );

    // QoQ / YoY footnote and optional cards
    const qcur = kpiQ || null, qpri = kpiQp || null;
    const ycur = kpiY || null, ypri = kpiYp || null;

    const qTxt = qcur && qpri
      ? `QoQ: ${deltaLine(
          (qcur.totalEvents ?? qcur.total ?? qcur.events),
          (qpri.totalEvents ?? qpri.total ?? qpri.events),
          "events"
        )}`
      : `QoQ: —`;

    const yTxt = ycur && ypri
      ? `YoY: ${deltaLine(
          (ycur.totalEvents ?? ycur.total ?? ycur.events),
          (ypri.totalEvents ?? ypri.total ?? ypri.events),
          "events"
        )}`
      : `YoY: —`;

    ui.kpiFoot.innerHTML = `
      <span class="mono">30d vs prior 30d: ${
        deltaLine(
          (cur30.totalEvents ?? cur30.total ?? cur30.events),
          (pri30.totalEvents ?? pri30.total ?? pri30.events),
          "events"
        )
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

    // grid lines
    const rows = 4;
    for (let i = 0; i <= rows; i++) {
      const y = pad + ((h - pad * 2) * i) / rows;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      ctx.stroke();
    }

    // axis border
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  }

  function drawLineBarChart(canvas, series) {
    // series: [{label, events, views}]
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

    // Point
    if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
      const [lng, lat] = geom.coordinates;
      if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    }

    // Polygon / MultiPolygon: compute average of all coords
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

    // Map lng [-180..180] to x, lat [-90..90] to y
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

    // Determine weight scaling
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

    // axis labels
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText("-180°", pad, h - 16);
    ctx.fillText("180°", w - pad - 30, h - 16);
    ctx.fillText("90°", 12, pad + 12);
    ctx.fillText("-90°", 12, h - pad);
  }

  // ------------------------
  // Funnel modeling
  // ------------------------

  function normalizeType(t) {
    return String(t || "").trim().toLowerCase();
  }

  function buildFunnel(events) {
    // You can tune this mapping to your real event types.
    // Common events from your app.js: page_view, property_click, land_click, view_property_detail, view_land_detail
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
      const t = normalizeType(e.eventType);
      if (counts[t] != null) counts[t] += 1;
    });

    // Build a unified funnel ordering:
    // Page -> (Property path) -> (Land path)
    const funnel = [
      { stage: "Page Views", key: "page_view", count: counts.page_view },
      { stage: "Property Clicks", key: "property_click", count: counts.property_click },
      { stage: "Property Detail Views", key: "view_property_detail", count: counts.view_property_detail },
      { stage: "Land Clicks", key: "land_click", count: counts.land_click },
      { stage: "Land Detail Views", key: "view_land_detail", count: counts.view_land_detail },
    ];

    // stage-to-stage conversion
    for (let i = 0; i < funnel.length; i++) {
      if (i === 0) {
        funnel[i].conv = null;
        continue;
      }
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
        <td>${row.stage}</td>
        <td class="mono">${fmt(row.count)}</td>
        <td class="mono">${i === 0 ? "—" : (row.conv == null ? "—" : `${row.conv.toFixed(1)}%`)}</td>
      `;
      ui.funnelTableBody.appendChild(tr);
    });
  }

  // ------------------------
  // Exec Summary (GPT optional)
  // ------------------------

  function localExecSummary(kpi7, kpi7p, kpi30, kpi30p, funnel, geo) {
    const total7 = (kpi7?.totalEvents ?? kpi7?.total ?? kpi7?.events) ?? 0;
    const total7p = (kpi7p?.totalEvents ?? kpi7p?.total ?? kpi7p?.events) ?? 0;

    const views7 = (kpi7?.views ?? kpi7?.totalViews) ?? 0;
    const views7p = (kpi7p?.views ?? kpi7p?.totalViews) ?? 0;

    const dEv = pct(total7, total7p);
    const dVw = pct(views7, views7p);

    const topGeo = (() => {
      const feats = geo?.features || [];
      if (!feats.length) return null;
      // group approx by rounded lat/lon
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

    const propConv = funnel?.find(r => r.key === "view_property_detail")?.conv ?? null;
    const landConv = funnel?.find(r => r.key === "view_land_detail")?.conv ?? null;

    const evTxt = dEv == null ? "Events were not comparable to the prior period." :
      `Events ${dEv >= 0 ? "increased" : "decreased"} by ${Math.abs(dEv).toFixed(1)}% versus the prior 7 days.`;

    const vwTxt = dVw == null ? "Views were not comparable to the prior period." :
      `Views ${dVw >= 0 ? "increased" : "decreased"} by ${Math.abs(dVw).toFixed(1)}% versus the prior 7 days.`;

    const funnelTxt =
      `Funnel signals: property-detail conversion is ${propConv == null ? "—" : propConv.toFixed(1) + "%"} and land-detail conversion is ${landConv == null ? "—" : landConv.toFixed(1) + "%"} (stage-to-stage).`;

    const geoTxt = topGeo
      ? `Geographic demand clustered around approximately ${topGeo.where} (relative intensity score ${topGeo.score.toFixed(0)}).`
      : "No geographic demand points were available for this reporting window.";

    return `
      <b>Executive Summary</b><br/><br/>
      • ${evTxt}<br/>
      • ${vwTxt}<br/>
      • ${funnelTxt}<br/>
      • ${geoTxt}<br/><br/>
      <span class="small">This summary is locally generated from KPI + event + geo data. If you add an exec-summary endpoint, this button can return GPT output.</span>
    `;
  }

  async function tryFetchExecSummary(payload) {
    // Optional endpoint you can add in your worker:
    // POST /api/admin/exec-summary {kpis, funnel, geo} => {summaryHtml or summaryText}
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
      const out = await res.json();
      return out?.summaryHtml || out?.summaryText || null;
    } catch {
      return null;
    }
  }

  // ------------------------
  // Data assembly
  // ------------------------

  function csvUrl() {
    const params = new URLSearchParams(location.search);
    params.set("format", "csv");
    return `${CFG.WORKER_BASE}/admin/events?${params.toString()}`;
  }

  function priorWindowDays(days) {
    // prior 7d or prior 30d modeled as previous same length window:
    // if your worker KPI supports "since/until", use that instead.
    // Here we approximate by requesting 2*days and subtracting:
    // BUT we don't have raw breakdown, so we will fetch days again by passing a "since" style in worker later if you add it.
    // For now: attempt /admin/kpi?days=<days>&offset=<days> if you implement offset.
    // Without backend support, we'll best-effort by returning null.
    return null;
  }

  async function loadAll() {
    hideNotice();
    setStatus("warn", "Loading…");

    ui.csvBtn.href = csvUrl();

    // 1) KPI 7 and 30
    let kpi7, kpi30, kpi90, kpi365;
    let kpi7p = null, kpi30p = null, kpi90p = null, kpi365p = null;

    try {
      // current periods
      [kpi7, kpi30] = await Promise.all([
        getJson(CFG.KPI(7)),
        getJson(CFG.KPI(30)),
      ]);

      // QoQ (approx quarter = 90d) + YoY (365d) best effort
      // If your worker doesn't support these lengths, it will error and we handle gracefully.
      try { kpi90 = await getJson(CFG.KPI(90)); } catch { kpi90 = null; }
      try { kpi365 = await getJson(CFG.KPI(365)); } catch { kpi365 = null; }

      // PRIOR windows:
      // If you add backend support later, implement e.g. /admin/kpi?days=7&offset=7.
      // For now, attempt &offset=<days> and ignore if unsupported.
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
          Your browser is being redirected to Cloudflare Access, which cannot be fetched via JS due to CORS, so nothing renders.<br/><br/>
          <a class="btn" href="/admin.html">Sign in to view report</a>
          <a class="btn" href="/admin.html" style="background:rgba(255,255,255,.03)">Open Admin Dashboard</a>
          <div class="muted">After signing in, refresh this page.</div>
        `);
        return;
      }

      setStatus("bad", "Failed");
      showNotice(`
        <b>Failed to load report data.</b>
        <div class="muted">Error: <span class="mono">${String(e.code || e.message || e)}</span></div>
      `);
      return;
    }

    // 2) Events for modeling & charts
    let events = [];
    try {
      const out = await getJson(CFG.EVENTS(2000));
      events = out.events || out.log || [];
    } catch {
      events = [];
    }

    // 3) Heatmap GeoJSON
    let geo = null;
    try {
      geo = await getJson(CFG.HEATMAP(30, 1)); // last 30 days default
    } catch {
      geo = { type: "FeatureCollection", features: [] };
    }

    // Render KPIs
    renderKpis(kpi7, kpi7p, kpi30, kpi30p, kpi90, kpi90p, kpi365, kpi365p);

    // Engagement series: build daily buckets from events timestamps (best-effort)
    const series = buildDailySeries(events, 30);
    drawLineBarChart(ui.engagementChart, series);
    ui.engagementNote.textContent =
      series.length ? `Showing last ${series.length} day(s) from event timestamps (client aggregated).` :
      "No engagement events available.";

    // Funnel
    const funnel = buildFunnel(events);
    renderFunnel(funnel);

    // Geo
    drawGeoDemand(ui.geoChart, geo);
    ui.geoNote.textContent =
      geo?.features?.length ? `Plotted ${geo.features.length} geo feature(s) (centroids).` :
      "No geo features returned from heatmap endpoint.";

    // Default executive summary (local)
    ui.execBox.innerHTML = localExecSummary(kpi7, kpi7p, kpi30, kpi30p, funnel, geo);

    setStatus("ok", "Loaded");
    hideNotice();
  }

  function buildDailySeries(events, daysBack) {
    const now = Date.now();
    const start = now - daysBack * 86400000;

    const buckets = new Map(); // YYYY-MM-DD => {events, views}
    const toDay = (ts) => {
      const d = new Date(ts);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    (events || []).forEach(e => {
      const ts = Date.parse(e.ts || e.timestamp || e.time || "");
      if (!Number.isFinite(ts)) return;
      if (ts < start || ts > now) return;

      const day = toDay(ts);
      if (!buckets.has(day)) buckets.set(day, { events: 0, views: 0 });

      const row = buckets.get(day);
      row.events += 1;

      const t = normalizeType(e.eventType);
      // treat “view_” as views for bar
      if (t.includes("view_") || t === "property_click" || t === "land_click") {
        row.views += 1;
      }
    });

    // fill missing days
    const out = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = toDay(d);
      const row = buckets.get(key) || { events: 0, views: 0 };
      out.push({ label: key.slice(5), events: row.events, views: row.views });
    }
    return out;
  }

  async function generateExecSummary() {
    setStatus("warn", "Summarizing…");

    // Try backend GPT endpoint if you add it later
    // Otherwise just re-run local summary from what is already on page.
    // We keep it safe and do not block rendering.

    // If you add EXEC_SUMMARY endpoint, it can use OpenAI server-side and return text safely.
    const payload = { note: "Provide executive summary from KPIs/funnel/geo" };
    const out = await tryFetchExecSummary(payload);

    if (out) {
      ui.execBox.innerHTML = String(out);
      setStatus("ok", "Loaded");
      return;
    }

    // If no endpoint, keep local text (already set), but add a note
    ui.execBox.innerHTML = ui.execBox.innerHTML + `
      <br/><br/>
      <span class="small">GPT exec-summary endpoint was not available. Showing local summary.</span>
    `;
    setStatus("ok", "Loaded");
  }

  // ------------------------
  // Wire UI
  // ------------------------
  ui.refreshBtn.addEventListener("click", () => loadAll());
  ui.execBtn.addEventListener("click", () => generateExecSummary());

  // Init
  setStatus("warn", "Idle");
  ui.csvBtn.href = csvUrl();
  loadAll().catch((e) => {
    setStatus("bad", "Failed");
    showNotice(`<b>Unexpected failure.</b><div class="muted mono">${String(e?.message || e)}</div>`);
  });

})();
