/* Read-only static-asset map for the supplier portal.
 *
 * Reuses the exact MapLibre GL JS + KML->GeoJSON technique already proven in
 * assets/js/circuit-map.js (same CDN libs, same fetch-KML/DOMParser/toGeoJSON
 * pipeline, same "flat CARTO raster basemap" default view) — trimmed down to
 * the read-only subset this portal needs: no 3D buildings, no basemap
 * switcher, no traffic/screenshot export, just markers + popups.
 *
 * KML filename == oohassets.id (confirmed data model) — a missing/failed
 * fetch for a given asset is caught, logged, and that one asset is skipped
 * rather than aborting the whole map (assets can lack a KML file, e.g. newly
 * added locations not yet mapped). */

const MAPLIBRE_JS  = "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js";
const MAPLIBRE_CSS = "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css";
const TOGEOJSON_JS = "https://unpkg.com/@tmcw/togeojson@5.8.1/dist/togeojson.umd.js";

// Same CARTO Voyager tiles circuit-map.js uses as its "Default" view basemap.
const RETINA_SUFFIX = (window.devicePixelRatio || 1) >= 2 ? "@2x" : "";
const BASEMAP_TILES = ["a", "b", "c", "d"].map(
  s => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}${RETINA_SUFFIX}.png`
);
const BASEMAP_ATTRIBUTION = "&copy; OpenStreetMap &copy; CARTO";

// Same colors as the pills (.sp-popup-pill-live/signed/pending, and the
// internal app's .status-pill/.pill-*) — one marker color per active-status
// category, so a marker's color already tells you which bucket it's in
// before you even click it.
const CATEGORY_COLOR = { live: "#35B37E", booked: "#E5484D", pending: "#E0A13A" };
const CATEGORIES = ["live", "booked", "pending"];

let maplibregl = null;
let toGeoJSON  = null;
let libsPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
function loadCSS(href) {
  return new Promise(resolve => {
    if (document.querySelector(`link[href="${href}"]`)) { resolve(); return; }
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    l.onload = () => resolve();
    l.onerror = () => resolve(); // don't block map init on a stylesheet failure
    document.head.appendChild(l);
  });
}
function loadLibs() {
  if (libsPromise) return libsPromise;
  libsPromise = (async () => {
    await loadCSS(MAPLIBRE_CSS);
    await loadScript(MAPLIBRE_JS);
    await loadScript(TOGEOJSON_JS);
    maplibregl = window.maplibregl;
    toGeoJSON  = window.toGeoJSON || window.togeojson;
  })();
  return libsPromise;
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

// Same "MM/DD/YYYY" -> "1 Aug" convention as portal-dashboard.js's own
// parseDate()/fmtShort() (duplicated here rather than imported, same
// module-isolation reasoning as escapeHTML above).
function parseDate(str) {
  if (!str) return null;
  const p = str.split("/").map(Number);
  if (p.length < 3) return null;
  const d = new Date(p[2], p[0] - 1, p[1]);
  d.setHours(0, 0, 0, 0);
  return d;
}
function fmtShort(str) {
  const d = parseDate(str);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function statusClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "live") return "sp-popup-pill-live";
  if (s === "pending") return "sp-popup-pill-pending";
  if (s === "completed") return "sp-popup-pill-completed";
  if (s === "cancelled") return "sp-popup-pill-cancelled";
  return "sp-popup-pill-signed"; // BO Signed / anything else
}

/** An asset's map category is the highest-priority *active* status among its
    bookings — Live beats Booked (BO Signed) beats Pending — mirroring the
    same substring convention as bookings.js's getStatusClass()/dashboard.js's
    updateStats(). Completed/Cancelled bookings don't count toward any
    category; an asset whose bookings are only Completed/Cancelled/empty
    resolves to null and is left off the map entirely per spec ("show only
    which is live campaign, booked and pending campaign"). */
function categorizeAsset(bookings) {
  const statuses = (bookings || []).map(b => (b.Status || "").toLowerCase());
  if (statuses.some(s => s.includes("live"))) return "live";
  if (statuses.some(s => s.includes("signed"))) return "booked";
  if (statuses.some(s => s.includes("pending"))) return "pending";
  return null;
}

/** Same active-status definition as categorizeAsset() — Live/Booked
    (BO Signed)/Pending only. Completed and Cancelled bookings are real
    history but not relevant to "what's happening at this asset right now",
    so the popup leaves them out entirely rather than just deprioritizing
    them. */
function isActiveBooking(status) {
  const s = (status || "").toLowerCase();
  return s.includes("live") || s.includes("signed") || s.includes("pending");
}

function popupHTML(asset) {
  const bookings = (asset.bookings || []).filter(b => isActiveBooking(b.Status));
  const bookingsHTML = bookings.length
    ? bookings.map(b => `
        <div class="sp-popup-booking">
          <div class="sp-popup-brand">${escapeHTML(b["Brand Campaign"] || "—")}</div>
          <div class="sp-popup-client">${escapeHTML(b.Client || "—")} · Slot ${escapeHTML(b.Slot || 1)}</div>
          <div class="sp-popup-dates">${fmtShort(b["Start Date"])} → ${fmtShort(b["End Date"])}</div>
          <span class="sp-popup-pill ${statusClass(b.Status)}">${escapeHTML(b.Status || "—")}</span>
        </div>
      `).join("")
    : `<div class="sp-popup-empty">No active bookings on record.</div>`;
  return `<div class="sp-popup-name">${escapeHTML(asset.name || asset.Circuits || asset.id)}</div>${bookingsHTML}`;
}

/** Fetches + parses ../maps/{id}.kml to GeoJSON. Returns null (never throws)
    on a missing file, network failure, or unparsable XML. */
async function fetchAssetGeoJSON(id) {
  let res;
  try { res = await fetch(`../maps/${id}.kml`); }
  catch (e) { console.warn(`[supplier-map] failed to fetch KML for "${id}":`, e); return null; }
  if (!res.ok) { console.warn(`[supplier-map] no KML found for "${id}" (${res.status})`); return null; }

  const text = await res.text();
  const xml  = new DOMParser().parseFromString(text, "text/xml");
  if (xml.querySelector("parsererror")) {
    console.warn(`[supplier-map] KML for "${id}" failed to parse`);
    return null;
  }
  const geojson = toGeoJSON.kml(xml);
  if (!geojson.features?.length) return null;
  return geojson;
}

function layerIds(cat) {
  return { src: `sp-src-${cat}`, circle: `sp-circle-${cat}` };
}

/**
 * Renders the supplier map into `container` and plots every asset that has
 * an active (Live/Booked/Pending) booking — see categorizeAsset(). `assets`
 * is the array returned by getSupplierPortalData:
 * [{ id, name, Circuits, bookings: [...] }].
 * `onNotice(message)` is called once per asset that couldn't be plotted
 * (missing/failed KML), so the caller can surface it in the UI without the
 * map itself needing to know about the page's DOM.
 *
 * Returns `{ map, counts, setCategoryVisible(cat, visible) }` — `counts` is
 * `{ live: {circuits, markers}, booked: {...}, pending: {...} }` (`circuits`
 * = distinct assets in that category, `markers` = total plotted points
 * across all of them, since one circuit's KML can hold many individual
 * points), and setCategoryVisible() toggles that category's whole marker
 * layer on/off, for the clickable summary chips in portal-dashboard.js.
 */
export async function initSupplierMap(container, assets, onNotice) {
  await loadLibs();
  if (!maplibregl) throw new Error("window.maplibregl is undefined after script load — CDN blocked?");

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: { basemap: { type: "raster", tiles: BASEMAP_TILES, tileSize: 256, attribution: BASEMAP_ATTRIBUTION } },
      layers: [{ id: "basemap-layer", type: "raster", source: "basemap" }],
    },
    center: [51.543, 25.372], // Pearl Qatar / Qanat Quartier — where these assets sit
    zoom: 14,
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");

  await new Promise(resolve => map.on("load", resolve));

  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px", className: "sp-map-popup" });
  const bounds = new maplibregl.LngLatBounds();
  const byCategory = { live: [], booked: [], pending: [] };
  const circuitIds = { live: new Set(), booked: new Set(), pending: new Set() };
  const assetByFeatureId = new Map(); // "<cat>:<index>" -> asset, for the click handler

  for (const asset of assets) {
    const category = categorizeAsset(asset.bookings);
    if (!category) continue; // no active booking — excluded from the map entirely

    const geojson = await fetchAssetGeoJSON(asset.id);
    if (!geojson) { onNotice?.(`No map data for "${asset.name || asset.id}"`); continue; }

    geojson.features.forEach(f => {
      if (f.geometry?.type !== "Point") return;
      const key = `${category}:${byCategory[category].length}`;
      f.properties = { ...(f.properties || {}), spAssetKey: key };
      assetByFeatureId.set(key, asset);
      byCategory[category].push(f);
      circuitIds[category].add(asset.id);
      bounds.extend(f.geometry.coordinates);
    });
  }

  const counts = { live: {}, booked: {}, pending: {} };
  for (const cat of CATEGORIES) {
    const features = byCategory[cat];
    counts[cat] = { circuits: circuitIds[cat].size, markers: features.length };
    if (!features.length) continue;

    const { src, circle } = layerIds(cat);
    map.addSource(src, { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({
      id: circle, type: "circle", source: src,
      paint: {
        "circle-radius": 9,
        "circle-color": CATEGORY_COLOR[cat],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.on("click", circle, e => {
      const f = e.features?.[0];
      if (!f) return;
      const asset = assetByFeatureId.get(f.properties.spAssetKey);
      if (!asset) return;
      popup.setLngLat(f.geometry.coordinates.slice()).setHTML(popupHTML(asset)).addTo(map);
    });
    map.on("mouseenter", circle, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", circle, () => { map.getCanvas().style.cursor = ""; });
  }

  if (counts.live.markers + counts.booked.markers + counts.pending.markers) {
    map.fitBounds(bounds, { padding: 60, duration: 0 });
  }

  function setCategoryVisible(cat, visible) {
    const { circle } = layerIds(cat);
    if (map.getLayer(circle)) map.setLayoutProperty(circle, "visibility", visible ? "visible" : "none");
  }

  return { map, counts, setCategoryVisible };
}
