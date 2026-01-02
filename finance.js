/* =========================================================
   ADEX HOLDINGS TRUST — FINANCE LOGIC
   finance.js
   Source of truth:
   - Property metadata: assets/financials.js (window.ADEX_DATA)
   - Financial records: Cloudflare Worker KV
========================================================= */

/* ---------------- CONFIG ---------------- */

const API_BASE = "/api/admin";
const FINANCE_BOOTSTRAP = `${API_BASE}/finance/bootstrap`;
const FINANCE_GET = `${API_BASE}/financials`;
const FINANCE_SAVE = `${API_BASE}/financials/update`;
const num = (v) =>
  Number(String(v || "").replace(/[^0-9.-]/g, "")) || 0;
/* ---------------- STATE ---------------- */

let PROPERTIES = [];
let FINANCIALS = {};
let SELECTED = new Set();
let READ_ONLY = false;

/* ---------------- HELPERS ---------------- */

const $ = (id) => document.getElementById(id);

const usd = (v) =>
  Number(v || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });

const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.ceil(
    (new Date(iso).getTime() - Date.now()) / 86400000
  );
};

/* ---------------- ACCESS ---------------- */

async function bootstrapFinance() {
  const res = await fetch(FINANCE_BOOTSTRAP, {
    credentials: "include"
  });

  if (!res.ok) {
    document.body.innerHTML =
      "<h2>Access expired. Please refresh and sign in.</h2>";
    throw new Error("Access denied");
  }

  const data = await res.json();
  READ_ONLY = !data.roles.includes("admin");
}

/* ---------------- PROPERTY LOADING ---------------- */

function loadProperties() {
  if (!window.ADEX_DATA) {
    throw new Error("assets/financials.js not loaded");
  }

  const rentals = window.ADEX_DATA.rentals || [];
  const lands = window.ADEX_DATA.lands || [];

  PROPERTIES = [...rentals, ...lands].filter(
    (p) => p.country === "USA"
  );
}

/* ---------------- FINANCIAL STORAGE ---------------- */

async function loadFinancials() {
  const res = await fetch(FINANCE_GET, {
    credentials: "include"
  });

  if (!res.ok) {
    throw new Error("Failed to load financial data");
  }

  const json = await res.json();
  FINANCIALS = json.financials || {};
}

/* ---------------- SELECTOR ---------------- */

function renderPropertySelector() {
  const sel = $("propertySelect");
  if (!sel) return;
  sel.innerHTML = "";

  PROPERTIES.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.state})`;
    sel.appendChild(opt);
  });
}

function onPropertySelect() {
  const sel = $("propertySelect");
  SELECTED = new Set(
    Array.from(sel.selectedOptions).map((o) => o.value)
  );
  renderTable();
}
if (PROPERTIES.length > 0) {
  $("propertySelect").selectedIndex = 0;
  onPropertySelect();
}
/* ---------------- CALCULATIONS ---------------- */

function annualize(value, period) {
  if (!value) return 0;
  if (period === "month") return value * 12;
  return value;
}

function computeAnnualPL(property, record = {}) {
  const rentAnnual =
    annualize(record.rent, "year") ||
    annualize(property.rent?.amount, property.rent?.period);

  const mortgageAnnual =
    annualize(record.mortgage, "year") ||
    annualize(property.Mortgage?.amount, property.Mortgage?.period);

  const hoaAnnual =
    annualize(record.hoa, "year") ||
    annualize(property.HOA?.amount, property.HOA?.period);

  const maintenanceAnnual = annualize(record.maintenance, "year");
  const taxAnnual =
    annualize(record.tax, "year") ||
    annualize(property.Taxes?.amount, property.Taxes?.period);

  const expenses =
    mortgageAnnual + hoaAnnual + maintenanceAnnual + taxAnnual;

  return {
    rentAnnual,
    expensesAnnual: expenses,
    netAnnual: rentAnnual - expenses,
    cashFlowMonthly: (rentAnnual - expenses) / 12
  };
}

/* ---------------- TABLE ---------------- */

function leaseBadge(end) {
  const d = daysUntil(end);
  if (d == null) return "—";
  if (d <= 30) return `<span class="badge red">30d</span>`;
  if (d <= 60) return `<span class="badge orange">60d</span>`;
  if (d <= 90) return `<span class="badge yellow">90d</span>`;
  return `<span class="badge green">Active</span>`;
}

function renderTable() {
  const body = $("financeBody");
  if (!body) return; // <-- IMPORTANT: input page has no table
  body.innerHTML = "";

  let totals = { rent: 0, expenses: 0, net: 0 };

  PROPERTIES.filter((p) => SELECTED.has(p.id)).forEach((p) => {
    const f = FINANCIALS[p.id] || {};
    const pl = computeAnnualPL(p, f);

    totals.rent += pl.rentAnnual;
    totals.expenses += pl.expensesAnnual;
    totals.net += pl.netAnnual;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${usd(pl.rentAnnual)}</td>
      <td>${usd(pl.expensesAnnual)}</td>
      <td class="${pl.netAnnual >= 0 ? "pos" : "neg"}">
        ${usd(pl.netAnnual)}
      </td>
      <td>${usd(pl.cashFlowMonthly)}</td>
      <td>${f.rentStartDate || "—"}</td>
      <td>${f.rentEndDate || "—"}</td>
      <td>${leaseBadge(f.rentEndDate)}</td>
      <td>
        ${
          READ_ONLY
            ? "🔒"
            : `<button onclick="openEditor('${p.id}')">Edit</button>`
        }
      </td>
    `;
    body.appendChild(tr);
  });

