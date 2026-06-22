/* ── Dashboard View Module ───────────────────────────────── */
import { rtdb } from "../../firebase/firebase.js";
import { ref, get, push, set, update } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// ── MODULE-LEVEL STATE ────────────────────────────────────
export let currentUserName = "";

export function setUser(name) { currentUserName = name; }

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let allCampaigns = [];
let allCampaignKeys = [];
let chartInstance = null;

// Date filter state
let drpStart = null, drpEnd = null;

// Calendar state
let calDrpStart = null, calDrpEnd = null;

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
function fmtShort(v) {
  if (!v) return "—";
  const p = v.trim().split("/").map(x => parseInt(x,10));
  if (p.length < 2) return "—";
  return `${p[1]} ${MONTHS[p[0]-1]||""}`;
}
function fmtCompact(n) {
  return new Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:1}).format(n);
}
function getStatusClass(s="") {
  s = s.toLowerCase();
  if (s.includes("live")) return "live";
  if (s.includes("signed")) return "signed";
  if (s.includes("pending")) return "pending";
  if (s.includes("completed")) return "completed";
  if (s.includes("cancel")) return "cancelled";
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
      date: `${fmtShort(sd)} → ${fmtShort(ed)}`, sortDate
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
    const editBtn = isOwner
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
        <td style="color:var(--text-muted);font-size:12px;white-space:nowrap;">${r.date}</td>
        <td style="position:relative;">
          <div class="status-cell">
            <span class="status-pill pill-${statusCls}">${r.status}</span>
            ${editBtn}
          </div>
        </td>
        <td style="color:var(--text-muted);font-size:12px;">${r.person}</td>
      </tr>
    `;
  }).join("");

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
        updateStats(allCampaigns, tables);
      } catch(err) {
        console.error(err);
        opt.textContent = "Error";
      }
    });
  });
}

// ── STATS ─────────────────────────────────────────────────
function updateStats(campaigns, tables) {
  let live=0, booked=0, pending=0, free=0;
  campaigns.forEach(c => {
    const s = (c.status||"").toLowerCase();
    if (s.includes("live")) live++;
    if (s.includes("signed")) booked++;
    if (s.includes("pending")) pending++;
  });
  Object.entries(tables).forEach(([k,v]) => {
    if (!k.startsWith("d_") && !k.startsWith("s_")) return;
    if (!v) return;
    const rows = Array.isArray(v) ? v : Object.values(v);
    rows.forEach(r => {
      if (!r) return;
      const bo = (r.BO||"").toString().toLowerCase();
      if (bo.includes("free")||bo.includes("filler")) free++;
    });
  });
  animateCounter("statActive", live);
  animateCounter("statBooked", booked);
  animateCounter("statPending", pending);
  animateCounter("statFree", free);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const duration = 1200, start = performance.now(), from = parseInt(el.textContent)||0;
  function step(now) {
    const t = Math.min((now-start)/duration, 1);
    const ease = 1 - Math.pow(1-t, 3);
    el.textContent = Math.round(from + (target-from)*ease);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── DATE FILTER HELPERS ───────────────────────────────────
function getPresetRange(preset) {
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth();
  switch(preset) {
    case "this-month":
      return [new Date(y,m,1), new Date(y,m+1,0)];
    case "last-month":
      return [new Date(y,m-1,1), new Date(y,m,0)];
    case "next-month":
      return [new Date(y,m+1,1), new Date(y,m+2,0)];
    case "all-year":
      return [new Date(y,0,1), new Date(y,11,31)];
    default: return [null, null];
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
      const d = parseDate(c.rawStartDate);
      const e = parseDate(c.rawEndDate);
      if (!d) return false;
      d.setHours(0,0,0,0);
      if (e) e.setHours(0,0,0,0);
      return d <= hi && (!e || e >= lo);
    });
  }
  if (status) f = f.filter(c => (c.status||"").toLowerCase().trim() === status.toLowerCase().trim());
  renderTable(f);
}

// CAMPAIGN UPDATES
function renderUpdates(campaigns, tables) {
  const container = document.getElementById("campaignUpdatesContainer");
  if (!container) return;
  const today = new Date(); today.setHours(0,0,0,0);
  function dateLabel(d, raw) {
    const diff = Math.floor((d-today)/86400000);
    if (diff===0) return "Today"; if (diff===1) return "Tomorrow";
    if (diff===-1) return "Yesterday";
    if (diff>1) return `In ${diff}d`; if (diff<-1) return fmtShort(raw);
    return fmtShort(raw);
  }
  const groups = {published:[],removed:[],upcoming:[],ending:[]};
  const logs = tables?.Campaign_Logs||tables?.campaign_logs||{};
  Object.values(logs).forEach(log => {
    const raw = log.Date||log.date; const type = (log.Type||log.type||"").toLowerCase();
    if (!raw||!type) return;
    const d = parseDate(raw); if (!d) return;
    d.setHours(0,0,0,0);
    const diff = Math.floor((d-today)/86400000);
    if (diff<-3||diff>0) return;
    if (type==="add") groups.published.push({label:dateLabel(d,raw),brand:log.Client||"-",asset:log.Circuits||"-",sortDate:d});
    if (type==="removed") groups.removed.push({label:dateLabel(d,raw),brand:log.Client||"-",asset:log.Circuits||"-",sortDate:d});
  });

  campaigns.forEach(c => {
    const sd = parseDate(c.rawStartDate); const ed = parseDate(c.rawEndDate);
    if (!sd) return; sd.setHours(0,0,0,0); if (ed) ed.setHours(0,0,0,0);
    const sdiff = Math.floor((sd-today)/86400000);
    const ediff = ed ? Math.floor((ed-today)/86400000) : 999;
    const s = (c.status||"").toLowerCase();
    const isUpcoming = s.includes("signed") || s.includes("pending");
    const isActive = isUpcoming || s.includes("live");
    if (!isActive) return;
    if (isUpcoming && ((sdiff>=0&&sdiff<=30)||(sdiff<0&&ediff>=0))) {
      groups.upcoming.push({label:dateLabel(sd,c.rawStartDate),statusCls:getStatusClass(c.status),statusLabel:c.status,brand:c.brand||c.client,asset:c.asset,person:c.person,sortDate:sd});
    }
    if (ed && ediff >= 0 && ediff <= 7 && sdiff < 0) {
      groups.ending.push({label:dateLabel(ed,c.rawEndDate),statusCls:getStatusClass(c.status),statusLabel:c.status,brand:c.brand||c.client,asset:c.asset,person:c.person,sortDate:ed});
    }
  });

  groups.published.sort((a,b) => b.sortDate - a.sortDate);
  groups.removed.sort((a,b) => b.sortDate - a.sortDate);
  groups.upcoming.sort((a,b) => a.sortDate - b.sortDate);
  groups.ending.sort((a,b) => a.sortDate - b.sortDate);

  function card(id, title, dotCls, items) {
    const body = items.length ? items.map((u,i) => `
      <div class="update-item" style="animation-delay:${i*0.05}s">
        <div>
          <div class="update-item-label">${u.brand}</div>
          <div class="update-item-sub">${u.asset}</div>
          ${id==="upcoming"&&u.statusLabel?`<span class="status-pill pill-${u.statusCls}" style="margin-top:4px;font-size:10px;">${u.statusLabel}</span>`:""}
        </div>
        <div class="update-date-badge">${u.label}</div>
      </div>
    `).join("") : `<div style="padding:14px 0;font-size:12px;color:var(--text-muted);">No updates</div>`;
    return `
      <div class="update-card">
        <div class="update-card-head ${id}">
          <div>
            <div class="update-title">${title}</div>
            <div class="update-count">${items.length} campaign${items.length!==1?"s":""}</div>
          </div>
          <div class="update-dot ${dotCls}"></div>
        </div>
        <div class="update-body">${body}</div>
      </div>
    `;
  }
  container.innerHTML = `
    <div class="update-cards-grid">
      ${card("published","Published","dot-green",groups.published)}
      ${card("removed","Removed","dot-red",groups.removed)}
      ${card("upcoming","Upcoming","dot-amber",groups.upcoming)}
      ${card("ending","Ending","dot-cyan",groups.ending)}
    </div>
  `;
}

// ── CHART ─────────────────────────────────────────────────
function renderChart(campaigns) {
  const canvas = document.getElementById("trendChart");
  if (!canvas) return;
  if (chartInstance) chartInstance.destroy();
  const live=new Array(12).fill(0), booked=new Array(12).fill(0), completed=new Array(12).fill(0);
  campaigns.forEach(c => {
    const d = parseDate(c.rawStartDate); if (!d) return;
    const m = d.getMonth(); const s = (c.status||"").toLowerCase();
    if (s.includes("live")) live[m]++;
    else if (s.includes("signed")) booked[m]++;
    else if (s.includes("completed")) completed[m]++;
  });
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(79,70,229,0.06)";
  const labelColor = isDark ? "#5A6A8A" : "#6B7A99";
  chartInstance = new Chart(canvas.getContext("2d"), {
    type:"line",
    data:{
      labels:MONTHS,
      datasets:[
        {label:"Booked",data:booked,borderColor:"#F43F5E",backgroundColor:"rgba(244,63,94,0.08)",tension:0.45,fill:true,pointRadius:4,pointHoverRadius:7,borderWidth:2.5},
        {label:"Live",data:live,borderColor:"#10B981",backgroundColor:"rgba(16,185,129,0.08)",tension:0.45,fill:true,pointRadius:4,pointHoverRadius:7,borderWidth:2.5},
        {label:"Completed",data:completed,borderColor:"#0496ff",backgroundColor:"rgba(4,150,255,0.08)",tension:0.45,fill:true,pointRadius:4,pointHoverRadius:7,borderWidth:2.5}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{intersect:false,mode:"index"},
      plugins:{
        legend:{position:"top",align:"end",labels:{usePointStyle:true,pointStyle:"circle",padding:20,font:{family:"Space Grotesk",size:12,weight:"600"},color:labelColor}},
        tooltip:{backgroundColor:isDark?"#0A1628":"white",borderColor:"rgba(79,70,229,0.2)",borderWidth:1,padding:14,cornerRadius:14,titleColor:isDark?"#F8FAFF":"#0A1628",bodyColor:isDark?"#94A3C0":"#3D4F6E",titleFont:{family:"Space Grotesk",size:13,weight:"700"},bodyFont:{family:"DM Sans",size:12}}
      },
      scales:{
        x:{grid:{display:false},ticks:{color:labelColor,font:{family:"Space Grotesk",weight:"600",size:11}}},
        y:{beginAtZero:true,ticks:{precision:0,color:labelColor,font:{family:"DM Sans",size:11}},grid:{color:gridColor}}
      },
      animation:{duration:1200,easing:"easeOutQuart"}
    }
  });
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
function initDateCalc() {
  const s = document.getElementById("bookingStartDate");
  const e = document.getElementById("bookingEndDate");
  const t = document.getElementById("bookingTotalDays");
  if (!s||!e||!t) return;
  function calc() {
    if (!s.value||!e.value) { t.value=""; return; }
    const diff = Math.floor((new Date(e.value)-new Date(s.value))/86400000)+1;
    t.value = diff>0 ? `${diff} Day${diff>1?"s":""}` : "Invalid dates";
  }
  s.addEventListener("change",calc); e.addEventListener("change",calc);
}

// ── SLOT AUTO-ASSIGN ──────────────────────────────────────
async function autoAssignSlot() {
  const asset   = document.getElementById("bookingAsset")?.value;
  const startEl = document.getElementById("bookingStartDate");
  const endEl   = document.getElementById("bookingEndDate");
  const slotEl  = document.getElementById("bookingSlot");
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
      const bookings = Object.values(bookSnap.val());
      bookings.forEach(b => {
        if (!b) return;
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
  let [circuitSlots, bookings] = await Promise.all([loadCircuitSlots(), loadBookings()]);
  if (!circuitSlots.length) { table.innerHTML = `<tr><td style="padding:20px;text-align:center;color:var(--text-muted);">No circuits found</td></tr>`; return; }
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
        while (prev && !rowCircuit) { const c2=prev.querySelector(".circuit-col:not(.head)"); if (c2) rowCircuit=c2.textContent.trim(); prev=prev.previousElementSibling; }
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

// ── MISC ──────────────────────────────────────────────────
function updateAssetOccupancy(tables) {
  const t = tables["oohassets"]; if (!t) return;
  const rows = Array.isArray(t) ? t : Object.values(t);
  let total=0, booked=0;
  rows.forEach(r => { if (!r) return; const c={}; Object.keys(r).forEach(k=>c[k.trim()]=r[k]); total+=Number(c.Slot||0); booked+=Number(c["Booked Slot"]||0); });
}
function updateMonthlyVisitors(tables) {
  const vt = tables["vehiclecounts"]||tables["VehicleCounts"]||Object.values(tables).find((v,i,a)=>Object.keys(tables)[i]?.toLowerCase()==="vehiclecounts");
  if (!vt) return;
}

// ── PARTICLE / CANVAS / CURSOR ANIMATIONS ─────────────────
function initAnimations() {
  // SCROLL PROGRESS
  window.addEventListener("scroll", () => {
    const p = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
    const el = document.getElementById("scroll-progress");
    if (el) el.style.width = p + "%";
  });

  // CURSOR
  const cursor = document.getElementById("cursor");
  const cursorRing = document.getElementById("cursor-ring");
  let mouseX=0, mouseY=0, ringX=0, ringY=0;
  if (cursor && cursorRing) {
    if (window.innerWidth > 900) {
      document.addEventListener("mousemove", e => {
        mouseX = e.clientX; mouseY = e.clientY;
        cursor.style.left = mouseX + "px"; cursor.style.top = mouseY + "px";
      });
      setInterval(() => {
        ringX += (mouseX - ringX) * 0.15; ringY += (mouseY - ringY) * 0.15;
        cursorRing.style.left = ringX + "px"; cursorRing.style.top = ringY + "px";
      }, 16);
      document.querySelectorAll("button,a,input,select,.stat-card").forEach(el => {
        el.addEventListener("mouseenter", () => { cursor.style.width="24px"; cursor.style.height="24px"; cursorRing.style.width="52px"; cursorRing.style.height="52px"; });
        el.addEventListener("mouseleave", () => { cursor.style.width="16px"; cursor.style.height="16px"; cursorRing.style.width="36px"; cursorRing.style.height="36px"; });
      });
    } else { cursor.style.display="none"; cursorRing.style.display="none"; }
  }

  // HERO CANVAS
  const canvas = document.getElementById("hero-canvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let W, H, particles = [];
    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = canvas.parentElement.offsetHeight || window.innerHeight; }
    resize(); window.addEventListener("resize", () => { resize(); initParticles(); });
    function Particle() { this.x=Math.random()*W; this.y=Math.random()*H; this.vx=(Math.random()-0.5)*0.4; this.vy=(Math.random()-0.5)*0.4; this.r=Math.random()*1.5+0.5; this.alpha=Math.random()*0.5+0.1; }
    Particle.prototype.update = function() { this.x+=this.vx; this.y+=this.vy; if(this.x<0)this.x=W; if(this.x>W)this.x=0; if(this.y<0)this.y=H; if(this.y>H)this.y=0; };
    function initParticles() { const count=Math.floor(W*H/12000); particles=Array.from({length:count},()=>new Particle()); }
    initParticles();
    let mouseHero={x:W/2,y:H/2};
    canvas.parentElement.addEventListener("mousemove",e=>{mouseHero.x=e.clientX;mouseHero.y=e.clientY;});
    function drawParticles() {
      const isDark=document.documentElement.getAttribute("data-theme")!=="light";
      ctx.clearRect(0,0,W,H);
      particles.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=isDark?`rgba(99,102,241,${p.alpha})`:`rgba(79,70,229,${p.alpha*0.6})`;ctx.fill();p.update();});
      const maxDist=120;
      for(let i=0;i<particles.length;i++){const dx=particles[i].x-mouseHero.x;const dy=particles[i].y-mouseHero.y;const dist=Math.sqrt(dx*dx+dy*dy);if(dist<maxDist){ctx.beginPath();ctx.moveTo(particles[i].x,particles[i].y);ctx.lineTo(mouseHero.x,mouseHero.y);const alpha=(1-dist/maxDist)*(isDark?0.3:0.15);ctx.strokeStyle=`rgba(79,70,229,${alpha})`;ctx.lineWidth=0.8;ctx.stroke();}}
      requestAnimationFrame(drawParticles);
    }
    drawParticles();
  }

  // SCROLL REVEAL
  const reveals = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); observer.unobserve(e.target); } });
  }, {threshold:0.1,rootMargin:"0px 0px -40px 0px"});
  reveals.forEach(el => observer.observe(el));

  // Immediately reveal elements already in view
  reveals.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add("visible");
      observer.unobserve(el);
    }
  });
}

// ── INIT (called by router after HTML is injected) ────────
export async function init(userName) {
  currentUserName = userName || "User";

  // Set booking person label
  const lbl = document.getElementById("bookingPersonLabel");
  if (lbl) lbl.textContent = currentUserName;

  // Date filter setup
  const dateFilterBtn = document.getElementById("dateFilterBtn");
  const dateFilterDropdown = document.getElementById("dateFilterDropdown");
  const dateCustomInputs = document.getElementById("dateCustomInputs");
  const dateFilterLabel = document.getElementById("dateFilterLabel");

  [drpStart, drpEnd] = getPresetRange("this-month");

  if (dateFilterBtn) {
    dateFilterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dateFilterDropdown.classList.toggle("open");
      dateFilterBtn.classList.toggle("open");
    });
  }

  document.addEventListener("click", (e) => {
    if (dateFilterBtn && !dateFilterBtn.contains(e.target) && dateFilterDropdown && !dateFilterDropdown.contains(e.target)) {
      dateFilterDropdown.classList.remove("open");
      dateFilterBtn.classList.remove("open");
    }
    // Close inline status dropdowns
    document.querySelectorAll(".inline-status-dropdown.open")
      .forEach(d => d.classList.remove("open"));
  });

  document.querySelectorAll(".date-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".date-preset").forEach(b => b.classList.remove("selected"));
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
      drpStart = parseISOLocal(f);
      drpEnd   = parseISOLocal(t);
      if (dateFilterLabel) dateFilterLabel.textContent = `${f} → ${t}`;
      applyFilters();
      dateFilterDropdown?.classList.remove("open");
      dateFilterBtn?.classList.remove("open");
    }
  });

  // Campaign search/filter
  document.getElementById("campaignSearch")?.addEventListener("input", applyFilters);
  document.getElementById("campaignStatusFilter")?.addEventListener("change", applyFilters);

  // Slot auto-assign
  ["bookingAsset","bookingStartDate","bookingEndDate"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", autoAssignSlot);
  });

  // Booking modal
  const bookingModal = document.getElementById("bookingModal");
  ["openBookingBtn","openBookingBtnHero"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => bookingModal?.classList.add("active"));
  });
  ["closeBookingModal"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => bookingModal?.classList.remove("active"));
  });
  document.getElementById("clearFormBtn")?.addEventListener("click", () => {
    ["bookingOrder","bookingClient","bookingBrand","bookingStartDate","bookingEndDate","bookingTotalDays"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value="";
    });
    const a = document.getElementById("bookingAsset"); if (a) a.selectedIndex=0;
  });

  document.getElementById("confirmBookingBtn")?.addEventListener("click", async () => {
    const booking = document.getElementById("bookingOrder")?.value;
    const client  = document.getElementById("bookingClient")?.value?.trim();
    const brand   = document.getElementById("bookingBrand")?.value?.trim();
    const asset   = document.getElementById("bookingAsset")?.value;
    const start   = document.getElementById("bookingStartDate")?.value;
    const end     = document.getElementById("bookingEndDate")?.value;
    const slotRaw = document.getElementById("bookingSlot")?.value || "";
    const person  = document.getElementById("bookingPersonLabel")?.textContent?.trim();
    if (!client||!brand||!asset||!start||!end) { alert("Please fill in all required fields."); return; }
    const slotNum = parseInt(slotRaw.replace(/\D/g,""), 10);
    if (!slotRaw || isNaN(slotNum) || slotRaw.toLowerCase().includes("no slots")) {
      alert("No available slot for the selected circuit and date range."); return;
    }
    const btn = document.getElementById("confirmBookingBtn");
    btn.textContent = "Saving…"; btn.disabled = true;
    function toMMDDYYYY(iso) { const p = iso.split("-"); return `${p[1]}/${p[2]}/${p[0]}`; }
    try {
      const existingSnap = await get(ref(rtdb, "Campaigns_Booking"));
      let nextKey = 1;
      if (existingSnap.exists()) {
        const val = existingSnap.val();
        nextKey = (Array.isArray(val) ? val.filter(Boolean).length : Object.keys(val).length);
      }
      await set(ref(rtdb, `Campaigns_Booking/${nextKey}`), {
        BO: booking, Client: client, "Brand Campaign": brand,
        Circuits: asset, Slot: slotNum,
        "Start Date": toMMDDYYYY(start), "End Date": toMMDDYYYY(end),
        Status: "Pending", Person: person
      });
      btn.textContent = "Saved! ✓";
      const tables = await loadAll();
      allCampaigns = getCampaigns(tables);
      applyFilters(); renderChart(allCampaigns); updateStats(allCampaigns, tables);
      setTimeout(() => {
        btn.textContent = "Save Booking"; btn.disabled = false;
        ["bookingClient","bookingBrand","bookingStartDate","bookingEndDate","bookingTotalDays","bookingSlot"].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = "";
        });
        const a = document.getElementById("bookingAsset"); if (a) a.selectedIndex = 0;
        document.getElementById("bookingModal")?.classList.remove("active");
      }, 1500);
    } catch(e) {
      console.error(e); btn.textContent = "Error — try again"; btn.disabled = false;
    }
  });

  // Calendar modal
  const calModal = document.getElementById("calendarModal");
  [calDrpStart, calDrpEnd] = setCalPresetRange("this-month");

  const calDateFilterBtn = document.getElementById("calDateFilterBtn");
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
        const calToEl = document.getElementById("calTo");
        if (calFromEl) calFromEl.value = toISO(calDrpStart);
        if (calToEl) calToEl.value = toISO(calDrpEnd);
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

  ["openCalBtn","openCalBtnHero"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", async () => {
      calModal?.classList.add("active");
      if (!calDrpStart) [calDrpStart, calDrpEnd] = setCalPresetRange("this-month");
      const calFromEl = document.getElementById("calFrom");
      const calToEl = document.getElementById("calTo");
      if (calFromEl) calFromEl.value = toISO(calDrpStart);
      if (calToEl) calToEl.value = toISO(calDrpEnd);
      await buildCalendar();
    });
  });
  document.getElementById("closeCalModal")?.addEventListener("click", () => calModal?.classList.remove("active"));

  // Initialize animations (particle canvas, cursor, scroll reveal)
  initAnimations();

  // Load data
  const tables = await loadAll();
  window.__tables = tables;
  allCampaigns = getCampaigns(tables);
  applyFilters();
  renderChart(allCampaigns);
  updateStats(allCampaigns, tables);
  renderUpdates(allCampaigns, tables);
  updateAssetOccupancy(tables);
  updateMonthlyVisitors(tables);
  populateAssets(tables);
  initDateCalc();
}

// ── CLEANUP (called by router before switching views) ─────
export function cleanup() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}
