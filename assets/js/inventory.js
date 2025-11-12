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

  if (!inventoryBtn || !inventoryWrapper) {
    console.error("❌ Missing button or inventory wrapper in DOM");
    return;
  }

  // --- Inventory button ---
  inventoryBtn.addEventListener("click", async () => {
    // If iframe hidden — show and try fullscreen
    if (inventoryWrapper.style.display !== "block") {
      inventoryWrapper.style.display = "block";
      await loadInventory();

      try {
        // Try entering fullscreen mode
        if (inventoryWrapper.requestFullscreen) {
          await inventoryWrapper.requestFullscreen();
        } else {
          // Fallback for Safari/iOS
          inventoryWrapper.classList.add("fullscreen-wrapper");
          document.body.classList.add("no-scroll");
        }
      } catch (error) {
        console.warn("Fullscreen failed:", error);
        inventoryWrapper.classList.add("fullscreen-wrapper");
        document.body.classList.add("no-scroll");
      }
    } 
    // If already visible — close it
    else {
      closeInventory();
    }
  });

  // --- Fullscreen change listener ---
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      closeInventory();
    }
  });

  // --- ESC key close ---
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeInventory();
    }
  });

  // --- Helper function to close ---
  function closeInventory() {
    inventoryWrapper.classList.remove("fullscreen-wrapper");
    inventoryWrapper.style.display = "none";
    document.body.classList.remove("no-scroll");

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
});
