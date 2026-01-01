"use strict";

/* ===========================
   PROPERTY FINANCIAL DATA
=========================== */

const PROPERTIES = [
  {
    id: "co-townhouse",
    name: "Colorado Townhouse",
    leaseStart: "2024-03-01",
    leaseEnd: "2025-03-01",
    rent: 2400,
    mortgage: 1650,
    hoa: {
      name: "Pine Ridge HOA",
      contact: "hoa@pineridge.org",
      monthly: 280
    },
    securityDeposit: 2400,
    maintenance: 0
  }
];

/* ===========================
   HELPERS
=========================== */

function daysUntil(date) {
  return Math.ceil((new Date(date) - new Date()) / 86400000);
}

function leaseStatus(days) {
  if (days <= 30) return ["30 Days", "danger"];
  if (days <= 60) return ["60 Days", "warn"];
  if (days <= 90) return ["90 Days", "warn"];
  return ["Active", "ok"];
}

function money(n) {
  return `$${Number(n || 0).toLocaleString()}`;
}

/* ===========================
   RENDER TABLE
=========================== */

function render() {
  const body = document.querySelector("#financeTable tbody");
  body.innerHTML = "";

  PROPERTIES.forEach(p => {
    const days = daysUntil(p.leaseEnd);
    const [label, cls] = leaseStatus(days);

    const totalCost =
      Number(p.mortgage) +
      Number(p.hoa.monthly) +
      Number(p.maintenance || 0);

    const net = Number(p.rent) - totalCost;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${money(p.rent)}</td>
      <td>${money(p.mortgage)}</td>
      <td>${money(p.hoa.monthly)}</td>
      <td>
        <input type="number" value="${p.maintenance}"
               data-id="${p.id}" />
      </td>
      <td>${money(totalCost)}</td>
      <td class="${net >= 0 ? "profit" : "loss"}">
        ${money(net)}
      </td>
      <td>${new Date(p.leaseEnd).toLocaleDateString()}</td>
      <td><span class="badge ${cls}">${label}</span></td>
    `;

    body.appendChild(tr);
  });
}

/* ===========================
   EVENTS
=========================== */

document.addEventListener("input", e => {
  if (e.target.matches("input[data-id]")) {
    const p = PROPERTIES.find(x => x.id === e.target.dataset.id);
    p.maintenance = Number(e.target.value || 0);
    render();
  }
});

render();
