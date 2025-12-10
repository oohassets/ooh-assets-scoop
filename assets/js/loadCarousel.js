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
// TODAY Campaign Section
// ===============================
function publishCampaignToday(allTables) {
  const todayCarousel = document.getElementById("carouselPublishToday");
  if (!todayCarousel) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const digitalToday = [];
  const staticToday = [];

  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data) continue;

    if (!tableName.startsWith("d_") && !tableName.startsWith("s_")) continue;

    const cleanLocation = tableName
      .replace(/^d_/, "")
      .replace(/^s_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    const rows = Array.isArray(data) ? data : Object.values(data);

    rows.forEach(row => {
      if (!row || !row["Start Date"]) return;

      const formatted = formatDateDDMMMYYYY(row["Start Date"]);

      // Convert formatted dd-mmm-yyyy back to a real date
      const [d, mmm, y] = formatted.split("-");
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const m = months.indexOf(mmm);

      const rowDate = new Date(parseInt(y), m, parseInt(d));
      rowDate.setHours(0, 0, 0, 0);

      if (rowDate.getTime() === today.getTime()) {
        const newRow = {
          Client: row.Client ?? "—",
          Location: cleanLocation,
          "Start Date": formatted
        };

        if (tableName.startsWith("d_")) digitalToday.push(newRow);
        if (tableName.startsWith("s_")) staticToday.push(newRow);
      }
    });
  }

  todayCarousel.innerHTML = "";

  if (digitalToday.length > 0) {
    const obj = Object.fromEntries(digitalToday.map((r, i) => [i, r]));
    todayCarousel.appendChild(
      createCard("Digital", obj, ["Client", "Location", "Start Date"], ["Start Date"])
    );
  }

  if (staticToday.length > 0) {
    const obj = Object.fromEntries(staticToday.map((r, i) => [i, r]));
    todayCarousel.appendChild(
      createCard("Static", obj, ["Client", "Location", "Start Date"], ["Start Date"])
    );
  }

  if (digitalToday.length === 0 && staticToday.length === 0) {
    const msg = document.createElement("div");
    msg.textContent = "No campaign publish today";
    msg.classList.add("no-data-message");
    todayCarousel.appendChild(msg);
  }
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

      const formattedDate = formatDateDDMMMYYYY(row["Start Date"]);

      upcomingRows.push({
        Client: row.Client ?? "—",
        Location: row.Location ?? "—",
        Circuit: row.Circuit ?? "—",
        "Start Date": formattedDate
      });
    });
  }

  upcomingCarousel.innerHTML = "";

  if (upcomingRows.length > 0) {
    const dataObj = Object.fromEntries(upcomingRows.map((r, i) => [i, r]));
    upcomingCarousel.appendChild(
      createCard("Upcoming Campaigns", dataObj, ["Client", "Location", "Circuit", "Start Date"], ["Start Date"])
    );
  } else {
    const msg = document.createElement("div");
    msg.textContent = "No Upcoming Campaigns";
    msg.classList.add("no-data-message");
    upcomingCarousel.appendChild(msg);
  }
}

document.addEventListener("DOMContentLoaded", loadCarousel);
