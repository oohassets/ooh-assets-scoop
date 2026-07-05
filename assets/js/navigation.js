/* ── Navigation / Dock controller ───────────────────────── */

/** Toggle the nav's transparent-at-top state to match #app-content's current scroll position. */
export function updateNavAtTop() {
  const nav   = document.querySelector('nav');
  const frame = document.getElementById('app-content');
  if (!nav || !frame) return;
  nav.classList.toggle('nav-at-top', frame.scrollTop < 4);
}

// Minimum scroll delta (px) before flipping hide/show state — avoids
// flicker from tiny/inertial scroll jitter.
const SCROLL_HIDE_THRESHOLD = 8;
let lastScrollTop = 0;

/**
 * Hides the nav + mobile dock on scroll-down, reveals them on scroll-up.
 * @param {number} [scrollTop] - scrollTop of whichever container scrolled;
 *   defaults to #app-content's own scrollTop when called with no args
 *   (e.g. on page-transition reset).
 */
export function updateScrollDirection(scrollTop) {
  const nav   = document.querySelector('nav');
  const dock  = document.getElementById('mobileDock');
  const frame = document.getElementById('app-content');
  const st    = typeof scrollTop === 'number' ? scrollTop : (frame?.scrollTop || 0);
  const delta = st - lastScrollTop;

  if (st < 4) {
    nav?.classList.remove('nav-hidden');
    dock?.classList.remove('dock-hidden');
    lastScrollTop = st;
  } else if (delta > SCROLL_HIDE_THRESHOLD) {
    nav?.classList.add('nav-hidden');
    dock?.classList.add('dock-hidden');
    lastScrollTop = st;
  } else if (delta < -SCROLL_HIDE_THRESHOLD) {
    nav?.classList.remove('nav-hidden');
    dock?.classList.remove('dock-hidden');
    lastScrollTop = st;
  }
}

/** Make the nav transparent at scroll-top, solid when scrolled, and
 *  fade the nav + mobile dock away on scroll-down / back in on scroll-up. */
export function initNavScroll() {
  const frame = document.getElementById('app-content');
  if (!frame) return;

  frame.addEventListener('scroll', () => {
    updateNavAtTop();
    updateScrollDirection(frame.scrollTop);
  }, { passive: true });

  updateNavAtTop();
}

/**
 * Swap the nav's right-side content: on Dashboard/Splash it shows the
 * chatbot/notification/avatar icon cluster; on every other page it shows
 * that page's title + subtitle instead. Pass no args (or null) to go
 * back to icon mode.
 */
export function setNavPageTitle(title, sub) {
  const wrap    = document.getElementById('navPageTitle');
  const titleEl = document.getElementById('navPageTitleText');
  const subEl   = document.getElementById('navPageTitleSub');
  const actions = document.querySelector('.nav-actions');
  if (!wrap) return;

  if (title) {
    if (titleEl) titleEl.textContent = title;
    if (subEl)   subEl.textContent   = sub || '';
    wrap.hidden = false;
    actions?.classList.add('nav-actions-hidden');
  } else {
    wrap.hidden = true;
    actions?.classList.remove('nav-actions-hidden');
  }
}

/** Set the active dock item by index (0-based). */
export function setDockActive(index) {
  document.querySelectorAll(".dock-item").forEach((item, i) => {
    item.classList.toggle("active", i === index);
  });
}

/** Close all slide-up dock panels. */
export function closeAllPanels() {
  document.getElementById("assetsPanel")?.classList.remove("show");
  document.getElementById("servicesPanel")?.classList.remove("show");
}

/**
 * Wire mobile dock buttons.
 * Must be called after DOMContentLoaded.
 * @param {Object} handlers - { openHome, openContentInventory, openVehicleReport,
 *                              openAssetDimensionChecker, openImageCompressor,
 *                              openViewScreen, setMapAndClose }
 */
export function initDock(handlers) {
  const {
    openHome,
    openContentInventory,
    openBookings,
    setMapAndClose,
  } = handlers;

  document.getElementById("btnHome")?.addEventListener("click", () => {
    closeAllPanels(); openHome();
  });

  document.getElementById("btnContentInventory")?.addEventListener("click", () => {
    closeAllPanels(); openContentInventory();
  });

  document.getElementById("btnAssetsLocation")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel  = document.getElementById("assetsPanel");
    const isOpen = panel.classList.contains("show");
    closeAllPanels();
    if (!isOpen) { panel.classList.add("show"); setDockActive(3); }
  });

  document.getElementById("btnBookings")?.addEventListener("click", () => {
    closeAllPanels(); openBookings();
  });

  document.getElementById("btnServices")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel  = document.getElementById("servicesPanel");
    const isOpen = panel.classList.contains("show");
    closeAllPanels();
    if (!isOpen) { panel.classList.add("show"); setDockActive(4); }
  });

  // Close panels when clicking outside
  document.addEventListener("click", () => closeAllPanels());
  document.querySelectorAll(".dock-panel").forEach(p =>
    p.addEventListener("click", e => e.stopPropagation())
  );
}
