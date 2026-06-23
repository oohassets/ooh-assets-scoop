/* ── Bookings View Module ─────────────────────────────────── */
import { rtdb } from "../../../firebase/firebase.js";
import { ref, get, push, set, update } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

let currentUserName = "";
let allCampaigns = [];
let drpStart = null, drpEnd = null;
let calDrpStart = null, calDrpEnd = null;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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
function getStatusClass(s="") {
  s = s.toLowerCase();
  if (s.includes("live"))      return "live";
  if (s.includes("signed"))    return "signed";
  if (s.includes("pending"))   return "pending";
  if (s.includes("completed")) return "completed";
  if (s.includes("cancel"))    return "cancelled";
  return "";
}

async function loadAll() {
  try {
    const snap = await get(ref(rtdb, "/"));
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

  tbody.innerHTML = campaigns.map(r => {
    const statusCls = getStatusClass(r.status);
    const isOwner = currentUserName && r.person &&
      r.person.trim().toLowerCase() === currentUserName.trim().toLowerCase();

    const editDateBtn = isOwner
      ? `<button class="edit-row-btn" data-key="${r.key}" title="Edit booking">
           <span class="material-symbols-outlined" style="font-size:14px;">edit</span>
         </button>`
      : "";

    const editStatusBtn = isOwner
      ? `<button class="edit-status-btn" data-key="${r.key}" title="Edit status">✎</button>
         <div class="inline-status-dropdown" id="statusDrop-${r.key}">
           <button class="status-option" data-key="${r.key}" data-val="Live">● Live</button>
           <button class="status-option" data-key="${r.key}" data-val="BO Signed">● BO Signed</button>
           <button class="status-option" data-key="${r.key}" data-val="Pending">● Pending</button>
           <button class="status-option" data-key="${r.key}" data-val="Completed">● Completed</button>
         </div>`
      : "";

    return `
      <tr>
        <td><div class="client-name">${r.client}</div><div class="brand-name">${r.brand}</div></td>
        <td style="color:var(--text-secondary);font-size:13px;">${r.asset}</td>
        <td style="color:var(--text-muted);font-size:12px;white-space:nowrap;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span>${r.date}</span>
            ${editDateBtn}
          </div>
        </td>
        <td style="position:relative;">
          <div class="status-cell">
            <span class="status-pill pill-${statusCls}">${r.status}</span>
            ${editStatusBtn}
          </div>
        </td>
        <td style="color:var(--text-muted);font-size:12px;">${r.person}</td>
      </tr>
    `;
  }).join("");

  // Edit row (date edit) — opens modal pre-filled
  tbody.querySelectorAll(".edit-row-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const campaign = allCampaigns.find(c => c.key === key);
      if (!campaign) return;
      openEditModal(campaign);
    });
  });

  // Status inline dropdown
  tbody.querySelectorAll(".edit-status-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const drop = document.getElementById(`statusDrop-${key}`);
      tbody.querySelectorAll(".inline-status-dropdown.open").forEach(d => {
        if (d !== drop) d.classList.remove("open");
      });
      drop.classList.toggle("open");
    });
  });

  tbody.querySelectorAll(".status-option").forEach(opt => {
    opt.addEventListener("click", async (e) => {
      e.stopPropagation();
      const key = opt.dataset.key;
      const newStatus = opt.dataset.val;
      opt.textContent = "Saving…";
      try {
        await update(ref(rtdb, `Campaigns_Booking/${key}`), { Status: newStatus });
        const tables = await loadAll();
        allCampaigns = getCampaigns(tables);
        applyFilters();
      } catch(err) {
        console.error(err);
        opt.textContent = "Error";
      }
    });
  });
}

