// ==============================
// FULLSCREEN OVERLAY FUNCTIONS
// ==============================

// Open overlay and show only the selected section
function expandCarousel(type) {
  const overlay = document.getElementById("fullscreenOverlay");
  overlay.classList.add("show");

  // Hide both sections
  document.getElementById("digitalOverlay").style.display = "none";
  document.getElementById("staticOverlay").style.display = "none";

  // Show selected section
  if (type === "digital") {
    document.getElementById("digitalOverlay").style.display = "block";
  }
  if (type === "static") {
    document.getElementById("staticOverlay").style.display = "block";
  }
}

// Close overlay
function closeOverlay() {
  document.getElementById("fullscreenOverlay").classList.remove("show");
}

// ESC key closes overlay
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOverlay();
});

// Close button event
window.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("overlayCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", closeOverlay);
});
