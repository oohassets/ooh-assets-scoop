// Firebase Imports
// ===============================
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

  // Year auto-detect
  let year = parts.length === 3 ? parts[2] : new Date().getFullYear();
  if (/^\d{2}$/.test(year)) year = "20" + year;
  if (!/^\d{4}$/.test(year)) year = new Date().getFullYear();

  return `${month}/${day}/${year}`;
}

// ===============================
// Convert JSON → HTML table
// ===============================
function jsonToTableAuto(dataObj, columns) {
  if (!dataObj) return "<p>No data</p>";

  let html = `
    <table class="json-table">
      <thead>
        <tr>${columns.map(col => `<th>${col}</th>`).join("")}</tr>
      </thead>
      <tbody>
  `;

  for (const rowKey in dataObj) {
    const row = dataObj[rowKey];

    html += `
      <tr>
        ${columns.map(field => `<td>${row[field] ?? "—"}</td>`).join("")}
      </tr>
    `;
  }

  html += "</tbody></table>";
  return html;
}

// ===============================
// Create Card
// ===============================
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

// ==========================
// LOAD CAROUSEL (main function)
// ==========================
export async function loadCarousel() {

  const digitalCarousel = document.getElementById("carouselDigital");
  const staticCarousel  = document.getElementById("carouselStatic");
  const upcomingCarousel = document.getElementById("carouselUpcoming");

  const allTables = await loadAllTables();

  for (const tableName in allTables) {
    const data = allTables[tableName];

    // Clean readable title
    const cleanTitle = tableName
      .replace(/^d_/, "")
      .replace(/^s_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    let columns;
    let targetCarousel;

    // DIGITAL
    if (tableName.startsWith("d_")) {
      columns = ["SN", "Client", "Start Date", "End Date"];
      targetCarousel = digitalCarousel;
    }

    // STATIC
    else if (tableName.startsWith("s_")) {
      columns = ["Circuit", "Client", "Start Date", "End Date"];
      targetCarousel = staticCarousel;
    }

    // UPCOMING CAMPAIGNS
    else if (tableName.startsWith("Upcoming_")) {
      columns = ["Client", "Location", "Circuit", "Start Date"];
      targetCarousel = upcomingCarousel;
    }

    // UNKNOWN NODE → SKIP
    else {
      continue;
    }

    // NORMALIZE ALL DATE FIELDS
    const dateColumns = columns.filter(col => col.toLowerCase().includes("date"));
    for (const rowKey in data) {
      const row = data[rowKey];
      dateColumns.forEach(col => {
        if (row[col]) {
          row[col] = formatDateMMDDYYYY(row[col]);
        }
      });
    }

    // CREATE CARD
    const card = createCard(cleanTitle, data, columns);
    targetCarousel.appendChild(card);
  }
}

