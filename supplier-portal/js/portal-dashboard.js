/* Supplier portal dashboard — read-only Static Assets Map.
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

const loadingEl  = document.getElementById("spLoadingState");
const errorEl    = document.getElementById("spErrorState");
const errorMsgEl = document.getElementById("spErrorMsg");
const contentEl  = document.getElementById("spContent");
const whoNameEl  = document.getElementById("spWhoName");
const summaryEl  = document.getElementById("spAssetsSummary");
const noticesEl  = document.getElementById("spMapNotices");

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
    await showContent(data);
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

async function showContent(data) {
  loadingEl.style.display = "none";
  errorEl.style.display = "none";
  contentEl.style.display = "block";
  whoNameEl.textContent = data.contactName
    ? `${data.contactName} · ${data.supplierName}`
    : data.supplierName || auth.currentUser?.email || "";
  document.title = `${data.supplierName || "Supplier"} — SCOOP Supplier Portal`;

  const assets = data.assets || [];
  const totalBookings = assets.reduce((sum, a) => sum + (a.bookings?.length || 0), 0);
  summaryEl.textContent = `${assets.length} static asset${assets.length === 1 ? "" : "s"} · ${totalBookings} booking${totalBookings === 1 ? "" : "s"} on record`;

  try {
    await initSupplierMap(document.getElementById("spMapCanvas"), assets, addNotice);
  } catch (err) {
    console.error("[SupplierPortal] map init failed:", err);
    addNotice("Map failed to load.");
  }
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
