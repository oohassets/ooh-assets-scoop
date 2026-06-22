/* ── Content Inventory View Module ───────────────────────── */
import { loadCarousel } from "../loadCarousel.js";

export async function init() {
  await loadCarousel();

  document.querySelectorAll(".circuit-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".circuit-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("digitalSection").style.display = tab === "digital" ? "block" : "none";
      document.getElementById("staticSection").style.display  = tab === "static"  ? "block" : "none";
    });
  });
}

export function cleanup() {}
