// ===============================
// EXPAND OVERLAY
// ===============================
function expandCarousel(type) {
  console.log("Expand clicked:", type);

  const overlay = document.getElementById("fullscreenOverlay");
  if (!overlay) {
    console.error("❌ fullscreenOverlay not found");
    return;
  }

  // Show overlay
  overlay.classList.add("show");

  // Hide sections first
  const digi = document.getElementById("digitalOverlay");
  const stat = document.getElementById("staticOverlay");

  if (!digi || !stat) {
    console.error("❌ Overlay children missing");
    return;
  }

  digi.style.display = "none";
  stat.style.display = "none";

  // Show selected section
  if (type === "digital") digi.style.display = "block";
  if (type === "static") stat.style.display = "block";
}

// ===============================
// CLOSE OVERLAY
// ===============================
function closeOverlay() {
  const overlay = document.getElementById("fullscreenOverlay");
  if (overlay) overlay.classList.remove("show");
}

// ESC closes
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeOverlay();
});

// Close button
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("overlayCloseBtn");
  if (btn) btn.addEventListener("click", closeOverlay);
});

// ===============================
// MAKE FUNCTIONS GLOBAL
// ===============================
window.expandCarousel = expandCarousel;
window.closeOverlay = closeOverlay;
