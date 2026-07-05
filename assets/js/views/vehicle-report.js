/* ── Vehicle Traffic Report View Module ─────────────────── */
import { rtdb } from "../../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const adsPerMinute = 6;
const personPerCar = 2;
let chart = null;
let kpiChart = null;
let rankChart = null;
let circuitMetrics = []; // last computed per-circuit stats: {name, category, impDay}

let vehicleDataCache = null;
let monthKeys = [];

let assetRateCache = null;
let circuitConfig = [];   // built from the "assetrate" table: {name, faces, category, source, icon}
let activeCircuits = new Set(); // circuit names currently shown in the cards grid (slicer state)

// Circuits visible by default when the page first loads; everything else starts hidden.
const DEFAULT_ACTIVE_CIRCUITS = [
  "Underpass Entrance",
  "Mupi Circuit 1",
  "Gewan Crystal Walk Circuit 1",
  "Light Poles Main Entrance Circuit 1"
];

function parseMDY(dateStr) {
  if (!dateStr) return null;
  const [month, day, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

/** "YYYY-MM" key for a given Date. */
function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" -> "May 2026" */
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** "YYYY-MM" -> { from: first day 00:00, to: last day 23:59:59 } */
function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  return {
    from: new Date(y, m - 1, 1, 0, 0, 0, 0),
    to:   new Date(y, m, 0, 23, 59, 59, 999)
  };
}

/** Date -> "YYYY-MM-DD" for native <input type="date"> value/min/max. */
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" -> Date */
function parseISODate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function fetchAllData() {
  if (vehicleDataCache) return vehicleDataCache;
  const snap = await get(ref(rtdb, "vehiclecounts"));
  vehicleDataCache = snap.exists() ? snap.val() : {};
  return vehicleDataCache;
}

async function fetchAssetRates() {
  if (assetRateCache) return assetRateCache;
  const snap = await get(ref(rtdb, "assetrate"));
  assetRateCache = snap.exists() ? snap.val() : {};
  return assetRateCache;
}

/**
 * Build the circuit list from the "assetrate" table (category, name, faces).
 * Only DEFAULT_ACTIVE_CIRCUITS start visible in the slicer; the rest start hidden.
 */
async function loadCircuitConfig() {
  const raw = await fetchAssetRates();
  circuitConfig = Object.values(raw)
    .filter(r => r && r.name)
    .map(r => {
      const category = (r.category || "").toLowerCase() === "static" ? "static" : "digital";
      return {
        name: r.name,
        screens: Number(r.faces) || 0,
        category,
        source: /gewan/i.test(r.name) ? "gewan" : "tpi",
        icon: category === "static" ? "signpost" : "tv",
        metricLabel: category === "static" ? "Faces" : "Screens"
      };
    });
  activeCircuits = new Set(
    circuitConfig.map(c => c.name).filter(name => DEFAULT_ACTIVE_CIRCUITS.includes(name))
  );
}

/** Renders the excel-slicer-style toggle buttons as two columns: Digital / Static. */
function renderCircuitSlicer() {
  const el = document.getElementById("circuitSlicer");
  if (!el || !circuitConfig.length) return;

  const groups = { digital: [], static: [] };
  circuitConfig.forEach(c => groups[c.category].push(c));

  const columnHTML = (cat, list) => `
    <div class="vr-slicer-group">
      <span class="vr-slicer-group-label">${cat === "digital" ? "Digital" : "Static"}</span>
      <div class="vr-slicer-btns">
        ${list.map(c => `<button type="button" class="vr-slicer-btn${activeCircuits.has(c.name) ? " active" : ""}" data-circuit="${c.name}">${c.name}</button>`).join("")}
      </div>
    </div>`;

  el.innerHTML = `
    <div class="vr-slicer-title">Circuits</div>
    <div class="vr-slicer-columns">
      ${columnHTML("digital", groups.digital)}
      ${columnHTML("static", groups.static)}
    </div>`;

  el.querySelectorAll(".vr-slicer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.circuit;
      btn.classList.toggle("active");
      if (btn.classList.contains("active")) activeCircuits.add(name);
      else activeCircuits.delete(name);
      applyCircuitFilter();
      renderCircuitRankChart();
    });
  });
}

/** Shows/hides already-rendered cards to match the current slicer selection. */
function applyCircuitFilter() {
  document.querySelectorAll("#cardsContainer .card").forEach(card => {
    card.style.display = activeCircuits.has(card.dataset.circuit) ? "" : "none";
  });
}

