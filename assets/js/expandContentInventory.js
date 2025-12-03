// ===============================
// EXPAND OVERLAY
// ===============================
function expandCarousel(type) {
  const overlay = document.getElementById("fullscreenOverlay");
  overlay.classList.add("show");

  const digitalOverlay = document.getElementById("digitalOverlay");
  const staticOverlay  = document.getElementById("staticOverlay");

  digitalOverlay.style.display = "none";
  staticOverlay.style.display = "none";

  // Clear previous tables
  digitalOverlay.innerHTML = `<h2>Digital Circuits</h2>`;
  staticOverlay.innerHTML = `<h2>Static Circuits</h2>`;

  // Determine which table to populate
  let targetOverlay, allRows, columns, highlightCols;

  if (type === "digital") {
    targetOverlay = digitalOverlay;
    allRows = window.digitalTodayRows || [];
    columns = ["Client", "Location", "Start Date"];
    highlightCols = ["Start Date"];
  }
  if (type === "static") {
    targetOverlay = staticOverlay;
    allRows = window.staticTodayRows || [];
    columns = ["Client", "Location", "Start Date"];
    highlightCols = ["Start Date"];
  }

  if (!targetOverlay) return;

  if (allRows.length === 0) {
    targetOverlay.innerHTML += `<p>No campaigns today.</p>`;
  } else {
    const obj = Object.fromEntries(allRows.map((r,i)=>[i,r]));
    const card = createCard("Campaigns Today", obj, columns, highlightCols);
    targetOverlay.appendChild(card);
  }

  targetOverlay.style.display = "block";
}

// Close overlay
function closeOverlay() {
  document.getElementById("fullscreenOverlay").classList.remove("show");
}

// ESC key closes overlay
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeOverlay();
});

// Close button
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("overlayCloseBtn");
  if (btn) btn.addEventListener("click", closeOverlay);
});

// Expose functions globally
window.expandCarousel = expandCarousel;
window.closeOverlay = closeOverlay;
