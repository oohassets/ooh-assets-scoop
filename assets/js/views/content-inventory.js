/* ── Content Inventory View Module ───────────────────────── */
import { loadCarousel, formatDateDDMMMYYYY, renderCellHTML } from "../loadCarousel.js";
import { initScrollReveal } from "../utils.js";
import { loadRootTables } from "../rtdb-root.js";
import { rtdb } from "../../../firebase/firebase.js";
import { ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// Escapes free-text fields (Client/Circuits/BO — plain RTDB strings)
// before they're interpolated into innerHTML, matching bookings.js's
// escapeHTML() for the same reason (stored XSS via a booking/log field).
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadImageForPDF(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = src;
  });
}


function buildColStyles(columns, tableW) {
  const fixedW = { "SN": 7, "Circuit": 22, "BO": 14, "Start Date": 18, "End Date": 18 };
  let used = 0, autoCols = 0;
  columns.forEach(col => { if (fixedW[col]) used += fixedW[col]; else autoCols++; });
  const autoW = autoCols > 0 ? (tableW - used) / autoCols : 0;
  const styles = {};
  columns.forEach((col, i) => {
    styles[i] = { cellWidth: fixedW[col] || autoW, valign: "middle" };
  });
  return styles;
}

function activeTabLabel() {
  const active = document.querySelector(".circuit-tab.active");
  return active ? active.textContent.trim() : "Content";
}

function activeSection() {
  const active = document.querySelector(".circuit-tab.active");
  const tab = active?.dataset.tab || "digital";
  return document.getElementById(
    tab === "digital" ? "digitalSection" : tab === "static" ? "staticSection" : tab === "logs" ? "logsSection" : "activitySection"
  );
}

// Matches the .bo-filler highlight rule used on-screen (loadCarousel.js) —
// BO cells reading "Free"/"Filler" get called out in red in both exports.
function isFreeOrFiller(v) {
  return /free|filler/i.test(String(v ?? "").trim());
}
const BO_RED = [229, 72, 77]; // matches --error / --accent-rose

function extractCards(container) {
  const cards = [];
  container?.querySelectorAll(".card").forEach(card => {
    const title   = card.querySelector("h2")?.textContent.trim() || "";
    const tbl     = card.querySelector("table");
    if (!tbl) return;
    // .ci-actions-col (more_vert / row edit-status icons) is UI-only — exclude
    // it so exports don't pick up Material Symbols ligature text ("edit", etc.)
    const columns = Array.from(tbl.querySelectorAll("thead th:not(.ci-actions-col)")).map(th => th.textContent.trim());
    const rows    = Array.from(tbl.querySelectorAll("tbody tr")).map(tr =>
      Array.from(tr.querySelectorAll("td:not(.ci-actions-col)")).map(td => td.textContent.trim())
    ).filter(r => r.some(Boolean));
    if (columns.length) cards.push({ title, columns, rows });
  });
  return cards;
}

/** Cards for the active tab, grouped the same way the PDF lays them out:
 *  TPI then Gewan (each internally in DOM order) for Digital, plain DOM
 *  order for Static/Activity. */
function getOrderedCardGroups(section) {
  const tab = document.querySelector(".circuit-tab.active")?.dataset.tab || "digital";
  if (tab === "digital") {
    return [
      extractCards(document.getElementById("carouselTPI")),
      extractCards(document.getElementById("carouselGewan")),
    ].filter(g => g.length);
  }
  return [extractCards(section)];
}

async function downloadAsPDF() {
  const btn = document.getElementById("ciDownloadBtn");
  if (btn) btn.classList.add("loading");
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    const { jsPDF } = window.jspdf;

    const section = activeSection();
    if (!section) return;

    const M      = 5;
    const GAP    = 3;
    const doc    = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const AVAIL_W = PAGE_W - M * 2;
    const CARD_W  = (AVAIL_W - GAP) / 2;

    // ── Logo ─────────────────────────────────────────────
    let logoData = null;
    try { logoData = await loadImageForPDF("images/scooplogo.png"); } catch (_) {}
    const LOGO_H = 10;
    const logoW  = logoData ? (LOGO_H * logoData.w) / logoData.h : 0;

    // ── Header ────────────────────────────────────────────
    let y = M + 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 50);
    doc.text("SCOOP Media and Communication Co.", M, y + 5);

    if (logoData) {
      doc.addImage(logoData.dataUrl, "PNG", PAGE_W - M - logoW, y, logoW, LOGO_H);
    }
    y += 10;

    const now = new Date();
    const MONTH_NAMES = ["January","February","March","April","May","June",
                         "July","August","September","October","November","December"];
    const dateStr = `Date: ${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 50);
    doc.text("Content Inventory", M, y + 3.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(20, 20, 50);
    doc.text(dateStr, PAGE_W - M - doc.getTextWidth(dateStr), y + 3.5);

    y += 7;

    // ── Shared table style (font 7 to prevent wrapping) ──
    const tblStyles = {
      styles: {
        font: "helvetica", fontSize: 7,
        cellPadding: { top: 1, bottom: 1, left: 1.5, right: 1.5 },
        overflow: "linebreak", valign: "middle",
      },
      headStyles: {
        fillColor: [100, 116, 139], textColor: 255,
        fontStyle: "bold", fontSize: 6.5,
        cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 },
      },
      alternateRowStyles: { fillColor: [245, 245, 255] },
    };

    const TITLE_H    = 4;
    const CARD_GAP_V = 2;
    const GROUP_GAP  = 3;
    const rightX     = M + CARD_W + GAP;

    const drawCardTitle = (title, x, ty) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 50);
      doc.text(title, x, ty);
    };

    // Colors the BO column red for Free/Filler rows; index looked up per
    // card since column order can vary between digital/static tables.
    const boHighlight = (columns) => {
      const boIdx = columns.indexOf("BO");
      if (boIdx === -1) return undefined;
      return (data) => {
        if (data.section !== "body" || data.column.index !== boIdx) return;
        if (isFreeOrFiller(data.cell.raw)) data.cell.styles.textColor = BO_RED;
      };
    };

    const renderCardPair = (left, right, startY) => {
      const tableY = startY + TITLE_H;
      drawCardTitle(left.title, M, startY + 3.2);
      doc.autoTable({
        startY: tableY, tableWidth: CARD_W,
        head: [left.columns], body: left.rows,
        ...tblStyles,
        columnStyles: buildColStyles(left.columns, CARD_W),
        margin: { top: 0, left: M, bottom: 0, right: PAGE_W - M - CARD_W },
        didParseCell: boHighlight(left.columns),
      });
      const leftFinalY = doc.lastAutoTable.finalY;

      let rightFinalY = leftFinalY;
      if (right) {
        drawCardTitle(right.title, rightX, startY + 3.2);
        doc.autoTable({
          startY: tableY, tableWidth: CARD_W,
          head: [right.columns], body: right.rows,
          ...tblStyles,
          columnStyles: buildColStyles(right.columns, CARD_W),
          margin: { top: 0, left: rightX, bottom: 0, right: M },
          didParseCell: boHighlight(right.columns),
        });
        rightFinalY = doc.lastAutoTable.finalY;
      }

      return Math.max(leftFinalY, rightFinalY) + CARD_GAP_V;
    };

    // ── Render based on active tab ────────────────────────
    // TPI group then Gewan group (digital) — keeps Monoprix solo before
    // Gewan starts; plain DOM order for static/activity.
    const groups = getOrderedCardGroups(section);
    groups.forEach((cards, gi) => {
      if (gi > 0 && cards.length) y += GROUP_GAP;
      for (let i = 0; i < cards.length; i += 2) {
        y = renderCardPair(cards[i], cards[i + 1] || null, y);
      }
    });

    doc.save(`SCOOP_OOH_Content_Inventory_${activeTabLabel()}.pdf`);
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

// Excel needs actual per-cell font color for the BO Free/Filler highlight,
// which the plain XLSX (SheetJS) build used elsewhere in this file can't do
// — so this export uses ExcelJS instead, same as bookings.js's calendar export.
async function downloadAsExcel() {
  const btn = document.getElementById("ciDownloadBtn");
  if (btn) btn.classList.add("loading");
  try {
    await loadScript("https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js");
    const ExcelJS = window.ExcelJS;

    const section = activeSection();
    const wb = new ExcelJS.Workbook();
    wb.creator = "SCOOP OOH"; wb.created = new Date();
    const ws = wb.addWorksheet(activeTabLabel());

    const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF64748B" } };
    const RED       = { argb: "FFE5484D" }; // matches --error / --accent-rose

    let maxCols = 1;
    let r = 1;

    // Same grouping/order as the PDF: TPI then Gewan (digital), plain DOM
    // order otherwise — each card becomes a title row + header row + rows.
    getOrderedCardGroups(section).forEach((cards, gi) => {
      if (gi > 0 && cards.length) r++; // gap between TPI and Gewan groups
      cards.forEach(({ title, columns, rows }) => {
        maxCols = Math.max(maxCols, columns.length);

        const titleCell = ws.getCell(r, 1);
        titleCell.value = title;
        titleCell.font  = { bold: true, size: 12, color: { argb: "FF141432" } };
        r++;

        const headRow = ws.getRow(r);
        columns.forEach((col, i) => { headRow.getCell(i + 1).value = col; });
        headRow.eachCell(cell => {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = HEAD_FILL;
        });
        r++;

        const boIdx = columns.indexOf("BO");
        rows.forEach(vals => {
          const row = ws.getRow(r);
          vals.forEach((val, i) => {
            const cell = row.getCell(i + 1);
            cell.value = val;
            if (i === boIdx && isFreeOrFiller(val)) cell.font = { bold: true, color: RED };
          });
          r++;
        });

        r++; // spacer row between cards
      });
    });

    for (let i = 1; i <= maxCols; i++) ws.getColumn(i).width = 22;

    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `SCOOP_OOH_Content_Inventory_${activeTabLabel()}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

