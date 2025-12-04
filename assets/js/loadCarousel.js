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

      // Convert to mm/dd/yyyy for comparison
      let match = cellValue.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4})$/);
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

      // Convert for comparison
      const parts = formatted.split("/");
      const d = parseInt(parts[0]);
      const mmm = parts[1];
      const y = parseInt(parts[2]);

      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const m = months.indexOf(mmm);

      const rowDate = new Date(y, m, d);
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

  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data) continue;

    const cleanTitle = tableName
      .replace(/^d_/, "")
      .replace(/^s_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

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
    else if (tableName.startsWith("Upcoming_")) {
      columns = ["Client", "Location", "Circuit", "Start Date"];
      targetCarousel = upcomingCarousel;
      highlightCols = ["Start Date"];
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
    const dataObj = Object.fromEntries(validRows.map((row, index) => [index, row]));

    targetCarousel.appendChild(
      createCard(cleanTitle, dataObj, columns, highlightCols)
    );
  }
}

document.addEventListener("DOMContentLoaded", loadCarousel);
