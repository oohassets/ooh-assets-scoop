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
  if (/^\d{2}$/.test(year)) year = "20" + year;

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mIndex = parseInt(month, 10) - 1;
  if (mIndex < 0 || mIndex > 11) return "—";

  return `${day}-${monthNames[mIndex]}-${year}`;
}

/* ===============================
   JSON → HTML Table (COLORS LIVE HERE)
================================ */
function jsonToTableAuto(dataObj, columns) {
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

  for (const key in dataObj) {
    const row = dataObj[key];
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
   Ending within 3 days (RAW)
================================ */
function isEndingWithin3Days(rawDate) {
  const formatted = formatDateDDMMMYYYY(rawDate);
  if (formatted === "—") return false;

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
   Load All Carousels
================================ */
export async function loadCarousel() {
  const digitalCarousel  = document.getElementById("carouselDigital");
  const staticCarousel   = document.getElementById("carouselStatic");
  const upcomingCarousel = document.getElementById("carouselUpcoming");

  const allTables = await loadAllTables();

  publishCampaignToday(allTables);

  /* ========= DIGITAL & STATIC ========= */
  for (const name in allTables) {
    const data = allTables[name];
    if (!data) continue;

    let cols, target;
    if (name.startsWith("d_")) {
      cols = ["SN","Client","Start Date","End Date"];
      target = digitalCarousel;
    } else if (name.startsWith("s_")) {
      cols = ["Circuit","Client","Start Date","End Date"];
      target = staticCarousel;
    } else continue;

    target.appendChild(
      createCard(
        name.replace(/^d_|^s_/,"").replace(/_/g," "),
        data,
        cols
      )
    );
  }

  /* ========= UPCOMING (Upcoming table only) ========= */
  upcomingCarousel.innerHTML = "";

  if (allTables["Upcoming"]) {
    upcomingCarousel.appendChild(
      createCard(
        "Upcoming Campaigns",
        allTables["Upcoming"],
        ["Client","Location","Circuit","Start Date"]
      )
    );
  }

  /* ========= ENDING CAMPAIGNS (Digital + Static) ========= */
  const ending = [];

  for (const name in allTables) {
    if (!name.startsWith("d_") && !name.startsWith("s_")) continue;

    Object.values(allTables[name]).forEach(r => {
      if (!r["End Date"]) return;
      if (!isEndingWithin3Days(r["End Date"])) return;

      ending.push({
        Client: r.Client ?? "—",
        Location: r.Location ?? "—",
        Circuit: r.Circuit ?? r.SN ?? "—",
        "End Date": formatDateDDMMMYYYY(r["End Date"])
      });
    });
  }

  if (ending.length) {
    upcomingCarousel.appendChild(
      createCard(
        "Ending Campaigns",
        Object.fromEntries(ending.map((r,i)=>[i,r])),
        ["Client","Location","Circuit","End Date"]
      )
    );
  }
}

/* ===============================
   Init
================================ */
document.addEventListener("DOMContentLoaded", loadCarousel);
