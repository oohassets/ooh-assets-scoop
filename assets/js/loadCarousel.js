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

// ===============================
// FIX DATE — auto-detect missing year
// ===============================
function fixDate(value) {
  if (!value) return null;

  value = value.trim();
  const parts = value.split("/").map(x => x.trim()).filter(x => x !== "");

  if (parts.length < 2) return null;

  let [month, day] = parts;
  month = month.padStart(2, "0");
  day   = day.padStart(2, "0");

  let year = parts.length === 3 ? parts[2] : new Date().getFullYear().toString();
  if (!/^\d{4}$/.test(year)) return null;

  return new Date(`${year}-${month}-${day}`);
}

// ===============================
// Load Carousel (main function)
// ===============================
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

    // ==========================
    // DIGITAL
    // ==========================
    if (tableName.startsWith("d_")) {
      columns = ["SN", "Client", "Start Date", "End Date"];
      targetCarousel = digitalCarousel;
    }

    // ==========================
    // STATIC
    // ==========================
    else if (tableName.startsWith("s_")) {
      columns = ["Circuit", "Client", "Start Date", "End Date"];
      targetCarousel = staticCarousel;
    }

    // ==========================
    // UPCOMING CAMPAIGNS (SORTED)
    // ==========================
    else if (tableName.startsWith("Upcoming_")) {
      const displayTitle = cleanTitle;
      columns = ["Client", "Location", "Circuit", "Start Date"];
      targetCarousel = upcomingCarousel;

      // Convert object → array
      const rows = Object.entries(data);

      // Sort dates: oldest → newest
      rows.sort((a, b) => {
        const dateA = fixDate(a[1]["Start Date"]);
        const dateB = fixDate(b[1]["Start Date"]);

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        return dateA - dateB;
      });

      // Convert back to object
      const sortedObj = Object.fromEntries(rows);

      // Create & append card
      const card = createCard(displayTitle, sortedObj, columns);
      targetCarousel.appendChild(card);

      continue; // Skip default processing
    }

    // Ignore unknown nodes
    else {
      continue;
    }

    // ==========================
    // DEFAULT CARD CREATION
    // ==========================
    const card = createCard(cleanTitle, data, columns);
    targetCarousel.appendChild(card);
  }
}

// Auto-run
document.addEventListener("DOMContentLoaded", loadCarousel);
