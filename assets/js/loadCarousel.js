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
// Convert JSON → HTML table
// ===============================
function jsonToTableAuto(dataObj, columns, highlightColumns = []) {
  if (!dataObj || Object.keys(dataObj).length === 0) return "<p>No data</p>";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = `<table class="json-table"><thead><tr>${columns.map(col => `<th>${col}</th>`).join("")}</tr></thead><tbody>`;

  for (const rowKey in dataObj) {
    const row = dataObj[rowKey] || {};
    html += `<tr>`;

    columns.forEach(field => {
      let cellValue = row[field] ?? "—";
      let className = "";

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

      if (field === "Start Date" && numericDate && numericDate.getTime() === today.getTime()) {
        className = "date-today";
      }

      if (highlightColumns.includes(field) && !className && numericDate) {
        const diff = (numericDate - today) / 86400000;
        if (diff === 0) className = "date-today";
        else if (diff === 1) className = "date-tomorrow";
        else if (diff > 1 && diff <= 7) className = "date-week";
        else if (diff < 0) className = "date-less-than-today";
      }

      if (field === "BO" && /free|filler/i.test(String(cellValue))) {
        html += `<td><span class="bo-filler">${cellValue}</span></td>`;
      } else if (className) {
        html += `<td><span class="${className}">${cellValue}</span></td>`;
      } else {
        html += `<td>${cellValue}</td>`;
      }
    });

    html += `</tr>`;
  }

  html += "</tbody></table>";
  return html;
}

// ── Mobile helpers ──────────────────────
function parseDDMMMYYYY(str) {
  if (!str || str === "—") return null;
  const m = str.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return new Date(parseInt(m[3]), months.indexOf(m[2]), parseInt(m[1]));
}

function fmtMobileDate(str) {
  if (!str || str === "—") return "—";
  const m = str.match(/^(\d{2})-([A-Za-z]{3})-\d{4}$/);
  return m ? `${parseInt(m[1])} ${m[2]}` : str;
}

// Returns the date highlight class for a given date string.
// isHighlight=false → only "date-today" (mirrors Start Date logic in table)
// isHighlight=true  → full range (mirrors highlightColumns / End Date logic)
function getDateClass(dateStr, isHighlight) {
  const d = parseDDMMMYYYY(dateStr); if (!d) return "";
  const today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
  const diff = (d - today) / 86400000;
  if (!isHighlight) return diff === 0 ? "date-today" : "";
  if (diff === 0)           return "date-today";
  if (diff === 1)           return "date-tomorrow";
  if (diff > 1 && diff <= 7) return "date-week";
  if (diff < 0)             return "date-less-than-today";
  return "";
}

// ===============================
function createCard(title, data, columns, highlightColumns = []) {
  const card = document.createElement("div");
  card.className = "card";

  // Build mobile slot-list for cards that have Client + date range
  const hasDates  = columns.includes("Start Date") && columns.includes("End Date");
  const hasClient = columns.includes("Client");
  const snKey     = columns.includes("SN") ? "SN" : columns.includes("Circuit") ? "Circuit" : null;

  let mobileHtml = "";
  if (hasDates && hasClient) {
    const rows = Object.values(data);
    const isStaticCard = snKey === "Circuit";
    const items = rows.map(row => {
      const sn        = snKey ? (row[snKey] ?? "—") : "";
      const client    = row["Client"] ?? "—";
      const start     = row["Start Date"] ?? "—";
      const end       = row["End Date"]   ?? "—";
      const noDate    = !start || start === "—";

      // Static circuit with no booking → show "Available"
      if (isStaticCard && noDate) {
        return `
          <div class="ml-row">
            <span class="ml-sn">${sn}</span>
            <div class="ml-body">
              <div class="ml-client ml-available">Available</div>
            </div>
          </div>`;
      }

      const bo        = row["BO"] ?? "";
      const boFiller  = bo && /free|filler/i.test(bo);
      const startCls  = getDateClass(start, false);
      const endCls    = getDateClass(end,   true);
      return `
        <div class="ml-row">
          ${snKey ? `<span class="ml-sn">${sn}</span>` : ""}
          <div class="ml-body">
            <div class="ml-client">${client}</div>
            <div class="ml-dates">
              ${bo && bo !== "—" ? `<div class="ml-bo${boFiller ? " bo-filler" : ""}">${bo}</div>` : ""}
              <span class="ml-date ${startCls}">${fmtMobileDate(start)}</span>
              <span class="ml-arrow">→</span>
              <span class="ml-date ${endCls}">${fmtMobileDate(end)}</span>
            </div>
          </div>
        </div>`;
    }).join("");

    mobileHtml = `
      <div class="mobile-list">
        <div class="ml-header">
          ${snKey ? `<span>${snKey}</span>` : ""}
          <span>Client</span>
        </div>
        ${items}
      </div>`;
  }

  card.innerHTML = `
    <h2>${title}</h2>
    <div class="table-container desk-view">
      ${jsonToTableAuto(data, columns, highlightColumns)}
    </div>
    ${mobileHtml ? `<div class="mob-view">${mobileHtml}</div>` : ""}
  `;
  return card;
}

