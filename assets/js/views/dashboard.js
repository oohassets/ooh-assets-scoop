/* ── Dashboard View Module ───────────────────────────────── */
import { rtdb } from "../../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

export let currentUserName = "";
export function setUser(name) { currentUserName = name; }

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let chartInstance = null;
let visitorsChartInstance = null;

// ── HELPERS ───────────────────────────────────────────────
function parseDate(v) {
  if (!v) return null;
  const p = v.toString().trim().split("/").map(x => parseInt(x,10));
  if (p.length >= 3) return new Date(p[2]||new Date().getFullYear(), p[0]-1, p[1]);
  if (p.length === 2) return new Date(new Date().getFullYear(), p[0]-1, p[1]);
  return null;
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

// ── CAMPAIGNS ─────────────────────────────────────────────
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
      bo: row.BO||row["BO No"]||row["BO NO"]||"",
      date: `${fmtShort(sd)} → ${fmtShort(ed)}`, sortDate
    });
  });
  return list.sort((a,b) => b.sortDate - a.sortDate);
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

// ── ENDING (sourced from content inventory d_/s_ circuit tables) ─────────
/**
 * Scans every d_/s_ circuit table for slots whose End Date falls within
 * `windowDays` of today. Slots whose End Date has already passed are kept
 * too (rather than dropped) and flagged as "Extended", since the slot is
 * still occupying the circuit past its originally scheduled end date.
 */
function getEndingFromContentInventory(tables, today, dateLabel, windowDays) {
  const items = [];
  Object.keys(tables).forEach(tableName => {
    if (!tableName.startsWith("d_") && !tableName.startsWith("s_")) return;
    const data = tables[tableName];
    if (!data) return;
    const formattedName = tableName.replace(/^d_|^s_/, "").replace(/_/g," ").replace(/\b\w/g, ch => ch.toUpperCase());
    const rows = Array.isArray(data) ? data : Object.values(data);
    rows.forEach(r => {
      if (!r || !r["End Date"]) return;
      const ed = parseDate(r["End Date"]); if (!ed) return;
      ed.setHours(0,0,0,0);
      const ediff = Math.floor((ed-today)/86400000);
      const isExtended = ediff < 0;
      if (!isExtended && ediff > windowDays) return;
      let asset = formattedName;
      if (tableName.startsWith("s_") && r["Circuit"]) asset = `${formattedName} ${r["Circuit"]}`;
      items.push({
        label: dateLabel(ed, r["End Date"]),
        brand: r.Client || "—",
        asset,
        statusCls: isExtended ? "extended" : "",
        statusLabel: isExtended ? "Extended" : "",
        sortDate: ed
      });
    });
  });
  return items;
}

// ── CAMPAIGN UPDATES ──────────────────────────────────────
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
    const sd = parseDate(c.rawStartDate);
    if (!sd) return; sd.setHours(0,0,0,0);
    const sdiff = Math.floor((sd-today)/86400000);
    const s = (c.status||"").toLowerCase();
    const isUpcoming = s.includes("signed") || s.includes("pending");
    const isActive   = isUpcoming || s.includes("live");
    if (!isActive) return;
    const ed = parseDate(c.rawEndDate); if (ed) ed.setHours(0,0,0,0);
    const ediff = ed ? Math.floor((ed-today)/86400000) : 999;
    if (isUpcoming && ((sdiff>=0&&sdiff<=30)||(sdiff<0&&ediff>=0))) {
      groups.upcoming.push({label:dateLabel(sd,c.rawStartDate),statusCls:getStatusClass(c.status),statusLabel:c.status,brand:c.brand||c.client,asset:c.asset,person:c.person,sortDate:sd});
    }
  });
  // Ending — sourced from the content inventory (d_/s_ circuit tables), not
  // Campaigns_Booking: a slot's real "End Date" there is what's actually
  // scheduled to come off screen. A slot whose End Date has already passed
  // (but is still occupying the circuit) is flagged "Extended" instead of
  // being dropped, since it means the booking ran past its original date.
  groups.ending = getEndingFromContentInventory(tables, today, dateLabel, 7);
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
          ${(id==="upcoming"||id==="ending")&&u.statusLabel?`<span class="status-pill pill-${u.statusCls}" style="margin-top:4px;font-size:10px;">${u.statusLabel}</span>`:""}
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

// ── CAMPAIGN TRENDS CHART ─────────────────────────────────
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
  const gridColor  = isDark ? "rgba(255,255,255,0.05)" : "rgba(79,70,229,0.06)";
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