// ══════════════════════════════════════════════════════════
// Campaign Logs tab — reads the "Campaign_Logs" RTDB table (the same one
// the digital/static delete/add-row actions below append to).
// ══════════════════════════════════════════════════════════

// "3/15/2025" (RTDB's stored format, same as every other date field in this
// app) → Date. Tolerant of missing/invalid input like the rest of this file.
function parseMDY(str) {
  if (!str) return null;
  const parts = String(str).trim().split("/").map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  const [m, d, y] = parts;
  return new Date(y, m - 1, d);
}

// "YYYY-MM-DD" (native <input type=date> value) → local Date, no UTC shift.
function parseISODateLocal(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

let campaignLogs   = null;  // cached; fetched once, appendCampaignLog() invalidates it
let logsFiltered   = [];
let logsSortField  = null;
let logsSortDir    = "asc";
let logsDrpStart   = null, logsDrpEnd = null;
let logsMonthKeys  = [];
let logsLoaded     = false; // guards the one-time fetch+setup in openLogsTab()
let logsIsAdmin    = false; // set once in openLogsTab(); gates the actions column

async function fetchCampaignLogs() {
  if (campaignLogs) return campaignLogs;
  // loadRootTables() (not a Campaign_Logs-only ref) — loadCarousel.js's own
  // loadAllTables() already reads the whole root for the Digital/Static/
  // Activity tabs, so sharing the same in-flight request here means opening
  // Content Inventory and immediately switching to Campaign Logs doesn't
  // fire two separate full-database reads.
  const snap = await loadRootTables();
  const raw  = snap.exists() ? (snap.val()?.Campaign_Logs || {}) : {};
  // Real RTDB key kept as _key (not just re-indexed 0..N) so admin edits can
  // write back to the exact record — same reason loadCarousel.js does this
  // for the d_/s_ tables.
  const entries = Array.isArray(raw) ? raw.map((r, i) => [String(i), r]) : Object.entries(raw);
  campaignLogs = entries.filter(([, r]) => r).map(([key, r]) => ({
    _key: key,
    Date: r.Date || "",
    Type: r.Type || "",
    BO: r.BO || "—",
    Client: r.Client || "—",
    Circuits: r.Circuits || "—",
    "Start Date": r["Start Date"] || "—",
    "End Date": r["End Date"] || "—",
    _sortDate:  parseMDY(r.Date),
    _sortStart: parseMDY(r["Start Date"]),
    _sortEnd:   parseMDY(r["End Date"]),
  }));
  return campaignLogs;
}

/** Contiguous "YYYY-MM" keys spanning every log's own Date, latest first. */
function buildLogsMonthKeys(rows) {
  const now = new Date();
  let min = new Date(now.getFullYear(), now.getMonth(), 1);
  let max = new Date(now.getFullYear(), now.getMonth(), 1);
  rows.forEach(r => {
    if (!r._sortDate) return;
    const monthStart = new Date(r._sortDate.getFullYear(), r._sortDate.getMonth(), 1);
    if (monthStart < min) min = monthStart;
    if (monthStart > max) max = monthStart;
  });
  const keys = [];
  const cur = new Date(min);
  while (cur <= max) {
    keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys.reverse();
}

function logsMonthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Shared by the date-filter <select> change handler and the initial default
// below — "" clears back to All Time (no range filter applied).
function setLogsMonthRange(key) {
  if (!key) { logsDrpStart = logsDrpEnd = null; return; }
  const [y, m] = key.split("-").map(Number);
  logsDrpStart = new Date(y, m - 1, 1);
  logsDrpEnd   = new Date(y, m, 0);
}

// Defaults to the current month (not "All Time") — Campaign_Logs only grows,
// so opening the tab renders just this month's rows unless the admin
// explicitly widens the filter; see renderLogsTable().
function populateLogsDateSelect(rows) {
  const select = document.getElementById("logsDateFilterSelect");
  if (!select) return;
  logsMonthKeys = buildLogsMonthKeys(rows);
  const curKey = currentMonthKey();
  const defaultKey = logsMonthKeys.includes(curKey) ? curKey : "";
  select.innerHTML =
    `<option value="">All Time</option><option value="range">Select Date Range</option>` +
    logsMonthKeys.map(k => `<option value="${k}">${logsMonthLabel(k)}</option>`).join("");
  select.value = defaultKey;
  setLogsMonthRange(defaultKey);
}

// Renders every row in `rows` — no pagination. Campaign_Logs is append-only
// and only grows, but the date filter defaults to the current month (see
// populateLogsDateSelect()), so a normal render is a small, bounded set;
// "All Time" or a wide custom range is an explicit admin choice to render
// more, not the default cost of opening the tab.
function renderLogsTable(rows) {
  const tbody = document.getElementById("logsTableBody");
  if (!tbody) return;
  const colspan = logsIsAdmin ? 8 : 7;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="ci-logs-loading">No campaign logs found</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const t = (r.Type || "").toLowerCase();
    const typeCls  = t === "add" ? "ci-logs-type-add" : t === "removed" ? "ci-logs-type-removed" : "";
    const typeCell = typeCls
      ? `<span class="${typeCls}">${escapeHTML(r.Type)}</span>`
      : (escapeHTML(r.Type) || "—");
    const actionsCell = logsIsAdmin
      ? `<td class="ci-actions-col"><button type="button" class="ci-row-edit-btn" aria-label="Edit row"><span class="material-symbols-outlined">edit</span></button></td>`
      : "";
    return `<tr data-key="${r._key}">
      <td>${formatDateDDMMMYYYY(r.Date)}</td>
      <td>${typeCell}</td>
      <td>${escapeHTML(r.BO)}</td>
      <td>${escapeHTML(r.Client)}</td>
      <td>${escapeHTML(r.Circuits)}</td>
      <td>${formatDateDDMMMYYYY(r["Start Date"])}</td>
      <td>${formatDateDDMMMYYYY(r["End Date"])}</td>
      ${actionsCell}
    </tr>`;
  }).join("");
}

