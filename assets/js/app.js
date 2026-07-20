/* ══════════════════════════════════════════
   SCOOP OOH — Main App Entry Point
   Bootstraps auth, routing, dock, theme,
   info-card events, and Scoop AI.
══════════════════════════════════════════ */
import { requireAuth } from "./authGuard.js";
import { auth, rtdb }  from "../../firebase/firebase.js";
import { signOut }     from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { ref, get }    from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

import { initTheme }   from "./theme.js";
import { initDock, initNavScroll } from "./navigation.js";
import { toggleInfoCard, updateInfoCard } from "./asset-rates.js";
import { loadAssetMap } from "./maps.js";
import { renderAssetsMegaDropdown, renderAssetsMobilePanel } from "./asset-location-menu.js";
import { getCurrentMapUrl } from "./router.js";
import {
  loadFromURL,
  openSplash, openHome, openContentInventory, openBookings, openVehicleReport,
  openAssetDimensionChecker, openImageCompressor, openArtworkResizer, openViewScreen,
  setMap, setMapAndClose,
} from "./router.js";
import { copyGoogleMapLink } from "./utils.js";
import { initScoopAI } from "./scoop-ai.js";
import { initNotifications } from "./notifications.js";

// ── Expose globals that inline onclick="" attributes need ──
window.openSplash              = openSplash;
window.openHome                = openHome;
window.openContentInventory    = openContentInventory;
window.openBookings            = openBookings;
window.openVehicleReport       = openVehicleReport;
window.openAssetDimensionChecker = openAssetDimensionChecker;
window.openImageCompressor     = openImageCompressor;
window.openArtworkResizer      = openArtworkResizer;
window.openViewScreen          = openViewScreen;
window.setMap                  = setMap;
window.setMapAndClose          = setMapAndClose;
window.toggleInfoCard          = toggleInfoCard;
window.copyGoogleMapLink       = () => copyGoogleMapLink(getCurrentMapUrl());

// Kick off the assetmap fetch as early as possible — routing (deep-linked
// ?map= URLs) and the Assets Location menus both depend on it.
const assetMapReady = loadAssetMap().catch(err => {
  console.error("[SCOOP] Failed to load asset map:", err);
  return [];
});

// ── Helpers ───────────────────────────────────────────────
function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Looks up the signed-in user's row in the "user" RTDB table by matching
 * its own `id` field against the Firebase Auth email (rows are keyed by a
 * plain sequential index, not by email — same convention as `assetrate`).
 */
async function loadUserProfile(email) {
  try {
    const snap = await get(ref(rtdb, "user"));
    if (!snap.exists()) return null;
    const data = snap.val();
    const rows = Array.isArray(data) ? data : Object.values(data);
    return rows.find(row => row && (row.id || "").toLowerCase() === email.toLowerCase()) || null;
  } catch (e) {
    console.error("[SCOOP] Failed to load user profile:", e);
    return null;
  }
}

// ── Auth guard ────────────────────────────────────────────
let firstLoad = true;
requireAuth(async (user) => {
  const profile  = await loadUserProfile(user.email);
  const userName = profile?.name || user.displayName || user.email.split("@")[0];
  const initials = profile?.initials || getInitials(userName);
  // Least-privilege default: an email not yet added to the "user" table
  // (or with no rule set) only gets view access.
  const rule     = (profile?.rule || "view").toLowerCase();

  // Avatar initials (nav button + dropdown header)
  const navInitEl  = document.getElementById("navAvatarInitials");
  const dropInitEl = document.getElementById("userDropdownInitials");
  if (navInitEl)  navInitEl.textContent  = initials;
  if (dropInitEl) dropInitEl.textContent = initials;

  // Dropdown profile info
  const dropNameEl  = document.getElementById("userDropdownName");
  const dropPosEl   = document.getElementById("userDropdownPosition");
  const dropEmailEl = document.getElementById("userDropdownEmail");
  if (dropNameEl)  dropNameEl.textContent  = userName;
  if (dropPosEl)   dropPosEl.textContent   = profile?.position || "";
  if (dropEmailEl) dropEmailEl.textContent = user.email;

  // Store globally for view modules
  window.__currentUser = {
    name: userName, initials, email: user.email, uid: user.uid,
    position: profile?.position || "", rule,
  };

  console.log(`[SCOOP] ✓ Auth — ${userName} (${user.email}) [${rule}]`);

  // Identify signed-in user in Chatbase widget
  initScoopAI(user);

  // Load the initial view only once, after auth confirms user identity
  if (firstLoad) {
    firstLoad = false;
    await assetMapReady; // ensure maps[] is populated before resolving ?map= deep links
    await loadFromURL();
    // Landing directly on a ?map= deep link leaves the (slow, third-party)
    // Google Maps embed still loading — router.js's own "load" listener on
    // #mapFrame clears the overlay once that finishes, so don't race it here.
    const mapFrame = document.getElementById("mapFrame");
    if (!mapFrame || mapFrame.style.display !== "block") {
      document.getElementById("appLoadingOverlay")?.classList.add("hide");
    }
  }
});

