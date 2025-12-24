/*
  Toggle rental availability here.
  true  = available
  false = rented
*/

const rentalStatus = {
  "co-townhouse": false,
  "co-condo": false,
  "ca-sfh": false
};

document.querySelectorAll(".property").forEach(property => {
  const id = property.dataset.id;
  const isAvailable = rentalStatus[id];

  const statusSpan = property.querySelector(".status");

  if (isAvailable) {
    property.classList.remove("rented");
    property.classList.add("available");
    statusSpan.textContent = "Available";
  } else {
    property.classList.add("rented");
    statusSpan.textContent = "Currently Rented";
  }
});
