/* ── Content Inventory View Module ───────────────────────── */
import { loadCarousel } from "../loadCarousel.js";

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
    const columns = Array.from(tbl.querySelectorAll("thead th")).map(th => th.textContent.trim());
    const rows    = Array.from(tbl.querySelectorAll("tbody tr")).map(tr =>
      Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim())
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

let _cleanupFns = [];

export async function init() {
  await loadCarousel();

  // ── Tab switcher ───────────────────────────────────────
  document.querySelectorAll(".circuit-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".circuit-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("digitalSection").style.display  = tab === "digital"  ? "block" : "none";
      document.getElementById("staticSection").style.display   = tab === "static"   ? "block" : "none";
      document.getElementById("activitySection").style.display = tab === "activity" ? "block" : "none";
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

  _cleanupFns = [
    () => document.removeEventListener("click", closeDropdown),
    () => appContent?.removeEventListener("scroll", onScroll),
  ];

}

export function cleanup() {
  _cleanupFns.forEach(fn => fn());
  _cleanupFns = [];
}
