import { db } from "../firebase/firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/**
 * Convert various Google Maps/Sheets viewer/edit URLs into an embed-safe URL.
 * If the URL already looks embed-ready, returns it unchanged.
 */
function toEmbedUrl(raw) {
  if (!raw) return raw;
  try {
    // quick replacements for common formats
    return raw
      .replace("/viewer?", "/embed?")
      .replace("/edit?", "/embed?")
      .replace("/pubhtml", "/pubhtml") // keep pubhtml as-is for Sheets published
      + (raw.includes("embed?") || raw.includes("pubhtml") ? "" : "&noprof=1");
  } catch (e) {
    return raw;
  }
}

export async function loadMapLinks() {
  const container = document.getElementById("assetLinks");
  const mapIframe = document.getElementById("mapIframe");

  if (!container || !mapIframe) {
    console.warn("mapLinks: missing #assetLinks or #mapIframe in DOM");
    return;
  }

  container.innerHTML = "";

  let snapshot;
  try {
    snapshot = await getDocs(collection(db, "maps"));
  } catch (err) {
    console.error("Failed to fetch maps collection:", err);
    container.innerHTML = "<p class='error'>Failed to load maps.</p>";
    return;
  }

  // pick a default: prefer a doc named "Digital Screen" (case-insensitive),
  // otherwise prefer first document in result list.
  let firstUrl = null;
  const docs = snapshot.docs || []; // QuerySnapshot.docs is an array of QueryDocumentSnapshot

  // create links while searching for the digital-screen doc
  for (let i = 0; i < docs.length; i++) {
    const docItem = docs[i];
    const data = docItem.data() || {};
    const name = data.name || `Map ${i + 1}`;
    const rawUrl = data.url || "";

    const a = document.createElement("a");
    a.textContent = name;
    a.dataset.map = rawUrl;
    a.href = "#";
    container.appendChild(a);
  }

  // Find preferred "Digital Screen" doc (case-insensitive)
  const digitalDoc = docs.find(d => {
    const n = (d.data()?.name || "").toLowerCase();
    return n.includes("digital screen") || n.includes("digital");
  });

  if (digitalDoc) {
    firstUrl = toEmbedUrl(digitalDoc.data().url);
  } else if (docs.length > 0) {
    firstUrl = toEmbedUrl(docs[0].data().url);
  }

  if (firstUrl) {
    mapIframe.src = firstUrl;

    // mark the matching link active (match by normalized URL or name)
    const linkToActivate = Array.from(container.querySelectorAll("a")).find(a => {
      // compare raw dataset map after normalization too
      return toEmbedUrl(a.dataset.map) === toEmbedUrl(firstUrl) ||
             a.textContent.trim().toLowerCase().includes("digital");
    }) || container.querySelector("a");

    if (linkToActivate) linkToActivate.classList.add("active");
  }

  attachMapEvents();
}

function attachMapEvents() {
  document.querySelectorAll("#assetLinks a").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();

      const mapIframe = document.getElementById("mapIframe");
      if (!mapIframe) return;

      // use same embed-normalizer used on load
      const url = toEmbedUrl(link.dataset.map);
      mapIframe.src = url;

      document.querySelectorAll("#assetLinks a").forEach(l => l.classList.remove("active"));
      link.classList.add("active");
    });
  });
}
