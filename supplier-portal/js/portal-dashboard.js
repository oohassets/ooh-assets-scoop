/* Supplier portal dashboard — Static Bookings (stat cards) + Static Asset Map.
 *
 * Deliberately does NOT read RTDB directly (no `get(ref(rtdb, ...))`
 * anywhere in this file): database.rules.json gives a userSupplier-listed
 * account a hard root .read:false, so there is nothing here for the Firebase
 * client SDK to read even if someone tried from devtools. All data comes
 * from one call to the getSupplierPortalData Cloud Function, which uses the
 * Admin SDK server-side to resolve the caller against userSupplier and
 * return only Static-type assets and their bookings — the same isolation
 * pattern as client-portal/js/portal-dashboard.js's getClientPortalData
 * call. */
import { auth } from "../../firebase/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initSupplierMap } from "./portal-map.js";

const FUNCTION_URL = "https://us-central1-scoopassets.cloudfunctions.net/getSupplierPortalData";

const CATEGORY_META = {
  live:    { label: "Live",    color: "#35B37E" },
  booked:  { label: "Booked",  color: "#E5484D" },
  pending: { label: "Pending", color: "#E0A13A" },
};

const loadingEl  = document.getElementById("spLoadingState");
const errorEl    = document.getElementById("spErrorState");
const errorMsgEl = document.getElementById("spErrorMsg");
const contentEl  = document.getElementById("spContent");
const whoNameEl  = document.getElementById("spWhoName");
const noticesEl  = document.getElementById("spMapNotices");
const summaryEl  = document.getElementById("spMapSummary");

let portalAssets = [];
let mapHandle    = null; // set once initSupplierMap() has run (lazy — see openMapTab())
const chipVisible = { live: true, booked: true, pending: true };

// ── Auth guard ──────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "./login.html"; return; }
  whoNameEl.textContent = user.email;
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: "{}",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load portal data");
    showContent(data);
  } catch (err) {
    console.error("[SupplierPortal] load failed:", err);
    showError(err.message || "Something went wrong loading your assets.");
  }
});

function showError(message) {
  loadingEl.style.display = "none";
  contentEl.style.display = "none";
  errorEl.style.display = "block";
  errorMsgEl.textContent = message;
}

function showContent(data) {
  loadingEl.style.display = "none";
  errorEl.style.display = "none";
  contentEl.style.display = "block";
  if (data.supplierName) {
    whoNameEl.innerHTML = `
      <span class="sp-who-supplier">${escapeHTML(data.supplierName)}</span>
      ${data.contactName ? `<span class="sp-who-contact">${escapeHTML(data.contactName)}</span>` : ""}
    `;
  } else {
    whoNameEl.textContent = auth.currentUser?.email || "";
  }
  document.title = `${data.supplierName || "Supplier"} — SCOOP Supplier Portal`;

  portalAssets = data.assets || [];
  renderStatCards(portalAssets, data.contentInventoryLive || []);
  renderCompletedTable(data.completedCampaigns || []);
}

// ── Static Bookings tab — stat cards ─────────────────────────
// Booked/Pending: same substring convention as bookings.js's
// getStatusClass()/dashboard.js's updateStats(), computed across every
// static asset's booking history (Campaigns_Booking rows). Live: sourced
// from contentInventoryLive instead (see getSupplierPortalData) — what's
// actually populated on the physical asset right now, not a booking's own
// Status field, which is manually set and can lag reality.
function renderStatCards(assets, contentInventoryLive) {
  const bookings = assets.flatMap(a => a.bookings || []);
  const groups = { booked: [], pending: [] };
  bookings.forEach(b => {
    const s = (b.Status || "").toLowerCase();
    if (s.includes("signed")) groups.booked.push(b);
    if (s.includes("pending")) groups.pending.push(b);
  });

  document.getElementById("spStatLive").textContent = contentInventoryLive.length;
  document.getElementById("spStatBooked").textContent = groups.booked.length;
  document.getElementById("spStatPending").textContent = groups.pending.length;

  renderStatList("spStatLiveList", contentInventoryLive, "No live campaigns.", { checkExtended: true });
  renderStatList("spStatBookedList", groups.booked, "No booked bookings.");
  renderStatList("spStatPendingList", groups.pending, "No pending bookings.");
}

