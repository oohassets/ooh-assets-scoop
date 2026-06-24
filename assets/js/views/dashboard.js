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
    const sd = parseDate(c.rawStartDate); const ed = parseDate(c.rawEndDate);
    if (!sd) return; sd.setHours(0,0,0,0); if (ed) ed.setHours(0,0,0,0);
    const sdiff = Math.floor((sd-today)/86400000);
    const ediff = ed ? Math.floor((ed-today)/86400000) : 999;
    const s = (c.status||"").toLowerCase();
    const isUpcoming = s.includes("signed") || s.includes("pending");
    const isActive   = isUpcoming || s.includes("live");
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
        { label:"The Pearl Island", data:tpiData,   backgroundColor:"rgba(16,185,129,0.8)", borderRadius:{ topLeft:6, topRight:6, bottomLeft:0, bottomRight:0 }, borderSkipped:false },
        { label:"Gewan Island",     data:gewanData, backgroundColor:"rgba(4,150,255,0.8)",  borderRadius:{ topLeft:6, topRight:6, bottomLeft:0, bottomRight:0 }, borderSkipped:false }
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
      },
      animations: {
        y: { from: 0 }
      }
    }
  });
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

  // Hero canvas particles
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

  // Hero CTA buttons → navigate to Bookings page
  document.getElementById("openBookingBtnHero")?.addEventListener("click", () => {
    window.openBookings?.();
  });
  document.getElementById("openCalBtnHero")?.addEventListener("click", () => {
    window.openBookings?.();
  });

  initAnimations();

  const tables = await loadAll();
  window.__tables = tables;
  const campaigns = getCampaigns(tables);
  updateStats(campaigns, tables);
  renderUpdates(campaigns, tables);
  renderChart(campaigns);
  renderVisitorsChart(tables);
}

// ── CLEANUP ───────────────────────────────────────────────
export function cleanup() {
  if (chartInstance)         { chartInstance.destroy();         chartInstance = null; }
  if (visitorsChartInstance) { visitorsChartInstance.destroy(); visitorsChartInstance = null; }
}
