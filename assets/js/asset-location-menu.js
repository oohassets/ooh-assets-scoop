/* ── Renders the Assets Location mega-dropdown (desktop nav) and the
   Assets panel (mobile dock) from the `assetmap` tree in maps.js. ── */
import { getAssetTree } from "./maps.js";

const isLeaf = (node) => !node.children || node.children.length === 0;

// assetmap has no in-app write path (populated externally), but its id/name
// fields still round-trip into innerHTML below — escaped defensively so a
// stray quote can't break out of the inline onclick="fn('...')" handlers.
function escAttr(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
// Safe inside a single-quoted JS string literal that itself sits inside a
// double-quoted HTML attribute — JS-escape first, then HTML-attribute-escape,
// so the browser's attribute-decode pass reconstructs the intended \' rather
// than an unescaped quote that would terminate the string early.
function escJsAttr(s) {
  return escAttr(String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
}

/* ── Desktop mega-dropdown ─────────────────────────────────
   depth 1 = top-level item in a column (Underpass, Mupi, …)
   depth 2+ = nested flyout (.sub / .deep), matching the original markup */
function renderDesktopNode(node, depth) {
  // Google Earth isn't a map embed — it's an external 3D view, opened in a
  // new tab like the original hardcoded link (its URL lives in map_link).
  if (node.id === "assets-google-earth") {
    const href = /^https?:/i.test(node.map_link || "") ? escAttr(node.map_link) : "#";
    return `<a class="mega-earth-link" href="${href}" target="_blank" rel="noopener noreferrer">${escAttr(node.name)}</a>`;
  }
  if (isLeaf(node)) {
    // Top-level leaves (e.g. UDC Tower) still get the .hover-item/.hover-title
    // wrapper — same block layout/hover state/font-size as branch siblings —
    // just without a chevron or submenu. Only nested leaves (depth 2+, inside
    // a .hover-submenu) render as bare links, matching the original markup.
    if (depth === 1) {
      return `<div class="hover-item"><div class="hover-title"><a onclick="setMap('${escJsAttr(node.id)}')">${escAttr(node.name)}</a></div></div>`;
    }
    return `<a onclick="setMap('${escJsAttr(node.id)}')">${escAttr(node.name)}</a>`;
  }
  const subClass  = depth >= 2 ? " sub"  : "";
  const deepClass = depth >= 2 ? " deep" : "";
  const children  = node.children.map(c => renderDesktopNode(c, depth + 1)).join("");
  return `
    <div class="hover-item${subClass}">
      <div class="hover-title"><a onclick="setMap('${escJsAttr(node.id)}')">${escAttr(node.name)}</a><span>›</span></div>
      <div class="hover-submenu${deepClass}">${children}</div>
    </div>`;
}

function renderDesktopColumn(root) {
  const items = root.children.map(c => renderDesktopNode(c, 1)).join("");
  // "assets" (All Assets / 3D View) is a narrower column, matching the
  // original hardcoded "3D View" column's width.
  const style = root.id === "assets" ? ` style="min-width:160px;max-width:180px;"` : "";
  return `
    <div class="mega-column"${style}>
      <div class="mega-title"><a onclick="setMap('${escJsAttr(root.id)}')">${escAttr(root.name)}</a></div>
      ${items}
    </div>`;
}

export function renderAssetsMegaDropdown() {
  const container = document.getElementById("assetsMegaColumns");
  if (!container) return;
  container.innerHTML = getAssetTree().map(renderDesktopColumn).join("");
}

/* ── Mobile dock panel ─────────────────────────────────────
   Flattened to two visible levels (group title + submenu). A node whose
   children are themselves branches (not leaves) — e.g. "Light Poles Main
   Circuits" wrapping "Main Entrance"/"Main Boulevard" — is skipped and its
   children are promoted up to be the group titles instead, exactly like
   the original hand-written markup did. */
function collectMobileGroups(nodes) {
  const groups = [];
  nodes.forEach(node => {
    if (isLeaf(node)) { groups.push(node); return; }
    const hasBranchChild = node.children.some(c => !isLeaf(c));
    if (hasBranchChild) groups.push(...collectMobileGroups(node.children));
    else groups.push(node);
  });
  return groups;
}

function renderMobileSection(root) {
  const groups = collectMobileGroups(root.children);
  const html = [];
  let leafBuffer = [];

  const flushLeaves = () => {
    if (!leafBuffer.length) return;
    const buttons = leafBuffer
      .map(n => `<button class="asset-group-title" onclick="setMapAndClose('${escJsAttr(n.id)}')">${escAttr(n.name)}</button>`)
      .join("");
    html.push(`<div class="asset-group">${buttons}</div>`);
    leafBuffer = [];
  };

  groups.forEach(node => {
    if (isLeaf(node)) { leafBuffer.push(node); return; }
    flushLeaves();
    const subButtons = node.children
      .map(c => `<button class="asset-group-submenu" onclick="setMapAndClose('${escJsAttr(c.id)}')">${escAttr(c.name)}</button>`)
      .join("");
    html.push(`
      <div class="asset-group">
        <button class="asset-group-title" onclick="setMapAndClose('${escJsAttr(node.id)}')">${escAttr(node.name)}</button>
        ${subButtons}
      </div>`);
  });
  flushLeaves();

  return `<button class="asset-section-title" onclick="setMapAndClose('${escJsAttr(root.id)}')">${escAttr(root.name)}</button>${html.join("")}`;
}

export function renderAssetsMobilePanel() {
  const container = document.getElementById("assetsPanelGenerated");
  if (!container) return;
  const sections = getAssetTree().filter(root => root.id !== "assets");
  container.innerHTML = sections.map(renderMobileSection).join("");
}