// ── Admin inline edit for a log row — same pencil/check/x pattern as the
// Digital/Static tables (startRowEdit()/saveRowEdit()/cancelRowEdit()), but
// simpler: a flat log entry has no SN/reorder/drag concept, so the actions
// column here is just always-on edit, gated entirely by logsIsAdmin at
// render time rather than a separate "edit mode" toggle. ──
const LOGS_COLUMNS = ["Date", "Type", "BO", "Client", "Circuits", "Start Date", "End Date"];
const LOGS_DATE_FIELDS = new Set(["Date", "Start Date", "End Date"]);

function startLogRowEdit(tr) {
  if (!tr || tr.classList.contains("ci-row-editing")) return;
  tr.classList.add("ci-row-editing");

  const cells = Array.from(tr.querySelectorAll("td:not(.ci-actions-col)"));
  cells.forEach((td, i) => {
    const field = LOGS_COLUMNS[i];
    td.dataset.original = td.innerHTML;
    const current = td.textContent.trim();

    if (LOGS_DATE_FIELDS.has(field)) {
      td.innerHTML = `<input type="date" class="ci-cell-input" value="${ddmmmyyyyToISO(current)}">`;
    } else if (field === "Type") {
      td.innerHTML = `
        <select class="ci-cell-input">
          <option value="Add"${current === "Add" ? " selected" : ""}>Add</option>
          <option value="Removed"${current === "Removed" ? " selected" : ""}>Removed</option>
        </select>`;
    } else {
      const val = current === "—" ? "" : current;
      td.innerHTML = `<input type="text" class="ci-cell-input" value="${escapeAttr(val)}">`;
    }
  });

  const actionsTd = tr.querySelector("td.ci-actions-col");
  if (actionsTd) {
    actionsTd.dataset.original = actionsTd.innerHTML;
    actionsTd.innerHTML = `
      <button type="button" class="ci-row-save-btn" aria-label="Save row"><span class="material-symbols-outlined">check</span></button>
      <button type="button" class="ci-row-cancel-btn" aria-label="Cancel edit"><span class="material-symbols-outlined">close</span></button>`;
  }
}

function cancelLogRowEdit(tr) {
  if (!tr) return;
  tr.querySelectorAll("td[data-original]").forEach(td => {
    td.innerHTML = td.dataset.original;
    delete td.dataset.original;
  });
  tr.classList.remove("ci-row-editing");
}

async function saveLogRowEdit(tr) {
  if (!tr) return;
  const key = tr.dataset.key;
  if (key === undefined) return;

  const cells = Array.from(tr.querySelectorAll("td:not(.ci-actions-col)"));
  const updates = {};
  const rowData = {};

  cells.forEach((td, i) => {
    const field = LOGS_COLUMNS[i];
    const input = td.querySelector(".ci-cell-input");
    if (!input) { rowData[field] = td.textContent.trim(); return; }
    const val = LOGS_DATE_FIELDS.has(field) ? isoToMDY(input.value) : input.value.trim();
    updates[field] = val;
    rowData[field] = val;
  });

  try {
    await update(ref(rtdb, `Campaign_Logs/${key}`), updates);
  } catch (err) {
    console.error("[ContentInventory] Failed to save log edit:", err);
    cancelLogRowEdit(tr);
    return;
  }

  // Keep the in-memory cache in sync (rather than invalidating it outright —
  // that would empty the table until the next fetch, since applyLogsFilters()
  // reads from campaignLogs).
  const entry = campaignLogs?.find(r => r._key === key);
  if (entry) {
    Object.assign(entry, rowData);
    entry._sortDate  = parseMDY(entry.Date);
    entry._sortStart = parseMDY(entry["Start Date"]);
    entry._sortEnd   = parseMDY(entry["End Date"]);
  }

  cells.forEach((td, i) => {
    const field = LOGS_COLUMNS[i];
    if (field === "Type") {
      const t = (rowData.Type || "").toLowerCase();
      const typeCls = t === "add" ? "ci-logs-type-add" : t === "removed" ? "ci-logs-type-removed" : "";
      td.innerHTML = typeCls ? `<span class="${typeCls}">${escapeHTML(rowData.Type)}</span>` : (escapeHTML(rowData.Type) || "—");
    } else if (LOGS_DATE_FIELDS.has(field)) {
      td.textContent = formatDateDDMMMYYYY(rowData[field]);
    } else {
      td.textContent = rowData[field] || "—";
    }
  });

  const actionsTd = tr.querySelector("td.ci-actions-col");
  if (actionsTd) actionsTd.innerHTML = `<button type="button" class="ci-row-edit-btn" aria-label="Edit row"><span class="material-symbols-outlined">edit</span></button>`;
  tr.classList.remove("ci-row-editing");
  flashRowSuccess(tr);
}

function applyLogsFilters() {
  const search = (document.getElementById("logsSearch")?.value || "").toLowerCase();
  const type   = document.getElementById("logsTypeFilter")?.value || "";
  let f = [...(campaignLogs || [])];
  if (search) f = f.filter(r => [r.Client, r.Circuits, r.BO].join(" ").toLowerCase().includes(search));
  if (type)   f = f.filter(r => (r.Type || "").toLowerCase() === type.toLowerCase());
  if (logsDrpStart && logsDrpEnd) {
    const lo = logsDrpStart < logsDrpEnd ? logsDrpStart : logsDrpEnd;
    const hi = logsDrpStart < logsDrpEnd ? logsDrpEnd   : logsDrpStart;
    f = f.filter(r => r._sortDate && r._sortDate >= lo && r._sortDate <= hi);
  }
  if (logsSortField) applyLogsSortInPlace(f);
  else f.sort((a, b) => (b._sortDate?.getTime() || 0) - (a._sortDate?.getTime() || 0)); // newest first by default
  logsFiltered = f;
  renderLogsTable(f);
}

