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

function getActiveMonth() {
  return $("activeMonth")?.value || null;
}

const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.ceil(
    (new Date(iso).getTime() - Date.now()) / 86400000
  );
};

/* ---------------- HELPER TO SELECT PROPERTIES ---------------- */
function selectAllProperties() {
  const sel = document.getElementById("propertySelect");
  if (!sel) return;

  Array.from(sel.options).forEach(o => (o.selected = true));
  onPropertySelect();
}

function clearAllProperties() {
  const sel = document.getElementById("propertySelect");
  if (!sel) return;

  Array.from(sel.options).forEach(o => (o.selected = false));
  onPropertySelect();
}
// --- LOAD FINANCIALS ---
   function loadFinancialsIntoForm(propertyId) {
  const f = FINANCIALS[propertyId] || {};

  if ($("editId")) $("editId").value = propertyId;
  if ($("rent")) $("rent").value = f.rent || "";
  if ($("mortgage")) $("mortgage").value = f.mortgage || "";
  if ($("hoa")) $("hoa").value = f.hoa || "";
  if ($("hoaCompany")) $("hoaCompany").value = f.hoaCompany || "";
  if ($("hoaWebsite")) $("hoaWebsite").value = f.hoaWebsite || "";
  if ($("hoaPhone")) $("hoaPhone").value = f.hoaPhone || "";
  if ($("hoaEmail")) $("hoaEmail").value = f.hoaEmail || "";
  if ($("maintenance")) $("maintenance").value = f.maintenance || "";
  if ($("tax")) $("tax").value = f.tax || "";
  if ($("rentStart")) $("rentStart").value = f.rentStartDate || "";
  if ($("rentEnd")) $("rentEnd").value = f.rentEndDate || "";
  if ($("deposit")) $("deposit").value = f.deposit || "";
      renderMaintenanceActuals(propertyId);

}
/* ---------------- MAINTENANCE ACTUALS ---------------- */

function renderMaintenanceActuals(propertyId) {
  const list = $("maintenanceList");
  if (!list) return;

  const actuals =
    FINANCIALS[propertyId]?.maintenanceActuals || {};

  if (!Object.keys(actuals).length) {
    list.innerHTML = "<em>No monthly maintenance recorded</em>";
    return;
  }

  list.innerHTML = Object.entries(actuals)
    .sort()
    .map(([month, amount]) =>
      `<div>${month}: ${usd(amount)}</div>`
    )
    .join("");
}

function saveMaintenanceActual() {
  const propertyId = $("editId")?.value;
  const month = $("maintMonth")?.value;
  const amount = num($("maintAmount")?.value);

  if (!propertyId || !month) {
    alert("Select property and month");
    return;
  }

  FINANCIALS[propertyId] ||= {};
  FINANCIALS[propertyId].maintenanceActuals ||= {};
  FINANCIALS[propertyId].maintenanceActuals[month] = amount;

  renderMaintenanceActuals(propertyId);
}

/* ---------------- lease-risk helper function---------------- */
function leaseRiskChip(endDate) {
  if (!endDate) return "—";

  const today = new Date();
  const end = new Date(endDate);
  const days = Math.ceil((end - today) / 86400000);

  if (days < 0) {
    return `<span class="riskChip risk-expired">Expired</span>`;
  }
  if (days <= 30) {
    return `<span class="riskChip risk-30">30d</span>`;
  }
  if (days <= 60) {
    return `<span class="riskChip risk-60">60d</span>`;
  }
  if (days <= 90) {
    return `<span class="riskChip risk-90">90d</span>`;
  }
  return `<span class="riskChip risk-safe">Active</span>`;
}
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

Object.values(FINANCIALS).forEach(f => {
  f.maintenanceActuals ||= {};
});

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
  const values = Array.from(sel.selectedOptions).map(o => o.value);

  SELECTED = new Set(values);

  // Auto-load editor fields if exactly one property is selected
  if (values.length === 1) {
    loadFinancialsIntoForm(values[0]);
  }

  renderTable();
  renderHOATable();
}