// ── EDIT MODAL ────────────────────────────────────────────
function openEditModal(campaign) {
  const modal = document.getElementById("bookingModal");
  const title = document.getElementById("bookingModalTitle");
  const sub   = document.getElementById("bookingModalSub");
  if (title) title.textContent = "Edit Campaign Booking";
  if (sub)   sub.textContent   = "Update the booking details below.";

  const editKey = document.getElementById("bookingEditKey");
  if (editKey) editKey.value = campaign.key;

  const toISOfromMDY = (mdy) => {
    if (!mdy) return "";
    const p = mdy.split("/");
    if (p.length < 3) return "";
    return `${p[2]}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`;
  };

  setValue("bookingOrder",     campaign.bo);
  setValue("bookingClient",    campaign.client);
  setValue("bookingBrand",     campaign.brand);
  setValue("bookingStartDate", toISOfromMDY(campaign.rawStartDate));
  setValue("bookingEndDate",   toISOfromMDY(campaign.rawEndDate));
  setValue("bookingSlot",      campaign.slot ? `Slot ${campaign.slot}` : "");

  const assetEl = document.getElementById("bookingAsset");
  if (assetEl) assetEl.value = campaign.asset;

  const statusEl = document.getElementById("campaignStatus");
  if (statusEl) statusEl.value = campaign.status;

  calcDays();
  modal?.classList.add("active");
}

function resetModal() {
  const title = document.getElementById("bookingModalTitle");
  const sub   = document.getElementById("bookingModalSub");
  if (title) title.textContent = "Create Campaign Booking";
  if (sub)   sub.textContent   = "Add a new booking to the schedule.";
  const editKey = document.getElementById("bookingEditKey");
  if (editKey) editKey.value = "";
  ["bookingOrder","bookingClient","bookingBrand","bookingStartDate","bookingEndDate","bookingTotalDays","bookingSlot"].forEach(id => setValue(id, ""));
  const a = document.getElementById("bookingAsset"); if (a) a.selectedIndex = 0;
  const s = document.getElementById("campaignStatus"); if (s) s.selectedIndex = 0;
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? "";
}

// ── DATE FILTER ───────────────────────────────────────────
function getPresetRange(preset) {
  const n = new Date(); const y = n.getFullYear(), m = n.getMonth();
  switch(preset) {
    case "this-month":  return [new Date(y,m,1),   new Date(y,m+1,0)];
    case "last-month":  return [new Date(y,m-1,1), new Date(y,m,0)];
    case "next-month":  return [new Date(y,m+1,1), new Date(y,m+2,0)];
    case "all-year":    return [new Date(y,0,1),   new Date(y,11,31)];
    default:            return [null, null];
  }
}

// ── FILTERS ───────────────────────────────────────────────
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
  renderTable(f);
}

// ── ASSET DROPDOWN ────────────────────────────────────────
function populateAssets(tables) {
  const t = tables["oohassets"]; if (!t) return;
  const rows = Array.isArray(t) ? t : Object.values(t);
  const circuits = [...new Set(rows.map(r=>r.Circuits).filter(Boolean))].sort();
  const opts = `<option value="">Select Asset</option>${circuits.map(c=>`<option value="${c}">${c}</option>`).join("")}`;
  const el = document.getElementById("bookingAsset"); if (el) el.innerHTML = opts;
}

// ── DATE CALCULATOR ───────────────────────────────────────
function calcDays() {
  const s = document.getElementById("bookingStartDate");
  const e = document.getElementById("bookingEndDate");
  const t = document.getElementById("bookingTotalDays");
  if (!s||!e||!t||!s.value||!e.value) { if (t) t.value = ""; return; }
  const diff = Math.floor((new Date(e.value) - new Date(s.value)) / 86400000) + 1;
  t.value = diff > 0 ? `${diff} Day${diff>1?"s":""}` : "Invalid dates";
}

