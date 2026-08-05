/* Client portal dashboard — My Bookings + Campaign Calendar.
 *
 * Deliberately does NOT read RTDB directly (no `get(ref(rtdb, ...))`
 * anywhere in this file): database.rules.json gives a userClient-listed
 * account a hard root .read:false, so there is nothing here for the
 * Firebase client SDK to read even if someone tried from devtools. All
 * data comes from one call to the getClientPortalData Cloud Function,
 * which uses the Admin SDK server-side to return this client's own
 * bookings in full and every other client's bookings pre-anonymized
 * (Circuits/Slot/dates + a generic "Booked"/"Reserve" label only — no
 * Client/Brand/BO/Person ever leaves the server for those). */
import { auth } from "../../firebase/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const FUNCTION_URL = "https://us-central1-scoopassets.cloudfunctions.net/getClientPortalData";

const loadingEl  = document.getElementById("cpLoadingState");
const errorEl    = document.getElementById("cpErrorState");
const errorMsgEl = document.getElementById("cpErrorMsg");
const contentEl  = document.getElementById("cpContent");
const whoNameEl  = document.getElementById("cpWhoName");

let portalData = null; // { clientName, circuits, myBookings, otherBookings }
let calMonth   = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

// ── Auth guard ──────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "./login.html"; return; }
  whoNameEl.textContent = user.email;
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: "{}",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load portal data");
    portalData = data;
    showContent();
  } catch (err) {
    console.error("[ClientPortal] load failed:", err);
    showError(err.message || "Something went wrong loading your bookings.");
  }
});

function showError(message) {
  loadingEl.style.display = "none";
  contentEl.style.display = "none";
  errorEl.style.display = "block";
  errorMsgEl.textContent = message;
}

function showContent() {
  loadingEl.style.display = "none";
  errorEl.style.display = "none";
  contentEl.style.display = "block";
  whoNameEl.textContent = portalData.contactName
    ? `${portalData.contactName} · ${portalData.clientName}`
    : portalData.clientName || auth.currentUser?.email || "";
  document.title = `${portalData.clientName} — SCOOP Client Portal`;
  renderBookingsTable();
  renderCalendar();
}

document.getElementById("cpSignOutBtn").addEventListener("click", () => {
  signOut(auth).then(() => { window.location.href = "./login.html"; });
});

// ── Tabs ────────────────────────────────────────────────────
const tabBookings = document.getElementById("cpTabBookings");
const tabCalendar = document.getElementById("cpTabCalendar");
const secBookings  = document.getElementById("cpBookingsSection");
const secCalendar  = document.getElementById("cpCalendarSection");

tabBookings.addEventListener("click", () => {
  tabBookings.classList.add("active"); tabCalendar.classList.remove("active");
  secBookings.style.display = "block"; secCalendar.style.display = "none";
});
tabCalendar.addEventListener("click", () => {
  tabCalendar.classList.add("active"); tabBookings.classList.remove("active");
  secCalendar.style.display = "block"; secBookings.style.display = "none";
});

// ── Date helpers (same "MM/DD/YYYY" convention as the internal app) ──
function parseDate(str) {
  if (!str) return null;
  const p = str.split("/").map(Number);
  if (p.length < 3) return null;
  const d = new Date(p[2], p[0] - 1, p[1]);
  d.setHours(0, 0, 0, 0);
  return d;
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtShort(str) {
  const d = parseDate(str);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── My Bookings table ────────────────────────────────────────
function statusClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "live") return "cp-pill-live";
  if (s === "pending") return "cp-pill-pending";
  if (s === "completed") return "cp-pill-completed";
  return "cp-pill-signed"; // BO Signed / anything else
}