// ── VISITORS CHART ────────────────────────────────────────
function renderVisitorsChart(tables) {
  const canvas = document.getElementById("visitorsChart");
  if (!canvas) return;
  if (visitorsChartInstance) { visitorsChartInstance.destroy(); visitorsChartInstance = null; }

  const vt = tables["vehiclecounts"] || tables["VehicleCounts"] ||
    Object.values(tables).find((_,i) => Object.keys(tables)[i]?.toLowerCase() === "vehiclecounts");
  if (!vt) return;

  const rows = Array.isArray(vt) ? vt : Object.values(vt);
  const monthly = {};

  rows.forEach(row => {
    if (!row) return;
    const dateStr = row.ContentDate;
    const total   = Number(row.ContentTotal || 0);
    const name    = (row.Name || "").toUpperCase();
    if (!dateStr || !total) return;
    const parts = dateStr.split("/").map(Number);
    if (parts.length < 3) return;
    const key = `${parts[2]}-${String(parts[0]).padStart(2,"0")}`;
    if (!monthly[key]) monthly[key] = { tpi: 0, gewan: 0 };
    if (name.includes("TPI"))   monthly[key].tpi   += total;
    if (name.includes("GEWAN")) monthly[key].gewan += total;
  });

  const allKeys = Object.keys(monthly).sort();
  if (!allKeys.length) return;
  const latestKey = allKeys[allKeys.length - 1];
  const [latestY, latestM] = latestKey.split("-").map(Number);

  const labels = [], tpiData = [], gewanData = [];
  for (let i = 11; i >= 0; i--) {
    let m = latestM - i, y = latestY;
    while (m <= 0) { m += 12; y--; }
    const key = `${y}-${String(m).padStart(2,"0")}`;
    labels.push(`${MONTHS[m-1]} '${String(y).slice(2)}`);
    tpiData.push(monthly[key]?.tpi   || 0);
    gewanData.push(monthly[key]?.gewan || 0);
  }

  const isDark     = document.documentElement.getAttribute("data-theme") !== "light";
  const gridColor  = isDark ? "rgba(255,255,255,0.05)" : "rgba(79,70,229,0.06)";
  const labelColor = isDark ? "#5A6A8A" : "#6B7A99";

  visitorsChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label:"The Pearl Island", data:tpiData,   backgroundColor:"#990000", borderRadius:{ topLeft:6, topRight:6, bottomLeft:0, bottomRight:0 }, borderSkipped:false },
        { label:"Gewan Island",     data:gewanData, backgroundColor:"#999999", borderRadius:{ topLeft:6, topRight:6, bottomLeft:0, bottomRight:0 }, borderSkipped:false }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{intersect:false,mode:"index"},
      plugins:{
        legend:{position:"top",align:"end",labels:{usePointStyle:true,pointStyle:"circle",padding:20,font:{family:"Space Grotesk",size:12,weight:"600"},color:labelColor}},
        tooltip:{
          backgroundColor:isDark?"#0A1628":"white",borderColor:"rgba(79,70,229,0.2)",borderWidth:1,padding:14,cornerRadius:14,
          titleColor:isDark?"#F8FAFF":"#0A1628",bodyColor:isDark?"#94A3C0":"#3D4F6E",
          titleFont:{family:"Space Grotesk",size:13,weight:"700"},bodyFont:{family:"DM Sans",size:12},
          callbacks:{ label: ctx => ` ${ctx.dataset.label}: ${new Intl.NumberFormat().format(ctx.raw)}` }
        }
      },
      scales:{
        x:{grid:{display:false},ticks:{color:labelColor,font:{family:"Space Grotesk",weight:"600",size:11}}},
        y:{beginAtZero:true,grid:{color:gridColor},ticks:{color:labelColor,font:{family:"DM Sans",size:11},callback:v=>new Intl.NumberFormat("en",{notation:"compact"}).format(v)}}
      },
      animation: {
        duration: 900,
        easing: "easeOutQuart",
        delay(ctx) {
          return ctx.type === "data" ? ctx.dataIndex * 60 : 0;
        }
      }
    }
  });
}

