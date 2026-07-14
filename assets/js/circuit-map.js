/* ── Circuit Map panel (Add Booking) ──────────────────────────
   3D map of a booking's selected circuits, built on MapLibre GL JS +
   @tmcw/togeojson. Circuit KML files live in /maps/{oohassets.id}.kml —
   the booking form only knows a circuit by its human "Circuits" name
   (e.g. "Mupi Circuit 1"), so this module resolves that name to the
   matching row's own "id" column on that same "oohassets" table
   (e.g. "mupi-c1") to get the KML filename. */
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// cdnjs, not unpkg — confirmed reachable in this environment (a known-working
// standalone preview used this same cdnjs URL for maplibre-gl).
const MAPLIBRE_JS  = "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js";
const MAPLIBRE_CSS = "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css";
const TOGEOJSON_JS = "https://unpkg.com/@tmcw/togeojson@5.8.1/dist/togeojson.umd.js";
const STYLE_URL    = "https://tiles.openfreemap.org/styles/liberty";
const LOAD_TIMEOUT_MS = 10000;
const TOMTOM_KEY = "338Cqqs5etZ36aDk1FUHBdJOguMd50FP";
const TRAFFIC_REFRESH_MS = 60000;

// Standard view's raster basemap (roads/buildings/labels baked into the
// tile images themselves) — swapped in for the "liberty" vector style's own
// layers when the user picks Standard, so it's a flat, plain streets look
// with no 2D/3D building extrusions. Falls back to the second entry if the
// first's tiles start failing to load (see handleStandardBasemapError()).
const RETINA_SUFFIX = (window.devicePixelRatio || 1) >= 2 ? "@2x" : "";
const STANDARD_BASEMAPS = [
  {
    tiles: ["a", "b", "c", "d"].map(s => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}${RETINA_SUFFIX}.png`),
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  },
  {
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "&copy; OpenStreetMap contributors"
  }
];

// Marker color by circuit category, keyed off the id prefix (see colorFor()).
const CATEGORY_COLORS = {
  lightpoles: "#1F7A42", // dark green — lightpoles-*
  mupiPA:     "#6C3FA6", // purple — mupi-pa*
  digital:    "#C2570A"  // dark orange — everything else (underpass*, gewan*, mupi/-c1/-c2, udctower, qqscreen, monoprix)
};

let maplibregl   = null;
let toGeoJSON    = null;
let libsPromise  = null;
let mapInitPromise = null;
let map          = null;
let popup        = null;
let is3D         = true;
let panelOpen    = false;
let standardBasemapIndex     = 0;
let standardBasemapFellBack  = false;

let assetNameToId   = null;               // lowercased Circuits name -> oohassets row id
let nameToIdPromise = null;
const geojsonCache  = new Map();          // id -> FeatureCollection | null (404/failed, cached so it's never refetched)
const pendingFetch  = new Map();          // id -> in-flight fetch promise
const idToLabel     = new Map();          // id -> the human Circuits name it was selected as
let visibleIds      = new Set();

let dom = {};
let getSelectedCircuits = () => [];
let resizeHandler = null;
let canvasResizeObserver = null;
let labelsOn = true;
let trafficOn = false;
let trafficTimer = null;
let detailsOn = false;
let dimensionsOn = false;

let idToAssetRate    = null;               // "oohassets"/"assetrate" shared id -> assetrate row (for the Faces/Dimensions columns)
let assetRatePromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    console.log("[circuit-map] loading script", src);
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => { console.log("[circuit-map] loaded script", src); resolve(); };
    s.onerror = () => { console.error("[circuit-map] FAILED to load script", src); reject(new Error(`Failed to load ${src}`)); };
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
    l.onload = () => resolve();
    l.onerror = () => { console.error("[circuit-map] FAILED to load stylesheet", href); resolve(); };
    document.head.appendChild(l);
  });
}
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

/** Some circuit KML files' <description> text comes through togeojson as a
    raw JSON envelope — e.g. {"@type":"html","value":"Description: ...\n..."}
    — instead of the plain HTML/text it's meant to hold (a Google My Maps
    export quirk), which rendered as literal escaped JSON in the popup.
    Unwraps that envelope; real HTML descriptions (containing actual tags)
    still pass through unchanged, so this only affects the JSON-wrapped
    plain-text case. */
function normalizeDescription(desc) {
  if (!desc) return "";
  let str = String(desc).trim();
  if (str.startsWith("{") && str.includes('"@type"') && str.includes('"value"')) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed?.value === "string") str = parsed.value.trim();
    } catch { /* not actually JSON — fall through and render as-is */ }
  }
  if (/<[a-z][\s\S]*>/i.test(str)) return str; // already real markup
  return escapeHTML(str).replace(/\n/g, "<br>");
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

/** Builds (once) an "assetrate" row lookup keyed by that table's own "id"
    field — the same id space as "oohassets"/"assetmap" (see CLAUDE.md) — so
    the Faces count for a circuit can be found by the same id resolved via
    loadNameToIdMap(). Used by updateDetailsPanel(). */
async function loadAssetRateMap() {
  if (idToAssetRate) return idToAssetRate;
  if (assetRatePromise) return assetRatePromise;
  assetRatePromise = (async () => {
    const snap = await get(ref(rtdb, "assetrate"));
    const map_ = new Map();
    if (snap.exists()) {
      const rows = Array.isArray(snap.val()) ? snap.val() : Object.values(snap.val());
      rows.forEach(row => { if (row?.id) map_.set(row.id, row); });
    }
    idToAssetRate = map_;
    return map_;
  })();
  return assetRatePromise;
}

function colorFor(id) {
  if (id.startsWith("lightpoles")) return CATEGORY_COLORS.lightpoles;
  if (id.startsWith("mupi-pa")) return CATEGORY_COLORS.mupiPA;
  return CATEGORY_COLORS.digital;
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
    showPopup(coords, f.properties.name || "", normalizeDescription(f.properties.description), idToLabel.get(id) || id);
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

/** Custom MapLibre IControl — reuses MapLibre's own "maplibregl-ctrl-group"
    chrome (white rounded button group, same shadow/border as the built-in
    NavigationControl) so it matches that control's look with no bespoke
    CSS. Added to the map after the NavigationControl, in the same
    "bottom-right" corner, so it stacks directly above it. */
class FitToVisibleControl {
  constructor(onClick) { this._onClick = onClick; }
  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bk-map-fit-btn";
    btn.setAttribute("aria-label", "Fit to visible circuits");
    btn.title = "Fit to visible circuits";
    btn.innerHTML = '<span class="material-symbols-outlined">fit_screen</span>';
    btn.addEventListener("click", () => this._onClick());
    this._container.appendChild(btn);
    return this._container;
  }
  onRemove() {
    this._container.parentNode?.removeChild(this._container);
  }
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

/** Adds a fill-extrusion building layer if the style doesn't already ship one.
    Starts out matching the current is3D state (visible in 3D, hidden in
    Standard) so a user who flips to Standard before the map finishes
    loading doesn't briefly see buildings pop in. */
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
    layout: { visibility: is3D ? "visible" : "none" },
    paint: {
      "fill-extrusion-color": "#1c2430",
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
      "fill-extrusion-opacity": 0.75
    }
  }, labelLayerId);
}

/** Adds the Standard-view raster basemap source/layer (hidden by default —
    only shown while !is3D, see setStandardBasemapActive()). Inserted below
    every other layer so it sits under the vector style's own layers (still
    visible while in 3D) as well as our own circuit markers. */
function ensureStandardBasemap() {
  if (map.getSource("standard-basemap")) return;
  const basemap = STANDARD_BASEMAPS[standardBasemapIndex];
  map.addSource("standard-basemap", {
    type: "raster",
    tiles: basemap.tiles,
    tileSize: 256,
    attribution: basemap.attribution
  });
  const beforeId = map.getStyle().layers[0]?.id;
  map.addLayer({
    id: "standard-basemap-layer",
    type: "raster",
    source: "standard-basemap",
    layout: { visibility: "none" }
  }, beforeId);
  map.on("error", handleStandardBasemapError);
  setStandardBasemapActive(!is3D);
}

/** Swaps to the next basemap in STANDARD_BASEMAPS the first time a tile from
    the current one fails to load — mirrors the original Leaflet prototype's
    tileerror-triggered fallback. Best-effort match on the error event since
    MapLibre's error payload shape for tile failures isn't fully consistent
    across sources. */
function handleStandardBasemapError(e) {
  if (standardBasemapFellBack) return;
  const nextIndex = standardBasemapIndex + 1;
  if (nextIndex >= STANDARD_BASEMAPS.length) return;
  const failedOurSource = e?.sourceId === "standard-basemap"
    || e?.source?.id === "standard-basemap"
    || (typeof e?.error?.message === "string" && e.error.message.includes("cartocdn.com"));
  if (!failedOurSource) return;

  const src = map.getSource("standard-basemap");
  if (!src || typeof src.setTiles !== "function") return;
  standardBasemapFellBack = true;
  standardBasemapIndex = nextIndex;
  src.setTiles(STANDARD_BASEMAPS[nextIndex].tiles);
  console.warn("[circuit-map] Standard-view basemap failed to load, switched to fallback tiles");
}

/** Toggles between the Standard raster basemap and the "liberty" vector
    style's own layers (roads/buildings/labels) — the two are never shown
    together, so Standard view reads as a plain basemap with no extra 2D/3D
    building/vector-label clutter. Leaves our own circuit- and traffic
    layers (and, when returning to 3D, the user's Labels toggle state)
    untouched. */
function setStandardBasemapActive(active) {
  if (!map.getLayer("standard-basemap-layer")) return;
  map.setLayoutProperty("standard-basemap-layer", "visibility", active ? "visible" : "none");
  map.getStyle().layers.forEach(l => {
    if (l.id === "standard-basemap-layer" || l.id.startsWith("circuit-") || l.id === "traffic") return;
    if (active) {
      map.setLayoutProperty(l.id, "visibility", "none");
    } else {
      map.setLayoutProperty(l.id, "visibility", (l.type === "symbol" && !labelsOn) ? "none" : "visible");
    }
  });
}

async function ensureMapInit() {
  if (mapInitPromise) return mapInitPromise;
  mapInitPromise = (async () => {
    try {
      console.log("[circuit-map] loading MapLibre + togeojson...");
      await loadLibs();
      if (!maplibregl) throw new Error("window.maplibregl is undefined after script load — CDN blocked?");
      console.log("[circuit-map] libs ready, constructing map...");
      map = new maplibregl.Map({
        container: dom.canvas,
        style: STYLE_URL,
        center: [51.543, 25.372], // Pearl Qatar / Qanat Quartier — where these circuits sit
        zoom: 15,
        pitch: 55,
        bearing: -20,
        antialias: true,
        // Required for canvas.toDataURL() to read back real pixels in
        // captureScreenshot() — WebGL clears the drawing buffer after each
        // frame by default, which would otherwise export a blank image.
        preserveDrawingBuffer: true
      });
      // bottom-right, not top-right — the panel header now floats over the
      // top of the map (see .bk-map-panel-hdr), which would otherwise cover it.
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
      // Added after the NavigationControl (and same corner) so it stacks
      // directly above it — MapLibre's bottom-right corner container uses
      // flex-direction:column-reverse, so later-added controls render higher.
      map.addControl(new FitToVisibleControl(() => { if (visibleIds.size) fitToVisible(); }), "bottom-right");
      // Style/tile fetch failures don't throw — they surface here instead, so
      // log them rather than leaving a silently blank canvas.
      map.on("error", e => console.error("[circuit-map] MapLibre error:", e?.error || e));
      console.log("[circuit-map] waiting for style/tiles to finish loading...");
      await Promise.race([
        new Promise(resolve => map.on("load", resolve)),
        new Promise((_, reject) => setTimeout(
          () => reject(new Error(`"load" event never fired within ${LOAD_TIMEOUT_MS}ms — check network access to ${STYLE_URL}`)),
          LOAD_TIMEOUT_MS
        ))
      ]);
      console.log("[circuit-map] map loaded");
      ensure3DBuildings();
      ensureStandardBasemap();
      map.resize();
      const rect = dom.canvas.getBoundingClientRect();
      const glCanvas = map.getCanvas();
      console.log(`[circuit-map] container box: ${rect.width}x${rect.height} — internal <canvas>: ${glCanvas.width}x${glCanvas.height} (style ${glCanvas.style.width} x ${glCanvas.style.height})`);
      // Trace the whole ancestor chain's computed height to find exactly
      // which level is collapsing to 0.
      [dom.modalBox, dom.mainRow, dom.panel, dom.canvas.parentElement, dom.canvas].forEach(el => {
        if (!el) return;
        const cs = getComputedStyle(el);
        console.log(`[circuit-map] ${el.id || el.className} — class="${el.className}" display=${cs.display} height=${cs.height} flex=${cs.flex} minHeight=${cs.minHeight}`);
      });
    } catch (err) {
      console.error("[circuit-map] map init failed:", err);
      addNotice("Map failed to load — see console for details");
      mapInitPromise = null; // allow retrying on the next toggle-on
      throw err;
    }
  })();
  return mapInitPromise;
}

function toggle2D3D() {
  if (!map) return;
  is3D = !is3D;
  map.easeTo({ pitch: is3D ? 55 : 0, duration: 400 });
  if (dom.dimBtn) dom.dimBtn.textContent = is3D ? "3D" : "Standard";
  // Standard view is the flat raster basemap only — no 2D/3D building
  // extrusions, no "liberty" vector style layers underneath it.
  if (map.getLayer("circuit-3d-buildings")) {
    map.setLayoutProperty("circuit-3d-buildings", "visibility", is3D ? "visible" : "none");
  }
  setStandardBasemapActive(!is3D);
}

/** Hides/shows the base style's own text/POI symbol layers (not our own circuit-seq labels). */
function toggleLabels() {
  if (!map) return;
  labelsOn = !labelsOn;
  map.getStyle().layers.forEach(l => {
    if (l.type === "symbol" && !l.id.startsWith("circuit-symbol-")) {
      map.setLayoutProperty(l.id, "visibility", labelsOn ? "visible" : "none");
    }
  });
  dom.labelsBtn?.classList.toggle("active", labelsOn);
  dom.labelsBtn?.setAttribute("aria-pressed", String(labelsOn));
}

/** First currently-added circuit circle layer, if any — used so the traffic
    raster always sits below circuit markers regardless of toggle order. */
function firstCircuitLayerId() {
  return map.getStyle().layers.find(l => l.id.startsWith("circuit-circle-"))?.id;
}
function trafficTileURL() {
  return `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_KEY}&t=${Date.now()}`;
}
function addTraffic() {
  if (map.getSource("traffic")) return;
  map.addSource("traffic", { type: "raster", tiles: [trafficTileURL()], tileSize: 256 });
  map.addLayer({ id: "traffic", type: "raster", source: "traffic", paint: { "raster-opacity": 0.85 } }, firstCircuitLayerId());
}
function removeTraffic() {
  if (map.getLayer("traffic")) map.removeLayer("traffic");
  if (map.getSource("traffic")) map.removeSource("traffic");
}
/** Live traffic overlay (TomTom Traffic Flow) — re-fetched every 60s while on. */
function toggleTraffic() {
  if (!map) return;
  trafficOn = !trafficOn;
  if (trafficOn) {
    addTraffic();
    trafficTimer = setInterval(() => { removeTraffic(); addTraffic(); }, TRAFFIC_REFRESH_MS);
  } else {
    removeTraffic();
    clearInterval(trafficTimer);
    trafficTimer = null;
  }
  dom.trafficBtn?.classList.toggle("active", trafficOn);
  dom.trafficBtn?.setAttribute("aria-pressed", String(trafficOn));
}

/** Fills the "Show Details" floating panel with one row per currently
    resolved circuit (Circuit name | Faces) plus a Faces total. Faces come
    from "assetrate", keyed by the same id space as "oohassets"/"assetmap". */
async function updateDetailsPanel(ids) {
  if (!dom.detailsBody) return;
  const rateMap = await loadAssetRateMap();
  let total = 0;
  const rows = [...ids].map(id => {
    const rate = rateMap.get(id);
    const facesNum = Number(rate?.faces) || 0;
    total += facesNum;
    return { label: idToLabel.get(id) || id, display: rate?.faces_screen ?? rate?.faces ?? "—" };
  });
  dom.detailsBody.innerHTML = rows.length
    ? rows.map(r => `<tr><td>${escapeHTML(r.label)}</td><td>${escapeHTML(String(r.display))}</td></tr>`).join("")
    : `<tr><td colspan="2" class="bk-map-float-empty">No circuits selected</td></tr>`;
  if (dom.detailsTotal) dom.detailsTotal.textContent = String(total);
}

/** Shows/hides the selected-circuits floating panel. */
function toggleDetails() {
  detailsOn = !detailsOn;
  dom.detailsPanel?.toggleAttribute("hidden", !detailsOn);
  dom.detailsBtn?.classList.toggle("active", detailsOn);
  dom.detailsBtn?.setAttribute("aria-pressed", String(detailsOn));
}

/** Splits a "<base> Circuit <N>" label so same-dimension circuits sharing a
    base name can be merged into one row — e.g. "Gewan Crystal Walk Circuit 1"
    and "...Circuit 2" both resolve here to base "Gewan Crystal Walk Circuit"
    + num "1"/"2". Returns null for labels that don't end in "Circuit <N>". */
function splitCircuitNumber(label) {
  const m = String(label).match(/^(.*\bCircuit)\s*(\d+)\s*$/i);
  return m ? { base: m[1].trim(), num: m[2] } : null;
}

/** "1" -> "1", ["1","2"] -> "1 & 2", ["1","2","3"] -> "1, 2 & 3". */
function formatMergedNumbers(nums) {
  const sorted = [...nums].sort((a, b) => Number(a) - Number(b));
  if (sorted.length === 1) return sorted[0];
  return `${sorted.slice(0, -1).join(", ")} & ${sorted[sorted.length - 1]}`;
}

/** Merges rows that share both an identical Dimension value and a common
    "<base> Circuit N" label into one row labeled "<base> Circuit N1 & N2" —
    e.g. selecting both Gewan Crystal Walk Circuit 1 and 2 (same physical
    dimension) collapses to a single "Gewan Crystal Walk Circuit 1 & 2" row
    instead of two identical-looking rows. Rows whose label doesn't match
    "Circuit N", or whose dimension differs, pass through unmerged. Preserves
    each row's first-seen order. */
function mergeSameDimensionCircuits(rows) {
  const order = [];
  const groups = new Map();
  rows.forEach(({ label, dim }) => {
    const split = splitCircuitNumber(label);
    const key = split ? `${split.base.toLowerCase()}|${dim}` : `__single__|${label}|${dim}`;
    if (!groups.has(key)) {
      groups.set(key, split ? { base: split.base, dim, nums: [split.num] } : { label, dim, nums: null });
      order.push(key);
    } else if (split) {
      groups.get(key).nums.push(split.num);
    }
  });
  return order.map(key => {
    const g = groups.get(key);
    return { label: g.nums ? `${g.base} ${formatMergedNumbers(g.nums)}` : g.label, dim: g.dim };
  });
}

/** Renders a Dimensions cell — locations like Gewan Crystal Walk carry more
    than one size in the same "Dimensions" value (comma/semicolon/newline
    separated); split those onto their own line each instead of running them
    together, single sizes render unchanged. */
function formatDimensionCell(dim) {
  const raw = String(dim);
  // Split on explicit separators first, then also break right after every
  // "px" occurrence — Gewan Crystal Walk's Dimensions value lists multiple
  // sizes back-to-back with no comma between them (e.g.
  // "1920x1080px2400x1200px"), so comma/semicolon/newline splitting alone
  // left it as one long wrapped line.
  const parts = raw
    .split(/[,;\n]+/)
    .flatMap(s => s.split(/(?<=px)/i))
    .map(s => s.replace(/\./g, "").trim())
    .filter(Boolean);
  return (parts.length ? parts : [raw]).map(escapeHTML).join("<br>");
}

/** Fills the "Show Dimensions" floating panel with one row per currently
    resolved circuit (Circuit name | Dimension), read from assetrate's own
    "Dimensions" column (same id lookup as updateDetailsPanel's Faces). */
async function updateDimensionsPanel(ids) {
  if (!dom.dimensionsBody) return;
  const rateMap = await loadAssetRateMap();
  const rawRows = [...ids].map(id => {
    const rate = rateMap.get(id);
    return { label: idToLabel.get(id) || id, dim: rate?.Dimensions || "—" };
  });
  const rows = mergeSameDimensionCircuits(rawRows);
  dom.dimensionsBody.innerHTML = rows.length
    ? rows.map(r => `<tr><td>${escapeHTML(r.label)}</td><td>${formatDimensionCell(r.dim)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="bk-map-float-empty">No circuits selected</td></tr>`;
}

/** Shows/hides the selected-circuits' dimensions floating panel. */
function toggleDimensions() {
  dimensionsOn = !dimensionsOn;
  dom.dimensionsPanel?.toggleAttribute("hidden", !dimensionsOn);
  dom.dimensionsBtn?.classList.toggle("active", dimensionsOn);
  dom.dimensionsBtn?.setAttribute("aria-pressed", String(dimensionsOn));
}

const SCREENSHOT_SCALE  = 2; // supersample beyond the display's own devicePixelRatio for a crisper export
const EXPORT_ASPECT_W   = 5; // exported image is always a fixed 5:3 landscape frame, regardless of
const EXPORT_ASPECT_H   = 3; // the on-screen panel's own shape (4:3 desktop, arbitrary mobile fullscreen)

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Reads the live colors/font off a real floating-panel DOM node so the
    canvas-drawn copy in the screenshot matches the current theme (light/dark)
    without duplicating theme values in JS. */
function readCardTheme(panelEl) {
  const cs = getComputedStyle(panelEl);
  const hdrEl = panelEl.querySelector(".bk-map-float-hdr");
  const thEl = panelEl.querySelector("th");
  return {
    bg: cs.backgroundColor,
    border: cs.borderTopColor,
    text: cs.color,
    muted: thEl ? getComputedStyle(thEl).color : cs.color,
    accent: hdrEl ? getComputedStyle(hdrEl).color : "#981E32",
    fontFamily: cs.fontFamily
  };
}

/** Reads a floating panel's already-rendered <tbody> rows straight from the
    DOM (single source of truth — whatever's on screen is what gets drawn
    into the screenshot), skipping the single-cell "No circuits selected"
    placeholder row. Uses innerText (not textContent) so a multi-line
    Dimensions cell's <br>-separated sizes come back as "line1\nline2" —
    drawFloatingCard() below splits on that to draw each on its own line. */
function readCardRows(tbody) {
  return [...tbody.querySelectorAll("tr")]
    .map(tr => [...tr.querySelectorAll("td")].map(td => (td.innerText ?? td.textContent).trim()))
    .filter(cols => cols.length >= 2);
}

function splitCellLines(v) {
  const lines = String(v ?? "").split("\n").map(s => s.trim()).filter(Boolean);
  return lines.length ? lines : [""];
}

/** Draws one floating-panel-style card (title + 2-col table [+ total row])
    onto the export canvas, anchored by its bottom-left corner so callers
    don't need to know the card's height up front. Cell values may contain
    "\n" (a multi-line Dimensions cell) — each row's height expands to fit
    its tallest column. Returns the card's rendered size so the next card
    can be placed beside it. */
function drawFloatingCard(ctx, x, bottomY, scale, theme, { title, columns, rows, totalRow, emptyText }) {
  const pad = 14 * scale, gap = 12 * scale, lineH = 15 * scale, rowVPad = 7 * scale, titleH = 20 * scale;
  const rowFont   = `${Math.round(12 * scale)}px ${theme.fontFamily}`;
  const headFont  = `700 ${Math.round(10 * scale)}px ${theme.fontFamily}`;
  const titleFont = `700 ${Math.round(10 * scale)}px ${theme.fontFamily}`;
  const emptyFont = `italic ${Math.round(11 * scale)}px ${theme.fontFamily}`;
  const totalFont = `700 ${Math.round(12 * scale)}px ${theme.fontFamily}`;

  const isEmpty = rows.length === 0;
  const rowLines = rows.map(cols => [splitCellLines(cols[0]), splitCellLines(cols[1])]);
  const totalLines = totalRow ? [splitCellLines(totalRow[0]), splitCellLines(totalRow[1])] : null;

  ctx.font = rowFont;
  let colAW = 0, colBW = 0;
  const lineSets = totalLines ? [...rowLines, totalLines] : rowLines;
  lineSets.forEach(([a, b]) => {
    a.forEach(l => { colAW = Math.max(colAW, ctx.measureText(l).width); });
    b.forEach(l => { colBW = Math.max(colBW, ctx.measureText(l).width); });
  });
  colAW = Math.max(colAW, ctx.measureText(columns[0]).width);
  colBW = Math.max(colBW, ctx.measureText(columns[1]).width);
  ctx.font = emptyFont;
  const emptyW = isEmpty ? ctx.measureText(emptyText).width : 0;

  const contentW = isEmpty ? emptyW : (colAW + gap + colBW);
  const cardW = Math.max(170 * scale, pad * 2 + contentW);
  const headerRowH = lineH + rowVPad;
  const rowHeights = rowLines.map(([a, b]) => Math.max(a.length, b.length, 1) * lineH + rowVPad);
  const totalRowH = totalLines ? Math.max(totalLines[0].length, totalLines[1].length, 1) * lineH + rowVPad + 4 * scale : 0;
  const bodyH = isEmpty ? (lineH + rowVPad) : (headerRowH + rowHeights.reduce((s, h) => s + h, 0) + totalRowH);
  const cardH = pad * 2 + titleH + bodyH;
  const y = bottomY - cardH;

  ctx.save();
  ctx.fillStyle = theme.bg;
  roundRect(ctx, x, y, cardW, cardH, 10 * scale);
  ctx.fill();
  ctx.lineWidth = Math.max(1, scale);
  ctx.strokeStyle = theme.border;
  ctx.stroke();

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let cy = y + pad;
  ctx.fillStyle = theme.accent;
  ctx.font = titleFont;
  ctx.fillText(title.toUpperCase(), x + pad, cy);
  cy += titleH;

  const drawLines = (lines, xPos, topY, align) => {
    ctx.textAlign = align;
    lines.forEach((l, i) => ctx.fillText(l, xPos, topY + i * lineH));
    ctx.textAlign = "left";
  };

  if (isEmpty) {
    ctx.fillStyle = theme.muted;
    ctx.font = emptyFont;
    ctx.fillText(emptyText, x + pad, cy + 4 * scale);
  } else {
    ctx.font = headFont;
    ctx.fillStyle = theme.muted;
    drawLines([columns[0].toUpperCase()], x + pad, cy, "left");
    drawLines([columns[1].toUpperCase()], x + cardW - pad, cy, "right");
    cy += headerRowH;

    ctx.font = rowFont;
    rowLines.forEach(([aLines, bLines], i) => {
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = Math.max(1, scale * 0.75);
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + cardW - pad, cy); ctx.stroke();
      const ty = cy + 5 * scale;
      ctx.fillStyle = theme.text;
      drawLines(aLines, x + pad, ty, "left");
      drawLines(bLines, x + cardW - pad, ty, "right");
      cy += rowHeights[i];
    });

    if (totalRow) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = Math.max(1.2, scale);
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + cardW - pad, cy); ctx.stroke();
      const ty = cy + 6 * scale;
      ctx.font = totalFont;
      ctx.fillStyle = theme.text;
      drawLines(totalLines[0], x + pad, ty, "left");
      drawLines(totalLines[1], x + cardW - pad, ty, "right");
    }
  }

  ctx.restore();
  return { width: cardW, height: cardH };
}

/** Exports the current map view as a high-resolution 5:3 PNG. Frames the
    selected circuits, momentarily resizes the MapLibre container to a fixed
    5:3 export resolution (counter-scaled back down visually via CSS
    transform so nothing appears to move on screen — a "Capturing…" veil
    covers the brief non-uniform squish this causes), then composites in the
    Details / Dimensions cards on top if their toggles are on, matching
    whatever's currently shown on screen. */
async function captureScreenshot() {
  if (!map || !dom.canvas) return;
  const canvasEl = dom.canvas;
  const veilEl = canvasEl.parentElement; // .bk-map-canvas-wrap
  const rect = canvasEl.getBoundingClientRect();
  const orig = {
    width: canvasEl.style.width,
    height: canvasEl.style.height,
    transform: canvasEl.style.transform,
    transformOrigin: canvasEl.style.transformOrigin
  };

  dom.screenshotBtn?.setAttribute("aria-busy", "true");
  veilEl?.classList.add("bk-map-capturing");
  try {
    if (visibleIds.size) {
      fitToVisible();
      await new Promise(resolve => {
        let done = false;
        const finish = () => { if (done) return; done = true; resolve(); };
        map.once("idle", finish);
        setTimeout(finish, 2000);
      });
    }

    const targetWidth  = Math.max(rect.width, 800) * SCREENSHOT_SCALE;
    const targetHeight = Math.round(targetWidth * EXPORT_ASPECT_H / EXPORT_ASPECT_W);
    canvasEl.style.width  = `${targetWidth}px`;
    canvasEl.style.height = `${targetHeight}px`;
    canvasEl.style.transformOrigin = "top left";
    canvasEl.style.transform = `scale(${rect.width / targetWidth}, ${rect.height / targetHeight})`;
    map.resize();

    // Wait for tiles at the new, larger pixel size to finish loading before
    // reading the canvas back — otherwise the export can catch a half-drawn
    // frame. Capped so a stalled tile fetch can't hang the button forever.
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      map.once("idle", finish);
      setTimeout(finish, 4000);
    });

    const mapCanvas = map.getCanvas();
    const out = document.createElement("canvas");
    out.width = mapCanvas.width;
    out.height = mapCanvas.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(mapCanvas, 0, 0);

    const pxScale = mapCanvas.width / targetWidth; // device pixels per CSS px, at the export size
    const margin = 10 * pxScale;
    let cardX = margin;
    const cardBottomY = out.height - margin;

    if (detailsOn && dom.detailsPanel && !dom.detailsPanel.hidden) {
      const theme = readCardTheme(dom.detailsPanel);
      const { width } = drawFloatingCard(ctx, cardX, cardBottomY, pxScale, theme, {
        title: "Selected Circuits",
        columns: ["Circuit", "Faces"],
        rows: readCardRows(dom.detailsBody),
        totalRow: ["Total", dom.detailsTotal?.textContent || "0"],
        emptyText: "No circuits selected"
      });
      cardX += width + 8 * pxScale;
    }

    if (dimensionsOn && dom.dimensionsPanel && !dom.dimensionsPanel.hidden) {
      const theme = readCardTheme(dom.dimensionsPanel);
      drawFloatingCard(ctx, cardX, cardBottomY, pxScale, theme, {
        title: "Circuit Dimensions",
        columns: ["Circuit", "Dimension"],
        rows: readCardRows(dom.dimensionsBody),
        emptyText: "No circuits selected"
      });
    }

    const dataUrl = out.toDataURL("image/png", 1.0);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `circuit-map-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error("[circuit-map] screenshot failed:", err);
    addNotice("Screenshot failed — see console for details");
  } finally {
    canvasEl.style.width = orig.width;
    canvasEl.style.height = orig.height;
    canvasEl.style.transform = orig.transform;
    canvasEl.style.transformOrigin = orig.transformOrigin;
    map.resize();
    veilEl?.classList.remove("bk-map-capturing");
    dom.screenshotBtn?.removeAttribute("aria-busy");
  }
}