function applyLogsSortInPlace(f) {
  const dirMul = logsSortDir === "asc" ? 1 : -1;
  const cmpStr = (a, b) => (a || "").localeCompare(b || "", undefined, { sensitivity: "base" });
  switch (logsSortField) {
    case "Date":       f.sort((a, b) => dirMul * ((a._sortDate?.getTime()  || 0) - (b._sortDate?.getTime()  || 0))); break;
    case "Type":       f.sort((a, b) => dirMul * cmpStr(a.Type, b.Type)); break;
    case "BO":         f.sort((a, b) => dirMul * cmpStr(a.BO, b.BO)); break;
    case "Client":     f.sort((a, b) => dirMul * cmpStr(a.Client, b.Client)); break;
    case "Circuits":   f.sort((a, b) => dirMul * cmpStr(a.Circuits, b.Circuits)); break;
    case "Start Date": f.sort((a, b) => dirMul * ((a._sortStart?.getTime() || 0) - (b._sortStart?.getTime() || 0))); break;
    case "End Date":   f.sort((a, b) => dirMul * ((a._sortEnd?.getTime()   || 0) - (b._sortEnd?.getTime()   || 0))); break;
  }
}

function toggleLogsSort(field) {
  if (logsSortField === field) logsSortDir = logsSortDir === "asc" ? "desc" : "asc";
  else { logsSortField = field; logsSortDir = "asc"; }
  updateLogsSortHeaderUI();
  applyLogsFilters();
}

function updateLogsSortHeaderUI() {
  document.querySelectorAll("#logsSection .th-sortable").forEach(th => {
    const isActive = th.dataset.sort === logsSortField;
    th.classList.toggle("sort-active", isActive);
    const icon = th.querySelector(".th-sort-icon");
    if (!icon) return;
    icon.textContent = !isActive ? "unfold_more" : (logsSortDir === "asc" ? "stat_1" : "stat_minus_1");
  });
}

// Same pattern as bookings.js's setupSuggest(): suggestions from the values
// already loaded (Client/Circuits/BO), shown on focus and filtered as you
// type; mousedown (not click) on an item so it fires before the input's blur.
function setupLogsSearchSuggest() {
  const input = document.getElementById("logsSearch");
  const drop  = document.getElementById("logsSearchSuggest");
  if (!input || !drop) return;

  const showMatches = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { drop.classList.remove("open"); return; }
    const pool = new Set();
    (campaignLogs || []).forEach(r => {
      [r.Client, r.Circuits, r.BO].forEach(v => { if (v && v !== "—") pool.add(v); });
    });
    const matches = [...pool].filter(v => v.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { drop.classList.remove("open"); return; }
    drop.innerHTML = matches.map(v => `<div class="ci-search-item" data-val="${escapeHTML(v)}">${escapeHTML(v)}</div>`).join("");
    drop.classList.add("open");
  };

  input.addEventListener("input", () => { showMatches(); applyLogsFilters(); });
  input.addEventListener("focus", showMatches);
  drop.addEventListener("mousedown", e => {
    const item = e.target.closest(".ci-search-item");
    if (!item) return;
    e.preventDefault();
    input.value = item.dataset.val;
    drop.classList.remove("open");
    applyLogsFilters();
  });
  input.addEventListener("blur", () => setTimeout(() => drop.classList.remove("open"), 150));
}

