/* ── Bookings View Module ─────────────────────────────────── */
import { rtdb } from "../../../firebase/firebase.js";
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { initScrollReveal } from "../utils.js";
import { initCircuitMapUI, syncCircuitMapSelection, teardownCircuitMap } from "../circuit-map.js";
import { loadRootTables } from "../rtdb-root.js";

// Escapes free-text booking fields (Client/Brand Campaign/BO/Circuits/Person
// — all plain <input> text, saved to RTDB verbatim) before they're
// interpolated into innerHTML, so a booking with HTML/script in one of those
// fields can't execute in another viewer's session (stored XSS).
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

let currentUserName     = "";
// Person is saved (and matched against, for the edit-button ownership
// check below) as initials, not the full name — see saveBooking().
let currentUserInitials = "";
// Role gate: window.__currentUser.rule from the "user" RTDB table —
// admin/sales can view, add and edit; anything else (view, or unset) is
// view-only. See dashboard/app.js loadUserProfile() for how rule is set.
let canEdit         = false;
let allCampaigns    = [];
let currentFiltered = [];
// Column sort state — null sortField means "no sort applied" (falls back to
// allCampaigns' own order, newest-first — see getCampaigns()). Currently
// only the Person header is wired to this; see applyFilters()/toggleSort().
let sortField = null;
let sortDir   = "asc";
let drpStart = null, drpEnd = null;
let calDrpStart = null, calDrpEnd = null;
let calBookings = [], calDates = [], calRangeStart = null, calRangeEnd = null;

// Date picker state
let bkPickerStart = null;
let bkPickerEnd   = null;
let bkPickMode    = "start";
let allCircuits   = [];
let allClients    = [];
let allBrands     = [];

const MONTHS      = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── HELPERS ───────────────────────────────────────────────
function parseDate(v) {
  if (!v) return null;
  const p = v.toString().trim().split("/").map(x => parseInt(x,10));
  if (p.length >= 3) return new Date(p[2]||new Date().getFullYear(), p[0]-1, p[1]);
  if (p.length === 2) return new Date(new Date().getFullYear(), p[0]-1, p[1]);
  return null;
}
function parseISOLocal(s) {
  if (!s) return null;
  const p = s.split("-").map(Number);
  return new Date(p[0], p[1]-1, p[2]);
}
function toISO(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function toMMDDYYYY(iso) {
  const p = iso.split("-");
  return `${p[1]}/${p[2]}/${p[0]}`;
}
function fmtShort(v) {
  if (!v) return "—";
  const p = v.trim().split("/").map(x => parseInt(x,10));
  if (p.length < 2) return "—";
  return `${p[1]} ${MONTHS[p[0]-1]||""}`;
}
function fmtPickDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day:"numeric", month:"short" });
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function getStatusClass(s="") {
  s = s.toLowerCase();
  if (s.includes("live"))      return "live";
  if (s.includes("signed"))    return "signed";
  if (s.includes("pending"))   return "pending";
  if (s.includes("completed")) return "completed";
  if (s.includes("cancel"))    return "cancelled";
  return "";
}
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? "";
}
/** Same convention as app.js's nav-avatar initials (first + last name letter). */
function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

async function loadAll() {
  try {
    const snap = await loadRootTables();
    return snap.exists() ? snap.val() : {};
  } catch(e) { console.error(e); return {}; }
}

// ── GET CAMPAIGNS ─────────────────────────────────────────
function getCampaigns(tables) {
  const list = [];
  const tableData = tables["Campaigns_Booking"];
  if (!tableData) return list;
  const entries = Array.isArray(tableData)
    ? tableData.map((row, i) => [i, row])
    : Object.entries(tableData);
  entries.forEach(([key, row]) => {
    if (!row) return;
    const sd = row["Start Date"]||""; const ed = row["End Date"]||"";
    let sortDate = new Date(9999,0,1);
    if (sd) { const p = sd.split("/").map(Number); sortDate = new Date(p[2]||new Date().getFullYear(),p[0]-1,p[1]); }
    list.push({
      key: String(key),
      client: row.Client||"—", brand: row["Brand Campaign"]||"—",
      asset: row.Circuits||"—", status: row.Status||"BO Signed",
      person: row.Person||"—", rawStartDate: sd, rawEndDate: ed,
      bo: row.BO||"",
      date: `${fmtShort(sd)} → ${fmtShort(ed)}`, sortDate,
      slot: row.Slot||""
    });
  });
  return list.sort((a,b) => b.sortDate - a.sortDate);
}

// ── RENDER TABLE ──────────────────────────────────────────
function renderTable(campaigns) {
  const tbody = document.getElementById("campaignTableBody");
  if (!tbody) return;
  if (!campaigns.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px;">No campaigns found</td></tr>`;
    return;
  }
  const mobHeader = `<tr class="mob-thead-row">
    <td class="td-mobile" colspan="5">
      <div class="mob-row mob-hdr">
        <div class="mob-col">Client</div>
        <div class="mob-col">Circuits</div>
        <div class="mob-col mob-col-right">Person</div>
      </div>
    </td>
  </tr>`;
  tbody.innerHTML = mobHeader + campaigns.map(r => {
    const statusCls = getStatusClass(r.status);
    // Person is now saved as initials (see saveBooking()) — match against
    // that, not the full name. Bookings saved before this change stored the
    // full name instead, so their own edit button may no longer show; that's
    // an inherent one-time consequence of switching the stored format.
    const isOwner = canEdit && currentUserInitials && r.person &&
      r.person.trim().toLowerCase() === currentUserInitials.trim().toLowerCase();
    const editDateBtn = isOwner
      ? `<button class="edit-row-btn" data-key="${r.key}" title="Edit booking"><span class="material-symbols-outlined" style="font-size:14px;">edit</span></button>`
      : "";
    const editStatusBtn = isOwner
      ? `<button class="edit-status-btn" data-key="${r.key}" title="Edit status"><span class="material-symbols-outlined" style="font-size:14px;">edit</span></button>
         <div class="inline-status-dropdown" id="statusDrop-${r.key}">
           <button class="status-option status-pill pill-live"      data-key="${r.key}" data-val="Live">Live</button>
           <button class="status-option status-pill pill-signed"    data-key="${r.key}" data-val="BO Signed">BO Signed</button>
           <button class="status-option status-pill pill-pending"   data-key="${r.key}" data-val="Pending">Pending</button>
           <button class="status-option status-pill pill-completed" data-key="${r.key}" data-val="Completed">Completed</button>
         </div>`
      : "";
    return `
      <tr>
        <td class="td-desk"><div class="client-name">${escapeHTML(r.client)}</div><div class="brand-name">${escapeHTML(r.brand)}</div>${r.bo ? `<div class="bo-name">${escapeHTML(r.bo)}</div>` : ""}</td>
        <td class="td-desk" style="color:var(--text-secondary);font-size:13px;">${escapeHTML(r.asset)}</td>
        <td class="td-desk" style="color:var(--text-muted);font-size:12px;white-space:nowrap;">
          <div style="display:flex;align-items:center;gap:6px;"><span>${escapeHTML(r.date)}</span>${editDateBtn}</div>
        </td>
        <td class="td-desk" style="position:relative;">
          <div class="status-cell">
            <span class="status-pill pill-${statusCls}">${escapeHTML(r.status)}</span>
            ${editStatusBtn}
          </div>
        </td>
        <td class="td-desk" style="color:var(--text-muted);font-size:12px;">${escapeHTML(r.person)}</td>
        <td class="td-mobile" colspan="5">
          <div class="mob-row">
            <div class="mob-col mob-col-left">
              <div class="client-name">${escapeHTML(r.client)}</div>
              <div class="brand-name">${escapeHTML(r.brand)}</div>
              ${r.bo ? `<div class="bo-name">${escapeHTML(r.bo)}</div>` : ""}
            </div>
            <div class="mob-col mob-col-mid">
              <div class="mob-circuit">${escapeHTML(r.asset)}</div>
              <div class="mob-date"><div style="display:flex;align-items:center;gap:5px;">${escapeHTML(r.date)}${editDateBtn}</div></div>
              <div class="status-cell">
                <span class="status-pill pill-${statusCls}">${escapeHTML(r.status)}</span>
                ${editStatusBtn}
              </div>
            </div>
            <div class="mob-col mob-col-right">
              <div class="mob-person">${escapeHTML(r.person)}</div>
            </div>
          </div>
        </td>
      </tr>`;
  }).join("");

  tbody.querySelectorAll(".edit-row-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const campaign = allCampaigns.find(c => c.key === btn.dataset.key);
      if (campaign) openEditModal(campaign);
    });
  });

  tbody.querySelectorAll(".edit-status-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const drop = document.getElementById(`statusDrop-${btn.dataset.key}`);
      tbody.querySelectorAll(".inline-status-dropdown.open").forEach(d => { if (d !== drop) d.classList.remove("open"); });
      drop.classList.toggle("open");
    });
  });

  tbody.querySelectorAll(".status-option").forEach(opt => {
    opt.addEventListener("click", async e => {
      e.stopPropagation();
      opt.textContent = "Saving…";
      try {
        await update(ref(rtdb, `Campaigns_Booking/${opt.dataset.key}`), { Status: opt.dataset.val });
        const tables = await loadAll();
        allCampaigns = getCampaigns(tables);
        applyFilters();
      } catch(err) { console.error(err); opt.textContent = "Error"; }
    });
  });
}

// ── MODAL OPEN / RESET ────────────────────────────────────
function openEditModal(campaign) {
  const title = document.getElementById("bookingModalTitle");
  if (title) title.textContent = "Edit Campaign Booking";
  const saveBtn = document.getElementById("confirmBookingBtn");
  if (saveBtn) saveBtn.textContent = "Update Booking";
  const clearBtn = document.getElementById("clearFormBtn");
  if (clearBtn) clearBtn.hidden = true;

  setValue("bookingEditKey",  campaign.key);
  setValue("bookingOrder",    campaign.bo);
  setValue("bookingClient",   campaign.client !== "—" ? campaign.client : "");
  setValue("bookingBrand",    campaign.brand  !== "—" ? campaign.brand  : "");

  // Each Campaigns_Booking record is a single circuit — edit mode always
  // starts from exactly one row (adding more here would create *new*
  // records alongside the one being edited, see saveBooking()).
  resetCircuitRows();
  if (campaign.asset && campaign.asset !== "—") {
    const firstRow = document.querySelector("#bkCircuitList .bk-circuit-row");
    const textInput   = firstRow?.querySelector(".bk-inp");
    const hiddenInput = firstRow?.querySelector("input[type=hidden]");
    if (textInput)   textInput.value   = campaign.asset;
    if (hiddenInput) hiddenInput.value = campaign.asset;
  }

  const toISOfromMDY = mdy => {
    if (!mdy) return "";
    const p = mdy.split("/");
    return p.length < 3 ? "" : `${p[2]}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`;
  };
  const startISO = toISOfromMDY(campaign.rawStartDate);
  const endISO   = toISOfromMDY(campaign.rawEndDate);
  setValue("bookingStartDate", startISO);
  setValue("bookingEndDate",   endISO);

  if (startISO) {
    bkPickerStart = parseISOLocal(startISO);
    const startEl = document.getElementById("bkStartVal");
    if (startEl) { startEl.textContent = fmtPickDate(bkPickerStart); startEl.classList.remove("bk-dt-placeholder"); }
  }
  if (endISO) {
    bkPickerEnd = parseISOLocal(endISO);
    const endEl = document.getElementById("bkEndVal");
    if (endEl) { endEl.textContent = fmtPickDate(bkPickerEnd); endEl.classList.remove("bk-dt-placeholder"); }
  }

  const statusEl = document.getElementById("campaignStatus");
  if (statusEl) statusEl.value = campaign.status;

  calcDays();
  autoAssignSlot();
  checkFormComplete();
  document.getElementById("bookingModal")?.classList.add("active");
}