// ── SLOT AUTO-ASSIGN ──────────────────────────────────────
async function autoAssignSlot() {
  const asset   = document.getElementById("bookingAsset")?.value;
  const startEl = document.getElementById("bookingStartDate");
  const endEl   = document.getElementById("bookingEndDate");
  const slotEl  = document.getElementById("bookingSlot");
  const editKey = document.getElementById("bookingEditKey")?.value;
  if (!slotEl) return;
  if (!asset || !startEl?.value || !endEl?.value) { slotEl.value = ""; return; }
  slotEl.value = "Checking…";
  const newStart = parseISOLocal(startEl.value);
  const newEnd   = parseISOLocal(endEl.value);
  if (!newStart || !newEnd || newStart > newEnd) { slotEl.value = "Invalid dates"; return; }
  newStart.setHours(0,0,0,0); newEnd.setHours(0,0,0,0);
  try {
    const assetSnap = await get(ref(rtdb, "oohassets"));
    let maxSlots = 1;
    if (assetSnap.exists()) {
      const rows = Object.values(assetSnap.val());
      const match = rows.find(r => r && (r.Circuits||"").trim().toLowerCase() === asset.trim().toLowerCase());
      if (match) maxSlots = parseInt(match.Slot || 1, 10);
    }
    const bookSnap = await get(ref(rtdb, "Campaigns_Booking"));
    const bookedSlots = new Set();
    if (bookSnap.exists()) {
      Object.entries(bookSnap.val()).forEach(([k, b]) => {
        if (!b) return;
        if (editKey && k === editKey) return; // skip self when editing
        const bc = (b.Circuits || "").trim().toLowerCase();
        if (bc !== asset.trim().toLowerCase()) return;
        const bStart = parseDate(b["Start Date"]);
        const bEnd   = parseDate(b["End Date"]);
        if (!bStart || !bEnd) return;
        bStart.setHours(0,0,0,0); bEnd.setHours(0,0,0,0);
        if (newStart <= bEnd && newEnd >= bStart) bookedSlots.add(parseInt(b.Slot || 1, 10));
      });
    }
    let assigned = null;
    for (let s = 1; s <= maxSlots; s++) { if (!bookedSlots.has(s)) { assigned = s; break; } }
    slotEl.value = assigned !== null ? `Slot ${assigned}` : "No slots available";
  } catch(e) { console.error("Slot check error:", e); slotEl.value = "Error"; }
}

// ── SAVE BOOKING ──────────────────────────────────────────
async function saveBooking() {
  const booking  = document.getElementById("bookingOrder")?.value;
  const client   = document.getElementById("bookingClient")?.value?.trim();
  const brand    = document.getElementById("bookingBrand")?.value?.trim();
  const asset    = document.getElementById("bookingAsset")?.value;
  const start    = document.getElementById("bookingStartDate")?.value;
  const end      = document.getElementById("bookingEndDate")?.value;
  const slotRaw  = document.getElementById("bookingSlot")?.value || "";
  const person   = document.getElementById("bookingPersonLabel")?.textContent?.trim();
  const status   = document.getElementById("campaignStatus")?.value || "Pending";
  const editKey  = document.getElementById("bookingEditKey")?.value;

  if (!client||!brand||!asset||!start||!end) { alert("Please fill in all required fields."); return; }
  const slotNum = parseInt(slotRaw.replace(/\D/g,""), 10);
  if (!slotRaw || isNaN(slotNum) || slotRaw.toLowerCase().includes("no slots")) {
    alert("No available slot for the selected circuit and date range."); return;
  }

  const btn = document.getElementById("confirmBookingBtn");
  btn.textContent = "Saving…"; btn.disabled = true;

  const data = {
    BO: booking, Client: client, "Brand Campaign": brand,
    Circuits: asset, Slot: slotNum,
    "Start Date": toMMDDYYYY(start), "End Date": toMMDDYYYY(end),
    Status: status, Person: person
  };

  try {
    if (editKey) {
      await update(ref(rtdb, `Campaigns_Booking/${editKey}`), data);
    } else {
      const existingSnap = await get(ref(rtdb, "Campaigns_Booking"));
      let nextKey = 1;
      if (existingSnap.exists()) {
        const val = existingSnap.val();
        nextKey = Array.isArray(val) ? val.filter(Boolean).length : Object.keys(val).length;
      }
      await set(ref(rtdb, `Campaigns_Booking/${nextKey}`), data);
    }
    btn.textContent = "Saved! ✓";
    const tables = await loadAll();
    allCampaigns = getCampaigns(tables);
    applyFilters();
    setTimeout(() => {
      btn.textContent = "Save Booking"; btn.disabled = false;
      resetModal();
      document.getElementById("bookingModal")?.classList.remove("active");
    }, 1200);
  } catch(e) {
    console.error(e); btn.textContent = "Error — try again"; btn.disabled = false;
  }
}

