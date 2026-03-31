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
// Format date as dd/mmm/yyyy
// ===============================
function formatDateDDMMMYYYY(value) {
  if (!value) return "—";

  value = value.trim();
  const parts = value.split("/").map(x => x.trim()).filter(x => x !== "");
  if (parts.length < 2) return "—";

  let [month, day, year] = parts;

  month = month.padStart(2, "0");
  day = day.padStart(2, "0");

  if (!year) {
    year = new Date().getFullYear();
  } else {
    if (/^\d{2}$/.test(year)) year = "20" + year;
    if (!/^\d{4}$/.test(year)) year = new Date().getFullYear();
  }

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mIndex = parseInt(month, 10) - 1;
  if (mIndex < 0 || mIndex > 11) return "—";

  return `${day}-${monthNames[mIndex]}-${year}`;
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
      let cellValue = row[field] ?? "—";
      let className = "";

      // Convert to Date for highlighting
      let match = cellValue.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
      let numericDate = null;

      if (match) {
        const d = parseInt(match[1]);
        const mmm = match[2];
        const y = parseInt(match[3]);
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const m = months.indexOf(mmm);
        numericDate = new Date(y, m, d);
        numericDate.setHours(0,0,0,0);
      }

      // ===== Start Date highlight =====
      if (field === "Start Date" && numericDate) {
        if (numericDate.getTime() === today.getTime()) {
          className = "date-today";
        }
      }

      // ===== End Date highlight =====
      if (highlightColumns.includes(field) && className === "" && numericDate) {
        const diff = (numericDate - today) / (1000 * 60 * 60 * 24);

        if (diff === 0) className = "date-today";
        else if (diff === 1) className = "date-tomorrow";
        else if (diff > 1 && diff <= 7) className = "date-week";
        else if (diff < 0) className = "date-less-than-today";
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
// TODAY Campaign Logs Section
// ===============================
function publishCampaignToday(allTables) {
  const todayCarousel = document.getElementById("carouselPublishToday");
  if (!todayCarousel) return;

  todayCarousel.replaceChildren();

  const logs = allTables["Campaign_Logs"];
  if (!logs) {
    showNoData(todayCarousel);
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = Array.isArray(logs) ? logs : Object.values(logs);

  const publishedSet = new Map();
  const removedSet = new Map();

  rows.forEach(row => {
    if (!row?.Date || !row?.Type) return;

    const formattedLogDate = formatDateDDMMMYYYY(row.Date);
    if (formattedLogDate === "—") return;

    const [d, mmm, y] = formattedLogDate.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m = months.indexOf(mmm);

    const logDate = new Date(y, m, d);
    logDate.setHours(0, 0, 0, 0);

    if (logDate.getTime() !== today.getTime()) return;

    const client = row.Client ?? "—";
    const location = row.Location ?? "—";
    const key = `${client}|${location}`;

    const record = { Client: client, Location: location };

    if (row.Type === "Add") publishedSet.set(key, record);
    if (row.Type === "Removed") removedSet.set(key, record);
  });

  let hasData = false;

  // ===== ONE Published Card =====
  if (publishedSet.size > 0) {
    hasData = true;

    const sortedPublished = [...publishedSet.values()]
      .sort((a, b) => a.Client.localeCompare(b.Client));

    const publishedCard = createCard(
      "Campaign Published Today",
      Object.fromEntries(sortedPublished.map((r, i) => [i, r])),
      ["Client", "Location"]
    );

    publishedCard.classList.add("published-card");
    todayCarousel.appendChild(publishedCard);
  }

  // ===== ONE Removed Card =====
  if (removedSet.size > 0) {
    hasData = true;

    const sortedRemoved = [...removedSet.values()]
      .sort((a, b) => a.Client.localeCompare(b.Client));

    const removedCard = createCard(
      "Campaign Removed Today",
      Object.fromEntries(sortedRemoved.map((r, i) => [i, r])),
      ["Client", "Location"]
    );

    removedCard.classList.add("removed-card");
    todayCarousel.appendChild(removedCard);
  }

  if (!hasData) showNoData(todayCarousel);
}

// 🔁 Helper
function showNoData(container) {
  const msg = document.createElement("div");
  msg.textContent = "No Campaign Published and Removed Today";
  msg.classList.add("no-data-message");
  container.appendChild(msg);
}

  // ===============================
  // Check if date is ending within next 3 days
  // Expects format: DD-MMM-YYYY
  // ===============================
  function isEndingWithin3Days(formattedDate) {
    if (!formattedDate || formattedDate === "—") return false;

    const match = formattedDate.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) return false;

    const d = parseInt(match[1], 10);
    const mmm = match[2];
    const y = parseInt(match[3], 10);

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m = months.indexOf(mmm);
    if (m === -1) return false;

    const endDate = new Date(y, m, d);
    endDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diff = (endDate - today) / 86400000;
    return diff >= 0 && diff <= 3;
  }


// ===============================
// Load Carousel
// ===============================
export async function loadCarousel() {
  const digitalCarousel = document.getElementById("carouselDigital");
  const staticCarousel  = document.getElementById("carouselStatic");
  const upcomingCarousel = document.getElementById("carouselUpcoming");

  const allTables = await loadAllTables();

  // Today Campaigns
  publishCampaignToday(allTables);

  // ===============================
  // Separate table names
  // ===============================
  const digitalTables = [];
  const staticTables = [];

  for (const tableName in allTables) {
    if (tableName.startsWith("d_")) digitalTables.push(tableName);
    else if (tableName.startsWith("s_")) staticTables.push(tableName);
  }

  // ===============================
  // Custom Order Logic
  // ===============================
  const getOrder = (name) => {
    name = name.toLowerCase().replace(/_/g, " ");

    if (name.includes("underpass in")) return 1;
    if (name.includes("underpass out")) return 2;

    if (name.includes("mupi") && name.includes("circuit 1")) return 3;
    if (name.includes("mupi") && name.includes("circuit 2")) return 4;

    if (name.includes("udc tower")) return 5;
    if (name.includes("qanat quartier")) return 6;

    if (name.includes("monoprix")) return 7;

    if (name.includes("crystal walk") && name.includes("1")) return 8;
    if (name.includes("crystal walk") && name.includes("2")) return 9;

    if (name.includes("residential") && name.includes("1")) return 10;
    if (name.includes("residential") && name.includes("2")) return 11;

    return 999;
  };

    const getStaticOrder = (name) => {
    name = name.toLowerCase().replace(/_/g, " ");

    // ===== Light Poles =====
    if (name.includes("light poles main entrance")) return 1;
    if (name.includes("light poles main boulevard")) return 2;

    if (name.includes("light poles porto arabia drive")) return 3;
    if (name.includes("light poles medina centrale")) return 4;

    if (name.includes("light poles porto arabia boardwalk")) return 5;
    if (name.includes("light poles viva bahriya boardwalk")) return 6;

    // ===== MUPI =====
    if (name.includes("mupi medina centrale")) return 7;
    if (name.includes("mupi porto arabia boardwalk")) return 8;

    // ===== Others =====
    if (name.includes("arcade porto arabia retail")) return 9;
    if (name.includes("senior medina centrale")) return 10;

    return 999;
  };

  // Apply sorting
  digitalTables.sort((a, b) => getOrder(a) - getOrder(b));
  staticTables.sort((a, b) => getStaticOrder(a) - getStaticOrder(b));

  // ===============================
  // DIGITAL
  // ===============================
  digitalCarousel.innerHTML = "";

  digitalTables.forEach(tableName => {
    const data = allTables[tableName];
    if (!data) return;

    const columns = ["SN", "Client", "Start Date", "End Date"];
    const highlightCols = ["End Date"];

    const rows = Array.isArray(data) ? data : Object.values(data);

    const dateCols = columns.filter(col => col.toLowerCase().includes("date"));

    const validRows = rows.filter(
      row => row && typeof row === "object" && !Array.isArray(row)
    );

    validRows.forEach(row => {
      columns.forEach(col => {
        row[col] = dateCols.includes(col)
          ? (row[col] ? formatDateDDMMMYYYY(row[col]) : "—")
          : (row[col] ?? "—");
      });
    });

    if (validRows.length === 0) return;

    digitalCarousel.appendChild(
      createCard(
        tableName
          .replace(/^d_/, "")
          .replace(/_/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase()),
        Object.fromEntries(validRows.map((r, i) => [i, r])),
        columns,
        highlightCols
      )
    );
  });

  // ===============================
  // STATIC
  // ===============================
  staticCarousel.innerHTML = "";

  staticTables.forEach(tableName => {
    const data = allTables[tableName];
    if (!data) return;

    const columns = ["Circuit", "Client", "Start Date", "End Date"];
    const highlightCols = ["End Date"];

    const rows = Array.isArray(data) ? data : Object.values(data);

    const dateCols = columns.filter(col => col.toLowerCase().includes("date"));

    const validRows = rows.filter(
      row => row && typeof row === "object" && !Array.isArray(row)
    );

    validRows.forEach(row => {
      columns.forEach(col => {
        row[col] = dateCols.includes(col)
          ? (row[col] ? formatDateDDMMMYYYY(row[col]) : "—")
          : (row[col] ?? "—");
      });
    });

    if (validRows.length === 0) return;

    staticCarousel.appendChild(
      createCard(
        tableName
          .replace(/^s_/, "")
          .replace(/_/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase()),
        Object.fromEntries(validRows.map((r, i) => [i, r])),
        columns,
        highlightCols
      )
    );
  });

  // ===============================
  // CLEAR UPCOMING
  // ===============================
  upcomingCarousel.innerHTML = "";

  // ===============================
  // ENDING CAMPAIGNS (Next 3 Days)
  // ===============================
  const endingRows = [];

  for (const tableName in allTables) {
    if (!tableName.startsWith("d_") && !tableName.startsWith("s_")) continue;

    const formattedName = tableName
      .replace(/^d_|^s_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    Object.values(allTables[tableName]).forEach(r => {
      if (!r || !r["End Date"] || r["End Date"] === "-" || r["End Date"] === "—") return;

      const end = r["End Date"];
      if (!isEndingWithin3Days(end)) return;

      let locationName = formattedName;

      if (tableName.startsWith("s_") && r["Circuit"]) {
        locationName = `${formattedName} ${r["Circuit"]}`;
      }

      endingRows.push({
        Client: r.Client ?? "—",
        Location: locationName,
        "End Date": end
      });
    });
  }

  endingRows.sort((a, b) => {
    const parse = d => {
      const [day, mmm, year] = d.split("-");
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return new Date(year, months.indexOf(mmm), day);
    };
    return parse(a["End Date"]) - parse(b["End Date"]);
  });

  if (endingRows.length) {
    upcomingCarousel.appendChild(
      createCard(
        "Ending Campaigns (Next 3 Days)",
        Object.fromEntries(endingRows.map((r, i) => [i, r])),
        ["Client", "Location", "End Date"],
        ["End Date"]
      )
    );
  } else {
    const msg = document.createElement("div");
    msg.textContent = "No Ending Campaigns";
    msg.classList.add("no-data-message");
    upcomingCarousel.appendChild(msg);
  }

  // ===============================
  // UPCOMING CAMPAIGNS
  // ===============================
  const upcomingRows = [];

  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data || !tableName.startsWith("Upcoming_")) continue;

    const rows = Array.isArray(data) ? data : Object.values(data);

    rows.forEach(row => {
      if (!row || !row["Start Date"]) return;

      upcomingRows.push({
        Client: row.Client ?? "—",
        Location: row.Location ?? "—",
        Circuit: row.Circuit ?? "—",
        "Start Date": formatDateDDMMMYYYY(row["Start Date"])
      });
    });
  }

  if (upcomingRows.length > 0) {
    upcomingCarousel.appendChild(
      createCard(
        "Upcoming Campaigns",
        Object.fromEntries(upcomingRows.map((r, i) => [i, r])),
        ["Client", "Location", "Circuit", "Start Date"],
        ["Start Date"]
      )
    );
  } else {
    const msg = document.createElement("div");
    msg.textContent = "No Upcoming Campaigns";
    msg.classList.add("no-data-message");
    upcomingCarousel.appendChild(msg);
  }
}


// ===============================
// DOMContentLoaded
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  // 🔄 Load all inventory content
  loadCarousel();

  // 🔀 Tabs logic (Digital / Static)
  const tabs = document.querySelectorAll(".inventory-tabs .tab");
  const sections = {
    digital: document.getElementById("digital-section"),
    static: document.getElementById("static-section")
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {

      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      Object.values(sections).forEach(sec => {
        if (sec) sec.style.display = "none";
      });

      if (sections[tab.dataset.target]) {
        sections[tab.dataset.target].style.display = "block";
      }
    });
  });
});