function checkFormComplete() {
  const client   = document.getElementById("bookingClient")?.value?.trim();
  const brand    = document.getElementById("bookingBrand")?.value?.trim();
  const circuits = getCircuitValues();
  const start    = document.getElementById("bookingStartDate")?.value;
  const end      = document.getElementById("bookingEndDate")?.value;
  const status   = document.getElementById("campaignStatus")?.value;
  const validDates = !!(start && end) && new Date(end) >= new Date(start);
  const complete = !!(client && brand && circuits.length && validDates && status);
  document.getElementById("confirmBookingBtn")?.classList.toggle("visible", complete);
  // Every place that can add/remove/clear a circuit row calls
  // checkFormComplete() right after, so this is the single choke point for
  // keeping the (optional) Circuit Map panel in sync — syncCircuitMapSelection()
  // itself no-ops until the panel has been switched on at least once.
  syncCircuitMapSelection(circuits);
}

function resetModal() {
  const title = document.getElementById("bookingModalTitle");
  if (title) title.textContent = "Let's start your booking";
  const saveBtn = document.getElementById("confirmBookingBtn");
  if (saveBtn) { saveBtn.textContent = "Save Booking"; saveBtn.classList.remove("success"); }
  const clearBtn = document.getElementById("clearFormBtn");
  if (clearBtn) clearBtn.hidden = false;
  setValue("bookingEditKey", "");
  ["bookingOrder","bookingClient","bookingBrand",
   "bookingStartDate","bookingEndDate","bookingTotalDays"].forEach(id => setValue(id, ""));
  resetCircuitRows();
  const s = document.getElementById("campaignStatus"); if (s) s.selectedIndex = 0;

  bkPickerStart = null; bkPickerEnd = null; bkPickMode = "start";
  const sv = document.getElementById("bkStartVal");
  if (sv) { sv.textContent = "Start Date"; sv.classList.add("bk-dt-placeholder"); }
  const ev = document.getElementById("bkEndVal");
  if (ev) { ev.textContent = "End Date"; ev.classList.add("bk-dt-placeholder"); }
  const td = document.getElementById("bookingTotalDaysDisplay"); if (td) td.textContent = "—";
  document.getElementById("bkPickStart")?.classList.remove("active");
  document.getElementById("bkPickEnd")?.classList.remove("active");
  checkFormComplete();
}

// ── FILTERS ───────────────────────────────────────────────
function monthKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function monthRangeFromKey(key) {
  const [y,m] = key.split("-").map(Number);
  return [new Date(y, m-1, 1), new Date(y, m, 0)];
}
/** Jan 1 → Dec 31 of the current calendar year. */
function currentYearRange() {
  const y = new Date().getFullYear();
  return [new Date(y, 0, 1), new Date(y, 11, 31)];
}
function monthLabel(key) {
  const [y,m] = key.split("-").map(Number);
  return `${FULL_MONTHS[m-1]} ${y}`;
}
/** Contiguous list of "YYYY-MM" keys spanning every campaign date, always including the current month. */
function buildMonthRange(campaigns) {
  const now = new Date();
  let min = new Date(now.getFullYear(), now.getMonth(), 1);
  let max = new Date(now.getFullYear(), now.getMonth(), 1);
  campaigns.forEach(c => {
    [parseDate(c.rawStartDate), parseDate(c.rawEndDate)].forEach(d => {
      if (!d) return;
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      if (monthStart < min) min = monthStart;
      if (monthStart > max) max = monthStart;
    });
  });
  const keys = [];
  const cur = new Date(min);
  while (cur <= max) {
    keys.push(monthKeyFromDate(cur));
    cur.setMonth(cur.getMonth()+1);
  }
  return keys;
}
/** Fills a <select> with "Select Date Range" + "This Year" + every month key (ascending), selecting defaultKey. */
function populateDateSelect(select, monthKeys, defaultKey) {
  if (!select) return;
  select.innerHTML =
    `<option value="range">Select Date Range</option>` +
    `<option value="year">This Year</option>` +
    monthKeys.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join("");
  select.value = defaultKey;
}

function applyFilters() {
  const search = (document.getElementById("campaignSearch")?.value||"").toLowerCase();
  const status = document.getElementById("campaignStatusFilter")?.value||"";
  let f = [...allCampaigns];
  if (search) f = f.filter(c => [c.client,c.brand,c.asset,c.status,c.person].join(" ").toLowerCase().includes(search));
  if (drpStart && drpEnd) {
    const lo = drpStart < drpEnd ? drpStart : drpEnd;
    const hi = drpStart < drpEnd ? drpEnd : drpStart;
    f = f.filter(c => {
      const d = parseDate(c.rawStartDate); const e = parseDate(c.rawEndDate);
      if (!d) return false;
      d.setHours(0,0,0,0); if (e) e.setHours(0,0,0,0);
      return d <= hi && (!e || e >= lo);
    });
  }
  if (status) f = f.filter(c => (c.status||"").toLowerCase().trim() === status.toLowerCase().trim());
  if (sortField) applySortInPlace(f);
  currentFiltered = f;
  renderTable(f);
}

/** Sorts `f` (the already-filtered array) in place by the active sortField/
    sortDir — one comparator per sortable <th> (Circuit/Dates/Status/Person;
    "Client / Brand" has no header hook and isn't sortable). Dates sorts on
    each row's own `sortDate` (a real Date, already computed in
    getCampaigns()) rather than the "date" field, which is just the
    formatted "MMM D → MMM D" display string. */
function applySortInPlace(f) {
  const dirMul = sortDir === "asc" ? 1 : -1;
  const cmpStr = (a, b) => (a || "").localeCompare(b || "", undefined, { sensitivity: "base" });
  switch (sortField) {
    case "asset":  f.sort((a, b) => dirMul * cmpStr(a.asset, b.asset)); break;
    case "date":   f.sort((a, b) => dirMul * (a.sortDate - b.sortDate)); break;
    case "status": f.sort((a, b) => dirMul * cmpStr(a.status, b.status)); break;
    case "person": f.sort((a, b) => dirMul * cmpStr(a.person, b.person)); break;
  }
}

/** Click handler for a sortable <th> — first click on a new column sorts
    ascending; clicking the already-active column flips direction. Re-runs
    applyFilters() so the sort applies on top of whatever search/date/status
    filters are currently set, and updates every sortable header's icon/state
    (not just the clicked one, in case more columns become sortable later). */
function toggleSort(field) {
  if (sortField === field) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortField = field;
    sortDir = "asc";
  }
  updateSortHeaderUI();
  applyFilters();
}

function updateSortHeaderUI() {
  document.querySelectorAll(".th-sortable").forEach(th => {
    const isActive = th.dataset.sort === sortField;
    th.classList.toggle("sort-active", isActive);
    const icon = th.querySelector(".th-sort-icon");
    if (!icon) return;
    icon.textContent = !isActive ? "unfold_more" : (sortDir === "asc" ? "stat_1" : "stat_minus_1");
  });
}

// ── ASSET / AUTOCOMPLETE DATA ─────────────────────────────
function populateAssets(tables) {
  const t = tables["oohassets"]; if (!t) return;
  const rows = Array.isArray(t) ? t : Object.values(t);
  allCircuits = [...new Set(rows.map(r => r.Circuits).filter(Boolean))].sort();
  allClients  = [...new Set(allCampaigns.map(c => c.client).filter(c => c !== "—"))].sort();
  allBrands   = [...new Set(allCampaigns.map(c => c.brand).filter(c  => c !== "—"))].sort();
}

function initAutoSuggest() {
  setupSuggest("bookingClient", "clientSuggestions", () => allClients, null);
  setupSuggest("bookingBrand",  "brandSuggestions",  () => allBrands,  null);
  resetCircuitRows();
}

// ── CIRCUIT ROWS (add / remove) ───────────────────────────
// One or more "Circuit" fields — the last row always shows a "+" button to
// add another; every row above it shows a "−" to remove that row. Each row
// gets its own text input (typed value) + hidden input (the exact value
// picked from the autocomplete dropdown, same pattern as Client/Brand).
let circuitRowSeq = 0;

function renderCircuitRow() {
  const n = circuitRowSeq++;
  const row = document.createElement("div");
  row.className = "bk-circuit-row";
  row.dataset.row = String(n);
  row.innerHTML = `
    <div class="bk-field bk-ac">
      <div class="bk-circuit-input-wrap">
        <input class="bk-inp" id="circuitText-${n}" type="text" placeholder=" " autocomplete="off">
        <input type="hidden" id="circuitVal-${n}">
        <label class="bk-lbl" for="circuitText-${n}">Circuit</label>
        <button type="button" class="bk-circuit-clear" id="circuitClear-${n}" title="Clear circuit" aria-label="Clear circuit">
          <span class="material-symbols-outlined">close</span>
        </button>
        <div class="bk-ac-drop" id="circuitDrop-${n}"></div>
      </div>
      <div class="bk-circuit-slot" id="circuitSlot-${n}"></div>
    </div>
    <button type="button" class="bk-circuit-btn" title="Add circuit">
      <span class="material-symbols-outlined">add</span>
    </button>`;
  document.getElementById("bkCircuitList")?.appendChild(row);

  document.getElementById(`circuitClear-${n}`)?.addEventListener("click", () => {
    const textInput = document.getElementById(`circuitText-${n}`);
    if (textInput) textInput.value = "";
    setValue(`circuitVal-${n}`, "");
    setCircuitSlotText(row, "");
    document.getElementById(`circuitDrop-${n}`)?.classList.remove("open");
    checkFormComplete();
    textInput?.focus();
  });

  setupSuggest(`circuitText-${n}`, `circuitDrop-${n}`, () => allCircuits, val => {
    // Reject picking a circuit that's already confirmed in another row —
    // getCircuitValues() only reads *other* rows here since this row's own
    // hidden value hasn't been set to `val` yet.
    const duplicate = getCircuitValues().some(v => v.toLowerCase() === val.toLowerCase());
    if (duplicate) {
      setValue(`circuitVal-${n}`, "");
      setCircuitSlotText(row, "This circuit is already added above", true);
      checkFormComplete();
      return;
    }
    setValue(`circuitVal-${n}`, val);
    autoAssignSlot();
    checkFormComplete();
  });
  document.getElementById(`circuitText-${n}`)?.addEventListener("input", () => {
    // Typing without picking a suggestion clears the confirmed value —
    // matches the Client/Brand fields, and keeps checkFormComplete/slot
    // checks from treating half-typed text as a selected circuit.
    setValue(`circuitVal-${n}`, "");
    setCircuitSlotText(row, "");
    checkFormComplete();
  });

  row.querySelector(".bk-circuit-btn").addEventListener("click", () => {
    if (row.querySelector(".bk-circuit-btn").classList.contains("remove")) {
      row.remove();
      refreshCircuitButtons();
      autoAssignSlot();
      checkFormComplete();
    } else {
      renderCircuitRow();
    }
  });

  refreshCircuitButtons();
}

