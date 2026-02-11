import { db } from "../../firebase/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export async function loadInventory() {
  const inventoryDoc = doc(db, "inventory", "contentInventory");
  const snap = await getDoc(inventoryDoc);

  if (snap.exists()) {
    document.getElementById("inventoryIframe").src = snap.data().iframeUrl;
  } else {
    console.error("Inventory document not found in Firestore");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const inventoryBtn = document.getElementById("contentInventoryBtn");
  const inventoryWrapper = document.getElementById("inventoryWrapper");
  const closeBtn = document.getElementById("closeInventoryBtn");

  if (!inventoryBtn || !inventoryWrapper) {
    console.error("❌ Missing inventory elements in DOM");
    return;
  }

  // --- Open Inventory ---
  inventoryBtn.addEventListener("click", async () => {
    if (inventoryWrapper.style.display !== "block") {
      inventoryWrapper.style.display = "block";
      await loadInventory();

      try {
        if (inventoryWrapper.requestFullscreen) {
          await inventoryWrapper.requestFullscreen();
        } else {
          inventoryWrapper.classList.add("fullscreen-wrapper");
          document.body.classList.add("no-scroll");
        }
      } catch (error) {
        console.warn("Fullscreen failed:", error);
        inventoryWrapper.classList.add("fullscreen-wrapper");
        document.body.classList.add("no-scroll");
      }
    }
  });

  // --- Close button ---
  closeBtn.addEventListener("click", closeInventory);

  // --- ESC key ---
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeInventory();
  });

  // --- Fullscreen change ---
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) closeInventory();
  });

  function closeInventory() {
    inventoryWrapper.classList.remove("fullscreen-wrapper");
    inventoryWrapper.style.display = "none";
    document.body.classList.remove("no-scroll");

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
});
