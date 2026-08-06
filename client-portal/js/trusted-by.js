import { CLIENTS } from "./scoop-clients.js";

// Same char set/behavior as the internal app's loadCarousel.js/asset-rates.js
// escapeHTML — kept as its own copy here rather than imported, same isolation
// reasoning as the rest of client-portal/ (see portal.css's file header).
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function tileHTML(client, isDuplicate) {
  const alt = isDuplicate ? "" : escapeHTML(client.name);
  return `
    <div class="cp-tb-tile"${isDuplicate ? ' aria-hidden="true"' : ""}>
      <img src="${escapeHTML(client.logo)}" alt="${alt}" width="${client.w}" height="${client.h}" loading="lazy" decoding="async">
    </div>`;
}

function renderRow(groupEl, groupDupEl, clients) {
  groupEl.innerHTML = clients.map(c => tileHTML(c, false)).join("");
  groupDupEl.innerHTML = clients.map(c => tileHTML(c, true)).join("");
}

export function initTrustedBy() {
  const band = document.getElementById("cpTrustedBy");
  if (!band || !CLIENTS.length) return;

  // Split the roster across the two rows rather than repeating all 68 logos
  // in each — keeps the DOM (and each row's own loop width) reasonably sized.
  const mid = Math.ceil(CLIENTS.length / 2);
  const row1 = CLIENTS.slice(0, mid);
  const row2 = CLIENTS.slice(mid);

  renderRow(
    document.getElementById("cpTbGroup1"),
    document.getElementById("cpTbGroup1Dup"),
    row1
  );
  renderRow(
    document.getElementById("cpTbGroup2"),
    document.getElementById("cpTbGroup2Dup"),
    row2
  );
}

initTrustedBy();
