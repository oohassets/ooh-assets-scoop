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
// Fixed pie-slice split for a circuit currently running more than one
// category at once (it has multiple Slots — see oohassets.Slot — each on
// its own active booking, e.g. Slot 1 Live + Slot 2 Pending) — not
// proportional to how many bookings/slots are actually in each category,
// a flat 50/30/20 weighting by category regardless of the mix.
const CATEGORY_WEIGHT = { live: 50, booked: 30, pending: 20 };

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

/** A booking counts toward a map category based on today's date vs. its own
    Start/End Date — not just because some booking on this circuit was ever
    marked Live/BO Signed/Pending at some point in its full history
    (asset.bookings is the complete unfiltered history, see
    getSupplierPortalData). Without this check, a circuit that had ever run
    one Live campaign stays permanently stuck in "live" for every other
    booking on it too, since Live outranks Booked/Pending in priority.

    The date rule differs by category, deliberately:
    - "Live" only needs Start Date <= today — it does NOT also require
      End Date >= today. A Live campaign commonly keeps running past its
      original scheduled End Date without the record being updated (that's
      exactly what the stat card's "Extended" pill flags); requiring the
      End Date to still be in the future would wrongly exclude every one of
      those still-genuinely-live-but-overrun bookings.
    - "Booked" (BO Signed) and "Pending" are inherently upcoming/
      not-yet-started statuses, so they don't require a Start Date already
      in the past — but they DO require End Date >= today, since a
      confirmed/pending booking whose window has already fully lapsed
      without ever going Live isn't "upcoming" anymore. */
function getActiveCategories(bookings) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cats = new Set();
  (bookings || []).forEach(b => {
    const s = (b.Status || "").toLowerCase();
    if (s.includes("live")) {
      const start = parseDate(b["Start Date"]);
      if (start && start <= today) cats.add("live");
    } else if (s.includes("signed") || s.includes("pending")) {
      const end = parseDate(b["End Date"]);
      if (end && end >= today) cats.add(s.includes("signed") ? "booked" : "pending");
    }
  });
  return CATEGORIES.filter(c => cats.has(c)); // stable live/booked/pending order
}

/** Same active-status definition as getActiveCategories() — Live/Booked
    (BO Signed)/Pending only. Completed and Cancelled bookings are real
    history but not relevant to "what's happening at this asset right now",
    so the popup leaves them out entirely rather than just deprioritizing
    them. */
function isActiveBooking(status) {
  const s = (status || "").toLowerCase();
  return s.includes("live") || s.includes("signed") || s.includes("pending");
}

/** conic-gradient() slice string for a multi-category pie marker — weights
    are CATEGORY_WEIGHT's fixed 50/30/20 split, renormalized across just the
    categories actually present (e.g. Live+Pending only -> 50/(50+20) and
    20/(50+20), not 50/20 of a non-existent Booked third). */
function buildPieBackground(categories) {
  const totalWeight = categories.reduce((sum, c) => sum + CATEGORY_WEIGHT[c], 0);
  let acc = 0;
  const stops = categories.map(c => {
    const from = (acc / totalWeight) * 100;
    acc += CATEGORY_WEIGHT[c];
    const to = (acc / totalWeight) * 100;
    return `${CATEGORY_COLOR[c]} ${from}% ${to}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
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
 * an active (Live/Booked/Pending) booking — see getActiveCategories(). `assets`
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
  const byCategory = { live: [], booked: [], pending: [] }; // single-category points -> circle layer
  const circuitIds = { live: new Set(), booked: new Set(), pending: new Set() };
  const markerCounts = { live: 0, booked: 0, pending: 0 };
  const assetByFeatureId = new Map(); // "<cat>:<index>" -> asset, for the click handler
  const pieMarkers = []; // { marker, categories } — multi-category points, rendered as DOM markers instead

  for (const asset of assets) {
    const activeCategories = getActiveCategories(asset.bookings);
    if (!activeCategories.length) continue; // no active booking — excluded from the map entirely

    const geojson = await fetchAssetGeoJSON(asset.id);
    if (!geojson) { onNotice?.(`No map data for "${asset.name || asset.id}"`); continue; }

    activeCategories.forEach(cat => circuitIds[cat].add(asset.id));

    geojson.features.forEach(f => {
      if (f.geometry?.type !== "Point") return;
      bounds.extend(f.geometry.coordinates);
      activeCategories.forEach(cat => { markerCounts[cat]++; });

      if (activeCategories.length === 1) {
        const cat = activeCategories[0];
        const key = `${cat}:${byCategory[cat].length}`;
        f.properties = { ...(f.properties || {}), spAssetKey: key };
        assetByFeatureId.set(key, asset);
        byCategory[cat].push(f);
        return;
      }

      // Multiple simultaneous active categories on this circuit — a plain
      // circle layer can only paint one solid color per feature, so this
      // needs an actual DOM element (conic-gradient pie) via
      // maplibregl.Marker instead of the data-driven circle layers below.
      const el = document.createElement("div");
      el.className = "sp-pie-marker";
      el.style.background = buildPieBackground(activeCategories);
      el.title = asset.name || asset.Circuits || asset.id;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(f.geometry.coordinates)
        .addTo(map);
      // stopPropagation — a custom Marker element's click event still
      // bubbles up through the map container (it's a DOM node overlaid on
      // the map, not part of the click-driven circle layers below), which
      // otherwise reaches MapLibre's own "click elsewhere closes the open
      // popup" handling and immediately closes the popup this click just
      // opened.
      el.addEventListener("click", e => {
        e.stopPropagation();
        popup.setLngLat(f.geometry.coordinates.slice()).setHTML(popupHTML(asset)).addTo(map);
      });
      pieMarkers.push({ marker, categories: activeCategories });
    });
  }

  const counts = { live: {}, booked: {}, pending: {} };
  for (const cat of CATEGORIES) {
    counts[cat] = { circuits: circuitIds[cat].size, markers: markerCounts[cat] };
    const features = byCategory[cat];
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

  const categoryVisible = { live: true, booked: true, pending: true };
  function setCategoryVisible(cat, visible) {
    categoryVisible[cat] = visible;
    const { circle } = layerIds(cat);
    if (map.getLayer(circle)) map.setLayoutProperty(circle, "visibility", visible ? "visible" : "none");
    // A pie marker stays visible as long as ANY of its active categories is
    // still toggled on — hiding "Booked" shouldn't also hide a circuit
    // that's simultaneously Live just because Booked is one of its slices.
    // Its pie itself is rebuilt from only the still-visible categories each
    // time, so toggling one off shrinks the marker down to just the
    // remaining slice(s) instead of leaving a now-hidden category's color
    // baked into the wedge — down to a single category, buildPieBackground()
    // naturally renders that as one full solid color, not a sliver.
    pieMarkers.forEach(({ marker, categories }) => {
      const visibleCats = categories.filter(c => categoryVisible[c]);
      const el = marker.getElement();
      if (!visibleCats.length) { el.style.display = "none"; return; }
      el.style.display = "";
      el.style.background = buildPieBackground(visibleCats);
    });
  }

  return { map, counts, setCategoryVisible };
}