// ── CALENDAR ──────────────────────────────────────────────
function setCalPresetRange(preset) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const ranges = {
    "this-month":  [new Date(y,m,1),   new Date(y,m+1,0)],
    "last-month":  [new Date(y,m-1,1), new Date(y,m,0)],
    "next-month":  [new Date(y,m+1,1), new Date(y,m+2,0)],
    "all-year":    [new Date(y,0,1),   new Date(y,11,31)]
  };
  return ranges[preset] || [null, null];
}

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
  requestAnimationFrame(() => renderBars(bookings, dates, startD, endD));
}

function renderBars(bookings, dates, startD, endD) {
  startD.setHours(0,0,0,0); endD.setHours(0,0,0,0);
  const rows = document.querySelectorAll("#bookingCalendar tbody tr");
  bookings.forEach(b => {
    const start = parseDate(b["Start Date"]||b.startDate);
    const end   = parseDate(b["End Date"]||b.endDate);
    if (!start||!end) return;
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    const asset   = (b.Circuits||b.Circuit||"").toLowerCase().replace(/[_-]/g," ").trim();
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
      const rowSlot = parseInt(slotCell.textContent.replace("Slot","").trim(),10);
      if (rowSlot !== slotVal) return;
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

// ── INIT ──────────────────────────────────────────────────
export async function init(userName) {
  currentUserName = userName || "User";

  const lbl = document.getElementById("bookingPersonLabel");
  if (lbl) lbl.textContent = currentUserName;

  // Date filter
  const dateFilterBtn      = document.getElementById("dateFilterBtn");
  const dateFilterDropdown = document.getElementById("dateFilterDropdown");
  const dateCustomInputs   = document.getElementById("dateCustomInputs");
  const dateFilterLabel    = document.getElementById("dateFilterLabel");

  [drpStart, drpEnd] = getPresetRange("this-month");

  dateFilterBtn?.addEventListener("click", e => {
    e.stopPropagation();
    dateFilterDropdown.classList.toggle("open");
    dateFilterBtn.classList.toggle("open");
  });

  document.addEventListener("click", e => {
    if (!dateFilterBtn?.contains(e.target) && !dateFilterDropdown?.contains(e.target)) {
      dateFilterDropdown?.classList.remove("open");
      dateFilterBtn?.classList.remove("open");
    }
    document.querySelectorAll(".inline-status-dropdown.open").forEach(d => d.classList.remove("open"));
  });

  document.querySelectorAll(".date-preset[data-preset]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".date-preset[data-preset]").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      const preset = btn.dataset.preset;
      if (preset === "custom") {
        dateCustomInputs?.classList.add("visible");
        if (dateFilterLabel) dateFilterLabel.textContent = "Custom Range";
      } else {
        dateCustomInputs?.classList.remove("visible");
        [drpStart, drpEnd] = getPresetRange(preset);
        const labels = {"this-month":"This Month","last-month":"Last Month","next-month":"Next Month","all-year":"All Year"};
        if (dateFilterLabel) dateFilterLabel.textContent = labels[preset] || "Custom";
        applyFilters();
        dateFilterDropdown?.classList.remove("open");
        dateFilterBtn?.classList.remove("open");
      }
    });
  });

  document.getElementById("applyCustomDate")?.addEventListener("click", () => {
    const f = document.getElementById("customDateFrom")?.value;
    const t = document.getElementById("customDateTo")?.value;
    if (f && t) {
      drpStart = parseISOLocal(f); drpEnd = parseISOLocal(t);
      if (dateFilterLabel) dateFilterLabel.textContent = `${f} → ${t}`;
      applyFilters();
      dateFilterDropdown?.classList.remove("open");
      dateFilterBtn?.classList.remove("open");
    }
  });

  document.getElementById("campaignSearch")?.addEventListener("input", applyFilters);
  document.getElementById("campaignStatusFilter")?.addEventListener("change", applyFilters);

  // Date calc + slot auto-assign
  ["bookingAsset","bookingStartDate","bookingEndDate"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => { calcDays(); autoAssignSlot(); });
  });

  // Booking modal open/close
  const bookingModal = document.getElementById("bookingModal");
  document.getElementById("openBookingBtn")?.addEventListener("click", () => {
    resetModal();
    bookingModal?.classList.add("active");
  });
  document.getElementById("closeBookingModal")?.addEventListener("click", () => {
    bookingModal?.classList.remove("active");
  });
  document.getElementById("clearFormBtn")?.addEventListener("click", resetModal);
  document.getElementById("confirmBookingBtn")?.addEventListener("click", saveBooking);

  // ── Tab switching ─────────────────────────────────────────
  const scheduleSection = document.getElementById("scheduleSection");
  const calendarSection = document.getElementById("calendarSection");
  const tabSchedule = document.getElementById("tabSchedule");
  const tabCalendar = document.getElementById("tabCalendar");

  tabSchedule?.addEventListener("click", () => {
    scheduleSection.style.display = "block";
    calendarSection.style.display = "none";
    tabSchedule.classList.add("active");
    tabCalendar.classList.remove("active");
  });

  tabCalendar?.addEventListener("click", async () => {
    scheduleSection.style.display = "none";
    calendarSection.style.display = "block";
    tabCalendar.classList.add("active");
    tabSchedule.classList.remove("active");
    if (!calDrpStart) [calDrpStart, calDrpEnd] = setCalPresetRange("this-month");
    const calFromEl = document.getElementById("calFrom");
    const calToEl   = document.getElementById("calTo");
    if (calFromEl) calFromEl.value = toISO(calDrpStart);
    if (calToEl)   calToEl.value   = toISO(calDrpEnd);
    await buildCalendar();
  });

  // ── Calendar date filter ──────────────────────────────────
  [calDrpStart, calDrpEnd] = setCalPresetRange("this-month");

  const calDateFilterBtn      = document.getElementById("calDateFilterBtn");
  const calDateFilterDropdown = document.getElementById("calDateFilterDropdown");

  calDateFilterBtn?.addEventListener("click", e => {
    e.stopPropagation();
    calDateFilterDropdown?.classList.toggle("open");
    calDateFilterBtn.classList.toggle("open");
  });
  document.addEventListener("click", e => {
    if (!calDateFilterBtn?.contains(e.target) && !calDateFilterDropdown?.contains(e.target)) {
      calDateFilterDropdown?.classList.remove("open");
      calDateFilterBtn?.classList.remove("open");
    }
  });

  document.querySelectorAll("[data-cal-preset]").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("[data-cal-preset]").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      const preset = btn.dataset.calPreset;
      const labels = {"this-month":"This Month","last-month":"Last Month","next-month":"Next Month","all-year":"All Year"};
      if (preset === "custom") {
        document.getElementById("calDateCustomInputs")?.classList.add("visible");
        const lbl2 = document.getElementById("calDateFilterLabel");
        if (lbl2) lbl2.textContent = "Custom Range";
      } else {
        document.getElementById("calDateCustomInputs")?.classList.remove("visible");
        [calDrpStart, calDrpEnd] = setCalPresetRange(preset);
        const calFromEl = document.getElementById("calFrom");
        const calToEl   = document.getElementById("calTo");
        if (calFromEl) calFromEl.value = toISO(calDrpStart);
        if (calToEl)   calToEl.value   = toISO(calDrpEnd);
        const calLbl = document.getElementById("calDateFilterLabel");
        if (calLbl) calLbl.textContent = labels[preset];
        calDateFilterDropdown?.classList.remove("open");
        calDateFilterBtn?.classList.remove("open");
        await buildCalendar();
      }
    });
  });

  document.getElementById("applyCalCustomDate")?.addEventListener("click", async () => {
    const f = document.getElementById("calFrom")?.value;
    const t = document.getElementById("calTo")?.value;
    if (f && t) {
      calDrpStart = parseISOLocal(f); calDrpEnd = parseISOLocal(t);
      const calLbl = document.getElementById("calDateFilterLabel");
      if (calLbl) calLbl.textContent = `${f} → ${t}`;
      calDateFilterDropdown?.classList.remove("open");
      calDateFilterBtn?.classList.remove("open");
      await buildCalendar();
    }
  });


  // Load data
  const tables = await loadAll();
  allCampaigns = getCampaigns(tables);
  applyFilters();
  populateAssets(tables);
}

export function cleanup() {
  drpStart = drpEnd = null;
  calDrpStart = calDrpEnd = null;
}