async function downloadLogsAsPDF() {
  const btn = document.getElementById("logsDownloadBtn");
  if (btn) btn.classList.add("loading");
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    const { jsPDF } = window.jspdf;

    const M   = 8;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const PAGE_W = doc.internal.pageSize.getWidth();

    let logoData = null;
    try { logoData = await loadImageForPDF("images/scooplogo.png"); } catch (_) {}
    const LOGO_H = 10;
    const logoW  = logoData ? (LOGO_H * logoData.w) / logoData.h : 0;

    let y = M + 2;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 50);
    doc.text("SCOOP Media and Communication Co.", M, y + 5);
    if (logoData) doc.addImage(logoData.dataUrl, "PNG", PAGE_W - M - logoW, y, logoW, LOGO_H);
    y += 10;

    const now = new Date();
    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const dateStr = `Date: ${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20, 20, 50);
    doc.text("Campaign Logs", M, y + 3.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(dateStr, PAGE_W - M - doc.getTextWidth(dateStr), y + 3.5);
    y += 8;

    const columns = ["Date", "Type", "BO", "Client", "Circuits", "Start Date", "End Date"];
    const rows = logsFiltered.map(r => [
      formatDateDDMMMYYYY(r.Date), r.Type, r.BO, r.Client, r.Circuits,
      formatDateDDMMMYYYY(r["Start Date"]), formatDateDDMMMYYYY(r["End Date"]),
    ]);

    doc.autoTable({
      startY: y, head: [columns], body: rows,
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 245, 255] },
      margin: { left: M, right: M },
      didParseCell: data => {
        if (data.section !== "body" || data.column.index !== 1) return;
        const t = String(data.cell.raw).toLowerCase();
        if (t === "add") data.cell.styles.textColor = [53, 179, 126];
        else if (t === "removed") data.cell.styles.textColor = BO_RED;
      },
    });

    doc.save(`SCOOP_OOH_Campaign_Logs.pdf`);
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

async function downloadLogsAsExcel() {
  const btn = document.getElementById("logsDownloadBtn");
  if (btn) btn.classList.add("loading");
  try {
    await loadScript("https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js");
    const ExcelJS = window.ExcelJS;
    const wb = new ExcelJS.Workbook();
    wb.creator = "SCOOP OOH"; wb.created = new Date();
    const ws = wb.addWorksheet("Campaign Logs");

    const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF64748B" } };
    const columns = ["Date", "Type", "BO", "Client", "Circuits", "Start Date", "End Date"];
    const headRow = ws.getRow(1);
    columns.forEach((c, i) => { headRow.getCell(i + 1).value = c; });
    headRow.eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = HEAD_FILL; });

    logsFiltered.forEach((r, i) => {
      const row = ws.getRow(i + 2);
      const vals = [
        formatDateDDMMMYYYY(r.Date), r.Type, r.BO, r.Client, r.Circuits,
        formatDateDDMMMYYYY(r["Start Date"]), formatDateDDMMMYYYY(r["End Date"]),
      ];
      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        if (ci === 1) cell.font = { bold: true, color: { argb: v === "Add" ? "FF35B37E" : "FFE5484D" } };
      });
    });

    for (let i = 1; i <= columns.length; i++) ws.getColumn(i).width = 20;

    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "SCOOP_OOH_Campaign_Logs.xlsx"; a.click();
    URL.revokeObjectURL(url);
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

async function openLogsTab() {
  if (logsLoaded) return;
  logsLoaded = true;
  logsIsAdmin = window.__currentUser?.rule === "admin";
  const actionsTh = document.getElementById("logsActionsTh");
  if (actionsTh) actionsTh.style.display = logsIsAdmin ? "" : "none";
  const rows = await fetchCampaignLogs();
  populateLogsDateSelect(rows);
  setupLogsSearchSuggest();
  applyLogsFilters();
}

function closeLogsDownloadDropdown() {
  document.getElementById("logsDownloadDropdown")?.classList.remove("open");
  document.getElementById("logsDownloadBtn")?.classList.remove("open");
}

function onLogsClick(e) {
  const sortTh = e.target.closest(".th-sortable");
  if (sortTh) { toggleLogsSort(sortTh.dataset.sort); return; }

  if (e.target.closest("#logsApplyCustomDate")) {
    const f = document.getElementById("logsDateFrom")?.value;
    const t = document.getElementById("logsDateTo")?.value;
    if (f && t) {
      logsDrpStart = parseISODateLocal(f);
      logsDrpEnd   = parseISODateLocal(t);
      applyLogsFilters();
    }
    return;
  }

  const dlBtn = e.target.closest("#logsDownloadBtn");
  if (dlBtn) {
    const willOpen = !document.getElementById("logsDownloadDropdown")?.classList.contains("open");
    document.getElementById("logsDownloadDropdown")?.classList.toggle("open", willOpen);
    dlBtn.classList.toggle("open", willOpen);
    return;
  }
  if (e.target.closest("#logsDownloadPDF"))    { closeLogsDownloadDropdown(); downloadLogsAsPDF();   return; }
  if (e.target.closest("#logsDownloadExcel"))  { closeLogsDownloadDropdown(); downloadLogsAsExcel(); return; }

  const editBtn = e.target.closest(".ci-row-edit-btn");
  if (editBtn) { startLogRowEdit(editBtn.closest("tr")); return; }

  const saveBtn = e.target.closest(".ci-row-save-btn");
  if (saveBtn) { saveLogRowEdit(saveBtn.closest("tr")); return; }

  const cancelBtn = e.target.closest(".ci-row-cancel-btn");
  if (cancelBtn) { cancelLogRowEdit(cancelBtn.closest("tr")); return; }
}

function onLogsChange(e) {
  if (e.target.id === "logsDateFilterSelect") {
    const val = e.target.value;
    const rangeInputs = document.getElementById("logsDateRangeInputs");
    if (val === "range") {
      if (rangeInputs) rangeInputs.hidden = false;
      logsDrpStart = logsDrpEnd = null;
    } else {
      if (rangeInputs) rangeInputs.hidden = true;
      setLogsMonthRange(val); // "" clears back to All Time
    }
    applyLogsFilters();
    return;
  }
  if (e.target.id === "logsTypeFilter") applyLogsFilters();
}

function onDocClickCloseLogsDownload(e) {
  const btn = document.getElementById("logsDownloadBtn");
  const dropdown = document.getElementById("logsDownloadDropdown");
  if (!btn?.contains(e.target) && !dropdown?.contains(e.target)) closeLogsDownloadDropdown();
}

// ── Admin edit mode: more_vert menu → Edit → draggable rows ────
// Only cards created with editInfo+isAdmin (loadCarousel.js) render a
// .ci-actions-col at all, so these handlers only ever touch rows backed by a
// real d_/s_ RTDB table.
function toggleEditMode(card) {
  card?.classList.toggle("ci-edit-mode");
}

function renumberSN(card) {
  // :not(.ci-add-row) — that row's own "SN" cell holds the green add button,
  // not a number; matching it here would stomp the button with plain text.
  card.querySelectorAll(".json-table tbody tr:not(.ci-add-row)").forEach((tr, i) => {
    const sn = tr.querySelector("td.ci-sn");
    if (sn) sn.textContent = i + 1;
  });
}

async function persistRowOrder(card) {
  const tableName = card.dataset.table;
  if (!tableName) return;
  const rows = Array.from(card.querySelectorAll(".json-table tbody tr"));
  await Promise.all(rows.map((tr, i) => {
    const key = tr.dataset.key;
    if (key === undefined) return null;
    return update(ref(rtdb, `${tableName}/${key}`), { order: i });
  }));
}

// Briefly flashes a row's action icon edit → check (var(--success)) to confirm
// a completed save, then reverts to the edit icon. Used by inline cell edit,
// which already auto-saves — the drag-reorder flow below uses a *pending*
// checkmark instead (a click-to-save prompt, not a "this just saved" flash).
function flashRowSuccess(row) {
  const btn  = row.querySelector(".ci-row-edit-btn");
  const icon = btn?.querySelector(".material-symbols-outlined");
  if (!btn || !icon) return;
  icon.textContent = "check";
  btn.classList.add("ci-row-success");
  setTimeout(() => {
    icon.textContent = "edit";
    btn.classList.remove("ci-row-success");
  }, 1200);
}

// Clears any row in `card` still waiting on a reorder confirmation (in case
// the admin dropped a different row without confirming the previous one).
function clearRowOrderPending(card) {
  card.querySelectorAll(".ci-row-edit-btn.ci-row-pending").forEach(btn => {
    btn.classList.remove("ci-row-pending");
    const icon = btn.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = "edit";
  });
}

// After a drop, the dropped row's action icon becomes a clickable checkmark —
// the reorder isn't written until the admin clicks it (see confirmRowOrderSave).
function markRowOrderPending(row) {
  const card = row.closest(".card");
  if (card) clearRowOrderPending(card);
  const btn  = row.querySelector(".ci-row-edit-btn");
  const icon = btn?.querySelector(".material-symbols-outlined");
  if (!btn || !icon) return;
  icon.textContent = "check";
  btn.classList.add("ci-row-pending");
}

async function confirmRowOrderSave(btn, card) {
  if (!card || btn.disabled) return;
  btn.disabled = true;
  try {
    await persistRowOrder(card);
  } catch (err) {
    console.error("[ContentInventory] Failed to save row order:", err);
  } finally {
    btn.disabled = false;
    btn.classList.remove("ci-row-pending");
    const icon = btn.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = "edit";
  }
}

// ── Inline row editing: Client/BO text, Start/End Date via <input type=date> ──
// Editable columns only — SN (positional) and Circuit (a static asset's own
// identity, not campaign data) are never editable inline.
const EDITABLE_COLUMNS = new Set(["Client", "BO", "Start Date", "End Date"]);
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// A row's normal (non-editing) actions cell contents — shared so every place
// that restores it after edit/save/cancel stays in sync (loadCarousel.js's
// initial render is the other source of this exact markup).
const ROW_ACTIONS_HTML = `<button type="button" class="ci-row-edit-btn" aria-label="Edit row"><span class="material-symbols-outlined">edit</span></button><button type="button" class="ci-row-delete-btn" aria-label="Delete row"><span class="material-symbols-outlined">delete</span></button>`;

function getCardColumns(card) {
  return Array.from(card.querySelectorAll(".json-table thead th:not(.ci-actions-col)")).map(th => th.textContent.trim());
}

// "08-Jul-2026" → "2026-07-08" (what <input type=date> needs); "—"/invalid → ""
function ddmmmyyyyToISO(str) {
  const m = String(str ?? "").trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return "";
  const mIdx = MONTH_ABBR.indexOf(m[2]);
  if (mIdx === -1) return "";
  return `${m[3]}-${String(mIdx + 1).padStart(2, "0")}-${m[1]}`;
}

// "2026-07-08" (from <input type=date>) → "07/08/2026" (RTDB's stored format)
function isoToMDY(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function startRowEdit(tr, card) {
  if (!tr || !card || tr.classList.contains("ci-row-editing")) return;
  tr.classList.add("ci-row-editing"); // also disqualifies the row from isRowDraggable() below

  const columns = getCardColumns(card);
  const cells = Array.from(tr.querySelectorAll("td:not(.ci-actions-col)"));

  cells.forEach((td, i) => {
    const field = columns[i];
    if (!EDITABLE_COLUMNS.has(field)) return;
    td.dataset.original = td.innerHTML;
    const current = td.textContent.trim();

    if (field === "Start Date" || field === "End Date") {
      td.innerHTML = `<input type="date" class="ci-cell-input" value="${ddmmmyyyyToISO(current)}">`;
    } else {
      const val = current === "—" ? "" : current;
      td.innerHTML = `<input type="text" class="ci-cell-input" value="${escapeAttr(val)}">`;
    }
  });

  const actionsTd = tr.querySelector("td.ci-actions-col");
  if (actionsTd) {
    actionsTd.dataset.original = actionsTd.innerHTML;
    actionsTd.innerHTML = `
      <button type="button" class="ci-row-save-btn" aria-label="Save row"><span class="material-symbols-outlined">check</span></button>
      <button type="button" class="ci-row-cancel-btn" aria-label="Cancel edit"><span class="material-symbols-outlined">close</span></button>`;
  }
}

function cancelRowEdit(tr) {
  if (!tr) return;
  tr.querySelectorAll("td[data-original]").forEach(td => {
    td.innerHTML = td.dataset.original;
    delete td.dataset.original;
  });
  tr.classList.remove("ci-row-editing");
}

async function saveRowEdit(tr, card) {
  if (!tr || !card) return;
  const tableName = card.dataset.table;
  const key = tr.dataset.key;
  if (!tableName || key === undefined) return;

  const columns = getCardColumns(card);
  const cells = Array.from(tr.querySelectorAll("td:not(.ci-actions-col)"));
  const updates = {};
  const rowData = {};

  cells.forEach((td, i) => {
    const field = columns[i];
    const input = td.querySelector(".ci-cell-input");
    if (!input) { rowData[field] = td.textContent.trim(); return; }
    if (field === "Start Date" || field === "End Date") {
      const mdy = isoToMDY(input.value);
      updates[field] = mdy;
      rowData[field] = mdy ? formatDateDDMMMYYYY(mdy) : "—";
    } else {
      const val = input.value.trim();
      updates[field] = val;
      rowData[field] = val || "—";
    }
  });

  try {
    await update(ref(rtdb, `${tableName}/${key}`), updates);
  } catch (err) {
    console.error("[ContentInventory] Failed to save row edit:", err);
    cancelRowEdit(tr);
    return;
  }

  // Re-render from the saved values so BO-filler / date-highlight styling
  // matches a normal page load instead of being left as plain edited text.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  cells.forEach((td, i) => {
    const field = columns[i];
    if (!EDITABLE_COLUMNS.has(field)) return;
    td.outerHTML = renderCellHTML(field, rowData, ["End Date"], today);
  });

  const actionsTd = tr.querySelector("td.ci-actions-col");
  if (actionsTd) actionsTd.innerHTML = ROW_ACTIONS_HTML;

  tr.classList.remove("ci-row-editing");
  flashRowSuccess(tr);
}

// ── Delete row (digital: fully removes the record; static: clears the slot
// back to empty/"Available", it's a fixed physical circuit, not deleted) ──
function cleanCircuitName(tableName) {
  return tableName.replace(/^d_|^s_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

async function appendCampaignLog(entry) {
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
  const snap = await get(ref(rtdb, "Campaign_Logs"));
  const existing = snap.exists() ? snap.val() : {};
  const keys = Array.isArray(existing)
    ? existing.map((_, i) => i)
    : Object.keys(existing).map(Number).filter(n => !Number.isNaN(n));
  const nextKey = keys.length ? Math.max(...keys) + 1 : 0;
  await set(ref(rtdb, `Campaign_Logs/${nextKey}`), { Date: dateStr, ...entry });
  campaignLogs = null; // invalidate the Logs tab's cache so it re-fetches next time it's opened
}

async function deleteInventoryRow(tr, card) {
  if (!tr || !card) return;
  const tableName = card.dataset.table;
  const key = tr.dataset.key;
  if (!tableName || key === undefined) return;

  const isStatic = tableName.startsWith("s_");
  const columns  = getCardColumns(card);
  const cells    = Array.from(tr.querySelectorAll("td:not(.ci-actions-col)"));
  const rowData  = {};
  cells.forEach((td, i) => { rowData[columns[i]] = td.textContent.trim(); });

  const client = rowData["Client"];
  if (!client || client === "—") return; // nothing booked here (e.g. an already-cleared static slot)

  if (!confirm(`Remove this campaign?\n\n${client}`)) return;

  const circuitLabel = cleanCircuitName(tableName) + (isStatic && rowData["Circuit"] ? ` ${rowData["Circuit"]}` : "");

  try {
    await appendCampaignLog({
      Type: "Removed",
      BO: rowData["BO"] && rowData["BO"] !== "—" ? rowData["BO"] : "—",
      Client: client,
      Circuits: circuitLabel,
      "Start Date": rowData["Start Date"] || "—",
      "End Date": rowData["End Date"] || "—",
    });

    if (isStatic) {
      await update(ref(rtdb, `${tableName}/${key}`), { Client: null, BO: null, "Start Date": null, "End Date": null });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      cells.forEach((td, i) => {
        const field = columns[i];
        if (field === "Circuit") return;
        td.outerHTML = renderCellHTML(field, {}, ["End Date"], today);
      });
    } else {
      await remove(ref(rtdb, `${tableName}/${key}`));
      tr.remove();
      renumberSN(card);
    }
  } catch (err) {
    console.error("[ContentInventory] Failed to delete row:", err);
  }
}

// ── Add row (digital tables only — static rows are fixed physical slots) ──
function startAddRow(addRowTr, card) {
  if (!addRowTr || !card) return;
  const columns = getCardColumns(card);
  const snCell = addRowTr.querySelector("td.ci-sn");
  const dataCells = Array.from(addRowTr.querySelectorAll("td")).slice(1, -1); // between SN and actions

  const nextSN = card.querySelectorAll(".json-table tbody tr:not(.ci-add-row)").length + 1;
  if (snCell) snCell.textContent = nextSN;

  dataCells.forEach((td, i) => {
    const field = columns[i + 1]; // columns[0] is "SN"
    if (field === "Start Date" || field === "End Date") {
      td.innerHTML = `<input type="date" class="ci-cell-input">`;
    } else {
      td.innerHTML = `<input type="text" class="ci-cell-input" placeholder="${escapeAttr(field)}">`;
    }
  });

  const actionsTd = addRowTr.querySelector("td.ci-actions-col");
  if (actionsTd) {
    actionsTd.innerHTML = `
      <button type="button" class="ci-row-save-btn" aria-label="Save row"><span class="material-symbols-outlined">check</span></button>
      <button type="button" class="ci-row-cancel-btn" aria-label="Cancel add"><span class="material-symbols-outlined">close</span></button>`;
  }
  addRowTr.classList.add("ci-row-adding");
}

function cancelAddRow(addRowTr) {
  if (!addRowTr) return;
  const snCell = addRowTr.querySelector("td.ci-sn");
  if (snCell) snCell.innerHTML = `<button type="button" class="ci-row-add-btn" aria-label="Add row"><span class="material-symbols-outlined">add</span></button>`;
  Array.from(addRowTr.querySelectorAll("td")).slice(1, -1).forEach(td => { td.innerHTML = ""; });
  const actionsTd = addRowTr.querySelector("td.ci-actions-col");
  if (actionsTd) actionsTd.innerHTML = "";
  addRowTr.classList.remove("ci-row-adding");
}

async function saveAddRow(addRowTr, card) {
  if (!addRowTr || !card) return;
  const tableName = card.dataset.table;
  if (!tableName) return;

  const columns = getCardColumns(card);
  const dataCells = Array.from(addRowTr.querySelectorAll("td")).slice(1, -1);
  const record = {};
  let client = "";

  dataCells.forEach((td, i) => {
    const field = columns[i + 1];
    const input = td.querySelector(".ci-cell-input");
    if (!input) return;
    record[field] = field === "Start Date" || field === "End Date" ? isoToMDY(input.value) : input.value.trim();
    if (field === "Client") client = record[field];
  });

  if (!client) { alert("Client is required."); return; }

  let nextKey;
  try {
    const snap = await get(ref(rtdb, tableName));
    const existing = snap.exists() ? snap.val() : {};
    const keys = Array.isArray(existing)
      ? existing.map((_, i) => i)
      : Object.keys(existing).map(Number).filter(n => !Number.isNaN(n));
    nextKey = keys.length ? Math.max(...keys) + 1 : 0;

    await set(ref(rtdb, `${tableName}/${nextKey}`), record);
    await appendCampaignLog({
      Type: "Add",
      BO: record["BO"] || "—",
      Client: client,
      Circuits: cleanCircuitName(tableName),
      "Start Date": record["Start Date"] || "—",
      "End Date": record["End Date"] || "—",
    });
  } catch (err) {
    console.error("[ContentInventory] Failed to add row:", err);
    return;
  }

  // Insert the now-saved row (rendered exactly like a normal page load)
  // above the add-row affordance, then reset that affordance for next time.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let rowHTML = `<tr data-key="${nextKey}"><td class="ci-sn">${addRowTr.querySelector("td.ci-sn").textContent}</td>`;
  columns.slice(1).forEach(field => { rowHTML += renderCellHTML(field, record, ["End Date"], today); });
  rowHTML += `<td class="ci-actions-col">${ROW_ACTIONS_HTML}</td></tr>`;
  addRowTr.insertAdjacentHTML("beforebegin", rowHTML);
  cancelAddRow(addRowTr);
}

// ── more_vert row-actions menu (single shared panel, fixed-positioned) ──
let rowMenuEl   = null;
let rowMenuCard = null;

function ensureRowMenu() {
  if (rowMenuEl) return rowMenuEl;
  rowMenuEl = document.createElement("div");
  rowMenuEl.className = "ci-row-menu";
  rowMenuEl.innerHTML = `<button type="button" class="ci-row-menu-edit"><span class="material-symbols-outlined">edit</span><span class="ci-row-menu-label">Edit</span></button>`;
  rowMenuEl.querySelector(".ci-row-menu-edit").addEventListener("click", () => {
    if (rowMenuCard) toggleEditMode(rowMenuCard);
    closeRowMenu();
  });
  document.body.appendChild(rowMenuEl);
  return rowMenuEl;
}

function openRowMenu(btn, card) {
  const menu = ensureRowMenu();
  rowMenuCard = card;
  menu.querySelector(".ci-row-menu-label").textContent = card.classList.contains("ci-edit-mode") ? "Done" : "Edit";
  const rect = btn.getBoundingClientRect();
  menu.style.top  = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 150)}px`;
  menu.classList.add("open");
  btn.classList.add("open");
}

