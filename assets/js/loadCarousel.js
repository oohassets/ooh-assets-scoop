import { db } from "../../firebase/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/**
 * Load a Firestore document by name and return data or null
 */
async function loadTable(tableName) {
  try {
    const tableRef = doc(db, "inventory", tableName);
    const snap = await getDoc(tableRef);

    if (snap.exists()) {
      return snap.data();  // Firestore JSON data
    } else {
      console.warn(`⚠️ No document found: inventory/${tableName}`);
      return null;
    }
  } catch (err) {
    console.error(`❌ Error loading ${tableName}:`, err);
    return null;
  }
}

/**
 * Create & inject a carousel card containing JSON data
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
 * Load all tables and populate carousel
 */
export async function loadCarousel() {
  const carousel = document.getElementById("jsonCarousel");

  if (!carousel) {
    console.error("❌ Missing #jsonCarousel element in DOM");
    return;
  }

  // 🔹 Add your table names here (these match your Firestore docs)
  const tableNames = [
    "Inventory",
    "DigitalScreens",
    "Campaigns",
    "StaticAssets",
    "ContentSummary"
  ];

  for (const name of tableNames) {
    const data = await loadTable(name);
    if (data) {
      const card = createCard(name, data);
      carousel.appendChild(card);
    }
  }
}

/**
 * Auto-run when page loads
 */
document.addEventListener("DOMContentLoaded", () => {
  loadCarousel();
});

