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
const MARKER_COLOR = "#981e32"; // --sp-brand

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

function statusClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "live") return "sp-popup-pill-live";
  if (s === "pending") return "sp-popup-pill-pending";
  if (s === "completed") return "sp-popup-pill-completed";
  if (s === "cancelled") return "sp-popup-pill-cancelled";
  return "sp-popup-pill-signed"; // BO Signed / anything else
}

function popupHTML(asset) {
  const bookings = asset.bookings || [];
  const bookingsHTML = bookings.length
    ? bookings.map(b => `
        <div class="sp-popup-booking">
          <div class="sp-popup-brand">${escapeHTML(b["Brand Campaign"] || "—")}</div>
          <div class="sp-popup-client">${escapeHTML(b.Client || "—")} · Slot ${escapeHTML(b.Slot || 1)}</div>
          <div class="sp-popup-dates">${escapeHTML(b["Start Date"] || "—")} → ${escapeHTML(b["End Date"] || "—")}</div>
          <span class="sp-popup-pill ${statusClass(b.Status)}">${escapeHTML(b.Status || "—")}</span>
        </div>
      `).join("")
    : `<div class="sp-popup-empty">No bookings on record.</div>`;
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

/**
 * Renders the supplier map into `container` and plots every asset's
 * geometry. `assets` is the array returned by getSupplierPortalData:
 * [{ id, name, Circuits, bookings: [...] }].
 * `onNotice(message)` is called once per asset that couldn't be plotted
 * (missing/failed KML), so the caller can surface it in the UI without the
 * map itself needing to know about the page's DOM.
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
  let plotted = 0;

  for (const asset of assets) {
    const geojson = await fetchAssetGeoJSON(asset.id);
    if (!geojson) { onNotice?.(`No map data for "${asset.name || asset.id}"`); continue; }

    const srcId = `sp-src-${asset.id}`;
    const layerId = `sp-circle-${asset.id}`;
    map.addSource(srcId, { type: "geojson", data: geojson });
    map.addLayer({
      id: layerId, type: "circle", source: srcId,
      paint: {
        "circle-radius": 9,
        "circle-color": MARKER_COLOR,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.on("click", layerId, e => {
      const f = e.features?.[0];
      if (!f) return;
      popup.setLngLat(f.geometry.coordinates.slice()).setHTML(popupHTML(asset)).addTo(map);
    });
    map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });

    geojson.features.forEach(f => {
      if (f.geometry?.type === "Point") { bounds.extend(f.geometry.coordinates); plotted++; }
    });
  }

  if (plotted) map.fitBounds(bounds, { padding: 60, duration: 0 });

  return map;
}
