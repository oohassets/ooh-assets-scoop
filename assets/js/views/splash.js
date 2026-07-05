/* ── Splash / Landing View Module ────────────────────────── */

const AUTO_REDIRECT_MS = 5000;
let redirectTimer = null;

export async function init() {
  redirectTimer = setTimeout(() => window.openHome?.(), AUTO_REDIRECT_MS);

  const cancelAutoRedirect = () => {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  };

  document.getElementById("splashBookingBtn")?.addEventListener("click", () => {
    cancelAutoRedirect();
    window.openBookings?.();
  });
  document.getElementById("splashContentBtn")?.addEventListener("click", () => {
    cancelAutoRedirect();
    window.openContentInventory?.();
  });
}

export function cleanup() {
  clearTimeout(redirectTimer);
  redirectTimer = null;
}