if ($("totalRent")) $("totalRent").textContent = usd(totals.rent);
if ($("totalExpenses")) $("totalExpenses").textContent = usd(totals.expenses);
if ($("totalNet")) $("totalNet").textContent = usd(totals.net);
}

/* ---------------- EDITOR ---------------- */
function openEditor(id) {
  if (!$("modal") || !$("editId")) {
    console.error("Editor modal not found in DOM");
    return;
  }
function openEditor(id) {
  const f = FINANCIALS[id] || {};

  $("editId").value = id;
  $("rent").value = f.rent || "";
  $("mortgage").value = f.mortgage || "";
  $("hoa").value = f.hoa || "";
  $("maintenance").value = f.maintenance || "";
  $("tax").value = f.tax || "";
  $("rentStart").value = f.rentStartDate || "";
  $("rentEnd").value = f.rentEndDate || "";
  $("deposit").value = f.deposit || "";

  $("modal").style.display = "block";
}

function closeEditor() {
  $("modal").style.display = "none";
}

/* ---------------- SAVE ---------------- */
if (READ_ONLY) {
  alert("You are in read-only mode.");
  return;
}
async function saveFinancials() {
  // --- HARD GUARD: ensure required DOM elements exist ---
  const requiredIds = [
    "editId",
    "rent",
    "mortgage",
    "hoa",
    "maintenance",
    "tax",
    "rentStart",
    "rentEnd",
    "deposit"
  ];

  for (const id of requiredIds) {
    const el = $(id);
    if (!el) {
      console.error(`saveFinancials(): Missing required element #${id}`);
      alert(`Internal error: Missing field "${id}". Please refresh the page.`);
      return;
    }
  }

  // --- SAFE VALUE EXTRACTION ---
  const payload = {
    propertyId: $("editId").value,

    rent: num($("rent").value),
    mortgage: num($("mortgage").value),
    hoa: num($("hoa").value),
    maintenance: num($("maintenance").value),
    tax: num($("tax").value),
    deposit: num($("deposit").value),
    rentStartDate: $("rentStart").value || null,
    rentEndDate: $("rentEnd").value || null,

  };

  // --- BASIC SANITY CHECK ---
  if (!payload.propertyId) {
    alert("No property selected. Unable to save.");
    return;
  }

  // --- SAVE TO BACKEND ---
  let res;
  try {
    res = await fetch(FINANCE_SAVE, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Network error while saving financials:", err);
    alert("Network error. Please try again.");
    return;
  }

  if (!res.ok) {
    console.error("Save failed:", await res.text());
    alert("Save failed. Please try again.");
    return;
  }

  // --- REFRESH STATE ---
  await loadFinancials();
  closeEditor();
  renderTable();
}

/* ---------------- INVESTOR MODE ---------------- */

function toggleInvestor() {
  READ_ONLY = !READ_ONLY;
  document.body.classList.toggle("investor", READ_ONLY);
  renderTable();
}

/* ---------------- PDF EXPORT ---------------- */

function exportPDF() {
  window.print();
}

/* ---------------- INIT ---------------- */

async function initFinance() {
  await bootstrapFinance();
  loadProperties();
  await loadFinancials();
  renderPropertySelector();
}

document.addEventListener("DOMContentLoaded", initFinance);
