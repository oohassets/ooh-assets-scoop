/* ══════════════════════════════════════════
   SCOOP OOH — Main App Entry Point
   Bootstraps auth, routing, dock, theme,
   info-card events, and Scoop AI.
══════════════════════════════════════════ */
import { requireAuth } from "./authGuard.js";
import { auth }        from "../../firebase/firebase.js";
import { signOut }     from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import { initTheme }   from "./theme.js";
import { initDock, initNavScroll } from "./navigation.js";
import { toggleInfoCard, updateInfoCard } from "./asset-rates.js";
import { getCurrentMapUrl } from "./router.js";
import {
  loadFromURL,
  openHome, openContentInventory, openBookings, openVehicleReport,
  openAssetDimensionChecker, openImageCompressor, openViewScreen,
  setMap, setMapAndClose,
} from "./router.js";
import { copyGoogleMapLink } from "./utils.js";
import { initScoopAI } from "./scoop-ai.js";
import { initNotifications } from "./notifications.js";

// ── Expose globals that inline onclick="" attributes need ──
window.openHome                = openHome;
window.openContentInventory    = openContentInventory;
window.openBookings            = openBookings;
window.openVehicleReport       = openVehicleReport;
window.openAssetDimensionChecker = openAssetDimensionChecker;
window.openImageCompressor     = openImageCompressor;
window.openViewScreen          = openViewScreen;
window.setMap                  = setMap;
window.setMapAndClose          = setMapAndClose;
window.toggleInfoCard          = toggleInfoCard;
window.copyGoogleMapLink       = () => copyGoogleMapLink(getCurrentMapUrl());

// ── Helpers ───────────────────────────────────────────────
function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ── Auth guard ────────────────────────────────────────────
let firstLoad = true;
requireAuth((user) => {
  const userName = user.displayName || user.email.split("@")[0];
  const initials = getInitials(userName);

  // Avatar initials (nav button + dropdown header)
  const navInitEl  = document.getElementById("navAvatarInitials");
  const dropInitEl = document.getElementById("userDropdownInitials");
  if (navInitEl)  navInitEl.textContent  = initials;
  if (dropInitEl) dropInitEl.textContent = initials;

  // Dropdown profile info
  const dropNameEl  = document.getElementById("userDropdownName");
  const dropEmailEl = document.getElementById("userDropdownEmail");
  if (dropNameEl)  dropNameEl.textContent  = userName;
  if (dropEmailEl) dropEmailEl.textContent = user.email;

  // Store globally for view modules
  window.__currentUser = { name: userName, email: user.email, uid: user.uid };

  console.log(`[SCOOP] ✓ Auth — ${userName} (${user.email})`);

  // Identify signed-in user in Chatbase widget
  initScoopAI(user);

  // Load the initial view only once, after auth confirms user identity
  if (firstLoad) {
    firstLoad = false;
    loadFromURL();
  }
});

// ── DOMContentLoaded bootstrap ────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  console.log("[SCOOP] DOM ready — bootstrapping app");

  // Theme
  initTheme();

  // Transparent nav at scroll-top
  initNavScroll();

  // Notification bell
  initNotifications();

  // Logo → manual page refresh with spin animation
  document.querySelector(".nav-logo")?.addEventListener("click", () => {
    const mark = document.querySelector(".nav-logo-mark");
    if (!mark || mark.classList.contains("spinning")) return;
    mark.classList.add("spinning");
    mark.addEventListener("animationend", () => {
      window.location.reload();
    }, { once: true });
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
