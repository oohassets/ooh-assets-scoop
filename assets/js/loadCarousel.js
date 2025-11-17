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
function jsonToTable(obj) {
  if (typeof obj !== "object" || obj === null) return "<p>No data</p>";

  let rows = "";
  for (const key in obj) {
    rows += `
      <tr>
        <td>${key}</td>
        <td>${formatValue(obj[key])}</td>
      </tr>
    `;
  }

  return `
    <table class="json-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Format table cell values
 */
function formatValue(val) {
  if (typeof val === "object") {
    return `<pre>${JSON.stringify(val, null, 2)}</pre>`;
  }
  return val;
}

/**
 * Create card with table inside
 */
function createCard(title, data) {
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <h2>${title}</h2>
    <div class="table-container">
      ${jsonToTable(data)}
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