/** Horizontal bar chart ranking the currently selected circuits by total impressions over the selected period. */
function renderCircuitRankChart() {
  const canvas = document.getElementById("circuitRankChart");
  if (!canvas) return;
  if (rankChart) { rankChart.destroy(); rankChart = null; }

  const rows = circuitMetrics
    .filter(m => activeCircuits.has(m.name) && m.totalImp > 0)
    .sort((a, b) => b.totalImp - a.totalImp)
    .slice(0, 10);

  const totalEl = document.getElementById("circuitRankTotal");
  if (totalEl) totalEl.textContent = rows.reduce((s, r) => s + r.totalImp, 0).toLocaleString();

  const isDark     = document.documentElement.getAttribute("data-theme") !== "light";
  const gridColor  = isDark ? "rgba(255,255,255,0.05)" : "rgba(79,70,229,0.06)";
  const labelColor = isDark ? "#5A6A8A" : "#6B7A99";

  rankChart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: rows.map(r => r.name),
      datasets: [{
        data: rows.map(r => r.totalImp),
        backgroundColor: rows.map(r => r.category === "static" ? "rgba(200,58,80,0.85)" : "rgba(152,30,50,0.85)"),
        borderRadius: 6,
        borderSkipped: "left"
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? "#0A1628" : "white",
          borderColor: "rgba(79,70,229,0.2)", borderWidth: 1,
          padding: 10, cornerRadius: 10,
          titleColor: isDark ? "#F8FAFF" : "#0A1628",
          bodyColor:  isDark ? "#94A3C0" : "#3D4F6E",
          callbacks: { label: ctx => ` ${new Intl.NumberFormat().format(ctx.raw)} impressions` }
        }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: labelColor, font: { family: "DM Sans", size: 10 }, callback: v => new Intl.NumberFormat("en", { notation: "compact" }).format(v) } },
        y: { grid: { display: false }, ticks: { color: labelColor, font: { family: "DM Sans", size: 10 } } }
      }
    }
  });
}

/**
 * Scan the DB once, collect every month that has data, and fill:
 * - #monthSelect: "Select Date Range" + divider, then months latest → oldest
 * - #dateFrom / #dateTo: native calendar inputs, constrained to the actual
 *   earliest/latest dates present in the DB (used only in range mode)
 */
async function populateMonthDropdowns() {
  const allData = await fetchAllData();
  const keysSet = new Set();
  let minDate = null, maxDate = null;

  for (const key in allData) {
    const d = allData[key];
    const date = parseMDY(d.ContentDate || d["Content.Date"]);
    if (!date) continue;
    keysSet.add(monthKey(date));
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
  }
  monthKeys = Array.from(keysSet).sort(); // ascending: oldest → latest

  const monthSelect = document.getElementById("monthSelect");
  const fromInput    = document.getElementById("dateFrom");
  const toInput      = document.getElementById("dateTo");
  if (!monthSelect || !fromInput || !toInput || !monthKeys.length) return;

  const descOptionsHTML = [...monthKeys].reverse().map(k => `<option value="${k}">${monthLabel(k)}</option>`).join("");
  monthSelect.innerHTML =
    `<option value="range">Select Date Range</option>` +
    `<option disabled>──────────</option>` +
    descOptionsHTML;

  const latest = monthKeys[monthKeys.length - 1];
  monthSelect.value = latest;

  if (minDate && maxDate) {
    const minISO = toISODate(minDate);
    const maxISO = toISODate(maxDate);
    fromInput.min = minISO; fromInput.max = maxISO;
    toInput.min   = minISO; toInput.max   = maxISO;

    // Default the calendar range to the latest whole month, capped to the
    // last day that actually has data.
    const latestRange = monthRange(latest);
    const cappedTo = latestRange.to > maxDate ? maxDate : latestRange.to;
    fromInput.value = toISODate(latestRange.from);
    toInput.value   = toISODate(cappedTo);
  }
}

/** Resolves the currently active {from, to} regardless of single-month or range mode. */
function getSelectedRange() {
  const mode = document.getElementById("monthSelect")?.value;
  if (!mode) return null;

  if (mode === "range") {
    const from = parseISODate(document.getElementById("dateFrom")?.value);
    const to   = parseISODate(document.getElementById("dateTo")?.value);
    if (!from || !to || to < from) return null;
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  return monthRange(mode);
}

function updateDaysCount() {
  const el    = document.getElementById("daysCount");
  const range = getSelectedRange();
  if (!range) { if (el) el.textContent = "-"; return; }
  const diff = Math.floor((range.to - range.from) / 86400000) + 1;
  if (el) el.textContent = diff;
}

async function loadData() {
  const range = getSelectedRange();
  if (!range) return;
  const { from, to } = range;
  const days = Math.floor((to - from) / 86400000) + 1;

  const allData = await fetchAllData();

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

  const tpiTotal   = tpi.reduce((s, x) => s + Number(x.ContentTotal || x["Content.Total"] || 0), 0);
  const gewanTotal = gewan.reduce((s, x) => s + Number(x.ContentTotal || x["Content.Total"] || 0), 0);

  renderKPIChart(tpiTotal, gewanTotal, days);
  renderCards(tpi, gewan, days);
  renderChart(tpi, gewan);
}

function renderKPIChart(tpiTotal, gewanTotal, days) {
  const combined = tpiTotal + gewanTotal;
  document.getElementById("kpiTPI").innerText   = tpiTotal.toLocaleString();
  document.getElementById("kpiGewan").innerText = gewanTotal.toLocaleString();
  document.getElementById("kpiAll").innerText   = combined.toLocaleString();
  document.getElementById("kpiAvgDay").innerText = Math.round(combined / days).toLocaleString();

  const canvas = document.getElementById("kpiDonut");
  if (!canvas) return;
  if (kpiChart) { kpiChart.destroy(); kpiChart = null; }

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";

  kpiChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: ["The Pearl Island", "Gewan Island"],
      datasets: [{
        data: [tpiTotal, gewanTotal],
        backgroundColor: ["#990000", "#999999"],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      animation: { duration: 900, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? "#0A1628" : "white",
          borderColor: "rgba(79,70,229,0.2)", borderWidth: 1,
          padding: 10, cornerRadius: 10,
          titleColor: isDark ? "#F8FAFF" : "#0A1628",
          bodyColor:  isDark ? "#94A3C0" : "#3D4F6E",
          callbacks: { label: ctx => ` ${ctx.label}: ${new Intl.NumberFormat().format(ctx.raw)} vehicles` }
        }
      }
    }
  });
}

