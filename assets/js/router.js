/* ── Client-side router ─────────────────────────────────── */
import { loadPage, toggleOverlay, setURL } from "./utils.js";
import { maps }        from "./maps.js";
import { updateInfoCard } from "./asset-rates.js";
import { setDockActive, closeAllPanels, updateNavAtTop, updateScrollDirection, setNavPageTitle } from "./navigation.js";

const BASE_PAGES = "./pages/";
const BASE_CSS = "./assets/css/";

let currentView = null; // holds { cleanup } of the active view module
let currentMapKey = "assets";
let currentMapUrl = maps["assets"];

export function getCurrentMapUrl() { return currentMapUrl; }

// The Google My Maps embed itself is what's slow to load (third-party, out
// of our control) — hide that behind the same spinner used for app boot,
// and clear it once the iframe actually finishes loading.
document.getElementById("mapFrame")?.addEventListener("load", () => {
  document.getElementById("appLoadingOverlay")?.classList.add("hide");
});

async function switchView(htmlPath, cssPath, viewModulePath) {
  console.log(`[SCOOP] → ${htmlPath}`);

  // Cleanup previous view
  if (currentView?.cleanup) currentView.cleanup();
  currentView = null;

  // Hide map, show content; restore orbs (may have been hidden by setMap)
  const mapFrame   = document.getElementById("mapFrame");
  const appContent = document.getElementById("app-content");
  const pageOrbs   = document.getElementById("page-orbs");
  if (mapFrame)   mapFrame.style.display   = "none";
  if (appContent) appContent.style.display = "block";
  if (pageOrbs)   pageOrbs.style.display   = "block"; // restore after map view
  toggleOverlay(false);

  // Reset scroll to top and sync nav-at-top / hide-on-scroll state directly
  // — resetting scrollTop is a no-op (fires no 'scroll' event) when the
  // frame was already at 0, so the passive scroll listener alone can't be
  // relied on here. Without this, a nav/dock hidden by scrolling down on
  // the previous page would stay hidden on the new page.
  if (appContent) appContent.scrollTop = 0;
  updateNavAtTop();
  updateScrollDirection();

  // Load HTML into container
  await loadPage(htmlPath, cssPath);

  // Dynamically import view module and call init
  if (viewModulePath) {
    const mod = await import(viewModulePath);
    const userName = window.__currentUser?.name || "";
    if (mod.init) await mod.init(userName);
    currentView = mod;
  }
}

export async function openSplash() {
  await switchView(
    BASE_PAGES + "splash.html",
    BASE_CSS + "splash.css",
    "./views/splash.js"
  );
  setURL({ map: null, page: "splash" });
  setDockActive(0);
  closeAllPanels();
  markNavActive(null);
  setNavPageTitle(null); // icon mode
}

export async function openHome() {
  await switchView(
    BASE_PAGES + "dashboard.html",
    BASE_CSS + "dashboard.css",
    "./views/dashboard.js"
  );
  setURL({ map: null, page: "home" });
  setDockActive(0);
  closeAllPanels();
  markNavActive("homeLink");
  setNavPageTitle(null); // icon mode
}

export async function openBookings() {
  await switchView(
    BASE_PAGES + "bookings.html",
    BASE_CSS + "bookings.css",
    "./views/bookings.js"
  );
  setURL({ map: null, page: "bookings" });
  setDockActive(1);
  closeAllPanels();
  markNavActive("bookingsLink");
  setNavPageTitle("Campaign Bookings", "Manage and update your bookings");
}

export async function openContentInventory() {
  await switchView(
    BASE_PAGES + "content-inventory.html",
    BASE_CSS + "content-inventory.css",
    "./views/content-inventory.js"
  );
  setURL({ map: null, page: "content-inventory" });
  setDockActive(2);
  closeAllPanels();
  markNavActive("contentInventoryLink");
  setNavPageTitle("Content Inventory", "Keep track of all active content displayed throughout your OOH Assets");
}

