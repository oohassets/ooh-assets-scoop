// Firebase Imports
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";


 // Fetch all top-level nodes (tables)

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

// Convert JSON object → HTML table (WITHOUT ROW COLUMN)

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
        ${columns.map(field => `<td>${rowData[field] ?? "—"}</td>`).join("")}
      </tr>
    `;
  }

  html += "</tbody></table>";
  return html;
}


// Format cell values

function formatValue(val) {
  if (val === undefined || val === null) return "—";
  return val;
}

// Create card with auto table

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

// Load carousel

export async function loadCarousel() {
  const digitalCarousel = document.getElementById("carouselDigital");
  const staticCarousel = document.getElementById("carouselStatic");
  const upcomingCarousel = document.getElementById("carouselUpcoming");

  const allTables = await loadAllTables();

  for (const tableName in allTables) {
    const data = allTables[tableName];

    // Clean title
    const cleanTitle = tableName
      .replace(/^d_/, "")
      .replace(/^s_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    let columns;
    let targetCarousel;

    // DIGITAL tables
    if (tableName.startsWith("d_")) {
      columns = ["SN", "Client", "Start Date", "End Date"];
      targetCarousel = digitalCarousel;
    }

    // STATIC tables
    else if (tableName.startsWith("s_")) {
      columns = ["Circuit", "Client", "Start Date", "End Date"];
      targetCarousel = staticCarousel;
    }

    // Upcoming Campaign tables
    else if (tableName.startsWith("Upcoming_")) {

  // Clean readable title
  const displayTitle = cleanTitle;

  // Define columns
  columns = ["Client", "Location", "Circuit", "Start Date"];
  targetCarousel = upcomingCarousel;

  // Convert object → array
  const rows = Object.entries(data);

  // Sort by Start Date
  rows.sort((a, b) => {
    const dateA = new Date(a[1]["Start Date"]);
    const dateB = new Date(b[1]["Start Date"]);
    return dateA - dateB;
  });

  // Convert array → object
  const sortedObj = Object.fromEntries(rows);

  // Create card (3 arguments)
  const card = createCard(displayTitle, sortedObj, columns);
  targetCarousel.appendChild(card);

  continue; // Skip default handling
}

    else {
      continue; // ignore anything else
    }

    const card = createCard(cleanTitle, data, columns);
    targetCarousel.appendChild(card);
  }
}

document.addEventListener("DOMContentLoaded", loadCarousel);
