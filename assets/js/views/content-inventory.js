/* ── Content Inventory View Module ───────────────────────── */
import { loadCarousel, formatDateDDMMMYYYY, renderCellHTML } from "../loadCarousel.js";
import { initScrollReveal } from "../utils.js";
import { rtdb } from "../../../firebase/firebase.js";
import { ref, update } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

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
    tab === "digital" ? "digitalSection" : tab === "static" ? "staticSection" : "activitySection"
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

// ── Admin edit mode: more_vert menu → Edit → draggable rows ────
// Only cards created with editInfo+isAdmin (loadCarousel.js) render a
// .ci-actions-col at all, so these handlers only ever touch rows backed by a
// real d_/s_ RTDB table.
let dragRow = null;

function toggleEditMode(card) {
  if (!card) return;
  const isOn = card.classList.toggle("ci-edit-mode");
  card.querySelectorAll(".json-table tbody tr").forEach(tr => { tr.draggable = isOn; });
}

function renumberSN(card) {
  card.querySelectorAll(".json-table tbody tr").forEach((tr, i) => {
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
  tr.classList.add("ci-row-editing");
  tr.draggable = false; // don't let this edit gesture double as a row drag

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
  tr.draggable = tr.closest(".card")?.classList.contains("ci-edit-mode") ?? false;
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
  if (actionsTd) actionsTd.innerHTML = `<button type="button" class="ci-row-edit-btn" aria-label="Edit row"><span class="material-symbols-outlined">edit</span></button>`;

  tr.classList.remove("ci-row-editing");
  tr.draggable = card.classList.contains("ci-edit-mode");
  flashRowSuccess(tr);
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
    saveRowEdit(tr, tr?.closest(".card"));
    return;
  }

  const cancelBtn = e.target.closest(".ci-row-cancel-btn");
  if (cancelBtn) {
    cancelRowEdit(cancelBtn.closest("tr"));
    return;
  }
}

function onDocClickCloseRowMenu(e) {
  if (!rowMenuEl) return;
  if (rowMenuEl.contains(e.target) || e.target.closest(".ci-more-btn")) return;
  closeRowMenu();
}

function onCiDragStart(e) {
  const tr = e.target.closest("tr");
  if (!tr || !tr.draggable) return;
  dragRow = tr;
  tr.classList.add("ci-dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onCiDragOver(e) {
  if (!dragRow) return;
  const tr = e.target.closest("tbody tr");
  if (!tr || tr === dragRow || tr.parentElement !== dragRow.parentElement) return;
  e.preventDefault();
  const rect = tr.getBoundingClientRect();
  const before = (e.clientY - rect.top) < rect.height / 2;
  tr.parentElement.insertBefore(dragRow, before ? tr : tr.nextSibling);
  // Renumber live as the row moves, not just once on drop.
  renumberSN(tr.closest(".card"));
}

function onCiDrop(e) {
  if (!dragRow) return;
  e.preventDefault();
  const row  = dragRow;
  const card = row.closest(".card");
  row.classList.remove("ci-dragging");
  dragRow = null;
  renumberSN(card);
  // Don't write yet — the dropped row's icon becomes a checkmark the admin
  // has to click to actually persist the new order (confirmRowOrderSave).
  markRowOrderPending(row);
}

function onCiDragEnd() {
  dragRow?.classList.remove("ci-dragging");
  dragRow = null;
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

  // ── Admin edit mode: more_vert menu + drag/drop (delegated) ───
  const ciPage = document.querySelector(".ci-page");
  ciPage?.addEventListener("click", onCiClick);
  ciPage?.addEventListener("dragstart", onCiDragStart);
  ciPage?.addEventListener("dragover", onCiDragOver);
  ciPage?.addEventListener("drop", onCiDrop);
  ciPage?.addEventListener("dragend", onCiDragEnd);
  document.addEventListener("click", onDocClickCloseRowMenu);

  _cleanupFns = [
    () => document.removeEventListener("click", closeDropdown),
    () => appContent?.removeEventListener("scroll", onScroll),
    () => ciPage?.removeEventListener("click", onCiClick),
    () => ciPage?.removeEventListener("dragstart", onCiDragStart),
    () => ciPage?.removeEventListener("dragover", onCiDragOver),
    () => ciPage?.removeEventListener("drop", onCiDrop),
    () => ciPage?.removeEventListener("dragend", onCiDragEnd),
    () => document.removeEventListener("click", onDocClickCloseRowMenu),
    () => { rowMenuEl?.remove(); rowMenuEl = null; },
  ];

}

export function cleanup() {
  _cleanupFns.forEach(fn => fn());
  _cleanupFns = [];
}
