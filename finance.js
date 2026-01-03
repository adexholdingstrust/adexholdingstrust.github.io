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

const num = (v) => Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;

/* ---------------- STATE ---------------- */

let PROPERTIES = [];
let FINANCIALS = {};
let SELECTED = new Set();
let READ_ONLY = false;

/* ---------------- HELPERS ---------------- */

const $ = (id) => document.getElementById(id);

const usd = (v) =>
  Number(v || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

function getActiveMonth() {
  return $("activeMonth")?.value || null;
}

const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
};

/* ---------------- PROPERTY MULTI-SELECT HELPERS ---------------- */

function selectAllProperties() {
  const sel = $("propertySelect");
  if (!sel) return;

  Array.from(sel.options).forEach((o) => (o.selected = true));
  onPropertySelect();
}

function clearAllProperties() {
  const sel = $("propertySelect");
  if (!sel) return;

  Array.from(sel.options).forEach((o) => (o.selected = false));
  onPropertySelect();
}

/* ---------------- FORM LOADER ---------------- */

function loadFinancialsIntoForm(propertyId) {
  const f = FINANCIALS[propertyId] || {};

  if ($("editId")) $("editId").value = propertyId;
  if ($("rent")) $("rent").value = f.rent ?? "";
  if ($("mortgage")) $("mortgage").value = f.mortgage ?? "";
  if ($("hoa")) $("hoa").value = f.hoa ?? "";
  if ($("hoaCompany")) $("hoaCompany").value = f.hoaCompany ?? "";
  if ($("hoaWebsite")) $("hoaWebsite").value = f.hoaWebsite ?? "";
  if ($("hoaPhone")) $("hoaPhone").value = f.hoaPhone ?? "";
  if ($("hoaEmail")) $("hoaEmail").value = f.hoaEmail ?? "";
  if ($("maintenance")) $("maintenance").value = f.maintenance ?? "";
  if ($("tax")) $("tax").value = f.tax ?? "";
  if ($("rentStart")) $("rentStart").value = f.rentStartDate ?? "";
  if ($("rentEnd")) $("rentEnd").value = f.rentEndDate ?? "";
  if ($("deposit")) $("deposit").value = f.deposit ?? "";

  renderMaintenanceActuals(propertyId);
}

/* ---------------- MAINTENANCE ACTUALS ---------------- */

function renderMaintenanceActuals(propertyId) {
  const list = $("maintenanceList");
  if (!list) return;

  const actuals = FINANCIALS[propertyId]?.maintenanceActuals || {};

  if (!Object.keys(actuals).length) {
    list.innerHTML = "<em>No monthly maintenance recorded</em>";
    return;
  }

  list.innerHTML = Object.entries(actuals)
    .sort()
    .map(([month, amount]) => `<div>${month}: ${usd(amount)}</div>`)
    .join("");
}

