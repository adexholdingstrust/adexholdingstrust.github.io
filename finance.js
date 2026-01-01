/* ======================================================
   FINANCE DASHBOARD — ADEX HOLDINGS TRUST
   ====================================================== */

const MAINT_KEY = "adex_finance_maintenance_v1";

const maintenanceStore = JSON.parse(
  localStorage.getItem(MAINT_KEY) || "{}"
);

/* -----------------------
   UTILITIES
----------------------- */

const usd = n =>
  `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0
  })}`;

function isUSProperty(p) {
  return (
    p?.country === "US" ||
    p?.country === "United States" ||
    p?.state
  );
}

/* -----------------------
   LOAD PROPERTIES
----------------------- */

const allProperties = (window.ADEX_PROPERTIES || [])
  .filter(isUSProperty);

const select = document.getElementById("propertySelect");

allProperties.forEach(p => {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = `${p.name} (${p.state || "US"})`;
  select.appendChild(opt);
});

/* -----------------------
   MAINTENANCE
----------------------- */

document.getElementById("saveMaintenance").onclick = () => {
  const val = Number(document.getElementById("maintenanceInput").value || 0);
  [...select.selectedOptions].forEach(o => {
    maintenanceStore[o.value] = val;
  });
  localStorage.setItem(MAINT_KEY, JSON.stringify(maintenanceStore));
  render();
};

/* -----------------------
   RENDER
----------------------- */

function render() {
  const selectedIds = [...select.selectedOptions].map(o => o.value);

  const rows = [];
  let totals = {
    rent: 0,
    mortgage: 0,
    hoa: 0,
    maintenance: 0,
    net: 0
  };

  allProperties
    .filter(p => selectedIds.length === 0 || selectedIds.includes(p.id))
    .forEach(p => {
      const rent = p.rent || 0;
      const mortgage = p.mortgage || 0;
      const hoa = p.hoa?.monthly || 0;
      const maintenance = maintenanceStore[p.id] || 0;

      const net = rent - mortgage - hoa - maintenance;

      totals.rent += rent;
      totals.mortgage += mortgage;
      totals.hoa += hoa;
      totals.maintenance += maintenance;
      totals.net += net;

      rows.push(`
        <tr>
          <td>${p.name}</td>
          <td>${usd(rent)}</td>
          <td>${usd(mortgage)}</td>
          <td>${usd(hoa)}</td>
          <td>${usd(maintenance)}</td>
          <td class="${net >= 0 ? "positive" : "negative"}">${usd(net)}</td>
          <td class="${net * 12 >= 0 ? "positive" : "negative"}">${usd(net * 12)}</td>
        </tr>
      `);
    });

  document.getElementById("financeTable").innerHTML = rows.join("");

  document.getElementById("summaryCards").innerHTML = `
    <div class="card">
      <h3>Total Monthly Rent</h3>
      <div class="value">${usd(totals.rent)}</div>
    </div>
    <div class="card">
      <h3>Total Monthly Costs</h3>
      <div class="value">${usd(
        totals.mortgage + totals.hoa + totals.maintenance
      )}</div>
    </div>
    <div class="card">
      <h3>Net Monthly Cash Flow</h3>
      <div class="value ${totals.net >= 0 ? "positive" : "negative"}">
        ${usd(totals.net)}
      </div>
    </div>
    <div class="card">
      <h3>Net Annual Cash Flow</h3>
      <div class="value ${totals.net * 12 >= 0 ? "positive" : "negative"}">
        ${usd(totals.net * 12)}
      </div>
    </div>
  `;
}

select.onchange = render;
render();