function closeRowMenu() {
  rowMenuEl?.classList.remove("open");
  document.querySelectorAll(".ci-more-btn.open").forEach(b => b.classList.remove("open"));
  rowMenuCard = null;
}

function onCiClick(e) {
  const moreBtn = e.target.closest(".ci-more-btn");
  if (moreBtn) {
    const alreadyOpen = moreBtn.classList.contains("open");
    closeRowMenu();
    if (!alreadyOpen) openRowMenu(moreBtn, moreBtn.closest(".card"));
    return;
  }

  const editBtn = e.target.closest(".ci-row-edit-btn");
  if (editBtn) {
    const tr   = editBtn.closest("tr");
    const card = tr?.closest(".card");
    if (editBtn.classList.contains("ci-row-pending")) {
      confirmRowOrderSave(editBtn, card);
    } else {
      startRowEdit(tr, card);
    }
    return;
  }

  const saveBtn = e.target.closest(".ci-row-save-btn");
  if (saveBtn) {
    const tr = saveBtn.closest("tr");
    if (tr?.classList.contains("ci-add-row")) saveAddRow(tr, tr.closest(".card"));
    else saveRowEdit(tr, tr?.closest(".card"));
    return;
  }

  const cancelBtn = e.target.closest(".ci-row-cancel-btn");
  if (cancelBtn) {
    const tr = cancelBtn.closest("tr");
    if (tr?.classList.contains("ci-add-row")) cancelAddRow(tr);
    else cancelRowEdit(tr);
    return;
  }

  const deleteBtn = e.target.closest(".ci-row-delete-btn");
  if (deleteBtn) {
    const tr = deleteBtn.closest("tr");
    deleteInventoryRow(tr, tr?.closest(".card"));
    return;
  }

  const addBtn = e.target.closest(".ci-row-add-btn");
  if (addBtn) {
    const tr = addBtn.closest("tr.ci-add-row");
    startAddRow(tr, tr?.closest(".card"));
    return;
  }
}