function saveMaintenanceActual() {
  const propertyId =
    $("editId")?.value ||
    Array.from($("propertySelect")?.selectedOptions || []).map((o) => o.value)[0];

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

/* ---------------- LEASE RISK ---------------- */

function leaseRiskChip(endDate) {
  if (!endDate) return "—";

  const today = new Date();
  const end = new Date(endDate);
  const days = Math.ceil((end - today) / 86400000);

  if (days < 0) return `<span class="riskChip risk-expired">Expired</span>`;
  if (days <= 30) return `<span class="riskChip risk-30">30d</span>`;
  if (days <= 60) return `<span class="riskChip risk-60">60d</span>`;
  if (days <= 90) return `<span class="riskChip risk-90">90d</span>`;
  return `<span class="riskChip risk-safe">Active</span>`;
}

function leaseBadge(end) {
  const d = daysUntil(end);
  if (d == null) return "—";
  if (d <= 30) return `<span class="badge red">30d</span>`;
  if (d <= 60) return `<span class="badge orange">60d</span>`;
  if (d <= 90) return `<span class="badge yellow">90d</span>`;
  return `<span class="badge green">Active</span>`;
}

/* ---------------- ACCESS ---------------- */

async function bootstrapFinance() {
  const res = await fetch(FINANCE_BOOTSTRAP, { credentials: "include" });

  if (!res.ok) {
    document.body.innerHTML = "<h2>Access expired. Please refresh and sign in.</h2>";
    throw new Error("Access denied");
  }

  const data = await res.json();
  READ_ONLY = !Array.isArray(data.roles) || !data.roles.includes("admin");
}

/* ---------------- PROPERTY LOADING ---------------- */

function loadProperties() {
  if (!window.ADEX_DATA) throw new Error("assets/financials.js not loaded");

  const rentals = window.ADEX_DATA.rentals || [];
  const lands = window.ADEX_DATA.lands || [];

  // IMPORTANT: If your data uses "US" instead of "USA", this filter would wipe everything.
  // Keep your original behavior but allow "US" too to prevent empty dropdowns.
  PROPERTIES = [...rentals, ...lands].filter((p) => (p.country || "").toUpperCase() === "USA" || (p.country || "").toUpperCase() === "US");
}

/* ---------------- FINANCIAL STORAGE ---------------- */

async function loadFinancials() {
  const res = await fetch(FINANCE_GET, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load financial data");

  const json = await res.json();
  FINANCIALS = json.financials || {};

  Object.values(FINANCIALS).forEach((f) => {
    f.maintenanceActuals ||= {};
  });
}

/* ---------------- SELECTOR ---------------- */

function renderPropertySelector() {
  const sel = $("propertySelect");
  if (!sel) return;

  sel.innerHTML = "";

  // On single-select pages (financials.html), a placeholder is helpful
  const page = document.body?.dataset?.page;
  if (page === "financials") {
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Select property…";
    sel.appendChild(ph);
  }

  PROPERTIES.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.state ? `${p.name} (${p.state})` : p.name;
    sel.appendChild(opt);
  });
}

function onPropertySelect() {
  const sel = $("propertySelect");
  if (!sel) return;

  const values = Array.from(sel.selectedOptions).map((o) => o.value).filter(Boolean);
  SELECTED = new Set(values);

  if (values.length === 1) loadFinancialsIntoForm(values[0]);

  renderTable();
  renderHOATable();
}

