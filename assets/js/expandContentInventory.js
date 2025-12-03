// Firebase Imports
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// ===============================
// Load all tables
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
// Date formatting
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
// Convert JSON → HTML Table
// ===============================
function jsonToTableAuto(dataObj, columns, highlightColumns = []) {
  if (!dataObj || Object.keys(dataObj).length === 0) return "<p>No data</p>";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = `<table class="json-table"><thead><tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;

  for (const rowKey in dataObj) {
    const row = dataObj[rowKey] || {};
    html += "<tr>";
    columns.forEach(col => {
      let cellValue = row[col] ?? "—";
      let className = "";

      if (highlightColumns.includes(col) && cellValue !== "—") {
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
    html += "</tr>";
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
// Expand Carousel Overlay
// ===============================
function expandCarousel(type) {
  const overlay = document.getElementById("fullscreenOverlay");
  overlay.classList.add("show");

  const digitalOverlay = document.getElementById("digitalOverlay");
  const staticOverlay = document.getElementById("staticOverlay");

  digitalOverlay.style.display = "none";
  staticOverlay.style.display = "none";

  digitalOverlay.innerHTML = `<h2>Digital Circuits</h2>`;
  staticOverlay.innerHTML = `<h2>Static Circuits</h2>`;

  let targetOverlay, allRows;

  if (type === "digital") {
    targetOverlay = digitalOverlay;
    allRows = window.digitalTodayRows || [];
  }
  if (type === "static") {
    targetOverlay = staticOverlay;
    allRows = window.staticTodayRows || [];
  }

  if (!targetOverlay) return;

  if (allRows.length === 0) {
    targetOverlay.innerHTML += `<p>No campaigns today.</p>`;
  } else {
    // Auto-add SN if missing
    const enrichedRows = allRows.map((row, i) => ({
      SN: i + 1,
      ...row
    }));

    const obj = Object.fromEntries(enrichedRows.map((r, i) => [i, r]));

    // Dynamically get all column names from first row
    const columns = enrichedRows.length > 0 ? Object.keys(enrichedRows[0]) : [];

    // Highlight only date columns
    const highlightCols = columns.filter(c => c.toLowerCase().includes("date"));

    targetOverlay.appendChild(createCard("Campaigns Today", obj, columns, highlightCols));
  }

  targetOverlay.style.display = "block";
}


// ===============================
// Attach Event Listeners
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  loadCarousel();

  document.querySelector(".expand-digital-btn").addEventListener("click", e => {
    e.preventDefault();
    expandCarousel("digital");
  });

  document.querySelector(".expand-static-btn").addEventListener("click", e => {
    e.preventDefault();
    expandCarousel("static");
  });

  // Close overlay
  document.getElementById("overlayCloseBtn").addEventListener("click", () => {
    document.getElementById("fullscreenOverlay").classList.remove("show");
  });
});