function onDocClickCloseRowMenu(e) {
  if (!rowMenuEl) return;
  if (rowMenuEl.contains(e.target) || e.target.closest(".ci-more-btn")) return;
  closeRowMenu();
}

// ── Row reordering via Pointer Events ──────────────────
// Native HTML5 Drag-and-Drop (draggable/dragstart/dragover/drop) has no
// touch support on iOS Safari and is unreliable on Android — Pointer Events
// unify mouse/touch/stylus in one code path and work on all of them.
//
// A drag only "engages" once movement crosses DRAG_THRESHOLD; a plain
// tap/click on a row (pointerdown+pointerup with no real movement) never
// engages, so it falls through to the normal click handling below instead of
// being treated as a (no-op) reorder.
let dragCandidate = null; // { tr, pointerId, startX, startY } — below threshold
let dragRow = null;       // set once the drag has actually engaged
const DRAG_THRESHOLD = 8; // px

function isRowDraggable(tr) {
  return !!tr.closest(".card")?.classList.contains("ci-edit-mode")
    && !tr.classList.contains("ci-row-editing")
    && !tr.classList.contains("ci-add-row");
}

function releasePointerCaptureSafe(el, pointerId) {
  try { el.releasePointerCapture(pointerId); } catch (_) { /* already released/never captured */ }
}

