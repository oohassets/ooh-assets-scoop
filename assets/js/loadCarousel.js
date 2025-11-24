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
      let cellValue = row[field] ?? "—"; // default to "—"
      let className = "";

      // Highlight only specified columns
      if (highlightColumns.includes(field) && cellValue !== "—") {
        const parts = cellValue.split("/").map(x => parseInt(x, 10));
        if (parts.length === 3) {
          const cellDate = new Date(parts[2], parts[0]-1, parts[1]);
          const diff = (cellDate - today) / (1000*60*60*24);

          if (diff === 0) className = "date-today";
          else if (diff === 1) className = "date-tomorrow";
          else if (diff > 1 && diff <= 7) className = "date-week";
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
function createCard(title, data, columns, highlightColumns = [], tableType = "") {
  const card = document.createElement("div");
  card.className = "card";

  // EXPAND only for DIGITAL + STATIC
  const expandBtn = 
    tableType === "digital" || tableType === "static"
      ? `<div class="expand-btn" onclick="openFullscreen('${title}')">Expand ></div>`
      : "";

  card.innerHTML = `
    <div class="card-header">
      <h2>${title}</h2>
      ${expandBtn}
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
  const staticCarousel  = document.getElementById("carouselStatic");
  const upcomingCarousel = document.getElementById("carouselUpcoming");

  if (!digitalCarousel || !staticCarousel || !upcomingCarousel) {
    console.error("❌ One or more carousel containers are missing in HTML.");
    return;
  }

  const allTables = await loadAllTables();
  console.log("✅ Loaded tables:", allTables);

  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data) continue;

    const cleanTitle = tableName
      .replace(/^d_/, "")
      .replace(/^s_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    let columns, targetCarousel, highlightCols = [];

    // Digital
    if (tableName.startsWith("d_")) {
      columns = ["SN", "Client", "Start Date", "End Date"];
      targetCarousel = digitalCarousel;
      highlightCols = ["End Date"];
      tableType = "digital";
    }
    // Static
    else if (tableName.startsWith("s_")) {
      columns = ["Circuit", "Client", "Start Date", "End Date"];
      targetCarousel = staticCarousel;
      highlightCols = ["End Date"];
      tableType = "static";
    }
    // Upcoming
    else if (tableName.startsWith("Upcoming_")) {
      columns = ["Client", "Location", "Circuit", "Start Date"];
      targetCarousel = upcomingCarousel;
      highlightCols = ["Start Date"];
      tableType = "upcoming";
    }
    else {
      console.warn("⚠️ Unknown table skipped:", tableName);
      continue;
    }

    // Convert array or object → array
    const rows = Array.isArray(data) ? data : Object.values(data);

    // Normalize all columns (format dates, missing → "-")
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

    // Filter out invalid rows before creating object
    const validRows = rows.filter(row => row && typeof row === "object");

    // Convert array → object for table rendering
    const dataObj = Object.fromEntries(validRows.map((row, index) => [index, row]));

    const card = createCard(cleanTitle, dataObj, columns, highlightCols, tableType);
    targetCarousel.appendChild(card);
  }
}

// Auto-run
document.addEventListener("DOMContentLoaded", loadCarousel);

<script>
function openFullscreen(title) {
  const container = document.getElementById("fullscreenContainer");
  const iframe = document.getElementById("fullscreenIframe");

  // Load your dedicated fullscreen view page
  iframe.src = "/fullscreen/index.html?table=" + encodeURIComponent(title);

  container.style.display = "flex";
}

function closeFullscreen() {
  document.getElementById("fullscreenContainer").style.display = "none";
  document.getElementById("fullscreenIframe").src = "";
}
</script>

