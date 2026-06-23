/* ── Navigation / Dock controller ───────────────────────── */

/** Set the active dock item by index (0-based). */
export function setDockActive(index) {
  document.querySelectorAll(".dock-item").forEach((item, i) => {
    item.classList.toggle("active", i === index);
  });
}

/** Close all slide-up dock panels. */
export function closeAllPanels() {
  document.getElementById("assetsPanel")?.classList.remove("show");
  document.getElementById("servicesPanel")?.classList.remove("show");
}

/**
 * Wire mobile dock buttons.
 * Must be called after DOMContentLoaded.
 * @param {Object} handlers - { openHome, openContentInventory, openVehicleReport,
 *                              openAssetDimensionChecker, openImageCompressor,
 *                              openViewScreen, setMapAndClose }
 */
export function initDock(handlers) {
  const {
    openHome,
    openContentInventory,
    openBookings,
    openVehicleReport,
    setMapAndClose,
  } = handlers;

  document.getElementById("btnHome")?.addEventListener("click", () => {
    closeAllPanels(); openHome();
  });

  document.getElementById("btnContentInventory")?.addEventListener("click", () => {
    closeAllPanels(); openContentInventory();
  });

  document.getElementById("btnAssetsLocation")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel  = document.getElementById("assetsPanel");
    const isOpen = panel.classList.contains("show");
    closeAllPanels();
    if (!isOpen) { panel.classList.add("show"); setDockActive(2); }
  });

  document.getElementById("btnVehicleTraffic")?.addEventListener("click", () => {
    closeAllPanels(); openVehicleReport();
  });

  document.getElementById("btnBookings")?.addEventListener("click", () => {
    closeAllPanels(); openBookings();
  });

  document.getElementById("btnServices")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel  = document.getElementById("servicesPanel");
    const isOpen = panel.classList.contains("show");
    closeAllPanels();
    if (!isOpen) { panel.classList.add("show"); setDockActive(4); }
  });

  // Close panels when clicking outside
  document.addEventListener("click", () => closeAllPanels());
  document.querySelectorAll(".dock-panel").forEach(p =>
    p.addEventListener("click", e => e.stopPropagation())
  );
}