function onCiPointerDown(e) {
  if (e.pointerType === "mouse" && e.button !== 0) return; // left-click/primary touch only
  if (e.target.closest(".ci-actions-col")) return; // keep row buttons tappable, not drag origins
  const tr = e.target.closest(".json-table tbody tr");
  if (!tr || !isRowDraggable(tr)) return;
  dragCandidate = { tr, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
}

function engageDrag(candidate) {
  dragRow = candidate.tr;
  dragRow.classList.add("ci-dragging");
  try { dragRow.setPointerCapture(candidate.pointerId); } catch (_) { /* best-effort */ }
}

function onCiPointerMove(e) {
  if (dragCandidate && !dragRow) {
    if (dragCandidate.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragCandidate.startX;
    const dy = e.clientY - dragCandidate.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    engageDrag(dragCandidate);
  }
  if (!dragRow) return;
  e.preventDefault();
  // Capture means e.target stays pinned to dragRow — hit-test by coordinate instead.
  // :not(.ci-add-row) — that placeholder must always stay last; it's not a
  // real row to reorder against.
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const tr = target?.closest("tbody tr:not(.ci-add-row)");
  if (!tr || tr === dragRow || tr.parentElement !== dragRow.parentElement) return;
  const rect = tr.getBoundingClientRect();
  const before = (e.clientY - rect.top) < rect.height / 2;
  tr.parentElement.insertBefore(dragRow, before ? tr : tr.nextSibling);
  // Renumber live as the row moves, not just once on release.
  renumberSN(tr.closest(".card"));
}

function endDrag(e) {
  dragCandidate = null;
  if (!dragRow) return null;
  const row = dragRow;
  dragRow = null;
  releasePointerCaptureSafe(row, e.pointerId);
  row.classList.remove("ci-dragging");
  return row;
}

function onCiPointerUp(e) {
  const row = endDrag(e);
  if (!row) return; // never engaged as a drag — plain tap, nothing to do
  renumberSN(row.closest(".card"));
  // Don't write yet — the dropped row's icon becomes a checkmark the admin
  // has to click to actually persist the new order (confirmRowOrderSave).
  markRowOrderPending(row);
}

function onCiPointerCancel(e) {
  endDrag(e);
}

let _cleanupFns = [];

export async function init() {
  await loadCarousel();
  initScrollReveal();

  // ── Tab switcher ───────────────────────────────────────
  document.querySelectorAll(".circuit-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".circuit-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("digitalSection").style.display  = tab === "digital"  ? "block" : "none";
      document.getElementById("staticSection").style.display   = tab === "static"   ? "block" : "none";
      document.getElementById("activitySection").style.display = tab === "activity" ? "block" : "none";
      // #logsSection is display:flex (see content-inventory.css) so its own
      // toolbar/table flex-column sizing (and the "page can't scroll, only
      // the table does" height-lock) actually takes effect.
      document.getElementById("logsSection").style.display     = tab === "logs"     ? "flex"  : "none";

      // Logs has its own dedicated download button (PDF/Excel of the log
      // rows) — the top-bar one exports Digital/Static/Activity cards and
      // doesn't apply here.
      const digitalDownloadWrap = document.getElementById("ciDigitalDownloadWrap");
      if (digitalDownloadWrap) digitalDownloadWrap.style.display = tab === "logs" ? "none" : "";

      if (tab === "logs") openLogsTab();

      // Sections start hidden (display:none), so their .reveal children have a
      // zero-size rect when initScrollReveal() first runs and never satisfy the
      // "already in view" check — they'd otherwise sit at opacity:0 until a
      // scroll happens to cross the observer's mid-viewport band. Tab switches
      // are a deliberate action, not a scroll, so force-reveal immediately.
      activeSection()?.querySelectorAll(".reveal").forEach(el => el.classList.add("visible"));
    });
  });

  // ── Download dropdown toggle ───────────────────────────
  const ciBtn      = document.getElementById("ciDownloadBtn");
  const ciDropdown = document.getElementById("ciDownloadDropdown");

  const toggleDropdown = () => {
    const isOpen = ciDropdown.classList.toggle("open");
    ciBtn.classList.toggle("open", isOpen);
  };
  const closeDropdown = (e) => {
    if (!ciBtn?.contains(e.target) && !ciDropdown?.contains(e.target)) {
      ciDropdown?.classList.remove("open");
      ciBtn?.classList.remove("open");
    }
  };

  ciBtn?.addEventListener("click", toggleDropdown);
  document.addEventListener("click", closeDropdown);

  document.getElementById("ciDownloadPDF")?.addEventListener("click", () => {
    ciDropdown.classList.remove("open"); ciBtn.classList.remove("open");
    downloadAsPDF();
  });
  document.getElementById("ciDownloadExcel")?.addEventListener("click", () => {
    ciDropdown.classList.remove("open"); ciBtn.classList.remove("open");
    downloadAsExcel();
  });

  // ── Sticky header background on scroll ────────────────
  const appContent   = document.getElementById("app-content");
  const stickyHeader = document.querySelector(".ci-sticky-header");

  const onScroll = () => {
    stickyHeader?.classList.toggle("ci-scrolled", appContent.scrollTop > 10);
  };

  appContent?.addEventListener("scroll", onScroll, { passive: true });

  // ── Admin edit mode: more_vert menu + pointer-based drag reorder ───
  const ciPage = document.querySelector(".ci-page");
  ciPage?.addEventListener("click", onCiClick);
  ciPage?.addEventListener("pointerdown", onCiPointerDown);
  ciPage?.addEventListener("pointermove", onCiPointerMove);
  ciPage?.addEventListener("pointerup", onCiPointerUp);
  ciPage?.addEventListener("pointercancel", onCiPointerCancel);
  document.addEventListener("click", onDocClickCloseRowMenu);

  // ── Campaign Logs tab (search/sort/filter/download — delegated) ───
  const logsSection = document.getElementById("logsSection");
  logsSection?.addEventListener("click", onLogsClick);
  logsSection?.addEventListener("change", onLogsChange);
  document.addEventListener("click", onDocClickCloseLogsDownload);

  _cleanupFns = [
    () => document.removeEventListener("click", closeDropdown),
    () => appContent?.removeEventListener("scroll", onScroll),
    () => ciPage?.removeEventListener("click", onCiClick),
    () => ciPage?.removeEventListener("pointerdown", onCiPointerDown),
    () => ciPage?.removeEventListener("pointermove", onCiPointerMove),
    () => ciPage?.removeEventListener("pointerup", onCiPointerUp),
    () => logsSection?.removeEventListener("click", onLogsClick),
    () => logsSection?.removeEventListener("change", onLogsChange),
    () => document.removeEventListener("click", onDocClickCloseLogsDownload),
    () => ciPage?.removeEventListener("pointercancel", onCiPointerCancel),
    () => document.removeEventListener("click", onDocClickCloseRowMenu),
    () => { rowMenuEl?.remove(); rowMenuEl = null; },
  ];

}

export function cleanup() {
  _cleanupFns.forEach(fn => fn());
  _cleanupFns = [];
}
