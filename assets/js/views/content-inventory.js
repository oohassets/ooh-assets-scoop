/* ── Content Inventory View Module ───────────────────────── */
import { loadCarousel } from "../loadCarousel.js";

export async function init() {
  await loadCarousel();
}

export function cleanup() {}
