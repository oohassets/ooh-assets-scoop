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

async function downloadAsPDF() {
  const btn = document.getElementById("ciDownloadBtn");
  if (btn) btn.classList.add("loading");
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    const { jsPDF } = window.jspdf;

    const section = activeSection();
    if (!section) return;

    const M   = 15;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // ── Header ────────────────────────────────────────────
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(79, 70, 229);
    doc.text("SCOOP OOH", M, M + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20, 20, 50);
    doc.text("Content Inventory", M, M + 14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110, 120, 150);
    doc.text(activeTabLabel(), M, M + 21);

    // ── Extract card data as text rows ────────────────────
    // Each card: h2 = circuit/slot title; td.key/sibling = field/value pairs;
    // or plain table rows if no .key cells.
    const tableRows = [];
    let lastTitle = "";

    section.querySelectorAll(".card").forEach(card => {
      const title = card.querySelector("h2")?.textContent.trim() || "";

      const keyTds = card.querySelectorAll("td.key");
      if (keyTds.length) {
        keyTds.forEach(kTd => {
          const field = kTd.textContent.trim();
          const value = kTd.nextElementSibling?.textContent.trim() || "";
          // Show title only on first row of each card
          tableRows.push([title !== lastTitle ? title : "", field, value]);
          lastTitle = title;
        });
      } else {
        // Generic: read all non-empty table rows
        card.querySelectorAll("tr").forEach(tr => {
          const cells = Array.from(tr.querySelectorAll("td, th")).map(c => c.textContent.trim());
          const nonempty = cells.filter(Boolean);
          if (!nonempty.length) return;
          const [field = "", ...rest] = nonempty;
          tableRows.push([title !== lastTitle ? title : "", field, rest.join("  ·  ")]);
          lastTitle = title;
        });
      }
    });

    // ── Table ─────────────────────────────────────────────
    doc.autoTable({
      startY: M + 27,
      head: [["Circuit / Slot", "Field", "Value"]],
      body: tableRows,
      styles: {
        font: "helvetica", fontSize: 9,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        overflow: "linebreak", valign: "middle",
      },
      headStyles: {
        fillColor: [79, 70, 229], textColor: 255,
        fontStyle: "bold", fontSize: 9.5,
      },
      alternateRowStyles: { fillColor: [245, 245, 255] },
      columnStyles: {
        0: { cellWidth: 52, fontStyle: "bold", textColor: [20, 20, 50] },
        1: { cellWidth: 38, textColor: [80, 90, 120] },
        2: { cellWidth: "auto" },
      },
      margin: { left: M, right: M },
    });

    doc.save(`SCOOP_OOH_Content_Inventory_${activeTabLabel()}.pdf`);
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

async function downloadAsExcel() {
  const btn = document.getElementById("ciDownloadBtn");
  if (btn) btn.classList.add("loading");
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    const XLSX = window.XLSX;

    // Gather all visible table rows from the active section
    const section = activeSection();
    const rows = [["Circuit / Slot", "Content", "Status", "Start Date", "End Date"]];

    section.querySelectorAll(".card").forEach(card => {
      const title  = card.querySelector("h2")?.textContent.trim() || "";
      const cells  = card.querySelectorAll("td");
      if (cells.length) {
        // Table-style card: read each row
        card.querySelectorAll("tr").forEach(tr => {
          const vals = Array.from(tr.querySelectorAll("td,th")).map(c => c.textContent.trim());
          if (vals.length) rows.push([title, ...vals]);
        });
      } else {
        // Simple card: add title line
        const body = card.querySelector("p,span,.card-body")?.textContent.trim() || "";
        rows.push([title, body]);
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 32 }, { wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTabLabel());
    XLSX.writeFile(wb, `SCOOP_OOH_Content_Inventory_${activeTabLabel()}.xlsx`);
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

  _cleanupFns = [() => document.removeEventListener("click", closeDropdown)];
}

export function cleanup() {
  _cleanupFns.forEach(fn => fn());
  _cleanupFns = [];
}