/** Writes text to the clipboard, falling back to the legacy
    execCommand("copy") path (via a throwaway offscreen textarea) for
    contexts where the async Clipboard API isn't available. */
async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to legacy path */ }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch {
    return false;
  }
}

/** Builds a plain-text, space-padded table (title + aligned 2-column rows
    [+ total]) suitable for pasting into an email or chat message. A
    Dimensions cell's "\n"-joined multi-line sizes are flattened to a single
    ", "-separated line here, since plain-text alignment can't represent a
    multi-line table cell without breaking every row after it. */
function buildShareTableText({ title, columns, rows, totalRow }) {
  if (rows.length === 0) return `${title}\nNo circuits selected`;

  const flatRows = rows.map(([a, b]) => [a, b.replace(/\s*\n+\s*/g, ", ")]);
  const measureRows = totalRow ? [...flatRows, totalRow] : flatRows;
  const colAWidth = Math.max(columns[0].length, ...measureRows.map(r => r[0].length));
  const colBWidth = Math.max(columns[1].length, ...measureRows.map(r => r[1].length));
  const sep = "-".repeat(colAWidth + colBWidth + 3);
  const padRow = ([a, b]) => `${a.padEnd(colAWidth)}   ${b.padEnd(colBWidth)}`;

  const lines = [title, sep, padRow(columns), sep, ...flatRows.map(padRow)];
  if (totalRow) lines.push(sep, padRow(totalRow));
  return lines.join("\n");
}

