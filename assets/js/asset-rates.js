/* ── Asset rate card data ───────────────────────────────── */
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

let assetRateCache = null;

/**
 * Fetches the "assetrate" table once and caches it, keyed by each record's
 * own "id" field (e.g. "underpass-entrance") — the RTDB rows themselves are
 * keyed by a plain sequential index (1, 2, 3…), not by that id.
 */
async function fetchAssetRates() {
  if (assetRateCache) return assetRateCache;
  const snap = await get(ref(rtdb, "assetrate"));
  const rows = snap.exists() ? Object.values(snap.val()) : [];
  assetRateCache = {};
  rows.forEach(row => { if (row?.id) assetRateCache[row.id] = row; });
  return assetRateCache;
}

function formatQAR(val) {
  if (val === undefined || val === null || val === "") return "-";
  return `${Number(val).toLocaleString()} QAR`;
}

/**
 * Populate and show the info card for a given map key.
 * Pass null / unknown key to hide the card.
 */
export async function updateInfoCard(mapKey) {
  const card   = document.getElementById("infoCard");
  const tbody  = document.getElementById("infoTableBody");
  const header = document.getElementById("infoHeader");
  if (!card) return;

  const allRates = mapKey ? await fetchAssetRates() : null;
  const details  = allRates ? allRates[mapKey] : null;

  if (!details) {
    card.style.display   = "none";
    card.dataset.hasdata = "false";
    return;
  }

  const isStatic = (details.category || "").toLowerCase() === "static";
  card.dataset.hasdata = "true";
  header.innerHTML = `Asset Rate Card › ${details.name || "Asset"}<span class="close-info" onclick="toggleInfoCard()">✕</span>`;

  const countLabel = isStatic ? "Faces" : "Screens";
  const feeLabel   = isStatic ? "Production &amp; Installation" : "Upload Fee";
  const count      = details.faces_screen ?? details.faces ?? "-";

  tbody.innerHTML = `
    <tr><th>${countLabel}</th><td>${count}</td></tr>
    <tr><th>Rate</th><td>${formatQAR(details.Rate)}</td></tr>
    <tr><th>${feeLabel}</th><td>${formatQAR(details["Service Fee"])}</td></tr>
    <tr><th>Campaign Duration</th><td>${details.Duration || "-"}</td></tr>
    <tr><th>Dimension W×H</th><td>${details.Dimensions || "-"}</td></tr>`;
}

export function toggleInfoCard() {
  const card = document.getElementById("infoCard");
  if (!card || card.dataset.hasdata !== "true") return;
  card.style.display = card.style.display === "block" ? "none" : "block";
}