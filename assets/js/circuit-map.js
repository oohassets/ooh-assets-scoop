/* ── Circuit Map panel (Add Booking) ──────────────────────────
   3D map of a booking's selected circuits, built on MapLibre GL JS +
   @tmcw/togeojson. Circuit KML files live in /maps/{oohassets.id}.kml —
   the booking form only knows a circuit by its human "Circuits" name
   (e.g. "Mupi Circuit 1"), so this module resolves that name to the
   matching row's own "id" column on that same "oohassets" table
   (e.g. "mupi-c1") to get the KML filename. */
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const MAPLIBRE_JS  = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
const TOGEOJSON_JS = "https://unpkg.com/@tmcw/togeojson@5.8.1/dist/togeojson.umd.js";
const STYLE_URL    = "https://tiles.openfreemap.org/styles/liberty";

// Fixed per-circuit palette (cycled if more circuits are selected than colors).
const CIRCUIT_COLORS = [
  "#4FE6C7", "#FF6B6B", "#FFD166", "#6C8CFF", "#C77DFF",
  "#FF9F45", "#39D98A", "#F45B69", "#5BC0EB", "#E4C1F9"
];

let maplibregl   = null;
let toGeoJSON    = null;
let libsPromise  = null;
let mapInitPromise = null;
let map          = null;
let popup        = null;
let is3D         = true;
let panelOpen    = false;

let assetNameToId   = null;               // lowercased Circuits name -> oohassets row id
let nameToIdPromise = null;
const geojsonCache  = new Map();          // id -> FeatureCollection | null (404/failed, cached so it's never refetched)
const pendingFetch  = new Map();          // id -> in-flight fetch promise
const colorForId    = new Map();          // id -> assigned color
const idToLabel     = new Map();          // id -> the human Circuits name it was selected as
let visibleIds      = new Set();

let dom = {};
let getSelectedCircuits = () => [];
let resizeHandler = null;
let canvasResizeObserver = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
function loadCSS(href) {
  return new Promise(resolve => {
    if (document.querySelector(`link[href="${href}"]`)) { resolve(); return; }
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    // Resolve on error too — a stylesheet failing to load shouldn't block
    // map init forever, though the canvas will size wrong without it.
    l.onload = () => resolve(); l.onerror = () => resolve();
    document.head.appendChild(l);
  });
}
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

async function loadLibs() {
  if (libsPromise) return libsPromise;
  libsPromise = (async () => {
    // MapLibre's own CSS sizes/positions the internal canvas — it must be
    // applied before the map is constructed, not just requested, or the
    // canvas can end up sized wrong (map appears blank).
    await loadCSS(MAPLIBRE_CSS);
    await loadScript(MAPLIBRE_JS);
    await loadScript(TOGEOJSON_JS);
    maplibregl = window.maplibregl;
    toGeoJSON  = window.toGeoJSON || window.togeojson;
  })();
  return libsPromise;
}

/** Builds (once) a lowercase "Circuits" name -> "oohassets" row "id" lookup
    (the "id" column on that same table is the KML filename, e.g. "mupi-c1"). */
async function loadNameToIdMap() {
  if (assetNameToId) return assetNameToId;
  if (nameToIdPromise) return nameToIdPromise;
  nameToIdPromise = (async () => {
    const snap = await get(ref(rtdb, "oohassets"));
    const map_ = new Map();
    if (snap.exists()) {
      const rows = Array.isArray(snap.val()) ? snap.val() : Object.values(snap.val());
      rows.forEach(row => {
        if (row?.Circuits && row?.id) map_.set(String(row.Circuits).trim().toLowerCase(), row.id);
      });
    }
    assetNameToId = map_;
    return map_;
  })();
  return nameToIdPromise;
}

function colorFor(id) {
  if (!colorForId.has(id)) colorForId.set(id, CIRCUIT_COLORS[colorForId.size % CIRCUIT_COLORS.length]);
  return colorForId.get(id);
}

/** Fetches + parses /maps/{id}.kml to GeoJSON once, caching the result (including failures) forever. */
async function fetchCircuitGeoJSON(id) {
  if (geojsonCache.has(id)) return geojsonCache.get(id);
  if (pendingFetch.has(id)) return pendingFetch.get(id);

  const promise = (async () => {
    let res;
    try { res = await fetch(`maps/${id}.kml`); }
    catch (e) { geojsonCache.set(id, null); return null; }
    if (!res.ok) { geojsonCache.set(id, null); return null; }

    const text = await res.text();
    const xml  = new DOMParser().parseFromString(text, "text/xml");
    if (xml.querySelector("parsererror")) { geojsonCache.set(id, null); return null; }

    const geojson = toGeoJSON.kml(xml);

    // togeojson doesn't reliably map <ExtendedData><Data name="seq"> across
    // versions — read it straight from the source XML, keyed by placemark
    // name (fallback: trailing number in the name).
    const seqByName = new Map();
    xml.querySelectorAll("Placemark").forEach(pm => {
      const nm = pm.querySelector("name")?.textContent?.trim();
      if (!nm) return;
      const dataEl = Array.from(pm.querySelectorAll("ExtendedData > Data")).find(d => d.getAttribute("name") === "seq");
      const seqVal = dataEl?.querySelector("value")?.textContent?.trim();
      if (seqVal) seqByName.set(nm, seqVal);
    });

    (geojson.features || []).forEach(f => {
      const nm = f.properties?.name?.trim() || "";
      let seq = seqByName.get(nm);
      if (!seq) { const m = nm.match(/(\d+)\s*$/); seq = m ? m[1] : ""; }
      f.properties.seq = seq;
      f.properties.circuitId = id;
    });

    geojsonCache.set(id, geojson);
    return geojson;
  })();

  pendingFetch.set(id, promise);
  try { return await promise; } finally { pendingFetch.delete(id); }
}