// ── STAT DETAIL PANEL ────────────────────────────────────
function initStatPanel(campaigns, tables) {
  const overlay  = document.getElementById("statOverlay");
  const panel    = document.getElementById("statPanel");
  const titleEl  = document.getElementById("statPanelTitle");
  const countEl  = document.getElementById("statPanelCount");
  const bodyEl   = document.getElementById("statPanelBody");
  const closeBtn = document.getElementById("statPanelClose");
  if (!overlay) return;

  const accentMap = {
    live: "var(--accent-emerald)", signed: "var(--accent-rose)",
    pending: "var(--accent-amber)", free: "var(--accent-cyan)"
  };

  function buildItems(items) {
    if (!items.length) return `<p class="sp-empty">No data available</p>`;
    return items.map((item, i) => {
      const label   = item.brand && item.brand !== "—"
        ? `${item.client} - ${item.brand}` : item.client;
      const circuit = item.circuit && item.circuit !== "—"
        ? `<div class="sp-circuit">${item.circuit}</div>` : "";
      const bo      = item.bo   && item.bo   !== "—" ? `<span class="sp-bo">${item.bo}</span>`   : "";
      const dates   = item.date && item.date !== "— → —" ? `<span class="sp-dates">${item.date}</span>` : "";
      return `
        <div class="sp-item" style="animation-delay:${i * 0.04}s">
          <span class="sp-num">${i + 1}</span>
          <div class="sp-body">
            <div class="sp-client">${label}</div>
            ${circuit}
            <div class="sp-meta">${bo}${dates}</div>
          </div>
        </div>`;
    }).join("");
  }

  function openPanel(type) {
    let items = [];
    const titleMap = { live: "Paid Campaigns", signed: "Booked Assets", pending: "Pending Approvals", free: "Free / Filler" };
    const statusKey = { live: "live", signed: "signed", pending: "pending" };

    if (statusKey[type]) {
      items = campaigns
        .filter(c => c.status.toLowerCase().includes(statusKey[type]))
        .map(c => ({ client: c.client, brand: c.brand, circuit: c.asset, bo: c.bo, date: c.date }));
    } else if (type === "free") {
      Object.entries(tables).forEach(([tName, tData]) => {
        if (!tName.startsWith("d_") && !tName.startsWith("s_")) return;
        if (!tData) return;
        const tLabel = tName.replace(/^[ds]_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        const rows   = Array.isArray(tData) ? tData : Object.values(tData);
        rows.forEach(r => {
          if (!r) return;
          const bo = (r.BO || "").toString();
          if (!/free|filler/i.test(bo)) return;
          items.push({
            client:  r.Client && r.Client !== "—" ? r.Client : "—",
            brand:   "",
            circuit: r.Circuit ? `${tLabel} – ${r.Circuit}` : tLabel,
            bo,
            date: `${fmtShort(r["Start Date"])} → ${fmtShort(r["End Date"])}`
          });
        });
      });
    }

    titleEl.textContent = titleMap[type] || "";
    countEl.textContent = `${items.length} campaign${items.length !== 1 ? "s" : ""}`;
    bodyEl.innerHTML    = buildItems(items);
    panel.style.setProperty("--sp-accent", accentMap[type] || "var(--accent-indigo)");
    overlay.dataset.active = type;
    overlay.classList.add("open");
  }

  function closePanel() {
    overlay.classList.remove("open");
    overlay.dataset.active = "";
  }

  document.querySelectorAll(".stat-card[data-stat]").forEach(card => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const type = card.dataset.stat;
      if (overlay.classList.contains("open") && overlay.dataset.active === type) {
        closePanel();
      } else {
        openPanel(type);
      }
    });
  });

  closeBtn?.addEventListener("click", closePanel);
  overlay?.addEventListener("click", e => { if (e.target === overlay) closePanel(); });
}

// ── ANIMATIONS ────────────────────────────────────────────
function initAnimations() {
  // Scroll progress
  window.addEventListener("scroll", () => {
    const p = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
    const el = document.getElementById("scroll-progress");
    if (el) el.style.width = p + "%";
  });

  // Cursor
  const cursor = document.getElementById("cursor");
  const cursorRing = document.getElementById("cursor-ring");
  let mouseX=0, mouseY=0, ringX=0, ringY=0;
  if (cursor && cursorRing) {
    if (window.innerWidth > 900) {
      document.addEventListener("mousemove", e => { mouseX = e.clientX; mouseY = e.clientY; cursor.style.left=mouseX+"px"; cursor.style.top=mouseY+"px"; });
      setInterval(() => { ringX+=(mouseX-ringX)*0.15; ringY+=(mouseY-ringY)*0.15; cursorRing.style.left=ringX+"px"; cursorRing.style.top=ringY+"px"; }, 16);
      document.querySelectorAll("button,a,input,select,.stat-card").forEach(el => {
        el.addEventListener("mouseenter", () => { cursor.style.width="24px"; cursor.style.height="24px"; cursorRing.style.width="52px"; cursorRing.style.height="52px"; });
        el.addEventListener("mouseleave", () => { cursor.style.width="16px"; cursor.style.height="16px"; cursorRing.style.width="36px"; cursorRing.style.height="36px"; });
      });
    } else { cursor.style.display="none"; cursorRing.style.display="none"; }
  }

  // Scroll reveal
  const reveals = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); observer.unobserve(e.target); } });
  }, {threshold:0.1,rootMargin:"0px 0px -40px 0px"});
  reveals.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) { el.classList.add("visible"); return; }
    observer.observe(el);
  });
}

// ── INIT ──────────────────────────────────────────────────
export async function init(userName) {
  currentUserName = userName || "User";

  initAnimations();

  const tables = await loadAll();
  window.__tables = tables;
  const campaigns = getCampaigns(tables);
  updateStats(campaigns, tables);
  renderUpdates(campaigns, tables);
  initStatPanel(campaigns, tables);
  renderChart(campaigns);
  renderVisitorsChart(tables);
}

// ── CLEANUP ───────────────────────────────────────────────
export function cleanup() {
  if (chartInstance)         { chartInstance.destroy();         chartInstance = null; }
  if (visitorsChartInstance) { visitorsChartInstance.destroy(); visitorsChartInstance = null; }
}
