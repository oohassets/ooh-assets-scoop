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
// Format any date as mm/dd/yyyy
// ===============================
function formatDateMMDDYYYY(value) {
  if (!value) return "—";

  value = value.trim();
  const parts = value.split("/").map(x => x.trim()).filter(x => x !== "");
  if (parts.length < 2) return "—";

  let [month, day] = parts;
  month = month.padStart(2, "0");
  day = day.padStart(2, "0");

  let year = parts.length === 3 ? parts[2] : new Date().getFullYear();
  if (/^\d{2}$/.test(year)) year = "20" + year;
  if (!/^\d{4}$/.test(year)) year = new Date().getFullYear();

  return `${month}/${day}/${year}`;
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

      // ===== FIXED: Start Date priority highlight =====
      if (field === "Start Date" && cellValue !== "—") {
        const parts = cellValue.split("/").map(Number);
        if (parts.length === 3) {
          const cellDate = new Date(parts[2], parts[0] - 1, parts[1]);
          cellDate.setHours(0, 0, 0, 0);

          if (cellDate.getTime() === today.getTime()) {
            className = "date-today";
          }
        }
      }

      // ===== End Date highlight (only if not Start Date today) =====
      if (highlightColumns.includes(field) && className === "" && cellValue !== "—") {
        const parts = cellValue.split("/").map(Number);
        if (parts.length === 3) {
          const cellDate = new Date(parts[2], parts[0] - 1, parts[1]);
          cellDate.setHours(0, 0, 0, 0);

          const diff = (cellDate - today) / (1000 * 60 * 60 * 24);

          if (diff === 0) className = "date-today";
          else if (diff === 1) className = "date-tomorrow";
          else if (diff > 1 && diff <= 7) className = "date-week";
          else if (diff < 0) className = "date-less-than-today";
        }
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
  if (!todayCarousel) {
    console.warn("⚠️ carouselToday container missing.");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const digitalToday = [];
  const staticToday = [];

  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data) continue;

    // Only digital and static tables
    if (!tableName.startsWith("d_") && !tableName.startsWith("s_")) continue;

    // Extract Location from title
    const cleanLocation = tableName
      .replace(/^d_/, "")
      .replace(/^s_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    const rows = Array.isArray(data) ? data : Object.values(data);

    rows.forEach(row => {
      if (!row || !row["Start Date"]) return;

      const formatted = formatDateMMDDYYYY(row["Start Date"]);
      const [m, d, y] = formatted.split("/").map(Number);

      const rowDate = new Date(y, m - 1, d);
      rowDate.setHours(0, 0, 0, 0);

      // Only campaigns starting today
      if (rowDate.getTime() === today.getTime()) {
        const newRow = {
          Client: row.Client ?? "—",
          Location: cleanLocation,       // 👈 Location based on title
          "Start Date": formatted
        };

        if (tableName.startsWith("d_")) digitalToday.push(newRow);
        if (tableName.startsWith("s_")) staticToday.push(newRow);
      }
    });
  }

  // Save to global for expand
  window.digitalTodayRows = digitalToday;
  window.staticTodayRows  = staticToday;

  // --- Create Cards ---
  if (digitalToday.length > 0) {
    const obj = Object.fromEntries(digitalToday.map((r, i) => [i, r]));
    const card = createCard(
      "Digital",
      obj,
      ["Client", "Location", "Start Date"],
      ["Start Date"]
    );
    todayCarousel.appendChild(card);
  }

  if (staticToday.length > 0) {
    const obj = Object.fromEntries(staticToday.map((r, i) => [i, r]));
    const card = createCard(
      "Static",
      obj,
      ["Client", "Location", "Start Date"],
      ["Start Date"]
    );
    todayCarousel.appendChild(card);
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

  // NEW SECTION
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
          row[col] = row[col] ? formatDateMMDDYYYY(row[col]) : "—";
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

