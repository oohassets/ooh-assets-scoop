/* ── Splash / Landing View Module ────────────────────────── */

export async function init() {
  document.getElementById("splashBookingBtn")?.addEventListener("click", () => {
    window.openBookings?.();
  });
  document.getElementById("splashContentBtn")?.addEventListener("click", () => {
    window.openContentInventory?.();
  });
}

export function cleanup() {}