/** Briefly swaps a share button's icon/tooltip to confirm success/failure,
    then restores it after a couple seconds. */
function flashShareButton(btnEl, ok) {
  if (!btnEl) return;
  const iconEl = btnEl.querySelector(".material-symbols-outlined");
  if (!iconEl) return;
  clearTimeout(btnEl._shareFlashTimer);
  const prevIcon = btnEl.dataset.baseIcon || iconEl.textContent;
  btnEl.dataset.baseIcon = prevIcon;
  const prevTitle = btnEl.dataset.baseTitle || btnEl.getAttribute("title") || "";
  btnEl.dataset.baseTitle = prevTitle;

  iconEl.textContent = ok ? "check" : "error";
  btnEl.setAttribute("title", ok ? "Copied!" : "Copy failed");
  btnEl.classList.toggle("bk-share-success", ok);
  btnEl.classList.toggle("bk-share-error", !ok);

  btnEl._shareFlashTimer = setTimeout(() => {
    iconEl.textContent = prevIcon;
    btnEl.setAttribute("title", prevTitle);
    btnEl.classList.remove("bk-share-success", "bk-share-error");
  }, 1800);
}

/** Copies a floating panel's currently-displayed rows to the clipboard as a
    plain-text table. Reads straight from the DOM (readCardRows), same as
    the screenshot compositor, so it always matches what's on screen
    (including merged Gewan-style rows and multi-line Dimensions cells). */
