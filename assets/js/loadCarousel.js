import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/**
 * Fetch ALL top-level nodes (tables)
 */
async function loadAllTables() {
  try {
    const rootRef = ref(rtdb, "/");  // <-- FIXED: use rtdb
    const snap = await get(rootRef);

    if (snap.exists()) {
      return snap.val();
    } else {
      console.warn("⚠️ Realtime Database is empty.");
      return {};
    }
  } catch (error) {
    console.error("❌ Error loading database:", error);
    return {};
  }
}

/**
 * Create card
 */
function createCard(title, data) {
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <h2>${title}</h2>
    <pre>${JSON.stringify(data, null, 2)}</pre>
  `;

  return card;
}

/**
 * Load carousel
 */
export async function loadCarouselRTDB() {
  const carousel = document.getElementById("jsonCarousel");

  if (!carousel) {
    console.error("❌ Missing #jsonCarousel element");
    return;
  }

  const allTables = await loadAllTables();

  for (const tableName in allTables) {
    const card = createCard(tableName, allTables[tableName]);
    carousel.appendChild(card);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadCarouselRTDB();
});
