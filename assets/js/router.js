/* ── Client-side router ─────────────────────────────────── */
import { setURL, showOnlyFrame, toggleOverlay } from "./utils.js";
import { maps }        from "./maps.js";
import { updateInfoCard } from "./asset-rates.js";
import { setDockActive, closeAllPanels } from "./navigation.js";

/* Absolute base URL for iframe sources.
   Pages live in /pages/ so each iframe src is relative to that. */
const BASE = "https://oohassets.github.io/ooh-assets-scoop/pages/";

let currentMapKey = "assets";
let currentMapUrl = maps["assets"];

export function getCurrentMapUrl() { return currentMapUrl; }

// ── Page openers ──────────────────────────────────────────

export function openHome() {
  showOnlyFrame("homeFrame");
  toggleOverlay(false);
  setURL({ map: null, page: "home" });
  setDockActive(0);
  closeAllPanels();
  markNavActive("homeLink");
}

export function openContentInventory() {
  showOnlyFrame("contentInventoryFrame");
  toggleOverlay(false);
  setURL({ map: null, page: "content-inventory" });
  setDockActive(1);
  closeAllPanels();
  markNavActive("contentInventoryLink");
}

export function openVehicleReport() {
  showOnlyFrame("vehicleFrame");
  toggleOverlay(false);
  setURL({ map: null, page: "vehicle" });
  setDockActive(3);
  closeAllPanels();
  markNavActive("vehicleTrafficLink");
}

export function openAssetDimensionChecker() {
  showOnlyFrame("assetDimensionCheckerFrame");
  toggleOverlay(false);
  setURL({ map: null, page: "asset-checker" });
  setDockActive(4);
  closeAllPanels();
}

export function openImageCompressor() {
  showOnlyFrame("imageCompressorFrame");
  toggleOverlay(false);
  setURL({ map: null, page: "image-compressor" });
  setDockActive(4);
  closeAllPanels();
}

export function openViewScreen() {
  showOnlyFrame("viewScreenFrame");
  toggleOverlay(false);
  setURL({ map: null, page: "view-screen" });
  setDockActive(5);
  closeAllPanels();
}

// ── Map opener ────────────────────────────────────────────

export function setMap(key) {
  if (!maps[key]) return;
  currentMapKey = key;
  currentMapUrl = maps[key];
  updateInfoCard(key);
  showOnlyFrame("mapFrame");
  document.getElementById("mapFrame").src = currentMapUrl;
  toggleOverlay(true);
  setURL({ map: key, page: null });
  setDockActive(2);
  markNavActive(null);
}

export function setMapAndClose(key) {
  closeAllPanels();
  setMap(key);
}

// ── URL-based restore on load ─────────────────────────────

export function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const page   = params.get("page");
  const map    = params.get("map");

  if (page === "home")              return openHome();
  if (page === "content-inventory") return openContentInventory();
  if (page === "vehicle")           return openVehicleReport();
  if (page === "asset-checker")     return openAssetDimensionChecker();
  if (page === "image-compressor")  return openImageCompressor();
  if (page === "view-screen")       return openViewScreen();
  if (map && maps[map])             return setMap(map);

  openContentInventory();
}

// ── Helper: mark active top-nav link ─────────────────────

function markNavActive(id) {
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  if (id) document.getElementById(id)?.classList.add("active");
}