// ── Static Bookings tab — Completed Campaigns table ──────────
function renderCompletedTable(rows) {
  const tbody = document.getElementById("spCompletedBody");
  const totalEl = document.getElementById("spCompletedTotal");
  totalEl.textContent = `Total completed campaigns: ${rows.length}`;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="sp-empty">No completed campaigns.</td></tr>`;
    return;
  }
  const sorted = [...rows].sort((a, b) => (parseDate(b["Start Date"]) || 0) - (parseDate(a["Start Date"]) || 0));
  tbody.innerHTML = sorted.map(r => `
    <tr>
      <td>${escapeHTML(r.Client || "—")}</td>
      <td>${escapeHTML(r.Circuits || "—")}</td>
      <td>${fmtLong(r["Start Date"])}</td>
      <td>${fmtLong(r["End Date"])}</td>
    </tr>
  `).join("");
}

// Newest-first (by Start Date), same convention as client-portal's My
// Bookings table. `options.checkExtended` (Live card only) adds a second
// "Extended" pill when a row's End Date has already passed — it's still
// occupying Content Inventory past its scheduled end, i.e. running longer
// than originally booked.
function renderStatList(listElId, rows, emptyMessage, options = {}) {
  const el = document.getElementById(listElId);
  if (!rows.length) {
    el.innerHTML = `<div class="sp-stat-empty">${escapeHTML(emptyMessage)}</div>`;
    return;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sorted = [...rows].sort((a, b) => (parseDate(b["Start Date"]) || 0) - (parseDate(a["Start Date"]) || 0));
  el.innerHTML = sorted.map(b => {
    const endDate = parseDate(b["End Date"]);
    const isExtended = options.checkExtended && endDate && endDate < today;
    return `
    <div class="sp-stat-row">
      <div class="sp-stat-row-brand">${escapeHTML(b["Brand Campaign"] || b.Client || "—")}</div>
      <div class="sp-stat-row-meta">
        <span class="sp-stat-row-circuit" title="${escapeHTML(b.Circuits || "")}">${escapeHTML(b.Circuits || "—")}</span>
        <span class="sp-stat-row-dates">${fmtShort(b["Start Date"])} → ${fmtShort(b["End Date"])}</span>
      </div>
      <div class="sp-stat-row-pills">
        <span class="sp-popup-pill ${statusPillClass(b.Status)}">${escapeHTML(b.Status || "—")}</span>
        ${isExtended ? `<span class="sp-popup-pill sp-popup-pill-extended">Extended</span>` : ""}
      </div>
    </div>
  `;
  }).join("");
}

// ── Date helpers (same "MM/DD/YYYY" convention as the internal app) ──
function parseDate(str) {
  if (!str) return null;
  const p = str.split("/").map(Number);
  if (p.length < 3) return null;
  const d = new Date(p[2], p[0] - 1, p[1]);
  d.setHours(0, 0, 0, 0);
  return d;
}
function fmtShort(str) {
  const d = parseDate(str);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
// "1 Aug 2026" — Completed Campaigns table only (rows can span past years,
// so the stat-card lists' year-less fmtShort() would be ambiguous there).
function fmtLong(str) {
  const d = parseDate(str);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Same substring convention as portal-map.js's statusClass() (map popups).
function statusPillClass(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("live")) return "sp-popup-pill-live";
  if (s.includes("signed")) return "sp-popup-pill-signed";
  if (s.includes("pending")) return "sp-popup-pill-pending";
  if (s.includes("completed")) return "sp-popup-pill-completed";
  if (s.includes("cancel")) return "sp-popup-pill-cancelled";
  return "sp-popup-pill-signed";
}

// ── Tabs ──────────────────────────────────────────────────────
const tabBookings = document.getElementById("spTabBookings");
const tabMap      = document.getElementById("spTabMap");
const secBookings = document.getElementById("spBookingsSection");
const secMap      = document.getElementById("spMapSection");

tabBookings.addEventListener("click", () => {
  tabBookings.classList.add("active"); tabMap.classList.remove("active");
  secBookings.style.display = "block"; secMap.style.display = "none";
});
tabMap.addEventListener("click", () => {
  tabMap.classList.add("active"); tabBookings.classList.remove("active");
  secMap.style.display = "block"; secBookings.style.display = "none";
  openMapTab();
});

// MapLibre sizes its canvas off the container's on-screen dimensions at
// construction time — initializing it while spMapSection is still
// display:none would produce a permanently-broken 0×0 canvas. So the map is
// built lazily, the first time this tab is actually opened (by which point
// the container is already visible), rather than eagerly in showContent().
let mapInitStarted = false;
async function openMapTab() {
  if (mapInitStarted) return;
  mapInitStarted = true;
  try {
    mapHandle = await initSupplierMap(document.getElementById("spMapCanvas"), portalAssets, addNotice);
    renderMapSummary(mapHandle.counts);
  } catch (err) {
    console.error("[SupplierPortal] map init failed:", err);
    addNotice("Map failed to load.");
  }
}

// ── Map summary chips — click to show/hide that category's markers ──
// counts[cat] is { circuits, markers } — e.g. "Live: 3 Circuits (48 Markers)".
function renderMapSummary(counts) {
  summaryEl.innerHTML = "";
  Object.entries(CATEGORY_META).forEach(([cat, meta]) => {
    const { circuits = 0, markers = 0 } = counts[cat] || {};
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sp-summary-chip";
    chip.style.setProperty("--sp-chip-color", meta.color);
    chip.innerHTML = `<span class="sp-chip-dot"></span>${meta.label}: ${circuits} Circuit${circuits === 1 ? "" : "s"} (${markers} Marker${markers === 1 ? "" : "s"})`;
    chip.addEventListener("click", () => {
      chipVisible[cat] = !chipVisible[cat];
      chip.classList.toggle("sp-chip-off", !chipVisible[cat]);
      mapHandle?.setCategoryVisible(cat, chipVisible[cat]);
    });
    summaryEl.appendChild(chip);
  });
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function addNotice(message) {
  if (!noticesEl) return;
  if (Array.from(noticesEl.children).some(c => c.textContent === message)) return;
  const div = document.createElement("div");
  div.className = "sp-map-notice-item";
  div.textContent = message;
  noticesEl.appendChild(div);
}

document.getElementById("spSignOutBtn").addEventListener("click", () => {
  signOut(auth).then(() => { window.location.href = "./login.html"; });
});
