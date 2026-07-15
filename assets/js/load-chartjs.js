/* ── Lazy-loads Chart.js's UMD build on first use ─────────────
   Chart.js (~200KB) used to load unconditionally as a render-blocking
   classic <script> in index.html's <head>, on every single page — even
   though only the Dashboard and Vehicle Traffic views ever call `new
   Chart(...)`. Every other page (Splash, Bookings, Content Inventory,
   Circuit Map, etc.) paid that download/parse cost for nothing. Loaded on
   demand instead; the in-flight/resolved promise is cached so a second
   view that needs it (e.g. navigating Dashboard → Vehicle Traffic) reuses
   the already-loaded script instead of re-fetching it — safe to cache
   indefinitely, unlike RTDB data, since the library itself never changes
   mid-session. */
let pending = null;

export function loadChartJS() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
      script.onload = () => resolve(window.Chart);
      script.onerror = () => { pending = null; reject(new Error("[SCOOP] Failed to load Chart.js")); };
      document.head.appendChild(script);
    });
  }
  return pending;
}
