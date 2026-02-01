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

      // Convert to Date for highlighting
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

      // ===== Start Date highlight =====
      if (field === "Start Date" && numericDate) {
        if (numericDate.getTime() === today.getTime()) {
          className = "date-today";
        }
      }

      // ===== End Date highlight =====
      if (highlightColumns.includes(field) && className === "" && numericDate) {
        const diff = (numericDate - today) / (1000 * 60 * 60 * 24);

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

    const client = row.Client ?? "—";
    const location = row.Location ?? "—";
    const key = `${client}|${location}`;

    const record = { Client: client, Location: location };

    if (row.Type === "Add") publishedSet.set(key, record);
    if (row.Type === "Removed") removedSet.set(key, record);
  });

  let hasData = false;

  // ===== ONE Published Card =====
  if (publishedSet.size > 0) {
    hasData = true;

    const sortedPublished = [...publishedSet.values()]
      .sort((a, b) => a.Client.localeCompare(b.Client));

    const publishedCard = createCard(
      "Campaign Published Today",
      Object.fromEntries(sortedPublished.map((r, i) => [i, r])),
      ["Client", "Location"]
    );

    publishedCard.classList.add("published-card");
    todayCarousel.appendChild(publishedCard);
  }

  // ===== ONE Removed Card =====
  if (removedSet.size > 0) {
    hasData = true;

    const sortedRemoved = [...removedSet.values()]
      .sort((a, b) => a.Client.localeCompare(b.Client));

    const removedCard = createCard(
      "Campaign Removed Today",
      Object.fromEntries(sortedRemoved.map((r, i) => [i, r])),
      ["Client", "Location"]
    );

    removedCard.classList.add("removed-card");
    todayCarousel.appendChild(removedCard);
  }

  if (!hasData) showNoData(todayCarousel);
}

// 🔁 Helper
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

  // Today Campaigns
  publishCampaignToday(allTables);

  // ===============================
  // Digital & Static Sections
  // ===============================
  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data) continue;

    let columns, targetCarousel, highlightCols = [];

    if (tableName.startsWith("d_")) {
      columns = ["SN", "Client", "Start Date", "End Date"];
      targetCarousel = digitalCarousel;
      highlightCols = ["End Date"];
    }
    else if (tableName.startsWith("s_")) {
      columns = ["Circuit", "Client", "Start Date", "End Date"];
      targetCarousel = staticCarousel;
      highlightCols = ["End Date"];
    }
    else continue;

    const rows = Array.isArray(data) ? data : Object.values(data);

    const dateCols = columns.filter(col => col.toLowerCase().includes("date"));
    rows.forEach(row => {
      if (!row || typeof row !== "object") return;
      columns.forEach(col => {
        if (dateCols.includes(col)) {
          row[col] = row[col] ? formatDateDDMMMYYYY(row[col]) : "—";
        } else {
          row[col] = row[col] ?? "—";
        }
      });
    });

    const validRows = rows.filter(row => row && typeof row === "object");
    if (validRows.length === 0) continue;

    const dataObj = Object.fromEntries(validRows.map((row, index) => [index, row]));

    targetCarousel.appendChild(
      createCard(
        tableName.replace(/^d_|^s_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        dataObj,
        columns,
        highlightCols
      )
    );
  }

  // ===============================
  // Upcoming Campaigns Section
  // ===============================
  const upcomingRows = [];

  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data || !tableName.startsWith("Upcoming_")) continue;

    const rows = Array.isArray(data) ? data : Object.values(data);

    rows.forEach(row => {
      if (!row || !row["Start Date"]) return;

      upcomingRows.push({
        Client: row.Client ?? "—",
        Location: row.Location ?? "—",
        Circuit: row.Circuit ?? "—",
        "Start Date": formatDateDDMMMYYYY(row["Start Date"])
      });
    });
  }

  upcomingCarousel.innerHTML = "";

  if (upcomingRows.length > 0) {
    const dataObj = Object.fromEntries(upcomingRows.map((r, i) => [i, r]));
    upcomingCarousel.appendChild(
      createCard(
        "Upcoming Campaigns",
        dataObj,
        ["Client", "Location", "Circuit", "Start Date"],
        ["Start Date"]
      )
    );
  } else {
    const msg = document.createElement("div");
    msg.textContent = "No Upcoming Campaigns";
    msg.classList.add("no-data-message");
    upcomingCarousel.appendChild(msg);
  }

  // ===============================
  // Ending Campaigns Section (Next 3 Days)
  // ===============================
  const endingRows = [];

  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data) continue;

    if (!tableName.startsWith("d_") && !tableName.startsWith("s_")) continue;

    const rows = Array.isArray(data) ? data : Object.values(data);

    rows.forEach(row => {
      if (!row || !row["End Date"]) return;

      // 🚫 Skip invalid dash values
      if (row["End Date"].trim() === "-") return;

      // 🔥 Parse End Date SAFELY
      const raw = row["End Date"].trim();
      const parts = raw.split("/").map(p => p.trim());

      if (parts.length < 2) return;

      let [month, day, year] = parts;

      month = parseInt(month, 10) - 1;
      day = parseInt(day, 10);

      if (!year) {
        year = new Date().getFullYear();
      } else if (/^\d{2}$/.test(year)) {
        year = parseInt("20" + year, 10);
      } else {
        year = parseInt(year, 10);
      }

      if (isNaN(month) || isNaN(day) || isNaN(year)) return;

      const endDate = new Date(year, month, day);
      endDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diff = (endDate - today) / 86400000;
      if (diff < 0 || diff > 3) return;

      endingRows.push({
        Client: row.Client ?? "—",
        Location: row.Location ?? "—",
        Circuit: row.Circuit ?? "—",
        "End Date": formatDateDDMMMYYYY(row["End Date"])
      });
    });

  }

  if (endingRows.length > 0) {
    const dataObj = Object.fromEntries(endingRows.map((r, i) => [i, r]));

    upcomingCarousel.appendChild(
      createCard(
        "Ending Campaigns (Next 3 Days)",
        dataObj,
        ["Client", "Location", "Circuit", "End Date"],
        ["End Date"]
      )
    );
  }
}


// ===============================
// DOMContentLoaded
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  // 🔄 Load all inventory content
  loadCarousel();

  // 🔀 Tabs logic (Digital / Static)
  const tabs = document.querySelectorAll(".inventory-tabs .tab");
  const sections = {
    digital: document.getElementById("digital-section"),
    static: document.getElementById("static-section")
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {

      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      Object.values(sections).forEach(sec => {
        if (sec) sec.style.display = "none";
      });

      if (sections[tab.dataset.target]) {
        sections[tab.dataset.target].style.display = "block";
      }
    });
  });
});
