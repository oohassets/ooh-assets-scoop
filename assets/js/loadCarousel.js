import { db } from "../../firebase/firebase.js";
import { ref, get, child } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/**
 * Fetch ALL top-level nodes (tables) in RTDB
 */
async function loadAllTables() {
  try {
    const rootRef = ref(db);
    const snap = await get(rootRef);

    if (snap.exists()) {
      return snap.val();   // return the whole database
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
 * Create a card element
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
 * Load everything into carousel
 */
export async function loadCarouselRTDB() {
  const carousel = document.getElementById("jsonCarousel");

  if (!carousel) {
    console.error("❌ Missing #jsonCarousel element");
    return;
  }

  const allTables = await loadAllTables();

  for (const tableName in allTables) {
    const tableData = allTables[tableName];
    const card = createCard(tableName, tableData);
    carousel.appendChild(card);
  }
}

/**
 * Auto-run when the page loads
 */
document.addEventListener("DOMContentLoaded", () => {
  loadCarouselRTDB();
});
