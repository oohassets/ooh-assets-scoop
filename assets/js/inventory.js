import { db } from "../../firebase/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("contentInventoryBtn");
  const wrapper = document.getElementById("inventoryWrapper");

  if (!btn || !wrapper) {
    console.error("❌ Missing DOM elements for inventory.");
    return;
  }

  // Handle button click (toggle)
  btn.addEventListener("click", async () => {
    if (wrapper.classList.contains("show")) {
      wrapper.classList.remove("show");
      setTimeout(() => (wrapper.style.display = "none"), 300);
    } else {
      wrapper.style.display = "block";
      await loadInventory();
      setTimeout(() => wrapper.classList.add("show"), 10);
    }
  });

  // Handle ESC key to close iframe
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && wrapper.classList.contains("show")) {
      wrapper.classList.remove("show");
      setTimeout(() => (wrapper.style.display = "none"), 300);
    }
  });
});
