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
function jsonToTableAuto(dataObj, columns) {
  if (!dataObj) return "<p>No data</p>";

  let html = `
    <table class="json-table">
      <thead>
        <tr>
          ${columns.map(col => `<th>${col}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
  `;

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
function createCard(title, data, columns) {
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <h2>${title}</h2>
    <div class="table-container">
      ${jsonToTableAuto(data, columns)}
    </div>
  `;

  return card;
}


/**
 * Load carousel
 */

export async function loadCarousel() {
  const carouselDigital = document.getElementById("carouselDigital");
  const carouselStatic = document.getElementById("carouselStatic");

  const allTables = await loadAllTables();

  for (const tableName in allTables) {
    const data = allTables[tableName];

    // Clean title
    const cleanTitle = tableName
      .replace(/^d_/, "")
      .replace(/^s_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    // ----- DIGITAL TABLES -----
    if (tableName.startsWith("d_")) {
      const columnsDigital = ["SN", "Client", "Start Date", "End Date"];

      const card = createCard(cleanTitle, data, columnsDigital);
      carouselDigital.appendChild(card);
      continue;
    }

    // ----- STATIC TABLES -----
    if (tableName.startsWith("s_")) {
      const columnsStatic = ["Circuit", "Client", "Start Date", "End Date"];

      const card = createCard(cleanTitle, data, columnsStatic);
      carouselStatic.appendChild(card);
      continue;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadCarousel();
});



