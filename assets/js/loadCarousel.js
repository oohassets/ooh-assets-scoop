// Firebase Imports
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// ===============================
// Load all top-level nodes
// ===============================
async function loadAllTables() {
  try {
    const snap = await get(ref(rtdb, "/"));
    return snap.exists() ? snap.val() : {};
  } catch (e) {
    console.error("❌ DB Load Error", e);
    return {};
  }
}

// ===============================
// Format date → dd-mmm-yyyy
// ===============================
function formatDateDDMMMYYYY(value) {
  if (!value) return "—";

  const parts = value.trim().split("/").map(p => p.trim());
  if (parts.length < 2) return "—";

  let [mm, dd, yy] = parts;
  mm = mm.padStart(2, "0");
  dd = dd.padStart(2, "0");

  if (!yy) yy = new Date().getFullYear();
  else if (/^\d{2}$/.test(yy)) yy = "20" + yy;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mi = parseInt(mm, 10) - 1;
  if (mi < 0 || mi > 11) return "—";

  return `${dd}-${months[mi]}-${yy}`;
}

// ===============================
// Date check: ending within 3 days
// ===============================
function isEndingWithin3Days(formatted) {
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

// ===============================
// Table Renderer
// ===============================
function jsonToTableAuto(dataObj, columns) {
  if (!dataObj || !Object.keys(dataObj).length) return "<p>No data</p>";

  return `
    <table class="json-table">
      <thead>
        <tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${Object.values(dataObj).map(r => `
          <tr>
            ${columns.map(c => `<td>${r[c] ?? "—"}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
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
// Load Carousel
// ===============================
export async function loadCarousel() {
  const upcomingCarousel = document.getElementById("carouselUpcoming");
  upcomingCarousel.innerHTML = "";

  const allTables = await loadAllTables();

  // ===============================
  // UPCOMING CAMPAIGNS (Upcoming tables ONLY)
  // ===============================
  const upcomingRows = [];

  for (const name in allTables) {
    if (!name.startsWith("Upcoming_")) continue;

    Object.values(allTables[name]).forEach(r => {
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
        ["Client","Location","Circuit","Start Date"]
      )
    );
  }

  // ===============================
  // ENDING CAMPAIGNS (Digital + Static ONLY)
  // ===============================
  const endingRows = [];

  for (const name in allTables) {
    if (!name.startsWith("d_") && !name.startsWith("s_")) continue;

    Object.values(allTables[name]).forEach(r => {
      if (!r["End Date"]) return;

      const end = formatDateDDMMMYYYY(r["End Date"]);
      if (!isEndingWithin3Days(end)) return;

      endingRows.push({
        Client: r.Client ?? "—",
        Location: r.Location ?? "—",
        Circuit: r.Circuit ?? "—",
        "End Date": end
      });
    });
  }

  if (endingRows.length) {
    upcomingCarousel.appendChild(
      createCard(
        "Ending Campaign",
        Object.fromEntries(endingRows.map((r,i)=>[i,r])),
        ["Client","Location","Circuit","End Date"]
      )
    );
  }
}

document.addEventListener("DOMContentLoaded", loadCarousel);
