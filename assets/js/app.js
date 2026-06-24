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

// ── Auth guard ────────────────────────────────────────────
let firstLoad = true;
requireAuth((user) => {
  const userName = user.displayName || user.email.split("@")[0];
  const userEl = document.getElementById("navUser");
  if (userEl) userEl.textContent = userName;

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

  // Logout
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
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
