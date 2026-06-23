/* ── Vehicle Traffic Report View Module ─────────────────── */
import { rtdb } from "../../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const adsPerMinute = 6;
const personPerCar = 2;
let chart = null;
let shouldAnimateKPI = false;

const screenConfig = [
  {name:"Underpass",            screens:1,  source:"tpi",   icon:"directions_car"},
  {name:"Digital Mupi",         screens:12, source:"tpi",   icon:"tv"},
  {name:"UDC Tower",            screens:1,  source:"tpi",   icon:"apartment"},
  {name:"Qanat Quartier",       screens:1,  source:"tpi",   icon:"location_city"},
  {name:"Gewan Crystal Walk",   screens:12, source:"gewan", icon:"storefront"}
];

function parseMDY(dateStr) {
  if (!dateStr) return null;
  const [month, day, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function parsePickerDate(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function updateDaysCount() {
  const from = parsePickerDate(document.getElementById("dateFrom")?.value);
  const to   = parsePickerDate(document.getElementById("dateTo")?.value);
  const el   = document.getElementById("daysCount");
  if (!from || !to || isNaN(from) || isNaN(to)) { if (el) el.innerText = "Days: -"; return; }
  const diff = Math.floor((to - from) / 86400000) + 1;
  if (el) el.innerText = "Days: " + diff;
}

async function loadData() {
  const from = parsePickerDate(document.getElementById("dateFrom")?.value);
  const to   = parsePickerDate(document.getElementById("dateTo")?.value);
  if (!from || !to) return;
  from.setHours(0,0,0,0);
  to.setHours(23,59,59,999);

  const snap = await get(ref(rtdb, "vehiclecounts"));
  const allData = snap.exists() ? snap.val() : null;
  if (!allData) return;

  let tpi = [], gewan = [];
  for (const key in allData) {
    const d = allData[key];
    const date = parseMDY(d.ContentDate || d["Content.Date"]);
    if (!date) continue;
    date.setHours(12,0,0,0);
    if (date < from || date > to) continue;
    if (d.Name?.toUpperCase().includes("TPI"))   tpi.push(d);
    if (d.Name?.toUpperCase().includes("GEWAN")) gewan.push(d);
  }

  shouldAnimateKPI = true;
  renderCards(tpi, gewan);
  renderChart(tpi, gewan);
}

function animateKPI(progress, totals) {
  document.getElementById("kpiTPI").innerText   = Math.floor(progress * totals.tpi).toLocaleString();
  document.getElementById("kpiGewan").innerText = Math.floor(progress * totals.gewan).toLocaleString();
  document.getElementById("kpiAll").innerText   = Math.floor(progress * totals.all).toLocaleString();
}

function format(val) {
  return val === "-" ? "-" : Number(val).toLocaleString();
}

function renderCards(tpiData, gewanData) {
  const container = document.getElementById("cardsContainer");
  if (!container) return;
  container.innerHTML = "";
  const from = parsePickerDate(document.getElementById("dateFrom")?.value);
  const to   = parsePickerDate(document.getElementById("dateTo")?.value);
  const days = (from && to) ? Math.floor((to - from) / 86400000) + 1 : 1;

  screenConfig.forEach(loc => {
    const data = loc.source === "tpi" ? tpiData : gewanData;
    if (!data.length) { container.innerHTML += createCard(loc, "-", "-", "-", "-"); return; }
    const total       = data.reduce((s, x) => s + Number(x.ContentTotal || 0), 0);
    const avg         = Math.round(total / days);
    const persons     = total * personPerCar;
    const avgPersons  = Math.round(persons / days);
    const impDay      = Math.round((avgPersons / adsPerMinute) * loc.screens);
    const totalImp    = impDay * days;
    container.innerHTML += createCard(loc, totalImp, impDay, avg, avgPersons);
  });
}

function createCard(loc, totalImp, impDay, avg, avgPersons) {
  return `
  <div class="card">
    <h3>${loc.name}</h3>
    <div class="big">${format(totalImp)}</div>
    <div class="metric">
      <div class="label"><span class="material-symbols-outlined">${loc.icon}</span> Screens</div>
      <div class="value">${loc.screens}</div>
    </div>
    <div class="metric">
      <div class="label"><span class="material-symbols-outlined">visibility</span> Impression/day</div>
      <div class="value">${format(impDay)}</div>
    </div>
    <div class="metric">
      <div class="label"><span class="material-symbols-outlined">directions_car</span> Avg Traffic</div>
      <div class="value">${format(avg)}</div>
    </div>
    <div class="metric">
      <div class="label"><span class="material-symbols-outlined">accessibility</span> Avg Persons/day</div>
      <div class="value">${format(avgPersons)}</div>
    </div>
  </div>`;
}

function renderChart(tpiData, gewanData) {
  const canvas = document.getElementById("vehicleChart");
  if (!canvas) return;
  if (chart) { chart.destroy(); chart = null; }

  const rawLabels = Array.from(new Set([
    ...tpiData.map(d => d.ContentDate || d["Content.Date"]),
    ...gewanData.map(d => d.ContentDate || d["Content.Date"])
  ])).sort((a, b) => new Date(a) - new Date(b));

  const fmt = d => new Date(d).toLocaleDateString("en-GB", {day:"2-digit", month:"short"});
  const labels = rawLabels.map(fmt);

  const tpiCounts   = rawLabels.map(l => { const r = tpiData.find(d => (d.ContentDate||d["Content.Date"]) === l); return r ? Number(r.ContentTotal||r["Content.Total"]||0) : 0; });
  const gewanCounts = rawLabels.map(l => { const r = gewanData.find(d => (d.ContentDate||d["Content.Date"]) === l); return r ? Number(r.ContentTotal||r["Content.Total"]||0) : 0; });

  const totals = { tpi: tpiCounts.reduce((a,b)=>a+b,0), gewan: gewanCounts.reduce((a,b)=>a+b,0) };
  totals.all = totals.tpi + totals.gewan;

  const isDark     = document.documentElement.getAttribute("data-theme") !== "light";
  const gridColor  = isDark ? "rgba(255,255,255,0.05)" : "rgba(79,70,229,0.06)";
  const labelColor = isDark ? "#5A6A8A" : "#6B7A99";

  chart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label:"The Pearl Island", data:tpiCounts,   backgroundColor:"rgba(16,185,129,0.8)", borderRadius:6, borderSkipped:false },
        { label:"Gewan Island",     data:gewanCounts, backgroundColor:"rgba(4,150,255,0.8)",  borderRadius:6, borderSkipped:false }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ intersect:false, mode:"index" },
      animation: {
        duration:1200, easing:"easeOutQuart",
        onProgress: anim => { if (shouldAnimateKPI) animateKPI(anim.currentStep / anim.numSteps, totals); },
        onComplete:  ()   => { if (shouldAnimateKPI) { animateKPI(1, totals); shouldAnimateKPI = false; } }
      },
      plugins: {
        legend:{ position:"top", align:"end", labels:{ usePointStyle:true, pointStyle:"circle", padding:20, font:{family:"Space Grotesk", size:12, weight:"600"}, color:labelColor } },
        title:{ display:false },
        tooltip:{
          backgroundColor: isDark ? "#0A1628" : "white",
          borderColor:"rgba(79,70,229,0.2)", borderWidth:1,
          padding:14, cornerRadius:14,
          titleColor: isDark ? "#F8FAFF" : "#0A1628",
          bodyColor:  isDark ? "#94A3C0" : "#3D4F6E",
          titleFont:{ family:"Space Grotesk", size:13, weight:"700" },
          bodyFont:{ family:"DM Sans", size:12 },
          callbacks:{ label: ctx => ` ${ctx.dataset.label}: ${new Intl.NumberFormat().format(ctx.raw)} vehicles` }
        }
      },
      scales: {
        x:{ grid:{display:false}, ticks:{ color:labelColor, font:{family:"Space Grotesk", weight:"600", size:11}, maxRotation:45, minRotation:45 } },
        y:{ beginAtZero:true, grid:{color:gridColor}, ticks:{ color:labelColor, font:{family:"DM Sans", size:11}, callback: v => new Intl.NumberFormat("en",{notation:"compact"}).format(v) } }
      }
    }
  });
}

export async function init() {
  // Wire up date inputs and load button
  document.getElementById("dateFrom")?.addEventListener("change", updateDaysCount);
  document.getElementById("dateTo")?.addEventListener("change",   updateDaysCount);
  document.getElementById("loadBtn")?.addEventListener("click",   loadData);

  // Enable load button (auth already handled by index.html)
  const btn = document.getElementById("loadBtn");
  if (btn) btn.disabled = false;
}

export function cleanup() {
  if (chart) { chart.destroy(); chart = null; }
}