// ===============================
function appendActivityMsg(container, text, cardClass) {
  const card = document.createElement("div");
  card.className = `card ${cardClass}`;
  const p = document.createElement("p");
  p.className = "no-data-message";
  p.textContent = text;
  card.appendChild(p);
  container.appendChild(card);
}

// ===============================
function isEndingWithin3Days(formattedDate) {
    if (!formattedDate || formattedDate === "—") return false;

    const match = formattedDate.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) return false;

    const d = parseInt(match[1]);
    const mmm = match[2];
    const y = parseInt(match[3]);

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m = months.indexOf(mmm);

    const endDate = new Date(y, m, d);
    endDate.setHours(0,0,0,0);

    const today = new Date();
    today.setHours(0,0,0,0);

    const diff = (endDate - today) / 86400000;
    return diff >= 0 && diff <= 3;
}

function publishCampaignToday(allTables) {
    const todayCarousel = document.getElementById("carouselPublishToday");
    if (!todayCarousel) return;

    todayCarousel.replaceChildren();

    const logs = allTables["Campaign_Logs"];
    if (!logs) {
      appendActivityMsg(todayCarousel, "No Campaign Published Today", "published-card");
      appendActivityMsg(todayCarousel, "No Campaign Removed Today",   "removed-card");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = Array.isArray(logs) ? logs : Object.values(logs);
    const publishedSet = new Map();
    const removedSet   = new Map();

    rows.forEach(row => {
      if (!row?.Date || !row?.Type) return;

      const formattedLogDate = formatDateDDMMMYYYY(row.Date);
      if (formattedLogDate === "—") return;

      const [d, mmm, y] = formattedLogDate.split("-");
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const logDate = new Date(y, months.indexOf(mmm), d);
      logDate.setHours(0, 0, 0, 0);
      if (logDate.getTime() !== today.getTime()) return;

      const client   = row.Client   ?? "—";
      const circuits = row.Circuits ?? "—";
      const key      = `${client}|${circuits}`;
      const record   = { Client: client, Circuits: circuits };

      const type = (row.Type || "").toLowerCase();
      if (type === "add" || type === "added")       publishedSet.set(key, record);
      if (type === "removed" || type === "remove")  removedSet.set(key, record);
    });

    // Published
    if (publishedSet.size > 0) {
      const sorted = [...publishedSet.values()].sort((a, b) => a.Client.localeCompare(b.Client));
      const card = createCard(
        "Campaign Published Today",
        Object.fromEntries(sorted.map((r, i) => [i, r])),
        ["Client", "Circuits"]
      );
      card.classList.add("published-card");
      todayCarousel.appendChild(card);
    } else {
      appendActivityMsg(todayCarousel, "No Campaign Published Today", "published-card");
    }

    // Removed
    if (removedSet.size > 0) {
      const sorted = [...removedSet.values()].sort((a, b) => a.Client.localeCompare(b.Client));
      const card = createCard(
        "Campaign Removed Today",
        Object.fromEntries(sorted.map((r, i) => [i, r])),
        ["Client", "Circuits"]
      );
      card.classList.add("removed-card");
      todayCarousel.appendChild(card);
    } else {
      appendActivityMsg(todayCarousel, "No Campaign Removed Today", "removed-card");
    }
}

// ===============================
export async function loadCarousel() {
  const tpiCarousel = document.getElementById("carouselTPI");
  const gewanCarousel = document.getElementById("carouselGewan");
  const staticCarousel  = document.getElementById("carouselStatic");
  const upcomingCarousel = document.getElementById("carouselUpcoming");

  const allTables = await loadAllTables();

  publishCampaignToday(allTables);

  const digitalTables = [];
  const staticTables = [];

  for (const tableName in allTables) {
    if (tableName.startsWith("d_")) digitalTables.push(tableName);
    else if (tableName.startsWith("s_")) staticTables.push(tableName);
  }

  // ✅ FIXED POSITION (after digitalTables filled)
  const tpiTables = [];
  const gewanTables = [];

  digitalTables.forEach(name => {
    const cleanName = name.toLowerCase();
    if (cleanName.includes("gewan")) gewanTables.push(name);
    else tpiTables.push(name);
  });

  const renderCard = (tableName, container) => {
    const data = allTables[tableName];
    if (!data) return;

    const columns = ["SN", "Client", "BO", "Start Date", "End Date"];
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

    if (!validRows.length) return;

    container.appendChild(
      createCard(
        tableName.replace(/^d_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        Object.fromEntries(validRows.map((r, i) => [i, r])),
        columns,
        highlightCols
      )
    );
  };

  const getTPIOrder = (name) => {
    name = name.toLowerCase().replace(/_/g, " ");

    if (name.includes("underpass in")) return 1;
    if (name.includes("underpass out")) return 2;

    if (name.includes("mupi") && name.includes("circuit 1")) return 3;
    if (name.includes("mupi") && name.includes("circuit 2")) return 4;

    if (name.includes("udc tower")) return 5;
    if (name.includes("qanat quartier")) return 6;

    if (name.includes("monoprix")) return 7;
    return 999;
  };

  const getGewanOrder = (name) => {
    name = name.replace(/^d_/, "").replace(/_/g, " ").toLowerCase();
    if (name.includes("crystal walk") && name.includes("1")) return 1;
    if (name.includes("crystal walk") && name.includes("2")) return 2;

    if (name.includes("residential") && name.includes("1")) return 3;
    if (name.includes("residential") && name.includes("2")) return 4;
    return 999;
  };

  const getStaticOrder = (name) => {
    // Remove prefix & normalize
    name = name.replace(/^s_/, "").replace(/_/g, " ").toLowerCase();

    // ===== Light Poles =====
    if (name.includes("light poles main entrance")) return 1;
    if (name.includes("light poles main boulevard")) return 2;

    if (name.includes("light poles porto arabia drive")) return 3;
    if (name.includes("light poles medina centrale")) return 4;

    if (name.includes("light poles porto arabia boardwalk")) return 5;
    if (name.includes("light poles viva bahriya boardwalk")) return 6;

    // ===== MUPI =====
    if (name.includes("mupi porto arabia boardwalk")) return 7;

    // ===== Others =====
    if (name.includes("senior medina centrale")) return 8;

    return 999;
  };

  tpiTables.sort((a, b) => getTPIOrder(a) - getTPIOrder(b));
  gewanTables.sort((a, b) => getGewanOrder(a) - getGewanOrder(b));
  staticTables.sort((a, b) => getStaticOrder(a) - getStaticOrder(b));

  // Clear before rendering
  tpiCarousel.innerHTML = "";
  gewanCarousel.innerHTML = "";

  // Render TPI in its own carousel
  tpiTables.forEach(t => renderCard(t, tpiCarousel));

  // Render Gewan in its own carousel
  gewanTables.forEach(t => renderCard(t, gewanCarousel));

  // ===============================
  // STATIC
  // ===============================
  staticCarousel.innerHTML = "";

  staticTables.forEach(tableName => {
    const data = allTables[tableName];
    if (!data) return;

    const columns = ["Circuit", "Client", "BO", "Start Date", "End Date"];
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

      let circuitsName = formattedName;

      if (tableName.startsWith("s_") && r["Circuit"]) {
        circuitsName = `${formattedName} ${r["Circuit"]}`;
      }

      endingRows.push({
        Client: r.Client ?? "—",
        Circuits: circuitsName,
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
        ["Client", "Circuits", "End Date"],
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
        Circuits: row.Circuits ?? "—",
        "Start Date": formatDateDDMMMYYYY(row["Start Date"]),
        "End Date": formatDateDDMMMYYYY(row["End Date"]) ?? "—",
        Status: row.Status ?? "—",  
        Person: row.Person ?? "—" 
      });
    });
  }

  if (upcomingRows.length > 0) {
    upcomingCarousel.appendChild(
      createCard(
        "Upcoming Campaigns",
        Object.fromEntries(upcomingRows.map((r, i) => [i, r])),
        ["Client", "Circuits", "Start Date", "End Date", "Status", "Person"],
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