/* ✅ ADD THIS FUNCTION RIGHT HERE */
function bindFinancialsSelect() {
  const sel = $("propertySelect");
  if (!sel) return;

  sel.addEventListener("change", () => {
    if (sel.value) {
      loadFinancialsIntoForm(sel.value);
    }
  });
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
/* ---------------- COMPUTING NEW ---------------- */
function computeMonthlyPL(property, record = {}, month) {
  const rent = record.rent || 0;
  const mortgage = record.mortgage || 0;
  const hoa = record.hoa || 0;
  const tax = (record.tax || 0) / 12;

  const maintenance =
    record.maintenanceActuals?.[month] ??
    record.maintenance ??
    0;

  const expenses =
    mortgage + hoa + tax + maintenance;

  return {
    rent,
    expenses,
    net: rent - expenses,
    maintenance
  };
}
/* ---------------- TABLE ---------------- */
function openPropertyModal(property) {
  const f = FINANCIALS[property.id] || {};

  const rent = Number(f.rent || 0);
  const mortgage = Number(f.mortgage || 0);
  const hoa = Number(f.hoa || 0);
  const maintenance = Number(f.maintenance || 0);
  const tax = Number(f.tax || 0);

  const expenses = mortgage + hoa + tax;
  const monthlyNet = rent - expenses;
  const annualNet = monthlyNet * 12;

  document.getElementById("modalTitle").textContent = property.name;

  document.getElementById("modalContent").innerHTML = `
    <div class="modalGrid">
      <div class="modalItem">
        <div class="modalLabel">Monthly Rent</div>
        <div class="modalValue">$${rent}</div>
      </div>

      <div class="modalItem">
        <div class="modalLabel">Security Deposit</div>
        <div class="modalValue">$${f.deposit || 0}</div>
      </div>

      <div class="modalItem">
        <div class="modalLabel">Mortgage</div>
        <div class="modalValue">$${mortgage}</div>
      </div>

      <div class="modalItem">
        <div class="modalLabel">HOA</div>
        <div class="modalValue">$${hoa}</div>
      </div>

      <div class="modalItem">
        <div class="modalLabel">Maintenance</div>
        <div class="modalValue">$${maintenance}</div>
      </div>

      <div class="modalItem">
        <div class="modalLabel">Taxes</div>
        <div class="modalValue">$${tax}</div>
      </div>

      <div class="modalItem">
        <div class="modalLabel">Total Monthly Expenses</div>
        <div class="modalValue">$${expenses}</div>
      </div>

      <div class="modalItem">
        <div class="modalLabel">Monthly Cash Flow</div>
        <div class="modalValue ${monthlyNet >= 0 ? "pos" : "neg"}">$${monthlyNet}</div>
      </div>

      <div class="modalItem">
        <div class="modalLabel">Annual P&L</div>
        <div class="modalValue ${annualNet >= 0 ? "pos" : "neg"}">$${annualNet}</div>
      </div>

      <div class="modalItem">
        <div class="modalLabel">Lease Term</div>
        <div class="modalValue">
          ${f.rentStartDate || "—"} → ${f.rentEndDate || "—"}
          <div style="margin-top:6px">${leaseRiskChip(f.rentEndDate)}</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("propertyModal").style.display = "block";
}

function closePropertyModal() {
  const m = $("propertyModal");
  if (!m) return;
  m.style.display = "none";
}

function leaseBadge(end) {
  const d = daysUntil(end);
  if (d == null) return "—";
  if (d <= 30) return `<span class="badge red">30d</span>`;
  if (d <= 60) return `<span class="badge orange">60d</span>`;
  if (d <= 90) return `<span class="badge yellow">90d</span>`;
  return `<span class="badge green">Active</span>`;
}
let previousKpis = {
  rent: null,
  expenses: null,
  net: null,
  annual: null
};

function updateDelta(id, prev, curr) {
  const el = document.getElementById(id);
  if (!el || prev === null || prev === curr) {
    if (el) el.classList.remove("show");
    return;
  }

  const diff = curr - prev;
  const up = diff > 0;

  el.textContent = `${up ? "↑" : "↓"} $${Math.abs(diff)}`;
  el.className = `kpiDelta ${up ? "up" : "down"} show`;
}

function reserveStress(netMonthly, reserve = 5000) {
  if (netMonthly >= 0) return "🟢 Stable";

  const months = Math.floor(
    reserve / Math.abs(netMonthly)
  );

  if (months >= 6) return "🟡 Watch";
  return "🔴 High Risk";
}

// Store for next comparison

function renderTable() {
  const body = $("financeBody");
  if (!body) return; // <-- IMPORTANT: input page has no table
  body.innerHTML = "";

  let totals = {
  rent: 0,
  expenses: 0,
  net: 0,
  deposits: 0
};
    const month = getActiveMonth();
    const isMonthly = Boolean(month);
if ($("rentHeader")) {
  $("rentHeader").textContent = isMonthly ? "Monthly Rent" : "Annual Rent";
}
if ($("expenseHeader")) {
  $("expenseHeader").textContent = isMonthly ? "Monthly Expenses" : "Annual Expenses";
}
if ($("netHeader")) {
  $("netHeader").textContent = isMonthly ? "Monthly Net" : "Annual Net";
}

  PROPERTIES.filter((p) => SELECTED.has(p.id)).forEach((p) => {
    const f = FINANCIALS[p.id] || {};

let pl;
let rentVal = 0;
let expenseVal = 0;
let netVal = 0;
let cashFlowVal = 0;

if (month) {
  pl = computeMonthlyPL(p, f, month);
  rentVal = pl.rent;
  expenseVal = pl.expenses;
  netVal = pl.net;
  cashFlowVal = pl.net;
} else {
  pl = computeAnnualPL(p, f);
  rentVal = pl.rentAnnual;
  expenseVal = pl.expensesAnnual;
  netVal = pl.netAnnual;
  cashFlowVal = pl.cashFlowMonthly;
}

totals.rent += rentVal;
totals.expenses += expenseVal;
totals.net += netVal;
totals.deposits += Number(f.deposit || 0);

    const tr = document.createElement("tr");
   tr.style.cursor = "pointer";
   tr.onclick = () => openPropertyModal(p);
    tr.innerHTML = `
  <td>${p.name}</td>
  <td>${usd(rentVal)}</td>
<td>${usd(expenseVal)}</td>
<td class="${netVal >= 0 ? "pos" : "neg"}">
  ${usd(netVal)}
</td>
<td>${usd(cashFlowVal)}</td>

<td>${reserveStress(cashFlowVal)}</td>
  <td>
    ${f.rentStartDate || "—"} → ${f.rentEndDate || "—"}
    <div style="margin-top:4px">
      ${leaseRiskChip(f.rentEndDate)}
    </div>
  </td>

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

// ---- Totals UI ----
if ($("totalRent")) $("totalRent").textContent = usd(totals.rent);
if ($("totalExpenses")) $("totalExpenses").textContent = usd(totals.expenses);
if ($("totalNet")) $("totalNet").textContent = usd(totals.net);

// ---- KPI values ----
if ($("kpiRent")) $("kpiRent").textContent = usd(totals.rent);
if ($("kpiExpenses")) $("kpiExpenses").textContent = usd(totals.expenses);
if ($("kpiNet")) $("kpiNet").textContent = usd(totals.net);
if ($("kpiAnnual")) $("kpiAnnual").textContent = usd(totals.net * 12);
if ($("kpiDeposits")) {  $("kpiDeposits").textContent = usd(totals.deposits);}


// ---- KPI deltas ----
const current = {
  rent: totals.rent,
  expenses: totals.expenses,
  net: totals.net,
  annual: totals.net * 12
};

updateDelta("kpiRentDelta", previousKpis.rent, current.rent);
updateDelta("kpiExpensesDelta", previousKpis.expenses, current.expenses);
updateDelta("kpiNetDelta", previousKpis.net, current.net);
updateDelta("kpiAnnualDelta", previousKpis.annual, current.annual);
// ✅ NEW: persist baseline for next render
previousKpis = { ...current };
   } // ✅ CLOSE renderTable() HERE
/* ---------------- EDITOR ---------------- */
function openEditor(id) {
  const f = FINANCIALS[id] || {};

  if (!$("modal") || !$("editId")) return;

  $("editId").value = id;
  $("rent").value = f.rent || "";
  $("mortgage").value = f.mortgage || "";
  $("hoa").value = f.hoa || "";
  $("hoaCompany").value = f.hoaCompany || "";
  $("hoaWebsite").value = f.hoaWebsite || "";
  $("hoaPhone").value = f.hoaPhone || "";
  $("hoaEmail").value = f.hoaEmail || "";
  $("maintenance").value = f.maintenance || "";
  $("tax").value = f.tax || "";
  $("rentStart").value = f.rentStartDate || "";
  $("rentEnd").value = f.rentEndDate || "";
  $("deposit").value = f.deposit || "";

  $("modal").style.display = "block";
}

function closeEditor() {
  const m = $("modal");
  if (!m) return;
  m.style.display = "none";
}

   document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePropertyModal();
});