function layerIds(id) {
  return { src: `circuit-src-${id}`, circle: `circuit-circle-${id}`, symbol: `circuit-symbol-${id}` };
}

function ensureCircuitLayers(id, geojson) {
  const { src, circle, symbol } = layerIds(id);

  if (map.getSource(src)) {
    map.setLayoutProperty(circle, "visibility", "visible");
    map.setLayoutProperty(symbol, "visibility", "visible");
    return;
  }

  const color = colorFor(id);
  map.addSource(src, { type: "geojson", data: geojson });

  map.addLayer({
    id: circle, type: "circle", source: src,
    paint: {
      "circle-radius": 9,
      "circle-color": color,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff"
    }
  });

  map.addLayer({
    id: symbol, type: "symbol", source: src,
    layout: {
      "text-field": ["get", "seq"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 10,
      "text-allow-overlap": true,
      "text-ignore-placement": true
    },
    paint: { "text-color": "#ffffff" }
  });

  map.on("click", circle, e => {
    const f = e.features?.[0];
    if (!f) return;
    const coords = f.geometry.coordinates.slice();
    showPopup(coords, f.properties.name || "", f.properties.description || "", idToLabel.get(id) || id);
  });
  map.on("mouseenter", circle, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", circle, () => { map.getCanvas().style.cursor = ""; });
}

function hideCircuitLayers(id) {
  const { circle, symbol } = layerIds(id);
  if (map.getLayer(circle)) map.setLayoutProperty(circle, "visibility", "none");
  if (map.getLayer(symbol)) map.setLayoutProperty(symbol, "visibility", "none");
}

function showPopup(coords, name, descriptionHTML, label) {
  if (!popup) popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px", className: "bk-map-popup" });
  popup.setLngLat(coords)
    .setHTML(`
      <div class="bk-map-popup-circuit">${escapeHTML(label)}</div>
      <div class="bk-map-popup-name">${escapeHTML(name)}</div>
      <div class="bk-map-popup-desc">${descriptionHTML}</div>
    `)
    .addTo(map);
}

function fitToVisible() {
  if (!visibleIds.size || !maplibregl) return;
  const bounds = new maplibregl.LngLatBounds();
  let has = false;
  visibleIds.forEach(id => {
    const gj = geojsonCache.get(id);
    (gj?.features || []).forEach(f => {
      if (f.geometry?.type === "Point") { bounds.extend(f.geometry.coordinates); has = true; }
    });
  });
  if (has) map.fitBounds(bounds, { padding: 60, pitch: map.getPitch(), duration: 500 });
}

function clearNotices() { if (dom.notices) dom.notices.innerHTML = ""; }
function addNotice(msg) {
  if (!dom.notices) return;
  if (Array.from(dom.notices.children).some(c => c.textContent === msg)) return;
  const div = document.createElement("div");
  div.className = "bk-map-notice";
  div.textContent = msg;
  dom.notices.appendChild(div);
}

/** Adds a fill-extrusion building layer if the style doesn't already ship one. */
function ensure3DBuildings() {
  const style = map.getStyle();
  if (style.layers.some(l => l.type === "fill-extrusion")) return;
  const vectorSourceId = Object.keys(style.sources).find(k => style.sources[k].type === "vector");
  if (!vectorSourceId) return;
  const labelLayerId = style.layers.find(l => l.type === "symbol" && l.layout?.["text-field"])?.id;
  map.addLayer({
    id: "circuit-3d-buildings",
    source: vectorSourceId,
    "source-layer": "building",
    type: "fill-extrusion",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": "#1c2430",
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
      "fill-extrusion-opacity": 0.75
    }
  }, labelLayerId);
}

async function ensureMapInit() {
  if (mapInitPromise) return mapInitPromise;
  mapInitPromise = (async () => {
    await loadLibs();
    map = new maplibregl.Map({
      container: dom.canvas,
      style: STYLE_URL,
      center: [51.543, 25.372], // Pearl Qatar / Qanat Quartier — where these circuits sit
      zoom: 15,
      pitch: 55,
      bearing: -20,
      antialias: true
    });
    // bottom-right, not top-right — the panel header now floats over the
    // top of the map (see .bk-map-panel-hdr), which would otherwise cover it.
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    // Style/tile fetch failures don't throw — they surface here instead, so
    // log them rather than leaving a silently blank canvas.
    map.on("error", e => console.error("[circuit-map] MapLibre error:", e?.error || e));
    await new Promise(resolve => map.on("load", resolve));
    ensure3DBuildings();
    map.resize();
  })();
  return mapInitPromise;
}

function toggle2D3D() {
  if (!map) return;
  is3D = !is3D;
  map.easeTo({ pitch: is3D ? 55 : 0, duration: 400 });
  if (dom.dimBtn) dom.dimBtn.textContent = is3D ? "3D" : "2D";
}

/** Diffs the currently-selected circuit names against what's on the map and updates layers/notices/bounds. */
export async function syncCircuitMapSelection(circuitNames) {
  if (!map) return;
  await loadNameToIdMap();
  clearNotices();

  const resolvedIds = new Set();
  for (const name of circuitNames) {
    const id = assetNameToId.get(String(name).trim().toLowerCase());
    if (!id) { addNotice(`No map data for ${name}`); continue; }
    const gj = geojsonCache.has(id) ? geojsonCache.get(id) : await fetchCircuitGeoJSON(id);
    if (!gj) { addNotice(`No map data for ${name}`); continue; }
    idToLabel.set(id, name);
    resolvedIds.add(id);
  }

  const unchanged = resolvedIds.size === visibleIds.size && [...resolvedIds].every(id => visibleIds.has(id));
  if (unchanged) return;

  visibleIds.forEach(id => { if (!resolvedIds.has(id)) hideCircuitLayers(id); });
  resolvedIds.forEach(id => { if (!visibleIds.has(id)) ensureCircuitLayers(id, geojsonCache.get(id)); });

  visibleIds = resolvedIds;
  fitToVisible();
}

async function onToggleChange(e) {
  const on = e.target.checked;
  panelOpen = on;

  if (!on) {
    dom.panel.classList.remove("bk-map-visible");
    dom.panel.hidden = true;
    dom.mainRow?.classList.remove("bk-map-open");
    dom.modalBox?.classList.remove("bk-modal-wide");
    return;
  }

  dom.panel.hidden = false;
  dom.mainRow?.classList.add("bk-map-open");
  dom.modalBox?.classList.add("bk-modal-wide");
  // Force a layout flush so the panel's initial (invisible, offset) state is
  // committed before adding .bk-map-visible — otherwise the browser can
  // coalesce "unhide" + "become visible" into one frame and the fade/slide
  // transition never runs.
  void dom.panel.offsetWidth;
  requestAnimationFrame(() => dom.panel.classList.add("bk-map-visible"));

  await ensureMapInit();
  requestAnimationFrame(() => {
    map.resize();
    syncCircuitMapSelection(getSelectedCircuits());
  });
}

/** Wires the toggle + resize button. Call once per Bookings view init(). */
export function initCircuitMapUI({ getSelectedCircuits: getter }) {
  getSelectedCircuits = getter || (() => []);

  dom = {
    toggle:  document.getElementById("bkMapToggle"),
    mainRow: document.getElementById("bkMainRow"),
    panel:   document.getElementById("bkMapPanel"),
    canvas:  document.getElementById("bkMapCanvas"),
    notices: document.getElementById("bkMapNotices"),
    dimBtn:  document.getElementById("bkMapDimToggle"),
    modalBox: document.getElementById("bkModalBox")
  };
  if (!dom.toggle || !dom.panel || !dom.canvas) return;

  dom.toggle.checked = false;
  dom.panel.hidden = true;
  panelOpen = false;

  dom.toggle.addEventListener("change", onToggleChange);
  dom.dimBtn?.addEventListener("click", toggle2D3D);

  resizeHandler = () => { if (map && panelOpen) map.resize(); };
  window.addEventListener("resize", resizeHandler);

  // Safety net: whenever the canvas's own box actually changes size (layout
  // settling, breakpoint switch, flex chain resolving late), resize the map
  // to match rather than relying solely on the explicit resize() calls above.
  if ("ResizeObserver" in window) {
    canvasResizeObserver = new ResizeObserver(() => { if (map) map.resize(); });
    canvasResizeObserver.observe(dom.canvas);
  }
}

/** Tears down the map instance and all per-page state. Call from the Bookings view's cleanup(). */
export function teardownCircuitMap() {
  if (resizeHandler) { window.removeEventListener("resize", resizeHandler); resizeHandler = null; }
  if (canvasResizeObserver) { canvasResizeObserver.disconnect(); canvasResizeObserver = null; }
  if (map) { map.remove(); map = null; }
  mapInitPromise = null;
  popup = null;
  visibleIds = new Set();
  geojsonCache.clear();
  pendingFetch.clear();
  colorForId.clear();
  idToLabel.clear();
  assetNameToId = null;
  nameToIdPromise = null;
  panelOpen = false;
  is3D = true;
  dom = {};
}