// ── PWA version (user dropdown footer) ─────────────────────
// Asks the active service worker for its own CACHE_NAME via the GET_VERSION
// message it already responds to (see service-worker.js) rather than
// hardcoding the version a second place. "scoop-ooh-cache-v243" → "PWA v243".
function initPwaVersionLabel() {
  const versionEl = document.getElementById("userDropdownVersion");
  if (!versionEl || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type !== "SW_VERSION") return;
    const v = e.data.version.match(/v[\d.]+$/i)?.[0] || e.data.version;
    versionEl.textContent = `PWA ${v}`;
  });

  const askForVersion = () => navigator.serviceWorker.controller?.postMessage({ type: "GET_VERSION" });
  askForVersion();
  // On a fresh install the new worker doesn't control this page yet when the
  // above fires — ask again once it takes over (see clients.claim() in
  // service-worker.js's activate handler).
  navigator.serviceWorker.addEventListener("controllerchange", askForVersion);
}

// ── DOMContentLoaded bootstrap ────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  console.log("[SCOOP] DOM ready — bootstrapping app");

  // Theme
  initTheme();

  // Transparent nav at scroll-top
  initNavScroll();

  // Notification bell
  initNotifications();

  // PWA version footer (user dropdown)
  initPwaVersionLabel();

  // Assets Location menus (desktop mega-dropdown + mobile dock panel)
  assetMapReady.then(() => {
    renderAssetsMegaDropdown();
    renderAssetsMobilePanel();
  });

  // Logo → manual page refresh
  document.querySelector(".nav-logo")?.addEventListener("click", () => {
    window.location.reload();
  });

  // User avatar dropdown
  const userAvatarWrap = document.getElementById("userAvatarWrap");
  const userAvatarBtn  = document.getElementById("userAvatarBtn");
  const userDropdown   = document.getElementById("userDropdown");

  userAvatarBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = userDropdown.classList.toggle("open");
    userAvatarBtn.classList.toggle("open", isOpen);
    // Close notification panel when avatar opens
    if (isOpen) {
      document.getElementById("notifPanel")?.classList.remove("open");
      document.getElementById("notifBtn")?.classList.remove("active");
    }
  });

  document.addEventListener("click", (e) => {
    if (!userAvatarWrap?.contains(e.target)) {
      userDropdown?.classList.remove("open");
      userAvatarBtn?.classList.remove("open");
    }
  });

  // Sign out from dropdown
  document.getElementById("userSignOutBtn")?.addEventListener("click", () => {
    signOut(auth)
      .then(() => { window.location.href = "./login.html"; })
      .catch(err => { console.error("Logout error:", err); alert("Failed to logout"); });
  });

  // Info-card close on outside click
  document.addEventListener("click", (e) => {
    const card    = document.getElementById("infoCard");
    const infoBtn = document.querySelector(".info-btn");
    if (!card || card.style.display !== "block") return;
    if (card.contains(e.target) || infoBtn?.contains(e.target)) return;
    card.style.display = "none";
  });

  // Mobile dock
  initDock({
    openHome,
    openContentInventory,
    openBookings,
    setMapAndClose,
  });
});
