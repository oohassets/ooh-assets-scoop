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
 * Convert JSON object → HTML table
 */
/**
 * Convert database table -> HTML table automatically
 */
function jsonToTableAuto(dataObj) {
  if (!dataObj) return "<p>No data</p>";

  let html = `
    <table class="json-table">
      <thead>
        <tr>
          <th>Row</th>
          <th>Field</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Loop each row (row1, row2, row3...)
  for (const rowKey in dataObj) {
    const rowData = dataObj[rowKey];

    // If object → loop fields
    for (const field in rowData) {
      html += `
        <tr>
          <td>${rowKey}</td>
          <td>${field}</td>
          <td>${formatValue(rowData[field])}</td>
        </tr>
      `;
    }

    // Separator between rows
    html += `
      <tr class="separator">
        <td colspan="3"></td>
      </tr>
    `;
  }

  html += "</tbody></table>";
  return html;
}

/**
 * Format nested objects nicely
 */
function formatValue(val) {
  if (typeof val === "object") {
    return `<pre>${JSON.stringify(val, null, 2)}</pre>`;
  }
  return val;
}

/**
 * Create card with auto-table
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

  // Create card for each table
  for (const tableName in allTables) {
    const card = createCard(tableName, allTables[tableName]);
    carousel.appendChild(card);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadCarousel();
});