async function shareCardAsText(btnEl, tbody, spec) {
  const text = buildShareTableText({ ...spec, rows: readCardRows(tbody) });
  const ok = await copyTextToClipboard(text);
  flashShareButton(btnEl, ok);
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

  await Promise.all([updateDetailsPanel(resolvedIds), updateDimensionsPanel(resolvedIds)]);

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
    dom.panel.style.transform = ""; // clear the inline override from transitionend so the next enter animates from the CSS base state again
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

  try {
    await ensureMapInit();
  } catch {
    return; // ensureMapInit already logged + surfaced a notice
  }
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
    labelsBtn: document.getElementById("bkMapLabelsToggle"),
    trafficBtn: document.getElementById("bkMapTrafficToggle"),
    modalBox: document.getElementById("bkModalBox"),
    backBtn: document.getElementById("bkMapBackBtn"),
    screenshotBtn: document.getElementById("bkMapScreenshotBtn"),
    detailsBtn: document.getElementById("bkMapDetailsToggle"),
    detailsPanel: document.getElementById("bkMapDetailsPanel"),
    detailsBody: document.getElementById("bkMapDetailsBody"),
    detailsTotal: document.getElementById("bkMapDetailsTotal"),
    detailsShareBtn: document.getElementById("bkMapDetailsShareBtn"),
    dimensionsBtn: document.getElementById("bkMapDimensionsToggle"),
    dimensionsPanel: document.getElementById("bkMapDimensionsPanel"),
    dimensionsBody: document.getElementById("bkMapDimensionsBody"),
    dimensionsShareBtn: document.getElementById("bkMapDimensionsShareBtn")
  };
  if (!dom.toggle || !dom.panel || !dom.canvas) return;

  dom.toggle.checked = false;
  dom.panel.hidden = true;
  panelOpen = false;
  labelsOn = true;
  trafficOn = false;
  detailsOn = false;
  dimensionsOn = false;
  dom.detailsPanel?.setAttribute("hidden", "");
  dom.dimensionsPanel?.setAttribute("hidden", "");

  dom.toggle.addEventListener("change", onToggleChange);
  dom.dimBtn?.addEventListener("click", toggle2D3D);
  dom.labelsBtn?.addEventListener("click", toggleLabels);
  dom.trafficBtn?.addEventListener("click", toggleTraffic);
  dom.detailsBtn?.addEventListener("click", toggleDetails);
  dom.dimensionsBtn?.addEventListener("click", toggleDimensions);
  dom.screenshotBtn?.addEventListener("click", captureScreenshot);
  dom.detailsShareBtn?.addEventListener("click", () => shareCardAsText(dom.detailsShareBtn, dom.detailsBody, {
    title: "Selected Circuits",
    columns: ["Circuit", "Faces"],
    totalRow: ["Total", dom.detailsTotal?.textContent || "0"]
  }));
  dom.dimensionsShareBtn?.addEventListener("click", () => shareCardAsText(dom.dimensionsShareBtn, dom.dimensionsBody, {
    title: "Circuit Dimensions",
    columns: ["Circuit", "Dimension"]
  }));
  // Mobile/tablet fullscreen back button — only visible under 900px (see
  // .bk-map-back-btn in bookings.css); just flips the same toggle switch
  // the desktop layout uses, so onToggleChange's teardown path is shared.
  dom.backBtn?.addEventListener("click", () => {
    dom.toggle.checked = false;
    onToggleChange({ target: dom.toggle });
  });

  // Once the enter transition finishes, drop the (by-then no-op) transform
  // entirely rather than leaving translate(0,0) applied forever — a
  // permanently-transformed ancestor keeps the element on its own
  // compositing layer, which some GPU/driver combos render a WebGL canvas
  // blank under. Also resize() once more in case the container's measured
  // box was briefly affected mid-transition. Widescreen reveals via
  // flex-basis instead of transform, so watch for either.
  dom.panel.addEventListener("transitionend", e => {
    if ((e.propertyName !== "transform" && e.propertyName !== "flex-basis") || !dom.panel.classList.contains("bk-map-visible")) return;
    dom.panel.style.transform = "none";
    map?.resize();
  });

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
  if (trafficTimer) { clearInterval(trafficTimer); trafficTimer = null; }
  if (map) { map.remove(); map = null; }
  mapInitPromise = null;
  popup = null;
  visibleIds = new Set();
  geojsonCache.clear();
  pendingFetch.clear();
  idToLabel.clear();
  assetNameToId = null;
  nameToIdPromise = null;
  idToAssetRate = null;
  assetRatePromise = null;
  panelOpen = false;
  is3D = true;
  labelsOn = true;
  trafficOn = false;
  detailsOn = false;
  dimensionsOn = false;
  standardBasemapIndex = 0;
  standardBasemapFellBack = false;
  dom = {};
}
