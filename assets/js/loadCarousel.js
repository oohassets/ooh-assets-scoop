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
// Format date → mm/dd/yyyy
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
// Convert JSON → HTML table
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

      // Only highlight specific columns
      if (highlightColumns.includes(field) && cellValue !== "—") {
        const parts = cellValue.split("/").map(x => parseInt(x, 10));
        if (parts.length === 3) {
          const cellDate = new Date(parts[2], parts[0] - 1, parts[1]);
          const diff = (cellDate - today) / (1000 * 60 * 60 * 24);

          if (diff === 0) className = "date-today";             // Today
          else if (diff === 1) className = "date-tomorrow";     // Tomorrow
          else if (diff > 1 && diff <= 7) className = "date-week"; // Within this week
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
function createCard(title, data, columns, highlightColumns = [], cardID) {
  const card = document.createElement("div");
  card.className = "card";
  card.id = cardID;

  card.innerHTML = `
    <div class="card-header">
      <h2>${title}</h2>
      <div class="expand-btn" onclick="openFullscreen('${cardID}')">Expand ></div>
    </div>
    <div class="table-container">
      ${jsonToTableAuto(data, columns, highlightColumns)}
    </div>
  `;

  return card;
}

// ===============================
// Load Carousel
// ===============================
export async function loadCarousel() {
  const digitalCarousel = document.getElementById("carouselDigital");
  const staticCarousel = document.getElementById("carouselStatic");
  const upcomingCarousel = document.getElementById("carouselUpcoming");

  if (!digitalCarousel || !staticCarousel || !upcomingCarousel) {
    console.error("❌ Carousel elements missing.");
    return;
  }

  const allTables = await loadAllTables();

  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data) continue;

    let columns, targetCarousel, highlightCols;

    // DIGITAL
    if (tableName.startsWith("d_")) {
      columns = ["SN", "Client", "Start Date", "End Date"];
      targetCarousel = digitalCarousel;
      highlightCols = ["End Date"];
    }
    // STATIC
    else if (tableName.startsWith("s_")) {
      columns = ["Circuit", "Client", "Start Date", "End Date"];
      targetCarousel = staticCarousel;
      highlightCols = ["End Date"];
    }
    // UPCOMING CAMPAIGNS (array order)
    else if (tableName.startsWith("Upcoming_")) {
      columns = ["Client", "Location", "Circuit", "Start Date"];
      targetCarousel = upcomingCarousel;
      highlightCols = ["Start Date"];
    }
    else continue;

    // Row array
    const rows = Array.isArray(data) ? data : Object.values(data);

    // Normalize row values
    const dateCols = columns.filter(c => c.toLowerCase().includes("date"));

    rows.forEach(row => {
      if (!row) return;
      columns.forEach(col => {
        if (dateCols.includes(col)) {
          row[col] = row[col] ? formatDateMMDDYYYY(row[col]) : "—";
        } else {
          row[col] = row[col] ?? "—";
        }
      });
    });

    // Build safe object
    const validRows = rows.filter(r => r && typeof r === "object");
    const dataObj = Object.fromEntries(validRows.map((row, i) => [i, row]));

    // Unique card ID
    const cardID = `${tableName}_card`;

    const cleanTitle = tableName
      .replace(/^d_/, "")
      .replace(/^s_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    const card = createCard(cleanTitle, dataObj, columns, highlightCols, cardID);
    targetCarousel.appendChild(card);
  }
}

document.addEventListener("DOMContentLoaded", loadCarousel);

// ===============================
// Fullscreen Logic
// ===============================
window.openFullscreen = function (cardId) {
  const overlay = document.getElementById("fullscreenOverlay");
  const container = document.getElementById("fullscreenContent");

  const originalCard = document.getElementById(cardId);
  const clone = originalCard.cloneNode(true);

  const expBtn = clone.querySelector(".expand-btn");
  if (expBtn) expBtn.remove();

  container.innerHTML = "";
  container.appendChild(clone);

  overlay.style.display = "flex";
};

window.closeFullscreen = function () {
  document.getElementById("fullscreenOverlay").style.display = "none";
  document.getElementById("fullscreenContent").innerHTML = "";
};