function renderBookingsTable() {
  const tbody = document.getElementById("cpBookingsBody");
  const rows = [...portalData.myBookings].sort((a, b) => {
    const da = parseDate(a["Start Date"]) || new Date(0);
    const db = parseDate(b["Start Date"]) || new Date(0);
    return db - da;
  });
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="cp-empty">No bookings yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHTML(r["Brand Campaign"] || "—")}</td>
      <td>${escapeHTML(r.BO || "—")}</td>
      <td>${escapeHTML(r.Circuits || "—")}</td>
      <td>${fmtShort(r["Start Date"])} → ${fmtShort(r["End Date"])}</td>
      <td><span class="cp-pill ${statusClass(r.Status)}">${escapeHTML(r.Status || "—")}</span></td>
    </tr>
  `).join("");
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Campaign calendar ─────────────────────────────────────────
document.getElementById("cpCalPrev").addEventListener("click", () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById("cpCalNext").addEventListener("click", () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  renderCalendar();
});

function renderCalendar() {
  const table = document.getElementById("cpCalTable");
  const monthLabelEl = document.getElementById("cpCalMonthLabel");
  monthLabelEl.textContent = calMonth.toLocaleDateString("en", { month: "long", year: "numeric" });

  const startD = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const endD   = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0);
  const dates  = [];
  for (const cur = new Date(startD); cur <= endD; cur.setDate(cur.getDate() + 1)) dates.push(new Date(cur));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const circuits = portalData.circuits;
  if (!circuits.length) {
    table.innerHTML = `<tr><td style="padding:20px;text-align:center;">No circuits found</td></tr>`;
    return;
  }

  table.innerHTML = "";
  const thead = document.createElement("thead");
  const hrow  = document.createElement("tr");
  hrow.innerHTML = `<th class="cp-cal-circuit-col">Circuit</th><th class="cp-cal-slot-col">Slot</th>`;
  dates.forEach(d => {
    const th = document.createElement("th");
    th.className = d.toDateString() === today.toDateString() ? "cp-cal-today" : "";
    th.dataset.date = toISO(d);
    th.innerHTML = `${d.toLocaleDateString("en", { month: "short" })}<br>${d.getDate()}`;
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  circuits.forEach(circuit => {
    for (let slot = 1; slot <= circuit.slots; slot++) {
      const tr = document.createElement("tr");
      if (slot === 1) {
        const td = document.createElement("td");
        td.className = "cp-cal-circuit-col";
        td.rowSpan = circuit.slots;
        td.textContent = circuit.name;
        tr.appendChild(td);
      }
      const st = document.createElement("td");
      st.className = "cp-cal-slot-col";
      st.textContent = `Slot ${slot}`;
      tr.appendChild(st);
      dates.forEach(d => {
        const td = document.createElement("td");
        td.dataset.date = toISO(d);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  });
  table.appendChild(tbody);

  requestAnimationFrame(() => placeBars(dates, startD, endD));
}

function placeBars(dates, startD, endD) {
  const rows = Array.from(document.querySelectorAll("#cpCalTable tbody tr"));
  const rowFor = (circuitName, slot) => rows.find(row => {
    const cell = row.querySelector(".cp-cal-slot-col");
    if (!cell || parseInt(cell.textContent.replace("Slot", "").trim(), 10) !== slot) return false;
    let circuitCell = row.querySelector(".cp-cal-circuit-col");
    if (!circuitCell) {
      let prev = row.previousElementSibling;
      while (prev && !circuitCell) { circuitCell = prev.querySelector(".cp-cal-circuit-col"); prev = prev.previousElementSibling; }
    }
    if (!circuitCell) return false;
    const rc = circuitCell.textContent.trim().toLowerCase().replace(/[_-]/g, " ");
    const ac = circuitName.trim().toLowerCase().replace(/[_-]/g, " ");
    return rc.includes(ac) || ac.includes(rc);
  });

  const placeOne = (row, start, end, className, label) => {
    if (!row) return;
    const cells = Array.from(row.querySelectorAll("td[data-date]"));
    let si = cells.findIndex(td => td.dataset.date === toISO(start));
    let ei = cells.findIndex(td => td.dataset.date === toISO(end));
    if (si === -1 && start < startD) si = 0;
    if (ei === -1 && end > endD) ei = cells.length - 1;
    if (si === -1 || ei === -1 || si > ei) return;
    const bar = document.createElement("div");
    bar.className = `cp-bar ${className}`;
    bar.textContent = label;
    bar.style.width = `calc(${(ei - si + 1) * 100}% + ${ei - si}px)`;
    cells[si].style.position = "relative";
    cells[si].appendChild(bar);
  };

  portalData.myBookings.forEach(b => {
    const start = parseDate(b["Start Date"]); const end = parseDate(b["End Date"]);
    if (!start || !end) return;
    const row = rowFor(b.Circuits || "", Number(b.Slot || 1));
    const s = (b.Status || "").toLowerCase();
    const cls = s === "live" ? "cp-bar-mine-live" : s === "pending" ? "cp-bar-mine-pending" : s === "completed" ? "cp-bar-mine-completed" : "cp-bar-mine-signed";
    placeOne(row, start, end, cls, b["Brand Campaign"] || b.Client || "Booked");
  });

  portalData.otherBookings.forEach(b => {
    const start = parseDate(b["Start Date"]); const end = parseDate(b["End Date"]);
    if (!start || !end) return;
    const row = rowFor(b.Circuits || "", Number(b.Slot || 1));
    placeOne(row, start, end, "cp-bar-other", b.label);
  });
}
