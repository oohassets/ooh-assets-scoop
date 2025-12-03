// expandContentInventory.js

function expandCarousel(type) {
  console.log("Expand clicked:", type);
  const overlay = document.getElementById("fullscreenOverlay");
  if (!overlay) { console.error("fullscreenOverlay not found"); return; }

  overlay.classList.add("show");

  const digi = document.getElementById("digitalOverlay");
  const stat = document.getElementById("staticOverlay");
  if (!digi || !stat) { console.error("Overlay children missing"); return; }

  digi.style.display = "none";
  stat.style.display = "none";

  if (type === "digital") digi.style.display = "block";
  if (type === "static") stat.style.display = "block";
}

function closeOverlay() {
  const overlay = document.getElementById("fullscreenOverlay");
  if (overlay) overlay.classList.remove("show");
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeOverlay();
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("overlayCloseBtn");
  if (btn) btn.addEventListener("click", closeOverlay);
});

// <<< IMPORTANT >>> expose to global scope so inline onclick can call them
window.expandCarousel = expandCarousel;
window.closeOverlay = closeOverlay;
