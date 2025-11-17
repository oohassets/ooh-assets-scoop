// Firebase Imports
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/**
 * Fetch all top-level nodes (tables)
 */
async function loadAllTables() {
  try {
    const rootRef = ref(rtdb, "/");
    const snap = await get(rootRef);

    if (snap.exists()) {
      return snap.val();
    } else {
      console.warn("⚠️ Realtime Database is empty.");
      return {};
    }
  } catch (error) {
    console.error("❌ Error loading database:", error);
    return {};
  }
}

/**
 * Convert JSON object → HTML table (WITHOUT ROW COLUMN)
 */
function jsonToTableAuto(dataObj) {
  if (!dataObj) return "<p>No data</p>";

  // Fixed column order
  const columns = ["SN", "Client", "Start Date", "End Date"];

  let html = `
    <table class="json-table">
      <thead>
        <tr>
          ${columns.map(col => `<th>${col}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
  `;

  // Loop rows in RTDB (row1, row2, row3...)
  for (const rowKey in dataObj) {
    const rowData = dataObj[rowKey];

    html += `
      <tr>
        ${columns
          .map(field => `<td>${formatValue(rowData[field])}</td>`)
          .join("")}
      </tr>
    `;
  }

  html += "</tbody></table>";
  return html;
}

/**
 * Format cell values
 */
function formatValue(val) {
  if (val === undefined || val === null) return "—";
  return val;
}

/**
 * Create card with auto table
 */
function createCard(title, data) {
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <h2>${title}</h2>
    <div class="table-container">
      ${jsonToTableAuto(data)}
    </div>
  `;

  return card;
}

/**
 * Load carousel
 */
export async function loadCarousel() {
  const carousel = document.getElementById("jsonCarousel");

  if (!carousel) {
    console.error("❌ Missing #jsonCarousel element");
    return;
  }

  const allTables = await loadAllTables();

  for (const tableName in allTables) {
    const card = createCard(tableName, allTables[tableName]);
    carousel.appendChild(card);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadCarousel();
});
