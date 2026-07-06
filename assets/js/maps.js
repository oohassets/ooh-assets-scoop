/* ── Asset location & map data (sourced from RTDB `assetmap`) ──
   Rows carry: id, name, parent_id, sort_order, map_link. A row's own "id"
   is the same id used in the "assetrate" table (see asset-rates.js), and
   a blank parent_id marks a root/column node (Digital Assets, Static
   Assets, Assets). Everything else is nested under its parent_id and
   ordered by sort_order. */
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// Populated by loadAssetMap(): id → map_link. Exported as a stable object
// reference (mutated in place, never reassigned) so modules that imported
// `{ maps }` before the fetch resolved still see the populated data.
export const maps = {};

let rowsCache = null;
let treeCache = [];

async function fetchAssetMapRows() {
  if (rowsCache) return rowsCache;
  const snap = await get(ref(rtdb, "assetmap"));
  rowsCache = snap.exists() ? Object.values(snap.val()) : [];
  return rowsCache;
}

function sortOrderOf(row) {
  return Number(row.sort_order ?? row.sort_id ?? 0) || 0;
}

function buildTree(rows) {
  const byId = {};
  rows.forEach(row => { if (row?.id) byId[row.id] = { ...row, children: [] }; });

  const roots = [];
  rows.forEach(row => {
    if (!row?.id) return;
    const node   = byId[row.id];
    const parent = row.parent_id ? byId[row.parent_id] : null;
    (parent ? parent.children : roots).push(node);
  });

  const sortRec = (list) => {
    list.sort((a, b) => sortOrderOf(a) - sortOrderOf(b));
    list.forEach(n => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/**
 * Fetches the "assetmap" table once, populates `maps` (id → map_link) and
 * builds the parent/child tree used to render the Assets Location menus.
 */
export async function loadAssetMap() {
  const rows = await fetchAssetMapRows();
  rows.forEach(row => { if (row?.id) maps[row.id] = row.map_link; });
  treeCache = buildTree(rows);
  return treeCache;
}

/** Root nodes (Digital Assets, Static Assets, Assets), each with `.children`. */
export function getAssetTree() {
  return treeCache;
}