function bindFinancialsSelect() {
  const sel = $("propertySelect");
  if (!sel) return;

  sel.addEventListener("change", () => {
    onPropertySelect();
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

  const expensesAnnual = mortgageAnnual + hoaAnnual + maintenanceAnnual + taxAnnual;

  return {
    rentAnnual,
    mortgageAnnual,
    hoaAnnual,
    maintenanceAnnual,
    taxAnnual,
    expensesAnnual,
    netAnnual: rentAnnual - expensesAnnual,
    cashFlowMonthly: (rentAnnual - expensesAnnual) / 12
  };
}

function computeMonthlyPL(property, record = {}, month) {
  const rent = num(record.rent);
  const mortgage = num(record.mortgage);
  const hoa = num(record.hoa);
  const tax = num(record.tax) / 12;

  const maintenance =
    record.maintenanceActuals?.[month] ??
    record.maintenance ??
    0;

  const maintenanceVal = num(maintenance);
  const expenses = mortgage + hoa + tax + maintenanceVal;

  return {
    rent,
    mortgage,
    hoa,
    maintenance: maintenanceVal,
    tax,
    expenses,
    net: rent - expenses
  };
}

/* ---------------- TABLE + MODAL ---------------- */

function openPropertyModal(property) {
  const f = FINANCIALS[property.id] || {};

  const rent = num(f.rent);
  const mortgage = num(f.mortgage);
  const hoa = num(f.hoa);
  const maintenance = num(f.maintenance);
  const tax = num(f.tax);

  const expenses = mortgage + hoa + maintenance + tax;
  const monthlyNet = rent - expenses;
  const annualNet = monthlyNet * 12;

  $("modalTitle").textContent = property.name;

  $("modalContent").innerHTML = `
    <div class="modalGrid">
      <div class="modalItem"><div class="modalLabel">Monthly Rent</div><div class="modalValue">${usd(rent)}</div></div>
      <div class="modalItem"><div class="modalLabel">Security Deposit</div><div class="modalValue">${usd(f.deposit || 0)}</div></div>
      <div class="modalItem"><div class="modalLabel">Mortgage</div><div class="modalValue">${usd(mortgage)}</div></div>
      <div class="modalItem"><div class="modalLabel">HOA</div><div class="modalValue">${usd(hoa)}</div></div>
      <div class="modalItem"><div class="modalLabel">Maintenance</div><div class="modalValue">${usd(maintenance)}</div></div>
      <div class="modalItem"><div class="modalLabel">Taxes</div><div class="modalValue">${usd(tax)}</div></div>
      <div class="modalItem"><div class="modalLabel">Total Monthly Expenses</div><div class="modalValue">${usd(expenses)}</div></div>
      <div class="modalItem"><div class="modalLabel">Monthly Cash Flow</div><div class="modalValue ${monthlyNet >= 0 ? "pos" : "neg"}">${usd(monthlyNet)}</div></div>
      <div class="modalItem"><div class="modalLabel">Annual P&L</div><div class="modalValue ${annualNet >= 0 ? "pos" : "neg"}">${usd(annualNet)}</div></div>
      <div class="modalItem">
        <div class="modalLabel">Lease Term</div>
        <div class="modalValue">
          ${f.rentStartDate || "—"} → ${f.rentEndDate || "—"}
          <div style="margin-top:6px">${leaseRiskChip(f.rentEndDate)}</div>
        </div>
      </div>
    </div>
  `;

  $("propertyModal").style.display = "block";
}

function closePropertyModal() {
  const m = $("propertyModal");
  if (!m) return;
  m.style.display = "none";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePropertyModal();
});

function renderTable() {
  const body = $("financeBody");
  if (!body) return; // financials.html does not have the table

  body.innerHTML = "";

  const month = getActiveMonth();
  const isMonthly = Boolean(month);

  // If nothing selected on finance page, show all (so the dashboard never looks empty)
  const selectedIds =
    SELECTED.size > 0 ? Array.from(SELECTED) : PROPERTIES.map((p) => p.id);

  const totals = { rent: 0, expenses: 0, net: 0, deposits: 0 };

  PROPERTIES.filter((p) => selectedIds.includes(p.id)).forEach((p) => {
    const f = FINANCIALS[p.id] || {};

    let rentVal = 0, mortgageVal = 0, hoaVal = 0, maintVal = 0, taxVal = 0, expensesVal = 0, netVal = 0, annualNetVal = 0;

    if (isMonthly) {
      const pl = computeMonthlyPL(p, f, month);
      rentVal = pl.rent;
      mortgageVal = pl.mortgage;
      hoaVal = pl.hoa;
      maintVal = pl.maintenance;
      taxVal = pl.tax;
      expensesVal = pl.expenses;
      netVal = pl.net;
      annualNetVal = pl.net * 12;
    } else {
      // For the breakdown table, keep the monthly components from KV (what your UI expects)
      rentVal = num(f.rent);
      mortgageVal = num(f.mortgage);
      hoaVal = num(f.hoa);
      maintVal = num(f.maintenance);
      taxVal = num(f.tax);

      expensesVal = mortgageVal + hoaVal + maintVal + taxVal;
      netVal = rentVal - expensesVal;
      annualNetVal = netVal * 12;
    }

    totals.rent += rentVal;
    totals.expenses += expensesVal;
    totals.net += netVal;
    totals.deposits += num(f.deposit);

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = () => openPropertyModal(p);

    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${usd(rentVal)}</td>
      <td>${usd(mortgageVal)}</td>
      <td>${usd(hoaVal)}</td>
      <td>${usd(maintVal)}</td>
      <td>${usd(taxVal)}</td>
      <td>${usd(expensesVal)}</td>
      <td class="${netVal >= 0 ? "pos" : "neg"}">${usd(netVal)}</td>
      <td class="${annualNetVal >= 0 ? "pos" : "neg"}">${usd(annualNetVal)}</td>
      <td>${usd(f.deposit || 0)}</td>
      <td>
        ${f.rentStartDate || "—"} → ${f.rentEndDate || "—"}
        <div style="margin-top:4px">${leaseRiskChip(f.rentEndDate)}</div>
      </td>
      <td>${leaseBadge(f.rentEndDate)}</td>
      <td>${READ_ONLY ? "🔒" : `<button onclick="event.stopPropagation(); openEditor('${p.id}')">Edit</button>`}</td>
    `;

    body.appendChild(tr);
  });

  if ($("totalRent")) $("totalRent").textContent = usd(totals.rent);
  if ($("totalExpenses")) $("totalExpenses").textContent = usd(totals.expenses);
  if ($("totalNet")) $("totalNet").textContent = usd(totals.net);

  if ($("kpiRent")) $("kpiRent").textContent = usd(totals.rent);
  if ($("kpiExpenses")) $("kpiExpenses").textContent = usd(totals.expenses);
  if ($("kpiNet")) $("kpiNet").textContent = usd(totals.net);
  if ($("kpiAnnual")) $("kpiAnnual").textContent = usd(totals.net * 12);
  if ($("kpiDeposits")) $("kpiDeposits").textContent = usd(totals.deposits);
}

/* ---------------- EDITOR ---------------- */

function openEditor(id) {
  const f = FINANCIALS[id] || {};
  if (!$("modal") || !$("editId")) return;

  $("editId").value = id;
  $("rent").value = f.rent ?? "";
  $("mortgage").value = f.mortgage ?? "";
  $("hoa").value = f.hoa ?? "";
  $("hoaCompany").value = f.hoaCompany ?? "";
  $("hoaWebsite").value = f.hoaWebsite ?? "";
  $("hoaPhone").value = f.hoaPhone ?? "";
  $("hoaEmail").value = f.hoaEmail ?? "";
  $("maintenance").value = f.maintenance ?? "";
  $("tax").value = f.tax ?? "";
  $("rentStart").value = f.rentStartDate ?? "";
  $("rentEnd").value = f.rentEndDate ?? "";
  $("deposit").value = f.deposit ?? "";

  $("modal").style.display = "block";
}

function closeEditor() {
  const m = $("modal");
  if (!m) return;
  m.style.display = "none";
}

async function saveFinancials() {
  const requiredIds = [
    "rent","mortgage","hoa","hoaCompany","hoaWebsite","hoaPhone","hoaEmail",
    "maintenance","tax","rentStart","rentEnd","deposit"
  ];

  for (const id of requiredIds) {
    const el = $(id);
    if (!el) {
      console.error(`saveFinancials(): Missing required element #${id}`);
      alert(`Internal error: Missing field "${id}". Please refresh the page.`);
      return;
    }
  }

  const propertyId =
    $("editId")?.value ||
    Array.from($("propertySelect")?.selectedOptions || []).map((o) => o.value)[0];

  if (!propertyId) {
    alert("No property selected. Unable to save.");
    return;
  }

  const existing = FINANCIALS[propertyId] || {};

  const payload = {
    propertyId,
    rent: num($("rent").value),
    mortgage: num($("mortgage").value),
    hoa: num($("hoa").value),
    maintenance: num($("maintenance").value),
    tax: num($("tax").value),
    deposit: num($("deposit").value),
    rentStartDate: $("rentStart").value || null,
    rentEndDate: $("rentEnd").value || null,
    hoaCompany: $("hoaCompany").value || existing.hoaCompany || null,
    hoaWebsite: $("hoaWebsite").value || existing.hoaWebsite || null,
    hoaPhone: $("hoaPhone").value || existing.hoaPhone || null,
    hoaEmail: $("hoaEmail").value || existing.hoaEmail || null
  };

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

/* ---------------- HOA TABLE ---------------- */

function renderHOATable() {
  const body = $("hoaBody");
  if (!body) return;

  body.innerHTML = "";

  // Show all properties if nothing selected, otherwise show selected
  const selectedIds =
    SELECTED.size > 0 ? Array.from(SELECTED) : PROPERTIES.map((p) => p.id);

  PROPERTIES.filter((p) => selectedIds.includes(p.id)).forEach((p) => {
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

const PAGE = document.body?.dataset?.page;

async function initFinance() {
  try {
    await bootstrapFinance();
    loadProperties();
    await loadFinancials();

    renderPropertySelector();
    bindFinancialsSelect();

    // Finance dashboard should never look empty
    if (PAGE === "finance") {
      const sel = $("propertySelect");
      if (sel && sel.options.length) {
        Array.from(sel.options).forEach((o) => (o.selected = true));
        onPropertySelect();
      }
    }

    // financials.html: do NOT auto-select; user picks one
    renderTable();
    renderHOATable();
  } catch (e) {
    console.error("initFinance failed:", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (PAGE === "finance" || PAGE === "financials") initFinance();
});


console.log("ADEX_DATA?", window.ADEX_DATA);
console.log("PROPERTIES length:", PROPERTIES.length);
