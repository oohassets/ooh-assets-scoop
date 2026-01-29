// Firebase Imports
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* ===============================
   Load all top-level nodes
================================ */
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

/* ===============================
   Format date as dd-mmm-yyyy
================================ */
function formatDateDDMMMYYYY(value) {
  if (!value) return "—";

  value = value.trim();
  const parts = value.split("/").map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return "—";

  let [month, day, year] = parts;
  month = month.padStart(2, "0");
  day = day.padStart(2, "0");

  if (!year) year = new Date().getFullYear();
  else if (/^\d{2}$/.test(year)) year = "20" + year;

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mIndex = parseInt(month, 10) - 1;
  if (mIndex < 0 || mIndex > 11) return "—";

  return `${day}-${monthNames[mIndex]}-${year}`;
}

/* ===============================
   JSON → HTML table
================================ */
function jsonToTableAuto(dataObj, columns, highlightColumns = []) {
  if (!dataObj || Object.keys(dataObj).length === 0) return "<p>No data</p>";

  const today = new Date();
  today.setHours(0,0,0,0);

  let html = `
    <table class="json-table">
      <thead>
        <tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr>
      </thead>
      <tbody>
  `;

  for (const k in dataObj) {
    const row = dataObj[k];
    html += `<tr>`;

    columns.forEach(col => {
      let value = row[col] ?? "—";
      let cls = "";

      const match = value.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
      if (match) {
        const d = +match[1];
        const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(match[2]);
        const y = +match[3];
        const date = new Date(y, m, d);
        date.setHours(0,0,0,0);

        const diff = (date - today) / 86400000;

        if (diff === 0) cls = "date-today";
        else if (diff === 1) cls = "date-tomorrow";
        else if (diff > 1 && diff <= 7) cls = "date-week";
        else if (diff < 0) cls = "date-less-than-today";
      }

      html += `<td class="${cls}">${value}</td>`;
    });

    html += `</tr>`;
  }

  html += "</tbody></table>";
  return html;
}

/* ===============================
   Create Card
================================ */
function createCard(title, data, columns, highlightCols = []) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h2>${title}</h2>
    <div class="table-container">
      ${jsonToTableAuto(data, columns, highlightCols)}
    </div>
  `;
  return card;
}

/* ===============================
   Campaign Published / Removed Today
================================ */
function publishCampaignToday(allTables) {
  const container = document.getElementById("carouselPublishToday");
  if (!container) return;
  container.replaceChildren();

  const logs = allTables["Campaign_Logs"];
  if (!logs) return;

  const today = new Date();
  today.setHours(0,0,0,0);

  const published = new Map();
  const removed = new Map();

  Object.values(logs).forEach(r => {
    if (!r?.Date || !r?.Type) return;

    const d = formatDateDDMMMYYYY(r.Date);
    if (d === "—") return;

    const [dd, mmm, yy] = d.split("-");
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(mmm);
    const date = new Date(yy, m, dd);
    date.setHours(0,0,0,0);

    if (date.getTime() !== today.getTime()) return;

    const key = `${r.Client}|${r.Location}`;
    const rec = { Client: r.Client ?? "—", Location: r.Location ?? "—" };

    if (r.Type === "Add") published.set(key, rec);
    if (r.Type === "Removed") removed.set(key, rec);
  });

  if (published.size) {
    container.appendChild(
      createCard(
        "Campaign Published Today",
        Object.fromEntries([...published.values()].map((v,i)=>[i,v])),
        ["Client","Location"]
      )
    );
  }

  if (removed.size) {
    container.appendChild(
      createCard(
        "Campaign Removed Today",
        Object.fromEntries([...removed.values()].map((v,i)=>[i,v])),
        ["Client","Location"]
      )
    );
  }
}

/* ===============================
   Ending within 3 days (formatted)
================================ */
function isEndingWithin3DaysFromFormatted(formatted) {
  if (!formatted || formatted === "—") return false;

  const [d, mmm, y] = formatted.split("-");
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(mmm);
  if (m < 0) return false;

  const end = new Date(y, m, d);
  end.setHours(0,0,0,0);

  const today = new Date();
  today.setHours(0,0,0,0);

  const diff = (end - today) / 86400000;
  return diff >= 0 && diff <= 3;
}

/* ===============================
   Load Carousel
================================ */
export async function loadCarousel() {
  const digitalCarousel  = document.getElementById("carouselDigital");
  const staticCarousel   = document.getElementById("carouselStatic");
  const upcomingCarousel = document.getElementById("carouselUpcoming");

  const allTables = await loadAllTables();

  publishCampaignToday(allTables);

  /* ========= DIGITAL & STATIC (UNCHANGED) ========= */
  for (const tableName in allTables) {
    const data = allTables[tableName];
    if (!data) continue;

    let columns, target, highlightCols = [];

    if (tableName.startsWith("d_")) {
      columns = ["SN","Client","Start Date","End Date"];
      target = digitalCarousel;
      highlightCols = ["End Date"];
    } else if (tableName.startsWith("s_")) {
      columns = ["Circuit","Client","Start Date","End Date"];
      target = staticCarousel;
      highlightCols = ["End Date"];
    } else continue;

    const rows = Object.values(data);
    rows.forEach(r => {
      columns.forEach(c => {
        if (c.toLowerCase().includes("date")) {
          r[c] = r[c] ? formatDateDDMMMYYYY(r[c]) : "—";
        }
      });
    });

    target.appendChild(
      createCard(
        tableName.replace(/^d_|^s_/,"").replace(/_/g," "),
        Object.fromEntries(rows.map((r,i)=>[i,r])),
        columns,
        highlightCols
      )
    );
  }

  /* ========= UPCOMING (UNCHANGED) ========= */
  upcomingCarousel.innerHTML = "";
  const upcomingRows = [];

  for (const t in allTables) {
    if (!t.startsWith("Upcoming_")) continue;
    Object.values(allTables[t]).forEach(r => {
      if (!r["Start Date"]) return;
      upcomingRows.push({
        Client: r.Client ?? "—",
        Location: r.Location ?? "—",
        Circuit: r.Circuit ?? "—",
        "Start Date": formatDateDDMMMYYYY(r["Start Date"])
      });
    });
  }

  if (upcomingRows.length) {
    upcomingCarousel.appendChild(
      createCard(
        "Upcoming Campaigns",
        Object.fromEntries(upcomingRows.map((r,i)=>[i,r])),
        ["Client","Location","Circuit","Start Date"],
        ["Start Date"]
      )
    );
  }

  /* ========= 🔴 ENDING CAMPAIGNS (NEW, SAFE ADDITION) ========= */
  const endingRows = [];

  for (const t in allTables) {
    if (!t.startsWith("d_") && !t.startsWith("s_")) continue;

    Object.values(allTables[t]).forEach(r => {
      if (!r["End Date"]) return;

      const formatted = formatDateDDMMMYYYY(r["End Date"]);
      if (!isEndingWithin3DaysFromFormatted(formatted)) return;

      endingRows.push({
        Client: r.Client ?? "—",
        Location: r.Location ?? "—",
        Circuit: r.Circuit ?? r.SN ?? "—",
        "End Date": formatted
      });
    });
  }

  if (endingRows.length) {
    upcomingCarousel.appendChild(
      createCard(
        "Ending Campaigns",
        Object.fromEntries(endingRows.map((r,i)=>[i,r])),
        ["Client","Location","Circuit","End Date"],
        ["End Date"]
      )
    );
  }
}

/* ===============================
   Init
================================ */
document.addEventListener("DOMContentLoaded", loadCarousel);