function format(val) {
  return val === "-" ? "-" : Number(val).toLocaleString();
}

function renderCards(tpiData, gewanData, days) {
  const container = document.getElementById("cardsContainer");
  if (!container) return;
  container.innerHTML = "";

  circuitMetrics = [];

  circuitConfig.forEach(loc => {
    const data = loc.source === "tpi" ? tpiData : gewanData;
    if (!data.length) {
      container.innerHTML += createCard(loc, "-", "-", "-", "-");
      circuitMetrics.push({ name: loc.name, category: loc.category, totalImp: 0 });
      return;
    }
    const total       = data.reduce((s, x) => s + Number(x.ContentTotal || 0), 0);
    const avg         = Math.round(total / days);
    const persons     = total * personPerCar;
    const avgPersons  = Math.round(persons / days);
    const impDay      = Math.round((avgPersons / adsPerMinute) * loc.screens);
    const totalImp    = impDay * days;
    container.innerHTML += createCard(loc, totalImp, impDay, avg, avgPersons);
    circuitMetrics.push({ name: loc.name, category: loc.category, totalImp });
  });

  applyCircuitFilter();
  renderCircuitRankChart();
}

function createCard(loc, totalImp, impDay, avg, avgPersons) {
  return `
  <div class="card" data-circuit="${loc.name}">
    <h3>${loc.name}</h3>
    <div class="big">${format(totalImp)}</div>
    <div class="metric">
      <div class="label"><span class="material-symbols-outlined">${loc.icon}</span> ${loc.metricLabel}</div>
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

  const isDark     = document.documentElement.getAttribute("data-theme") !== "light";
  const gridColor  = isDark ? "rgba(255,255,255,0.05)" : "rgba(79,70,229,0.06)";
  const labelColor = isDark ? "#5A6A8A" : "#6B7A99";

  chart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label:"The Pearl Island", data:tpiCounts,   backgroundColor:"#990000", borderRadius:6, borderSkipped:"bottom" },
        { label:"Gewan Island",     data:gewanCounts, backgroundColor:"#999999", borderRadius:6, borderSkipped:"bottom" }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ intersect:false, mode:"index" },
      animation: { duration:1200, easing:"easeOutQuart" },
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
  const monthSelect = document.getElementById("monthSelect");
  const rangeRow    = document.getElementById("rangeRow");

  // Picking "Select Date Range" reveals the From/To pair; picking a real
  // month hides it and refreshes the report immediately with that month.
  monthSelect?.addEventListener("change", () => {
    const isRange = monthSelect.value === "range";
    if (rangeRow) rangeRow.hidden = !isRange;
    updateDaysCount();
    if (!isRange) loadData();
  });

  // Any change to the custom range dates refreshes the report immediately.
  document.getElementById("dateFrom")?.addEventListener("change", () => { updateDaysCount(); loadData(); });
  document.getElementById("dateTo")?.addEventListener("change",   () => { updateDaysCount(); loadData(); });

  // Populate dropdowns from whatever data actually exists in the DB,
  // default to the latest available whole month, and auto-render it.
  await populateMonthDropdowns();
  updateDaysCount();

  // Build the circuit slicer from the "assetrate" table (default circuits active).
  await loadCircuitConfig();
  renderCircuitSlicer();

  await loadData();
}

export function cleanup() {
  if (chart) { chart.destroy(); chart = null; }
  if (kpiChart) { kpiChart.destroy(); kpiChart = null; }
  if (rankChart) { rankChart.destroy(); rankChart = null; }
  vehicleDataCache = null;
  assetRateCache = null;
}
