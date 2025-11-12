import { db } from "../../firebase/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- Function to load the content inventory iframe ---
export async function loadInventory() {
  try {
    const inventoryDoc = doc(db, "inventory", "contentInventory");
    const snap = await getDoc(inventoryDoc);

    if (snap.exists()) {
      const iframe = document.getElementById("inventoryIframe");
      iframe.src = snap.data().iframeUrl;
    } else {
      console.error("❌ Inventory document not found in Firestore");
    }
  } catch (err) {
    console.error("⚠️ Error loading inventory:", err);
  }
}

// --- Wait for DOM to load, then attach the click listener ---
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("contentInventoryBtn");
  const wrapper = document.getElementById("inventoryWrapper");

  if (!btn) {
    console.error("❌ contentInventoryBtn not found in DOM");
    return;
  }

  btn.addEventListener("click", async () => {
    // Toggle visibility
    if (wrapper.style.display === "block") {
      wrapper.style.display = "none";
    } else {
      await loadInventory();
      wrapper.style.display = "block";
    }
  });
});