/** Last row = "+" (add another); every row above it = "−" (remove this one). */
function refreshCircuitButtons() {
  const rows = document.querySelectorAll("#bkCircuitList .bk-circuit-row");
  rows.forEach((row, i) => {
    const isLast = i === rows.length - 1;
    const btn    = row.querySelector(".bk-circuit-btn");
    const icon   = btn?.querySelector(".material-symbols-outlined");
    if (!btn || !icon) return;
    btn.classList.toggle("remove", !isLast);
    btn.title = isLast ? "Add circuit" : "Remove circuit";
    icon.textContent = isLast ? "add" : "remove";
  });
}

/** Clears all circuit rows and seeds exactly one empty one. */
function resetCircuitRows() {
  const list = document.getElementById("bkCircuitList");
  if (list) list.innerHTML = "";
  renderCircuitRow();
}

/** Confirmed (autocomplete-selected) circuit values across all rows. */
function getCircuitValues() {
  return Array.from(document.querySelectorAll("#bkCircuitList .bk-circuit-row"))
    .map(row => row.querySelector("input[type=hidden]")?.value?.trim())
    .filter(Boolean);
}

/** BO/Client/Brand/dates for the circuit map's screenshot header (see
    getBookingInfo in circuit-map.js's initCircuitMapUI()). Reads straight
    from the form fields, not the campaign objects — this runs on whatever's
    currently typed/picked, including on an unsaved new booking. */
function getBookingHeaderInfo() {
  const bo     = document.getElementById("bookingOrder")?.value?.trim() || "";
  const client = document.getElementById("bookingClient")?.value?.trim() || "";
  const brand  = document.getElementById("bookingBrand")?.value?.trim() || "";
  const startEl = document.getElementById("bkStartVal");
  const endEl   = document.getElementById("bkEndVal");
  const start = startEl && !startEl.classList.contains("bk-dt-placeholder") ? startEl.textContent.trim() : "";
  const end   = endEl && !endEl.classList.contains("bk-dt-placeholder") ? endEl.textContent.trim() : "";
  const dates = start && end ? `${start} → ${end}` : (start || end || "");
  return { bo, client, brand, dates };
}

function setupSuggest(inputId, dropId, getList, onSelect) {
  const input = document.getElementById(inputId);
  const drop  = document.getElementById(dropId);
  if (!input || !drop) return;

  const showMatches = () => {
    const q = input.value.trim().toLowerCase();
    const list = getList();
    const matches = q ? list.filter(v => v.toLowerCase().includes(q)) : list.slice(0, 8);
    if (!matches.length) { drop.classList.remove("open"); return; }
    drop.innerHTML = matches.map(v => `<div class="bk-ac-item" data-val="${escapeHTML(v)}">${escapeHTML(v)}</div>`).join("");
    drop.classList.add("open");
  };

  // Show suggestions as soon as the field is clicked/focused, not just once
  // the user starts typing.
  input.addEventListener("input", showMatches);
  input.addEventListener("focus", showMatches);

  drop.addEventListener("mousedown", e => {
    const item = e.target.closest(".bk-ac-item");
    if (!item) return;
    e.preventDefault();
    input.value = item.dataset.val;
    drop.classList.remove("open");
    if (onSelect) onSelect(item.dataset.val);
    checkFormComplete();
  });

  input.addEventListener("blur", () => setTimeout(() => drop.classList.remove("open"), 150));
}

// ── DATE CALCULATOR ───────────────────────────────────────
function calcDays() {
  const sVal = document.getElementById("bookingStartDate")?.value;
  const eVal = document.getElementById("bookingEndDate")?.value;
  const tEl  = document.getElementById("bookingTotalDays");
  const disp = document.getElementById("bookingTotalDaysDisplay");
  if (!sVal || !eVal) {
    if (tEl)  tEl.value = "";
    if (disp) disp.textContent = "—";
    return;
  }
  const diff = Math.floor((new Date(eVal) - new Date(sVal)) / 86400000) + 1;
  const txt  = diff > 0 ? `${diff} Day${diff>1?"s":""}` : "Invalid dates";
  if (tEl)  tEl.value = txt;
  if (disp) disp.textContent = txt;
}

// ── SLOT AUTO-ASSIGN ──────────────────────────────────────
/**
 * For each circuit, finds the first slot (1..maxSlots) that isn't already
 * booked by another campaign overlapping [newStart, newEnd]. Shared by the
 * live preview (autoAssignSlot) and the actual save (saveBooking) so both
 * use identical logic.
 */
async function computeSlotAssignments(circuits, newStart, newEnd, editKey) {
  const [assetSnap, bookSnap] = await Promise.all([
    get(ref(rtdb, "oohassets")),
    get(ref(rtdb, "Campaigns_Booking")),
  ]);
  const assetRows = assetSnap.exists() ? Object.values(assetSnap.val()) : [];
  const bookRows  = bookSnap.exists()  ? Object.entries(bookSnap.val()) : [];

  return circuits.map(circuit => {
    const match = assetRows.find(r => r && (r.Circuits||"").trim().toLowerCase() === circuit.trim().toLowerCase());
    const maxSlots = match ? parseInt(match.Slot || 1, 10) : 1;
    const bookedSlots = new Set();
    bookRows.forEach(([k, b]) => {
      if (!b || (editKey && k === editKey)) return;
      if ((b.Circuits||"").trim().toLowerCase() !== circuit.trim().toLowerCase()) return;
      const bS = parseDate(b["Start Date"]); const bE = parseDate(b["End Date"]);
      if (!bS||!bE) return;
      bS.setHours(0,0,0,0); bE.setHours(0,0,0,0);
      if (newStart <= bE && newEnd >= bS) bookedSlots.add(parseInt(b.Slot||1,10));
    });
    let assigned = null;
    for (let s = 1; s <= maxSlots; s++) { if (!bookedSlots.has(s)) { assigned = s; break; } }
    return { circuit, assigned };
  });
}

/** Sets the small availability line under a single circuit row's input. */
function setCircuitSlotText(row, text, isError = false) {
  const el = row?.querySelector(".bk-circuit-slot");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("bk-circuit-slot-error", !!isError);
}

/** Checks slot availability per circuit row and shows it under each one. */
async function autoAssignSlot() {
  const startVal = document.getElementById("bookingStartDate")?.value;
  const endVal   = document.getElementById("bookingEndDate")?.value;
  const editKey  = document.getElementById("bookingEditKey")?.value;
  const rows     = Array.from(document.querySelectorAll("#bkCircuitList .bk-circuit-row"));
  // Only rows with a confirmed (autocomplete-selected) circuit get checked.
  const rowsWithCircuit = rows.filter(row => row.querySelector("input[type=hidden]")?.value?.trim());

  if (!rowsWithCircuit.length) return;

  if (!startVal || !endVal) {
    rowsWithCircuit.forEach(row => setCircuitSlotText(row, ""));
    return;
  }

  const newStart = parseISOLocal(startVal); const newEnd = parseISOLocal(endVal);
  if (!newStart || !newEnd || newStart > newEnd) {
    rowsWithCircuit.forEach(row => setCircuitSlotText(row, "Invalid dates", true));
    return;
  }
  newStart.setHours(0,0,0,0); newEnd.setHours(0,0,0,0);

  rowsWithCircuit.forEach(row => setCircuitSlotText(row, "Checking…"));

  try {
    const circuitNames = rowsWithCircuit.map(row => row.querySelector("input[type=hidden]").value.trim());
    const assignments  = await computeSlotAssignments(circuitNames, newStart, newEnd, editKey);
    rowsWithCircuit.forEach((row, i) => {
      const a = assignments[i];
      if (a.assigned !== null) setCircuitSlotText(row, `Slot ${a.assigned}`);
      else setCircuitSlotText(row, "No slots available", true);
    });
  } catch(e) {
    console.error(e);
    rowsWithCircuit.forEach(row => setCircuitSlotText(row, "Error", true));
  }
}

// ── DATE PICKER ───────────────────────────────────────────
function openDatePicker(mode) {
  bkPickMode = mode;
  document.getElementById("bkPickStart")?.classList.toggle("active", mode === "start");
  document.getElementById("bkPickEnd")?.classList.toggle("active",   mode === "end");
  renderPickerMonths();
  updatePickerInfo();
  document.getElementById("bkPicker")?.classList.add("open");
}

function closeDatePicker() {
  document.getElementById("bkPicker")?.classList.remove("open");
  document.getElementById("bkPickStart")?.classList.remove("active");
  document.getElementById("bkPickEnd")?.classList.remove("active");
}

function updatePickerInfo() {
  const hint  = document.getElementById("bkPickerInfo");
  const range = document.getElementById("bkPickerRange");
  const foot  = document.querySelector(".bk-picker-foot");
  const qpicks = document.querySelectorAll(".bk-qpick");

  if (!bkPickerStart) {
    if (hint)  { hint.textContent = "Select the campaign start date"; hint.classList.remove("bk-hint-small"); }
    if (range) range.textContent = "—";
    foot?.classList.remove("show");
    qpicks.forEach(b => { b.disabled = true; b.classList.remove("active"); });
  } else if (!bkPickerEnd) {
    if (hint)  { hint.textContent = "Now select the end date"; hint.classList.add("bk-hint-small"); }
    if (range) range.textContent = `${fmtPickDate(bkPickerStart)} → ?`;
    foot?.classList.add("show");
    qpicks.forEach(b => b.disabled = false);
  } else {
    const days = Math.floor((bkPickerEnd - bkPickerStart) / 86400000) + 1;
    if (hint)  { hint.textContent = `${days} days selected`; hint.classList.add("bk-hint-small"); }
    if (range) range.textContent = `${fmtPickDate(bkPickerStart)} → ${fmtPickDate(bkPickerEnd)}`;
    foot?.classList.add("show");
    qpicks.forEach(b => b.disabled = false);
  }
}

