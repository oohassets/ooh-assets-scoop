/* ── Shared utilities ───────────────────────────────────── */

/**
 * Show exactly one iframe, hide all others.
 * @param {string} frameId - element id to show
 */
export function showOnlyFrame(frameId) {
  const ids = [
    "mapFrame", "vehicleFrame", "homeFrame",
    "contentInventoryFrame", "assetDimensionCheckerFrame",
    "imageCompressorFrame", "viewScreenFrame"
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === frameId ? "block" : "none";
  });
}

/**
 * Show / hide the Google-branding overlay.
 */
export function toggleOverlay(show) {
  const el = document.querySelector(".map-overlay");
  if (el) el.style.display = show ? "block" : "none";
}

/**
 * Push params to the URL query string without a reload.
 * Pass null as a value to remove that key.
 * @param {Object} params
 */
export function setURL(params = {}) {
  const url = new URL(window.location);
  Object.entries(params).forEach(([k, v]) => {
    if (v === null) url.searchParams.delete(k);
    else            url.searchParams.set(k, v);
  });
  window.history.pushState({}, "", url);
}

/** Copy the current Google Map link to clipboard. */
export function copyGoogleMapLink(url) {
  navigator.clipboard.writeText(url).then(() => alert("Google Map link copied!"));
}