export async function openVehicleReport() {
  await switchView(
    BASE_PAGES + "vehicle-report.html",
    BASE_CSS + "vehicle-report.css",
    "./views/vehicle-report.js"
  );
  setURL({ map: null, page: "vehicle" });
  setDockActive(4);
  closeAllPanels();
  markNavActive("vehicleTrafficLink");
  setNavPageTitle("Vehicle Traffic Dashboard", "Track daily vehicle counts and estimated impressions across The Pearl Island and Gewan Island circuits");
}

export async function openAssetDimensionChecker() {
  await switchView(BASE_PAGES + "asset-dimension-checker.html", null, null);
  setURL({ map: null, page: "asset-checker" });
  setDockActive(4);
  closeAllPanels();
  setNavPageTitle("Artwork Dimension Checker", "Scan and validate artwork file dimensions before upload");
}

export async function openImageCompressor() {
  await switchView(BASE_PAGES + "image-compressor.html", BASE_CSS + "image-compressor.css", null);
  setURL({ map: null, page: "image-compressor" });
  setDockActive(4);
  closeAllPanels();
  setNavPageTitle("Bulk Image Compressor", "Resize and compress images for faster uploads");
}

export async function openArtworkResizer() {
  await switchView(BASE_PAGES + "artwork-resizer.html", BASE_CSS + "artwork-resizer.css", null);
  setURL({ map: null, page: "artwork-resizer" });
  setDockActive(4);
  closeAllPanels();
  setNavPageTitle("Artwork Resizer", "Auto-resize OOH artwork to its matching output size");
}

export async function openViewScreen() {
  await switchView(BASE_PAGES + "asset-digital-content.html", null, null);
  setURL({ map: null, page: "view-screen" });
  setDockActive(4);
  closeAllPanels();
  setNavPageTitle("View Screen", "Live preview of digital OOH asset content");
}

export function setMap(key) {
  if (!maps[key]) return;
  currentMapKey = key;
  // Re-selecting the map that's already loaded shouldn't re-trigger a full
  // iframe reload (and its slow round-trip to Google) — only swap src, and
  // show the loading spinner, when the URL is actually changing.
  const nextUrl    = maps[key];
  const urlChanged = nextUrl !== currentMapUrl;
  currentMapUrl    = nextUrl;
  updateInfoCard(key);

  // Cleanup current view and any page-specific inline styles
  if (currentView?.cleanup) currentView.cleanup();
  currentView = null;
  document.querySelectorAll("style[data-page-style]").forEach(s => s.remove());

  const mapFrame       = document.getElementById("mapFrame");
  const appContent     = document.getElementById("app-content");
  const pageOrbs       = document.getElementById("page-orbs");
  const loadingOverlay = document.getElementById("appLoadingOverlay");
  if (mapFrame) {
    mapFrame.style.display = "block";
    if (urlChanged) {
      loadingOverlay?.classList.remove("hide");
      mapFrame.src = currentMapUrl;
    }
  }
  if (appContent) { appContent.style.display = "none"; appContent.scrollTop = 0; }
  if (pageOrbs)   pageOrbs.style.display   = "none";
  toggleOverlay(true);

  // Map views don't scroll #app-content, so a nav/dock left hidden by
  // scrolling on the previous page would otherwise stay hidden here too.
  updateNavAtTop();
  updateScrollDirection();

  setURL({ map: key, page: null });
  setDockActive(3);
  markNavActive(null);
  setNavPageTitle("Assets Location", "Browse digital and static OOH asset locations on the map");
}

export function setMapAndClose(key) {
  closeAllPanels();
  setMap(key);
}

export function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page");
  const map  = params.get("map");

  if (page === "splash")            return openSplash();
  if (page === "home")              return openHome();
  if (page === "bookings")          return openBookings();
  if (page === "content-inventory") return openContentInventory();
  if (page === "vehicle")           return openVehicleReport();
  if (page === "asset-checker")     return openAssetDimensionChecker();
  if (page === "image-compressor")  return openImageCompressor();
  if (page === "artwork-resizer")   return openArtworkResizer();
  if (page === "view-screen")       return openViewScreen();
  if (map && maps[map])             return setMap(map);

  openSplash(); // default landing
}

function markNavActive(id) {
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  if (id) document.getElementById(id)?.classList.add("active");
}
