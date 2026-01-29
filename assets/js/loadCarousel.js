// Firebase Imports
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// ===============================
// Load all top-level nodes
// ===============================
async function loadAllTables() {
  try {
    const rootRef = ref(rtdb, "/");
    const snap = await get(rootRef);
    return snap.exists() ? snap.val() : {};
  } catch (error) {
    console.error("❌ Error loading database:", error);
    return {};
  }
}

// ===============================
// Format date as dd/mmm/yyyy
// ===============================
function formatDateDDMMMYYYY(value) {
  if (!value) return "—";

  value = value.trim();
  const parts = value.split("/").map(x => x.trim()).filter(x => x !== "");
  if (parts.length < 2) return "—";

  let [month, day, year] = parts;

  month = month.padStart(2, "0");
  day = day.padStart(2, "0");

  if (!year) {
    year = new Date().getFullYear();
  } else {
    if (/^\d{2}$/.test(year)) year = "20" + year;
    if (!/^\d{4}$/.test(year)) year = new Date().getFullYear();
  }

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mIndex = parseInt(month, 10) - 1;
  if (mIndex < 0 || mIndex > 11) return "—";

  return `${day}-${monthNames[mIndex]}-${year}`;
}

// ===============================
// Convert JSON → HTML table with optional highlighting
// ===============================
function jsonToTableAuto(dataObj, columns, highlightColumns = []) {
  if (!dataObj || Object.keys(dataObj).length === 0) return "<p>No data</p>";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = `
    <table class="json-table">
      <thead>
        <tr>${columns.map(col => `<th>${col}</th>`).join("")}</tr>
      </thead>
      <tbody>
  `;

  for (const rowKey in dataObj) {
    const row = dataObj[rowKey] || {};
    html += `<tr>`;

    columns.forEach(field => {
      let cellValue = row[field] ?? "—";
      let className = "";

      let match = cellValue.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
      let numericDate = null;

      if (match) {
        const d = parseInt(match[1]);
        const mmm = match[2];
        const y = parseInt(match[3]);
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const m = months.indexOf(mmm);
        numericDate = new Date(y, m, d);
        numericDate.setHours(0,0,0,0);
      }

      if (field === "Start Date" && numericDate) {
        if (numericDate.getTime() === today.getTime()) {
          className = "date-today";
        }
      }

      if (highlightColumns.includes(field) && className === "" && numericDate) {
        const diff = (numericDate - today) / 86400000;

        if (diff === 0) className = "date-today";
        else if (diff === 1) className = "date-tomorrow";
        else if (diff > 1 && diff <= 7) className = "date-week";
        else if (diff < 0) className = "date-less-than-today";
      }

      html += `<td class="${className}">${cellValue}</td>`;
    });

    html += `</tr>`;
  }

  html += "</tbody></table>";
  return html;
}

// ===============================
// Create Card
// ===============================
function createCard(title, data, columns, highlightColumns = []) {
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <h2>${title}</h2>
    <div class="table-container">
      ${jsonToTableAuto(data, columns, highlightColumns)}
    </div>
  `;
  return card;
}

// ===============================
// TODAY Campaign Logs Section
// ===============================
function publishCampaignToday(allTables) {
  const todayCarousel = document.getElementById("carouselPublishToday");
  if (!todayCarousel) return;

  todayCarousel.replaceChildren();

  const logs = allTables["Campaign_Logs"];
  if (!logs) {
    showNoData(todayCarousel);
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = Array.isArray(logs) ? logs : Object.values(logs);

  const publishedSet = new Map();
  const removedSet = new Map();

  rows.forEach(row => {
    if (!row?.Date || !row?.Type) return;

    const formattedLogDate = formatDateDDMMMYYYY(row.Date);
    if (formattedLogDate === "—") return;

    const [d, mmm, y] = formattedLogDate.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m = months.indexOf(mmm);

    const logDate = new Date(y, m, d);
    logDate.setHours(0, 0, 0, 0);

    if (logDate.getTime() !== today.getTime()) return;

    const key = `${row.Client}|${row.Location}`;
    const record = { Client: row.Client ?? "—", Location: row.Location ?? "—" };

    if (row.Type === "Add") publishedSet.set(key, record);
    if (row.Type === "Removed") removedSet.set(key, record);
  });

  let hasData = false;

  if (publishedSet.size > 0) {
    hasData = true;
    todayCarousel.appendChild(
      createCard(
        "Campaign Published Today",
        Object.fromEntries([...publishedSet.values()].map((r,i)=>[i,r])),
        ["Client","Location"]
      )
    );
  }

  if (removedSet.size > 0) {
    hasData = true;
    todayCarousel.appendChild(
      createCard(
        "Campaign Removed Today",
        Object.fromEntries([...removedSet.values()].map((r,i)=>[i,r])),
        ["Client","Location"]
      )
    );
  }

  if (!hasData) showNoData(todayCarousel);
}

function showNoData(container) {
  const msg = document.createElement("div");
  msg.textContent = "No Campaign Published and Removed Today";
  msg.classList.add("no-data-message");
  container.appendChild(msg);
}

// ===============================
// Load Carousel
// ===============================
export async function loadCarousel() {
  const digitalCarousel = document.getElementById("carouselDigital");
  const staticCarousel  = document.getElementById("carouselStatic");
  const upcomingCarousel = document.getElementById("carouselUpcoming");

  const allTables = await loadAllTables();

  publishCampaignToday(allTables);

  // (your Digital, Static, Upcoming & Ending logic — unchanged)
  // ...
}   // ✅ ← THIS WAS MISSING

// ===============================
// DOM Ready
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  loadCarousel();
});
