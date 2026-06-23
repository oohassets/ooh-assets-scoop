/* ── Client-side router ─────────────────────────────────── */
import { loadPage, toggleOverlay, setURL } from "./utils.js";
import { maps }        from "./maps.js";
import { updateInfoCard } from "./asset-rates.js";
import { setDockActive, closeAllPanels } from "./navigation.js";

const BASE_PAGES = "./pages/";
const BASE_CSS = "./assets/css/";

let currentView = null; // holds { cleanup } of the active view module
let currentMapKey = "assets";
let currentMapUrl = maps["assets"];

export function getCurrentMapUrl() { return currentMapUrl; }

async function switchView(htmlPath, cssPath, viewModulePath) {
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

  // Reset scroll to top so nav-at-top class is applied correctly
  const appContent = document.getElementById("app-content");
  if (appContent) appContent.scrollTop = 0;

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
}

export async function openBookings() {
  await switchView(
    BASE_PAGES + "bookings.html",
    BASE_CSS + "dashboard.css",
    "./views/bookings.js"
  );
  setURL({ map: null, page: "bookings" });
  setDockActive(1);
  closeAllPanels();
  markNavActive("bookingsLink");
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
}

export async function openVehicleReport() {
  await switchView(
    BASE_PAGES + "vehicle-report.html",
    null,
    "./views/vehicle-report.js"
  );
  setURL({ map: null, page: "vehicle" });
  setDockActive(4);
  closeAllPanels();
  markNavActive("vehicleTrafficLink");
}

export async function openAssetDimensionChecker() {
  await switchView(BASE_PAGES + "asset-dimension-checker.html", null, null);
  setURL({ map: null, page: "asset-checker" });
  setDockActive(5);
  closeAllPanels();
}

export async function openImageCompressor() {
  await switchView(BASE_PAGES + "image-compressor.html", null, null);
  setURL({ map: null, page: "image-compressor" });
  setDockActive(5);
  closeAllPanels();
}

export async function openViewScreen() {
  await switchView(BASE_PAGES + "asset-digital-content.html", null, null);
  setURL({ map: null, page: "view-screen" });
  setDockActive(5);
  closeAllPanels();
}

export function setMap(key) {
  if (!maps[key]) return;
  currentMapKey = key;
  currentMapUrl = maps[key];
  updateInfoCard(key);

  // Cleanup current view and any page-specific inline styles
  if (currentView?.cleanup) currentView.cleanup();
  currentView = null;
  document.querySelectorAll("style[data-page-style]").forEach(s => s.remove());

  const mapFrame   = document.getElementById("mapFrame");
  const appContent = document.getElementById("app-content");
  const pageOrbs   = document.getElementById("page-orbs");
  if (mapFrame)   { mapFrame.style.display = "block"; mapFrame.src = currentMapUrl; }
  if (appContent) appContent.style.display = "none";
  if (pageOrbs)   pageOrbs.style.display   = "none";
  toggleOverlay(true);

  setURL({ map: key, page: null });
  setDockActive(3);
  markNavActive(null);
}

export function setMapAndClose(key) {
  closeAllPanels();
  setMap(key);
}

export function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page");
  const map  = params.get("map");

  if (page === "home")              return openHome();
  if (page === "bookings")          return openBookings();
  if (page === "content-inventory") return openContentInventory();
  if (page === "vehicle")           return openVehicleReport();
  if (page === "asset-checker")     return openAssetDimensionChecker();
  if (page === "image-compressor")  return openImageCompressor();
  if (page === "view-screen")       return openViewScreen();
  if (map && maps[map])             return setMap(map);

  openHome(); // default
}

function markNavActive(id) {
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  if (id) document.getElementById(id)?.classList.add("active");
}