async function saveFinancials() {
  const requiredIds = [
    "editId",
    "rent",
    "mortgage",
    "hoa",
    "hoaCompany",
    "hoaWebsite",
    "hoaPhone",
    "hoaEmail",
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

  const payload = {
    propertyId: $("editId").value,

    // Financials
    rent: num($("rent").value),
    mortgage: num($("mortgage").value),
    hoa: num($("hoa").value),
    maintenance: num($("maintenance").value),
    tax: num($("tax").value),
    deposit: num($("deposit").value),

    // Lease
    rentStartDate: $("rentStart").value || null,
    rentEndDate: $("rentEnd").value || null,

    // HOA Metadata
    hoaCompany: $("hoaCompany").value || null,
    hoaWebsite: $("hoaWebsite").value || null,
    hoaPhone: $("hoaPhone").value || null,
    hoaEmail: $("hoaEmail").value || null
  };

  if (!payload.propertyId) {
    alert("No property selected. Unable to save.");
    return;
  }

  // ✅ SAFE MERGE (this is where it belongs)
  const existing = FINANCIALS[payload.propertyId] || {};

  payload.hoaCompany ??= existing.hoaCompany ?? null;
  payload.hoaWebsite ??= existing.hoaWebsite ?? null;
  payload.hoaPhone ??= existing.hoaPhone ?? null;
  payload.hoaEmail ??= existing.hoaEmail ?? null;

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

  await loadFinancials();
  closeEditor();
  renderTable();
  renderHOATable();
}

/* ---------------- INVESTOR MODE ---------------- */

function toggleInvestor() {
  READ_ONLY = !READ_ONLY;
  document.body.classList.toggle("investor", READ_ONLY);
  renderTable();
  renderHOATable();
}

/* ---------------- PDF EXPORT ---------------- */

function exportPDF() {
  window.print();
}
/* ============================
   HOA TABLE RENDERER
============================ */
function renderHOATable() {
  const body = document.getElementById("hoaBody");
  if (!body) return;

  body.innerHTML = "";

  PROPERTIES
  .filter(p => SELECTED.size === 0 || SELECTED.has(p.id))
  .forEach(p => {
    const f = FINANCIALS[p.id] || {};

    body.innerHTML += `
      <tr>
        <td>${p.name}</td>
        <td>${f.hoaCompany || "—"}</td>
        <td>${
          f.hoaWebsite
            ? `<a href="${f.hoaWebsite}" target="_blank" rel="noopener">${f.hoaWebsite}</a>`
            : "—"
        }</td>
        <td>${f.hoaPhone || "—"}</td>
        <td>${
          f.hoaEmail
            ? `<a href="mailto:${f.hoaEmail}">${f.hoaEmail}</a>`
            : "—"
        }</td>
      </tr>
    `;
  });
}
/* ---------------- INIT ---------------- */
const PAGE = document.body.dataset.page;
async function initFinance() {
  await bootstrapFinance();
  loadProperties();
  await loadFinancials();
  renderPropertySelector();
  bindFinancialsSelect(); 

  // ✅ NEW: auto-select first property
  const sel = $("propertySelect");
  if (sel && sel.options.length) {
    sel.options[0].selected = true;
    onPropertySelect();
  }

  renderTable();
  renderHOATable(); // ✅ Adding this for the new display
}


// document.addEventListener("DOMContentLoaded", initFinance);
document.addEventListener("DOMContentLoaded", () => {
  if (PAGE === "finance") {
    initFinance();
  }
});