function renderPickerMonths() {
  const container = document.getElementById("bkPickerMonths");
  if (!container) return;
  container.innerHTML = "";
  const today = new Date(); today.setHours(0,0,0,0);

  for (let mi = 0; mi < 6; mi++) {
    const firstDay = new Date(today.getFullYear(), today.getMonth() + mi, 1);
    const year  = firstDay.getFullYear();
    const month = firstDay.getMonth();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const monthEl = document.createElement("div");
    monthEl.className = "bk-cal-month";
    monthEl.innerHTML = `<div class="bk-cal-month-title">${FULL_MONTHS[month]} ${year}</div>`;

    const grid = document.createElement("div");
    grid.className = "bk-cal-grid";
    ["S","M","T","W","T","F","S"].forEach(d => {
      const dh = document.createElement("div");
      dh.className = "bk-cal-dh"; dh.textContent = d;
      grid.appendChild(dh);
    });

    const startDow = firstDay.getDay();
    for (let i = 0; i < startDow; i++) {
      const e = document.createElement("div");
      e.className = "bk-cal-day bk-cal-empty";
      grid.appendChild(e);
    }

    for (let d = 1; d <= lastDate; d++) {
      const date = new Date(year, month, d); date.setHours(0,0,0,0);
      const dayEl = document.createElement("div");
      dayEl.className = "bk-cal-day";
      dayEl.textContent = d;
      dayEl.dataset.dow = date.getDay();

      if (date < today) {
        dayEl.classList.add("bk-cal-past");
      } else {
        if (date.getTime() === today.getTime()) dayEl.classList.add("bk-cal-today");
        applyPickerHighlight(dayEl, date);
        dayEl.addEventListener("click", () => onPickerDayClick(new Date(date)));
      }
      grid.appendChild(dayEl);
    }

    monthEl.appendChild(grid);
    container.appendChild(monthEl);
  }

  // Scroll to month containing start date
  if (bkPickerStart) {
    const months = container.querySelectorAll(".bk-cal-month");
    months.forEach((m, i) => {
      const title = m.querySelector(".bk-cal-month-title")?.textContent || "";
      if (title.includes(FULL_MONTHS[bkPickerStart.getMonth()]) && title.includes(String(bkPickerStart.getFullYear()))) {
        setTimeout(() => m.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    });
  }
}

function applyPickerHighlight(el, date) {
  const t = date.getTime();
  const s = bkPickerStart?.getTime();
  const e = bkPickerEnd?.getTime();
  if (s && e && t > s && t < e) el.classList.add("bk-sel-range");
  if (s && t === s) el.classList.add("bk-sel-start");
  if (e && t === e) el.classList.add("bk-sel-end");
}

let pickerWarningTimeout = null;
/** Briefly shows a warning in place of the picker's normal hint text. */
function showPickerWarning(msg) {
  const hint = document.getElementById("bkPickerInfo");
  if (!hint) return;
  clearTimeout(pickerWarningTimeout);
  hint.textContent = msg;
  hint.classList.add("bk-hint-warning");
  pickerWarningTimeout = setTimeout(() => {
    hint.classList.remove("bk-hint-warning");
    updatePickerInfo();
  }, 2200);
}

function onPickerDayClick(date) {
  date.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  if (date < today) return;

  if (bkPickMode === "start" || !bkPickerStart) {
    bkPickerStart = date;
    bkPickerEnd   = addDays(date, 13); // 2-week default
    bkPickMode    = "end";
    document.getElementById("bkPickStart")?.classList.remove("active");
    document.getElementById("bkPickEnd")?.classList.add("active");
    document.querySelectorAll(".bk-qpick").forEach(b => {
      b.disabled = false;
      b.classList.toggle("active", b.dataset.weeks === "2");
    });
  } else if (date < bkPickerStart) {
    // End Date must never be earlier than Start Date — reject the click
    // and warn instead of silently treating it as a new start date. Use
    // the Reset button to actually restart the selection.
    showPickerWarning("End Date cannot be earlier than Start Date");
    return;
  } else {
    bkPickerEnd = date;
  }

  renderPickerMonths();
  updatePickerInfo();
}

function applyPickerToForm() {
  if (!bkPickerStart || !bkPickerEnd) return;
  setValue("bookingStartDate", toISO(bkPickerStart));
  setValue("bookingEndDate",   toISO(bkPickerEnd));
  const sv = document.getElementById("bkStartVal");
  if (sv) { sv.textContent = fmtPickDate(bkPickerStart); sv.classList.remove("bk-dt-placeholder"); }
  const ev = document.getElementById("bkEndVal");
  if (ev) { ev.textContent = fmtPickDate(bkPickerEnd); ev.classList.remove("bk-dt-placeholder"); }
  calcDays();
  autoAssignSlot();
  checkFormComplete();
  closeDatePicker();
}

// ── SAVE BOOKING ──────────────────────────────────────────
async function saveBooking() {
  const booking  = document.getElementById("bookingOrder")?.value;
  const client   = document.getElementById("bookingClient")?.value?.trim();
  const brand    = document.getElementById("bookingBrand")?.value?.trim();
  const circuits = getCircuitValues();
  const start    = document.getElementById("bookingStartDate")?.value;
  const end      = document.getElementById("bookingEndDate")?.value;
  // Saved as initials, not the full name shown in the "Booked by" bar.
  const person   = currentUserInitials;
  const status   = document.getElementById("campaignStatus")?.value || "Pending";
  const editKey  = document.getElementById("bookingEditKey")?.value;

  if (!client||!brand||!circuits.length||!start||!end) { alert("Please fill in all required fields."); return; }

  const newStart = parseISOLocal(start); const newEnd = parseISOLocal(end);
  newStart.setHours(0,0,0,0); newEnd.setHours(0,0,0,0);
  if (newEnd < newStart) { alert("End Date cannot be earlier than Start Date."); return; }

  const btn      = document.getElementById("confirmBookingBtn");
  const idleText = editKey ? "Update Booking" : "Save Booking";
  btn.textContent = "Saving…"; btn.disabled = true;

  try {

    // Re-check availability fresh at save time (rather than trusting the
    // last preview) — one assignment per circuit, since each circuit
    // becomes its own Campaigns_Booking record.
    const assignments = await computeSlotAssignments(circuits, newStart, newEnd, editKey);
    const unavailable = assignments.filter(a => a.assigned === null);
    if (unavailable.length) {
      alert(`No available slot for: ${unavailable.map(a => a.circuit).join(", ")}`);
      btn.textContent = idleText; btn.disabled = false;
      return;
    }

    const makeRecord = a => ({
      BO: booking, Client: client, "Brand Campaign": brand,
      Circuits: a.circuit, Slot: a.assigned,
      "Start Date": toMMDDYYYY(start), "End Date": toMMDDYYYY(end),
      Status: status, Person: person
    });

    const existingSnap = await get(ref(rtdb, "Campaigns_Booking"));
    let nextKey = 1;
    if (existingSnap.exists()) {
      const val = existingSnap.val();
      nextKey = Array.isArray(val) ? val.filter(Boolean).length : Object.keys(val).length;
    }

    if (editKey) {
      // Editing always starts from a single circuit row (see openEditModal),
      // so update that record in place; any *additional* rows the user adds
      // while editing become new records rather than overwriting it.
      await update(ref(rtdb, `Campaigns_Booking/${editKey}`), makeRecord(assignments[0]));
      for (let i = 1; i < assignments.length; i++) {
        await set(ref(rtdb, `Campaigns_Booking/${nextKey++}`), makeRecord(assignments[i]));
      }
    } else {
      for (const a of assignments) {
        await set(ref(rtdb, `Campaigns_Booking/${nextKey++}`), makeRecord(a));
      }
    }

    // Success — green button, no Reset button cluttering the confirmation
    // (applies the same whether this was an Add or an Update; edit mode
    // already keeps Reset hidden throughout, so hiding it again is a no-op).
    btn.textContent = "Saved! ✓";
    btn.classList.add("success");
    const clearBtnNow = document.getElementById("clearFormBtn");
    if (clearBtnNow) clearBtnNow.hidden = true;

    const tables = await loadAll();
    allCampaigns = getCampaigns(tables);
    applyFilters();
    setTimeout(() => {
      // resetModal() sets the button back to "Save Booking" (it also
      // un-hides Reset) since closing always returns to add-mode.
      btn.classList.remove("success");
      btn.disabled = false;
      resetModal();
      document.getElementById("bookingModal")?.classList.remove("active");
    }, 1200);
  } catch(e) {
    console.error(e); btn.textContent = "Error — try again"; btn.disabled = false;
  }
}

// ── CALENDAR (booking schedule view) ─────────────────────
async function buildCalendar() {
  const table = document.getElementById("bookingCalendar"); if (!table) return;
  const startD = calDrpStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const endD   = calDrpEnd   || new Date(new Date().getFullYear(), new Date().getMonth()+1, 0);
  const [circuitSlots, bookings] = await Promise.all([loadCircuitSlots(), loadBookings()]);
  if (!circuitSlots.length) {
    table.innerHTML = `<tr><td style="padding:20px;text-align:center;color:var(--text-muted);">No circuits found</td></tr>`;
    return;
  }
  const dates = [], cur = new Date(startD);
  while (cur <= endD) { dates.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
  const today = new Date(); today.setHours(0,0,0,0);
  table.innerHTML = "";
  const thead = document.createElement("thead");
  const hrow  = document.createElement("tr");
  hrow.innerHTML = `<th class="circuit-col head">Circuit</th><th class="slot-col head">Slot</th>`;
  dates.forEach(d => {
    const th = document.createElement("th");
    th.className = "date-head" + (d.toDateString()===today.toDateString() ? " today-head" : "");
    th.dataset.date = toISO(d);
    th.innerHTML = `${d.toLocaleDateString("en",{month:"short"})}<br>${d.getDate()}`;
    hrow.appendChild(th);
  });
  thead.appendChild(hrow); table.appendChild(thead);
  const tbody = document.createElement("tbody");
  circuitSlots.forEach(circuit => {
    for (let slot=1; slot<=circuit.slots; slot++) {
      const tr = document.createElement("tr");
      if (slot===1) {
        const td = document.createElement("td");
        td.className="circuit-col"; td.rowSpan=circuit.slots; td.textContent=circuit.name;
        tr.appendChild(td);
      }
      const st = document.createElement("td");
      st.className="slot-col"; st.textContent=`Slot ${slot}`; tr.appendChild(st);
      dates.forEach(d => {
        const td = document.createElement("td");
        td.dataset.date = toISO(d); tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  });
  table.appendChild(tbody);
  calBookings   = bookings;
  calDates      = dates;
  calRangeStart = new Date(startD);
  calRangeEnd   = new Date(endD);
  requestAnimationFrame(filterAndRenderBars);
}

function filterAndRenderBars() {
  const q = (document.getElementById("calSearch")?.value || "").toLowerCase().trim();
  const filtered = q
    ? calBookings.filter(b => [
        b.Client || "", b["Brand Campaign"] || "",
        b.Circuits || b.Circuit || "", b.Status || "", b.Person || ""
      ].join(" ").toLowerCase().includes(q))
    : calBookings;
  document.querySelectorAll("#bookingCalendar .booking-bar").forEach(el => el.remove());
  renderBars(filtered, calDates, new Date(calRangeStart), new Date(calRangeEnd));
}

function renderBars(bookings, dates, startD, endD) {
  startD.setHours(0,0,0,0); endD.setHours(0,0,0,0);
  const rows = document.querySelectorAll("#bookingCalendar tbody tr");
  bookings.forEach(b => {
    const start = parseDate(b["Start Date"]||b.startDate);
    const end   = parseDate(b["End Date"]||b.endDate);
    if (!start||!end) return;
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    const asset  = (b.Circuits||b.Circuit||"").toLowerCase().replace(/[_-]/g," ").trim();
    const slotVal = Number(b.Slot||b.slot||1);
    const client  = b.Client||"Booking";
    const brand   = b["Brand Campaign"]||"";
    const status  = (b.Status||"").toLowerCase();
    const person  = b.Person||"";
    rows.forEach(row => {
      const slotCell = row.querySelector(".slot-cell,.slot-col:not(.head)"); if (!slotCell) return;
      let rowCircuit = "";
      const cc = row.querySelector(".circuit-col:not(.head)");
      if (cc) rowCircuit = cc.textContent.trim();
      else {
        let prev = row.previousElementSibling;
        while (prev && !rowCircuit) {
          const c2 = prev.querySelector(".circuit-col:not(.head)");
          if (c2) rowCircuit = c2.textContent.trim();
          prev = prev.previousElementSibling;
        }
      }
      const rc = rowCircuit.toLowerCase().replace(/[_-]/g," ").trim();
      if (!rc.includes(asset) && !asset.includes(rc)) return;
      if (parseInt(slotCell.textContent.replace("Slot","").trim(),10) !== slotVal) return;
      const cells = Array.from(row.querySelectorAll("td[data-date]"));
      let si = cells.findIndex(td => td.dataset.date === toISO(start));
      let ei = cells.findIndex(td => td.dataset.date === toISO(end));
      if (si===-1 && start<startD) si=0;
      if (ei===-1 && end>endD) ei=cells.length-1;
      if (si===-1||ei===-1) return;
      const bar = document.createElement("div");
      bar.className = "booking-bar";
      if (status.includes("live")) bar.classList.add("live");
      else if (status.includes("signed")) bar.classList.add("signed");
      else if (status.includes("pending")) bar.classList.add("pending");
      else bar.classList.add("completed");
      bar.style.width = `calc(${(ei-si+1)*100}% + ${ei-si}px)`;
      bar.textContent = brand ? `${client} | ${brand} - ${person}` : client;
      cells[si].style.position = "relative"; cells[si].appendChild(bar);
    });
  });
}

async function loadCircuitSlots() {
  try {
    const snap = await get(ref(rtdb,"oohassets")); if (!snap.exists()) return [];
    const d = snap.val(), rows = Array.isArray(d) ? d : Object.values(d);
    return rows.filter(r=>r&&r.Circuits).map(r=>({name:r.Circuits.trim(),slots:parseInt(r.Slot||1,10)}));
  } catch(e) { return []; }
}
async function loadBookings() {
  try {
    const snap = await get(ref(rtdb,"Campaigns_Booking")); if (!snap.exists()) return [];
    const d = snap.val(); return Array.isArray(d) ? d : Object.values(d);
  } catch(e) { return []; }
}

// ── DOWNLOAD ──────────────────────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function fmtDateHeader(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getDateRangeStr() {
  if (!drpStart || !drpEnd) return "All dates";
  return `${fmtDateHeader(drpStart)} - ${fmtDateHeader(drpEnd)}`;
}

function filenameDateRange(start, end) {
  if (!start || !end) return "";
  const fmt = d => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return ` (${fmt(start)}-${fmt(end)})`;
}

function loadImageForPDF(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function downloadAsPDF() {
  const btn = document.getElementById("downloadBtn");
  if (btn) btn.classList.add("loading");
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const M      = 12.7;  // 0.5 inch margin
    const PAGE_W = doc.internal.pageSize.getWidth();  // 297mm landscape

    // ── Load logo ─────────────────────────────
    let logoData = null;
    try { logoData = await loadImageForPDF("images/scooplogo.png"); } catch (_) {}

    // ── Header ───────────────────────────────
    const LOGO_H = 12;  // desired logo height in mm
    const logoW  = logoData ? (LOGO_H * logoData.w) / logoData.h : 0;

    let y = M + 4;  // header top (margin + small top padding)

    // "SCOOP OOH" brand title — baseline at y + 5.5
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 50);
    doc.text("SCOOP Media and Communication Co.", M, y + 5.5);

    // Logo — top-right, vertically aligned with SCOOP OOH line
    if (logoData) {
      doc.addImage(logoData.dataUrl, "PNG", PAGE_W - M - logoW, y, logoW, LOGO_H);
    }
    y += LOGO_H;  // advance past the logo block height

    // "Campaign Bookings" subtitle
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 50);
    doc.text("Campaign Bookings", M, y + 4);
    y += 7;

    // Date range (left)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 120, 150);
    doc.text(`Dates: ${getDateRangeStr()}`, M, y + 2);

    // Status totals (right, same baseline)
    const statusOrder  = ["Live", "BO Signed", "Pending", "Completed", "Cancelled"];
    const statusCounts = {};
    currentFiltered.forEach(c => {
      const s = c.status || "Other";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const parts = statusOrder.filter(s => statusCounts[s]).map(s => ({ count: statusCounts[s], label: s }));

    if (parts.length) {
      const SEP = "   •   ";
      doc.setFontSize(10);

      // Measure total width first for right-alignment
      let totalW = 0;
      parts.forEach((p, i) => {
        doc.setFont("helvetica", "normal");   totalW += doc.getTextWidth(String(p.count));
        doc.setFont("helvetica", "normal"); totalW += doc.getTextWidth(": " + p.label);
        if (i < parts.length - 1) { doc.setFont("helvetica", "normal"); totalW += doc.getTextWidth(SEP); }
      });

      let tx = PAGE_W - M - totalW;
      const ty = y + 2;

      parts.forEach((p, i) => {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 50);
        const numStr = String(p.count);
        doc.text(numStr, tx, ty);
        tx += doc.getTextWidth(numStr);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(110, 120, 150);
        const lblStr = ": " + p.label;
        doc.text(lblStr, tx, ty);
        tx += doc.getTextWidth(lblStr);

        if (i < parts.length - 1) {
          const sepStr = SEP;
          doc.text(sepStr, tx, ty);
          tx += doc.getTextWidth(sepStr);
        }
      });
    }

    y += 6;

    const startY = y;  // table begins immediately after header content

    // ── Column layout ─────────────────────────
    // Landscape A4: 297mm - 2×12.7mm = 271.6mm available
    const PAD      = 2;
    const COL1_W   = 75;                   // Client/Brand
    const COL2_W   = 70;                   // Circuits
    const TEXT_W1  = COL1_W - PAD * 4;
    const TEXT_W2  = COL2_W - PAD * 2;
    const BLOCK_GAP = 1.5;

    // Real line heights from jsPDF font metrics
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const CLIENT_LH  = doc.getLineHeight() / doc.internal.scaleFactor;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    const BRAND_LH   = doc.getLineHeight() / doc.internal.scaleFactor;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const CIRCUIT_LH = doc.getLineHeight() / doc.internal.scaleFactor;

    // Pre-compute wrapped lines for col 1 (Client/Brand) and col 2 (Circuits)
    const cellLines = currentFiltered.map(c => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const clientLines = c.client !== "—" ? doc.splitTextToSize(c.client, TEXT_W1) : [];

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      const brandLines = c.brand !== "—" ? doc.splitTextToSize(c.brand, TEXT_W1) : [];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      const circuitLines = c.asset !== "—" ? doc.splitTextToSize(c.asset, TEXT_W2) : [];

      return { clientLines, brandLines, circuitLines };
    });

    const rows = currentFiltered.map(c => [
      c.bo || "—",
      "",   // col 1 — custom-drawn
      "",   // col 2 — custom-drawn
      c.date.replace("→", "-"),
      c.status,
      c.person
    ]);

    doc.autoTable({
      startY,
      head: [["Booking Order", "Client / Brand", "Circuits", "Dates", "Status", "Person"]],
      body: rows,
      styles: {
        font: "helvetica", fontSize: 10.5, cellPadding: PAD,
        valign: "middle", overflow: "linebreak"
      },
      headStyles: {
        fillColor: [79, 70, 229], textColor: 255,
        fontStyle: "bold", fontSize: 11, cellPadding: PAD        
      },
      alternateRowStyles: { fillColor: [245, 245, 255] },
      columnStyles: {
        0: { cellWidth: 40,   valign: "middle" },
        1: { cellWidth: COL1_W },
        2: { cellWidth: COL2_W },
        3: { cellWidth: 42,   valign: "middle" },
        4: { cellWidth: 28,   valign: "middle" },
        5: { cellWidth: 22.6, valign: "middle" }
      },
      margin: { left: M, right: M },

      didParseCell: (data) => {
        if (data.section !== "body") return;
        const row = cellLines[data.row.index] || {};

        if (data.column.index === 1) {
          const { clientLines = [], brandLines = [] } = row;
          const clientBlockH = clientLines.length * CLIENT_LH;
          const brandBlockH  = brandLines.length  * BRAND_LH;
          const hasGap       = clientLines.length && brandLines.length ? BLOCK_GAP : 0;
          data.cell.text = [];
          data.cell.styles.minCellHeight = Math.max(10, clientBlockH + hasGap + brandBlockH + PAD * 2);
        }

        if (data.column.index === 2) {
          const { circuitLines = [] } = row;
          data.cell.text = [];
          data.cell.styles.minCellHeight = Math.max(10, circuitLines.length * CIRCUIT_LH + PAD * 2);
        }
      },

      didDrawCell: (data) => {
        if (data.section !== "body") return;
        const row = cellLines[data.row.index] || {};
        const cx  = data.cell.x + PAD;
        const cy  = data.cell.y;
        const ch  = data.cell.height;

        if (data.column.index === 1) {
          const { clientLines = [], brandLines = [] } = row;
          if (!clientLines.length && !brandLines.length) return;

          const clientBlockH = clientLines.length * CLIENT_LH;
          const brandBlockH  = brandLines.length  * BRAND_LH;
          const hasGap       = clientLines.length && brandLines.length ? BLOCK_GAP : 0;
          const totalH       = clientBlockH + hasGap + brandBlockH;
          let curY = cy + (ch - totalH) / 2;

          if (clientLines.length) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            doc.setTextColor(140, 150, 175);
            clientLines.forEach((line, i) => {
              doc.text(line, cx, curY + CLIENT_LH * (i + 1) - CLIENT_LH * 0.15);
            });
            curY += clientBlockH + hasGap;
          }
          if (brandLines.length) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10.5);
            doc.setTextColor(20, 20, 50);
            brandLines.forEach((line, i) => {
              doc.text(line, cx, curY + BRAND_LH * (i + 1) - BRAND_LH * 0.15);
            });
          }
        }

        if (data.column.index === 2) {
          const { circuitLines = [] } = row;
          if (!circuitLines.length) return;

          const totalH = circuitLines.length * CIRCUIT_LH;
          let curY = cy + (ch - totalH) / 2;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(10.5);
          doc.setTextColor(80, 90, 120);
          circuitLines.forEach((line, i) => {
            doc.text(line, cx, curY + CIRCUIT_LH * (i + 1) - CIRCUIT_LH * 0.15);
          });
        }
      }
    });

    doc.save(`SCOOP_OOH_Campaign_Bookings${filenameDateRange(drpStart, drpEnd)}.pdf`);
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

async function downloadAsExcel() {
  const btn = document.getElementById("downloadBtn");
  if (btn) btn.classList.add("loading");
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const wsData = [
      ["SCOOP Media and Communication Co."],
      ["Campaign Bookings"],
      [`Dates: ${getDateRangeStr()}`],
      [],
      ["BO No", "Client", "Brand Campaign", "Circuit", "Start Date", "End Date", "Status", "Person"],
      ...currentFiltered.map(c => [
        c.bo || "", c.client, c.brand !== "—" ? c.brand : "",
        c.asset,
        c.rawStartDate, c.rawEndDate, c.status, c.person
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [15, 25, 40, 36, 14, 14, 14, 10].map(w => ({ wch: w }));
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Campaign Bookings");
    XLSX.writeFile(wb, `SCOOP_OOH_Campaign_Bookings${filenameDateRange(drpStart, drpEnd)}.xlsx`);
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

// ── CALENDAR DOWNLOAD ─────────────────────────────────────
function getCalDateRangeStr() {
  if (!calRangeStart || !calRangeEnd) return "All dates";
  return `${fmtDateHeader(calRangeStart)} - ${fmtDateHeader(calRangeEnd)}`;
}

/**
 * Shrinks an export to the span that actually has booking data instead of
 * the full selected calendar window (e.g. "All Year" = 365 columns).
 * Exporting the full window regardless of data is what was silently
 * breaking the PDF export (html2canvas/canvas can't produce a canvas wider
 * than ~32,767px, which a 365-day table at scale:2 comes right up against).
 */
function getPopulatedDateRange(bookings, fallbackStart, fallbackEnd) {
  let min = null, max = null;
  bookings.forEach(b => {
    const s = parseDate(b["Start Date"]); const e = parseDate(b["End Date"]);
    if (s && (!min || s < min)) min = s;
    if (e && (!max || e > max)) max = e;
  });
  if (!min || !max) return { start: fallbackStart, end: fallbackEnd };
  const start = fallbackStart && fallbackStart > min ? fallbackStart : min;
  const end   = fallbackEnd   && fallbackEnd   < max ? fallbackEnd   : max;
  return { start, end };
}

function getCalFilteredBookings() {
  if (!calBookings.length) return [];
  const lo = calRangeStart ? new Date(calRangeStart) : null;
  const hi = calRangeEnd   ? new Date(calRangeEnd)   : null;
  if (lo) lo.setHours(0, 0, 0, 0);
  if (hi) hi.setHours(0, 0, 0, 0);
  return calBookings
    .filter(b => {
      if (!b) return false;
      const s = parseDate(b["Start Date"]); const e = parseDate(b["End Date"]);
      if (!s || !e) return false;
      s.setHours(0,0,0,0); e.setHours(0,0,0,0);
      return (!lo || s <= hi) && (!hi || e >= lo);
    })
    .sort((a, b) => {
      const ad = parseDate(a["Start Date"]); const bd = parseDate(b["Start Date"]);
      return (ad || 0) - (bd || 0);
    });
}

async function downloadCalendarAsPDF() {
  const btn = document.getElementById("calDownloadBtn");
  if (btn) btn.classList.add("loading");
  const hiddenEls = [];
  let expStart = null, expEnd = null;
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    const { jsPDF } = window.jspdf;

    const table = document.getElementById("bookingCalendar");
    if (!table) return;

    // Hide date columns outside the range that actually has booking data —
    // exporting the full selected window (e.g. "All Year" = 365 columns)
    // regardless of data pushes the screenshot past the browser's max
    // canvas width and silently fails to produce a PDF at all.
    const filteredForExport = getCalFilteredBookings();
    ({ start: expStart, end: expEnd } = getPopulatedDateRange(filteredForExport, calRangeStart, calRangeEnd));
    if (expStart && expEnd) {
      table.querySelectorAll("[data-date]").forEach(el => {
        const d = new Date(el.dataset.date);
        if (d < expStart || d > expEnd) {
          hiddenEls.push(el);
          el.style.display = "none";
        }
      });
    }

    const M      = 12.7;  // 0.5 inch margin (mm)
    const doc    = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const PAGE_W = doc.internal.pageSize.getWidth();   // 297mm
    const PAGE_H = doc.internal.pageSize.getHeight();  // 210mm
    const AVAIL_W = PAGE_W - M * 2;

    // ── Load logo ─────────────────────────────
    let logoData = null;
    try { logoData = await loadImageForPDF("images/scooplogo.png"); } catch (_) {}

    // ── Header ───────────────────────────────
    const LOGO_H = 12;
    const logoW  = logoData ? (LOGO_H * logoData.w) / logoData.h : 0;

    let y = M + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 50);
    doc.text("SCOOP Media and Communication Co.", M, y + 5.5);

    if (logoData) {
      doc.addImage(logoData.dataUrl, "PNG", PAGE_W - M - logoW, y, logoW, LOGO_H);
    }
    y += LOGO_H;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 50);
    doc.text("Campaign Calendar", M, y + 4);
    y += 7;

    // Date range (left)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 120, 150);
    const expRangeStr = expStart && expEnd ? `${fmtDateHeader(expStart)} - ${fmtDateHeader(expEnd)}` : getCalDateRangeStr();
    doc.text(`Dates: ${expRangeStr}`, M, y + 2);

    // Status totals (right, same baseline)
    const calFiltered   = filteredForExport;
    const calStatusOrder  = ["Live", "BO Signed", "Pending", "Completed", "Cancelled"];
    const calStatusCounts = {};
    calFiltered.forEach(b => {
      const s = b.Status || "Other";
      calStatusCounts[s] = (calStatusCounts[s] || 0) + 1;
    });
    const calParts = calStatusOrder.filter(s => calStatusCounts[s]).map(s => ({ count: calStatusCounts[s], label: s }));

    if (calParts.length) {
      const SEP = "   •   ";
      doc.setFontSize(10);
      let totalW = 0;
      calParts.forEach((p, i) => {
        doc.setFont("helvetica", "bold");   totalW += doc.getTextWidth(String(p.count));
        doc.setFont("helvetica", "normal"); totalW += doc.getTextWidth(": " + p.label);
        if (i < calParts.length - 1) totalW += doc.getTextWidth(SEP);
      });
      let tx = PAGE_W - M - totalW;
      const ty = y + 2;
      calParts.forEach((p, i) => {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 50);
        const numStr = String(p.count);
        doc.text(numStr, tx, ty);
        tx += doc.getTextWidth(numStr);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(110, 120, 150);
        const lblStr = ": " + p.label;
        doc.text(lblStr, tx, ty);
        tx += doc.getTextWidth(lblStr);

        if (i < calParts.length - 1) {
          doc.text(SEP, tx, ty);
          tx += doc.getTextWidth(SEP);
        }
      });
    }

    y += 6;
    const HEADER_H = y - M;  // dynamic — actual space used by header block

    // ── Screenshot the live calendar table ────────────────
    const bgColor = getComputedStyle(document.body).backgroundColor || "#ffffff";
    const canvas  = await window.html2canvas(table, {
      scale: 2, useCORS: true, allowTaint: true,
      backgroundColor: bgColor, logging: false,
    });

    const imgData  = canvas.toDataURL("image/png");
    const drawW    = AVAIL_W;
    const drawH    = (canvas.height / canvas.width) * drawW;
    const pxPerMm  = canvas.width / drawW;

    // Measure the thead height so we can repeat it on subsequent pages
    const theadEl  = table.querySelector("thead");
    const theadPxH = theadEl ? theadEl.offsetHeight * 2 : 0; // ×2 for canvas scale:2
    const theadMmH = theadPxH / pxPerMm;

    const firstH = PAGE_H - M - HEADER_H - M;  // image height available on page 1
    const otherH = PAGE_H - M * 2;              // image height available on pages 2+

    if (drawH <= firstH) {
      // Entire Gantt fits on page 1
      doc.addImage(imgData, "PNG", M, M + HEADER_H, drawW, drawH);
    } else {
      // Page 1: top slice (includes the column header row naturally)
      const firstStripPx  = Math.min(firstH * pxPerMm, canvas.height);
      const firstStripMm  = firstStripPx / pxPerMm;
      const strip1 = document.createElement("canvas");
      strip1.width = canvas.width; strip1.height = firstStripPx;
      strip1.getContext("2d").drawImage(canvas, 0, 0, canvas.width, firstStripPx, 0, 0, canvas.width, firstStripPx);
      doc.addImage(strip1.toDataURL("image/png"), "PNG", M, M + HEADER_H, drawW, firstStripMm);

      // Subsequent pages: repeat thead at top, then next body chunk below it
      let bodyYPx = firstStripPx;
      while (bodyYPx < canvas.height) {
        doc.addPage();
        const bodyChunkPx  = Math.min((otherH * pxPerMm) - theadPxH, canvas.height - bodyYPx);
        const totalStripPx = theadPxH + bodyChunkPx;
        const totalStripMm = totalStripPx / pxPerMm;

        const strip = document.createElement("canvas");
        strip.width = canvas.width; strip.height = totalStripPx;
        const ctx   = strip.getContext("2d");
        // thead repeated at top
        ctx.drawImage(canvas, 0, 0, canvas.width, theadPxH, 0, 0, canvas.width, theadPxH);
        // body chunk below thead
        ctx.drawImage(canvas, 0, bodyYPx, canvas.width, bodyChunkPx, 0, theadPxH, canvas.width, bodyChunkPx);

        doc.addImage(strip.toDataURL("image/png"), "PNG", M, M, drawW, totalStripMm);
        bodyYPx += bodyChunkPx;
      }
    }

    doc.save(`SCOOP_OOH_Campaign_Calendar${filenameDateRange(expStart, expEnd)}.pdf`);
  } catch (err) {
    console.error("Calendar PDF export failed:", err);
    alert("Couldn't generate the calendar PDF. Please try again.");
  } finally {
    hiddenEls.forEach(el => { el.style.display = ""; });
    if (btn) btn.classList.remove("loading");
  }
}

async function downloadCalendarAsExcel() {
  const btn = document.getElementById("calDownloadBtn");
  if (btn) btn.classList.add("loading");
  try {
    await loadScript("https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js");

    // Fetch same data sources as buildCalendar
    const [circuitSlots, allBookings] = await Promise.all([loadCircuitSlots(), loadBookings()]);
    const filtered  = getCalFilteredBookings();
    const bookings  = filtered.length ? filtered : allBookings;

    // Trim to the range that actually has booking data instead of the full
    // selected calendar window (e.g. "All Year" = 365 mostly-empty columns).
    const { start: expStart, end: expEnd } = getPopulatedDateRange(bookings, calRangeStart, calRangeEnd);
    const dates = [];
    if (expStart && expEnd) {
      const cur = new Date(expStart);
      while (cur <= expEnd) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    } else if (calDates.length) {
      dates.push(...calDates);
    }

    // Deduplicate by circuit name, keeping max slot count (mirrors calendar row structure)
    const circuitMap = new Map();
    circuitSlots.forEach(c => {
      const prev = circuitMap.get(c.name);
      if (!prev || prev.slots < c.slots) circuitMap.set(c.name, c);
    });
    const circuits = [...circuitMap.values()];

    // Same fuzzy circuit match as renderBars
    function circuitMatch(b, name) {
      const asset = (b.Circuits || b.Circuit || "").toLowerCase().replace(/[_-]/g, " ").trim();
      const rc    = name.toLowerCase().replace(/[_-]/g, " ").trim();
      return rc.includes(asset) || asset.includes(rc);
    }

    function bookingOn(circuitName, slot, date) {
      const d = new Date(date); d.setHours(0, 0, 0, 0);
      return bookings.find(b => {
        if (!circuitMatch(b, circuitName)) return false;
        if (parseInt(b.Slot || b.slot || 1) !== slot) return false;
        const s = parseDate(b["Start Date"] || b.startDate);
        const e = parseDate(b["End Date"]   || b.endDate);
        if (!s || !e) return false;
        s.setHours(0,0,0,0); e.setHours(0,0,0,0);
        return d >= s && d <= e;
      }) || null;
    }

    // Same label format as the booking bar in the HTML calendar
    function barLabel(b) {
      const client = b.Client || "Booking";
      const brand  = b["Brand Campaign"] || "";
      const person = b.Person || "";
      return brand ? `${client} | ${brand} - ${person}` : client;
    }

    // Unique key to detect booking span boundaries
    function bKey(b) {
      return b
        ? `${b.Circuits || b.Circuit}|${b.Slot}|${b["Start Date"]}|${b["End Date"]}`
        : null;
    }

    // Status → ARGB fill (matches UI bar colors)
    function statusFill(status) {
      const s = (status || "").toLowerCase();
      let argb = "FF6366F1";
      if (s.includes("live"))        argb = "FF10B981";
      else if (s.includes("signed"))     argb = "FFF43F5E";
      else if (s.includes("pending"))    argb = "FFF59E0B";
      else if (s.includes("completed"))  argb = "FF0496FF";
      else if (s.includes("cancel"))     argb = "FF6B7A99";
      return { type: "pattern", pattern: "solid", fgColor: { argb } };
    }

    const ExcelJS   = window.ExcelJS;
    const wb        = new ExcelJS.Workbook();
    wb.creator      = "SCOOP Media and Communication Co."; wb.created = new Date();
    const totalCols = 2 + dates.length;

    const ws = wb.addWorksheet("Campaign Calendar", {
      views: [{ state: "frozen", xSplit: 2, ySplit: 5 }]
    });

    // ── Header rows ───────────────────────────────────────
    const addHdrRow = (text, rowNum, font, height) => {
      ws.addRow([text]);
      ws.mergeCells(rowNum, 1, rowNum, totalCols);
      const c = ws.getCell(rowNum, 1);
      c.font = font; c.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(rowNum).height = height;
    };
    addHdrRow("SCOOP Media and Communication Co.",         1, { bold: true, size: 18, color: { argb: "FF4F46E5" } }, 28);
    addHdrRow("Campaign Calendar", 2, { bold: true, size: 13, color: { argb: "FF141432" } }, 22);
    const expRangeStr = expStart && expEnd ? `${fmtDateHeader(expStart)} - ${fmtDateHeader(expEnd)}` : getCalDateRangeStr();
    addHdrRow(`Dates: ${expRangeStr}`, 3, { size: 10, color: { argb: "FF6E7A99" } }, 18);
    ws.addRow([]); ws.getRow(4).height = 6;

    // ── Column header row (row 5) ─────────────────────────
    const dateLabels = dates.map(d =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    );
    ws.addRow(["Circuit", "Slot", ...dateLabels]);
    const hdr = ws.getRow(5); hdr.height = 22;
    hdr.eachCell(cell => {
      cell.font      = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border    = { bottom: { style: "medium", color: { argb: "FF3730A3" } } };
    });

    // ── Data rows ─────────────────────────────────────────
    const ALT_FILL  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F3FF" } };
    let   nextRow   = 6;   // first data row in Excel (1-indexed)
    let   globalIdx = 0;   // for alternating row tint

    circuits.forEach(circuit => {
      const circuitFirstRow = nextRow;

      // Iterate exactly like buildCalendar: slot 1 … circuit.slots
      for (let slot = 1; slot <= circuit.slots; slot++) {
        const excelRow = nextRow++;

        // Pre-compute which booking covers each date for this slot
        const dateBks = dates.map(date => bookingOn(circuit.name, slot, date));

        // Compute consecutive booking spans
        const spans = [];
        let curKey = null, curStart = 0, curBk = null;
        for (let i = 0; i < dateBks.length; i++) {
          const key = bKey(dateBks[i]);
          if (key !== curKey) {
            if (curKey && curBk) spans.push({ start: curStart, end: i - 1, bk: curBk });
            curKey = key; curStart = i; curBk = dateBks[i];
          }
        }
        if (curKey && curBk) spans.push({ start: curStart, end: dateBks.length - 1, bk: curBk });

        // Add row — circuit name only on first slot (rest left blank for the merge)
        ws.addRow([slot === 1 ? circuit.name : "", `Slot ${slot}`, ...new Array(dates.length).fill("")]);
        const row = ws.getRow(excelRow); row.height = 22;

        // Style circuit name cell on first slot
        if (slot === 1) {
          const cc      = row.getCell(1);
          cc.font       = { bold: true, size: 10 };
          cc.alignment  = { vertical: "middle", horizontal: "left", wrapText: true };
        }

        // Slot cell
        const sc      = row.getCell(2);
        sc.font       = { size: 9, color: { argb: "FF6E7A99" } };
        sc.alignment  = { vertical: "middle", horizontal: "center" };

        // Track which date columns have a booking fill
        const bookedCols = new Set();

        // Apply booking spans: fill → label → merge
        spans.forEach(({ start, end, bk }) => {
          const c1   = 3 + start;   // ExcelJS 1-indexed
          const c2   = 3 + end;
          const fill = statusFill(bk.Status);
          const label = barLabel(bk);

          // Fill all cells in the span (colour shows on every cell before merge)
          for (let c = c1; c <= c2; c++) {
            row.getCell(c).fill = fill;
            bookedCols.add(c);
          }

          // Label + white text on the first (visible) cell
          const fc     = row.getCell(c1);
          fc.value     = label;
          fc.font      = { bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
          fc.alignment = { vertical: "middle", horizontal: "left", wrapText: false };

          // Merge across the span
          if (c2 > c1) ws.mergeCells(excelRow, c1, excelRow, c2);
        });

        // Alternate-row tint on empty date cells
        if (globalIdx % 2 === 1) {
          for (let c = 3; c <= totalCols; c++) {
            if (!bookedCols.has(c)) row.getCell(c).fill = ALT_FILL;
          }
        }
        globalIdx++;
      }

      // Merge the Circuit column vertically across all slot rows (rowspan equivalent)
      if (circuit.slots > 1) {
        ws.mergeCells(circuitFirstRow, 1, circuitFirstRow + circuit.slots - 1, 1);
        const mc     = ws.getCell(circuitFirstRow, 1);
        mc.font      = { bold: true, size: 10 };
        mc.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      }
    });

    // ── Column widths ─────────────────────────────────────
    ws.getColumn(1).width = 36;
    ws.getColumn(2).width = 8;
    for (let c = 3; c <= totalCols; c++) ws.getColumn(c).width = 9;

    // ── Write and trigger browser download ────────────────
    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href = url; a.download = `SCOOP_OOH_Campaign_Calendar${filenameDateRange(expStart, expEnd)}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Calendar Excel export failed:", err);
    alert("Couldn't generate the calendar spreadsheet. Please try again.");
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

let _cleanupFns = [];

// ── INIT ──────────────────────────────────────────────────
export async function init(userName) {
  currentUserName     = userName || "User";
  // Prefer the custom initials from the "user" RTDB table (window.__currentUser,
  // set in app.js) over a computed fallback, same as the nav avatar.
  currentUserInitials = window.__currentUser?.initials || getInitials(currentUserName);
  const lbl = document.getElementById("bookingPersonLabel");
  if (lbl) lbl.textContent = currentUserName;

  // Role gate — admin/sales can add + edit; view (or unset) is read-only.
  const rule = window.__currentUser?.rule || "view";
  canEdit = rule === "admin" || rule === "sales";
  document.getElementById("openBookingBtn")?.toggleAttribute("hidden", !canEdit);

  // Move overlays to <body> so they escape the app-frame stacking context
  // and render above the nav bar and mobile dock on all browsers / iOS Safari.
  {
    const bkModal = document.getElementById("bookingModal");
    if (bkModal && bkModal.parentNode !== document.body) document.body.appendChild(bkModal);
    const calSec = document.getElementById("calendarSection");
    if (calSec && calSec.parentNode !== document.body) document.body.appendChild(calSec);
  }

  // ── Table date filter ─────────────────────────────────
  const dateFilterSelect = document.getElementById("dateFilterSelect");
  const dateRangeInputs  = document.getElementById("dateRangeInputs");

  const closeStatusDropdownsHandler = () => {
    document.querySelectorAll(".inline-status-dropdown.open").forEach(d => d.classList.remove("open"));
  };
  document.addEventListener("click", closeStatusDropdownsHandler);

  dateFilterSelect?.addEventListener("change", () => {
    const val     = dateFilterSelect.value;
    const isRange = val === "range";
    if (dateRangeInputs) dateRangeInputs.hidden = !isRange;
    if (!isRange) {
      [drpStart, drpEnd] = val === "year" ? currentYearRange() : monthRangeFromKey(val);
      applyFilters();
    }
  });

  document.getElementById("applyCustomDate")?.addEventListener("click", () => {
    const f = document.getElementById("customDateFrom")?.value;
    const t = document.getElementById("customDateTo")?.value;
    if (f && t) {
      drpStart = parseISOLocal(f); drpEnd = parseISOLocal(t);
      applyFilters();
    }
  });

  document.getElementById("campaignSearch")?.addEventListener("input", applyFilters);
  document.getElementById("campaignStatusFilter")?.addEventListener("change", applyFilters);
  document.querySelectorAll(".th-sortable").forEach(th => {
    th.addEventListener("click", () => toggleSort(th.dataset.sort));
    th.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(th.dataset.sort); }
    });
  });
  document.getElementById("calSearch")?.addEventListener("input", filterAndRenderBars);

  // ── Download ──────────────────────────────────────────
  const downloadBtn      = document.getElementById("downloadBtn");
  const downloadDropdown = document.getElementById("downloadDropdown");
  downloadBtn?.addEventListener("click", e => {
    e.stopPropagation();
    downloadDropdown?.classList.toggle("open");
    downloadBtn.classList.toggle("open");
  });
  const closeDownloadDropdownHandler = e => {
    if (!downloadBtn?.contains(e.target) && !downloadDropdown?.contains(e.target)) {
      downloadDropdown?.classList.remove("open");
      downloadBtn?.classList.remove("open");
    }
  };
  document.addEventListener("click", closeDownloadDropdownHandler);
  document.getElementById("downloadPDF")?.addEventListener("click", () => {
    downloadDropdown?.classList.remove("open");
    downloadBtn?.classList.remove("open");
    downloadAsPDF();
  });
  document.getElementById("downloadExcel")?.addEventListener("click", () => {
    downloadDropdown?.classList.remove("open");
    downloadBtn?.classList.remove("open");
    downloadAsExcel();
  });

  // ── Calendar download ─────────────────────────────────
  const calDownloadBtn      = document.getElementById("calDownloadBtn");
  const calDownloadDropdown = document.getElementById("calDownloadDropdown");
  calDownloadBtn?.addEventListener("click", e => {
    e.stopPropagation();
    calDownloadDropdown?.classList.toggle("open");
    calDownloadBtn.classList.toggle("open");
  });
  const closeCalDownloadDropdownHandler = e => {
    if (!calDownloadBtn?.contains(e.target) && !calDownloadDropdown?.contains(e.target)) {
      calDownloadDropdown?.classList.remove("open");
      calDownloadBtn?.classList.remove("open");
    }
  };
  document.addEventListener("click", closeCalDownloadDropdownHandler);
  document.getElementById("calDownloadPDF")?.addEventListener("click", () => {
    calDownloadDropdown?.classList.remove("open");
    calDownloadBtn?.classList.remove("open");
    downloadCalendarAsPDF();
  });
  document.getElementById("calDownloadExcel")?.addEventListener("click", () => {
    calDownloadDropdown?.classList.remove("open");
    calDownloadBtn?.classList.remove("open");
    downloadCalendarAsExcel();
  });

  // ── Booking modal ────────────────────────────────────
  const bookingModal = document.getElementById("bookingModal");
  document.getElementById("openBookingBtn")?.addEventListener("click", () => {
    resetModal(); bookingModal?.classList.add("active");
  });
  document.getElementById("closeBookingModal")?.addEventListener("click", () => {
    bookingModal?.classList.remove("active");
  });
  document.getElementById("clearFormBtn")?.addEventListener("click", resetModal);
  document.getElementById("confirmBookingBtn")?.addEventListener("click", saveBooking);

  initCircuitMapUI({ getSelectedCircuits: getCircuitValues, getBookingInfo: getBookingHeaderInfo });

  // Circuit rows wire their own "input" → checkFormComplete (see renderCircuitRow).
  ["bookingClient","bookingBrand"].forEach(id =>
    document.getElementById(id)?.addEventListener("input", checkFormComplete)
  );
  document.getElementById("campaignStatus")?.addEventListener("change", checkFormComplete);

  // BO NO: "BO-0000" template on first focus (user only edits the digits),
  // always exactly 4 digits after "BO-", and a "-<year>" suffix appended
  // once the user confirms with Enter or Tab — e.g. typing "60" over the
  // template and pressing Enter/Tab turns "BO-0000" into "BO-0060-2026".
  const bookingOrderInput = document.getElementById("bookingOrder");
  const BO_PREFIX = "BO-";

  bookingOrderInput?.addEventListener("focus", (e) => {
    if (!e.target.value) e.target.value = BO_PREFIX + "0000";
  });

  bookingOrderInput?.addEventListener("input", (e) => {
    let val = e.target.value;
    if (!val.toUpperCase().startsWith(BO_PREFIX)) {
      val = BO_PREFIX + val.replace(/[^0-9]/g, "");
    }
    const rest = val.slice(BO_PREFIX.length);
    // Once a year suffix has been appended (a 2nd "-"), leave it alone —
    // the digits-only/4-digit-max formatting only applies before that.
    if (rest.includes("-")) return;
    e.target.value = BO_PREFIX + rest.replace(/[^0-9]/g, "").slice(0, 4);
  });

  const confirmBoNumber = () => {
    const match = bookingOrderInput?.value.match(/^BO-(\d{1,4})$/i);
    if (!match) return; // blank, already confirmed, or a non-standard value
    const digits = match[1].padStart(4, "0");
    bookingOrderInput.value = `${BO_PREFIX}${digits}-${new Date().getFullYear()}`;
  };
  bookingOrderInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); confirmBoNumber(); }
  });
  bookingOrderInput?.addEventListener("blur", confirmBoNumber);

  // ── Date picker wiring ────────────────────────────────
  document.getElementById("bkPickStart")?.addEventListener("click", () => openDatePicker("start"));
  document.getElementById("bkPickEnd")?.addEventListener("click",   () => openDatePicker("end"));
  document.getElementById("bkPickerClose")?.addEventListener("click", closeDatePicker);

  document.getElementById("bkPickerOk")?.addEventListener("click", applyPickerToForm);

  document.getElementById("bkPickerReset")?.addEventListener("click", () => {
    bkPickerStart = null;
    bkPickerEnd   = null;
    bkPickMode    = "start";
    document.getElementById("bkPickStart")?.classList.add("active");
    document.getElementById("bkPickEnd")?.classList.remove("active");
    renderPickerMonths();
    updatePickerInfo();
  });

  document.querySelectorAll(".bk-qpick").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!bkPickerStart) return;
      const weeks = parseInt(btn.dataset.weeks, 10);
      bkPickerEnd = addDays(bkPickerStart, weeks * 7 - 1);
      document.querySelectorAll(".bk-qpick").forEach(b => b.classList.toggle("active", b === btn));
      renderPickerMonths();
      updatePickerInfo();
    });
  });

  // ── Tab switching ────────────────────────────────────
  const scheduleSection = document.getElementById("scheduleSection");
  const calendarSection = document.getElementById("calendarSection");
  const tabSchedule     = document.getElementById("tabSchedule");
  const tabCalendar     = document.getElementById("tabCalendar");

  tabSchedule?.addEventListener("click", () => {
    scheduleSection.style.display = "";
    calendarSection.style.display = "none";
    tabSchedule.classList.add("active");
    tabCalendar.classList.remove("active");
  });

  tabCalendar?.addEventListener("click", async () => {
    scheduleSection.style.display = "none";
    calendarSection.style.display = "";
    tabCalendar.classList.add("active");
    const calSearchEl = document.getElementById("calSearch");
    if (calSearchEl) calSearchEl.value = "";
    tabSchedule.classList.remove("active");
    if (!calDrpStart) [calDrpStart, calDrpEnd] = monthRangeFromKey(monthKeyFromDate(new Date()));
    const calFromEl = document.getElementById("calFrom");
    const calToEl   = document.getElementById("calTo");
    if (calFromEl) calFromEl.value = toISO(calDrpStart);
    if (calToEl)   calToEl.value   = toISO(calDrpEnd);
    await buildCalendar();
  });

  // ── Calendar filter ───────────────────────────────────
  const calDateFilterSelect = document.getElementById("calDateFilterSelect");
  const calDateRangeInputs  = document.getElementById("calDateRangeInputs");

  calDateFilterSelect?.addEventListener("change", async () => {
    const val     = calDateFilterSelect.value;
    const isRange = val === "range";
    if (calDateRangeInputs) calDateRangeInputs.hidden = !isRange;
    if (!isRange) {
      [calDrpStart, calDrpEnd] = val === "year" ? currentYearRange() : monthRangeFromKey(val);
      const cfe = document.getElementById("calFrom"); if (cfe) cfe.value = toISO(calDrpStart);
      const cte = document.getElementById("calTo");   if (cte) cte.value = toISO(calDrpEnd);
      await buildCalendar();
    }
  });

  document.getElementById("applyCalCustomDate")?.addEventListener("click", async () => {
    const f = document.getElementById("calFrom")?.value;
    const t = document.getElementById("calTo")?.value;
    if (f && t) {
      calDrpStart = parseISOLocal(f); calDrpEnd = parseISOLocal(t);
      await buildCalendar();
    }
  });

  // ── Load data ─────────────────────────────────────────
  const tables = await loadAll();
  allCampaigns = getCampaigns(tables);

  const monthKeys  = buildMonthRange(allCampaigns);
  const currentKey = monthKeyFromDate(new Date());
  const defaultKey = monthKeys.includes(currentKey) ? currentKey : monthKeys[monthKeys.length - 1];

  populateDateSelect(dateFilterSelect, monthKeys, defaultKey);
  [drpStart, drpEnd] = monthRangeFromKey(defaultKey);
  applyFilters();

  populateDateSelect(calDateFilterSelect, monthKeys, defaultKey);
  [calDrpStart, calDrpEnd] = monthRangeFromKey(defaultKey);

  populateAssets(tables);
  initAutoSuggest();

  // ── Sticky header background on scroll (mirrors content-inventory.js) ──
  const appContent   = document.getElementById("app-content");
  const stickyHeader = document.querySelector(".bookings-sticky-header");

  const onScroll = () => {
    stickyHeader?.classList.toggle("bk-scrolled", appContent.scrollTop > 10);
  };

  appContent?.addEventListener("scroll", onScroll, { passive: true });

  _cleanupFns = [
    () => appContent?.removeEventListener("scroll", onScroll),
    // document-level click listeners persist across view navigations unless
    // explicitly removed (unlike element-scoped listeners inside
    // #app-content, which are torn down for free when the view's markup is
    // replaced) — without this, a stale copy of each piled up on every
    // Bookings visit.
    () => document.removeEventListener("click", closeStatusDropdownsHandler),
    () => document.removeEventListener("click", closeDownloadDropdownHandler),
    () => document.removeEventListener("click", closeCalDownloadDropdownHandler)
  ];

  initScrollReveal();
}

export function cleanup() {
  drpStart = drpEnd = null;
  calDrpStart = calDrpEnd = null;
  bkPickerStart = bkPickerEnd = null;
  sortField = null; sortDir = "asc";
  teardownCircuitMap();
  // Remove overlays moved to body during init
  document.getElementById("bookingModal")?.remove();
  document.getElementById("calendarSection")?.remove();
  _cleanupFns.forEach(fn => fn());
  _cleanupFns = [];
}
