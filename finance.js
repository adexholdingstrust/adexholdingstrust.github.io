/* =========================================================
   ADEX HOLDINGS TRUST — finance.js
   Read-only analytics + admin-safe financial aggregation
========================================================= */

/* ---------------- CONFIG ---------------- */

const FINANCE_API_BASE = "/api/admin"; // Access protected
const FINANCE_KV_ENDPOINT = `${FINANCE_API_BASE}/financials`; // future-proof
const CURRENCY = "USD";

/* ---------------- UTILITIES ---------------- */

function fmtCurrency(n) {
  if (typeof n !== "number" || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0
  }).format(n);
}

function toNumber(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function onlyUS(properties) {
  return properties.filter(p => p.country === "USA");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.ceil((d2 - d1) / 86400000);
}

/* ---------------- DATA LOADERS ---------------- */

/**
 * Load static financial baseline from assets/financials.js
 */
function loadStaticFinancials() {
  if (!window.ADEX_DATA) {
    console.error("ADEX_DATA missing");
    return [];
  }

  const rentals = window.ADEX_DATA.rentals || [];
  const lands = window.ADEX_DATA.lands || [];

  return onlyUS([...rentals, ...lands]);
}

/**
 * Load KV overrides (maintenance, edits, etc.)
 * Safe if endpoint does not yet exist
 */
async function loadKVFinancialOverrides() {
  try {
    const res = await fetch(`${FINANCE_KV_ENDPOINT}`, {
      cache: "no-store"
    });
    if (!res.ok) return {};
    const json = await res.json();
    return json.data || {};
  } catch {
    return {};
  }
}

/* ---------------- FINANCIAL COMPUTATION ---------------- */

/**
 * Normalize a property into a single financial model
 */
function normalizeProperty(base, override = {}) {
  const rent =
    toNumber(override.rent ?? base.rent?.amount);

  const mortgage =
    toNumber(override.mortgage ?? base.Mortgage?.amount);

  const hoa =
    toNumber(override.hoa ?? base.HOA?.amount);

  const taxes =
    toNumber(
      override.tax ??
      base.Taxes?.amount ??
      base.Payments?.amount
    );

  const maintenance =
    toNumber(override.maintenance ?? 0);

  const income = rent;
  const expenses = mortgage + hoa + taxes + maintenance;
  const net = income - expenses;

  return {
    id: base.id,
    name: base.name,
    type: base.type || "Land",
    state: base.state,
    acres: base.acres || null,

    income,
    expenses,
    net,

    breakdown: {
      rent,
      mortgage,
      hoa,
      taxes,
      maintenance
    },

    leaseEnd: override.leaseEnd || base.leaseEnd || null
  };
}

/**
 * Calculate portfolio summary
 */
function computePortfolioSummary(properties) {
  return properties.reduce(
    (acc, p) => {
      acc.totalIncome += p.income;
      acc.totalExpenses += p.expenses;
      acc.net += p.net;
      return acc;
    },
    { totalIncome: 0, totalExpenses: 0, net: 0 }
  );
}

/* ---------------- LEASE ALERTS ---------------- */

/**
 * Compute lease warnings (90 / 60 / 30 days)
 */
function computeLeaseAlerts(property) {
  if (!property.leaseEnd) return null;

  const days = daysBetween(todayISO(), property.leaseEnd);

  if (days <= 30) return { level: "30", days };
  if (days <= 60) return { level: "60", days };
  if (days <= 90) return { level: "90", days };

  return null;
}

/* ---------------- RENDER HELPERS ---------------- */

/**
 * Render portfolio KPIs
 */
function renderKPIs(summary) {
  document.getElementById("kpiIncome").textContent =
    fmtCurrency(summary.totalIncome);

  document.getElementById("kpiExpenses").textContent =
    fmtCurrency(summary.totalExpenses);

  document.getElementById("kpiNet").textContent =
    fmtCurrency(summary.net);
}

/**
 * Render property table
 */
function renderTable(properties) {
  const tbody = document.getElementById("financeTableBody");
  tbody.innerHTML = "";

  properties.forEach(p => {
    const alert = computeLeaseAlerts(p);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.state}</td>
      <td>${fmtCurrency(p.income)}</td>
      <td>${fmtCurrency(p.expenses)}</td>
      <td class="${p.net >= 0 ? "pos" : "neg"}">
        ${fmtCurrency(p.net)}
      </td>
      <td>
        ${
          alert
            ? `<span class="alert alert-${alert.level}">
                 ${alert.days} days
               </span>`
            : "—"
        }
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/* ---------------- MAIN BOOTSTRAP ---------------- */

async function initFinanceDashboard() {
  const base = loadStaticFinancials();
  const overrides = await loadKVFinancialOverrides();

  const normalized = base.map(p =>
    normalizeProperty(p, overrides[p.id])
  );

  const summary = computePortfolioSummary(normalized);

  renderKPIs(summary);
  renderTable(normalized);
}

/* ---------------- AUTO INIT ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("financeTableBody")) {
    initFinanceDashboard();
  }
});
