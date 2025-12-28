/* ============================================================
   ADEX HOLDINGS TRUST — EXECUTIVE REPORT LOGIC
   File: assets/report.js
   Purpose: Render C-suite reporting without admin auth
   ============================================================ */

(function () {
  const $ = (id) => document.getElementById(id);

  /* ---------- MOCK DATA (TEMPORARY) ---------- */
  const data = {
    kpis: {
      totalEvents: { value: 115, delta: +12 },
      propertyViews: { value: 32, delta: +8 },
      highSeverity: { value: 23, delta: -3 },
      uniqueProperties: { value: 7, delta: +1 }
    },

    engagementOverTime: [
      { day: "Mon", events: 12, views: 4 },
      { day: "Tue", events: 18, views: 6 },
      { day: "Wed", events: 15, views: 5 },
      { day: "Thu", events: 22, views: 9 },
      { day: "Fri", events: 30, views: 8 },
      { day: "Sat", events: 10, views: 3 },
      { day: "Sun", events: 8, views: 2 }
    ],

    funnel: [
      { stage: "Page View", count: 115 },
      { stage: "Property View", count: 32 },
      { stage: "High Intent Signal", count: 23 },
      { stage: "Inquiry Started", count: 9 },
      { stage: "Inquiry Submitted", count: 4 }
    ],

    executiveSummary: `
      Portfolio engagement increased week-over-week, driven primarily by
      land and high-value property interest. Conversion efficiency remains
      strongest in the top-performing assets, suggesting continued focus
      on these properties will maximize ROI. Funnel analysis indicates
      opportunity to improve mid-stage conversions through targeted follow-up.
    `
  };

  /* ---------- HELPERS ---------- */
  function trend(delta) {
    if (delta > 0) return `↑ ${delta}%`;
    if (delta < 0) return `↓ ${Math.abs(delta)}%`;
    return "—";
  }

  function metricCard(title, metric) {
    return `
      <div class="metric">
        <h3>${title}</h3>
        <div class="value">${metric.value.toLocaleString()}</div>
        <div class="delta">${trend(metric.delta)}</div>
      </div>
    `;
  }

  /* ---------- KPI SUMMARY ---------- */
  function renderKPIs() {
    const grid = $("kpiSummary");
    grid.innerHTML = `
      ${metricCard("Total Events", data.kpis.totalEvents)}
      ${metricCard("Property Views", data.kpis.propertyViews)}
      ${metricCard("High Severity Signals", data.kpis.highSeverity)}
      ${metricCard("Unique Properties", data.kpis.uniqueProperties)}
    `;
  }

  /* ---------- ENGAGEMENT (TEXT VERSION FOR NOW) ---------- */
  function renderEngagement() {
    const el = $("engagementChart");
    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Total Events</th>
            <th>Property Views</th>
          </tr>
        </thead>
        <tbody>
          ${data.engagementOverTime.map(d => `
            <tr>
              <td>${d.day}</td>
              <td>${d.events}</td>
              <td>${d.views}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  /* ---------- FUNNEL ---------- */
  function renderFunnel() {
    const tbody = $("funnelBody");
    let prev = null;

    tbody.innerHTML = data.funnel.map(stage => {
      const conv = prev ? ((stage.count / prev) * 100).toFixed(1) + "%" : "—";
      prev = stage.count;

      return `
        <tr>
          <td>${stage.stage}</td>
          <td>${stage.count}</td>
          <td>${conv}</td>
        </tr>
      `;
    }).join("");
  }

  /* ---------- EXEC SUMMARY ---------- */
  function renderSummary() {
    $("execSummary").innerHTML = `
      <div class="insight">${data.executiveSummary}</div>
    `;
  }

  /* ---------- INIT ---------- */
  function init() {
    $("reportStatus").textContent = "Live (Preview)";
    $("reportTime").textContent =
      new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

    renderKPIs();
    renderEngagement();
    renderFunnel();
    renderSummary();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
