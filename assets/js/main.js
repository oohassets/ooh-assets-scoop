import { requireAuth } from "./authGuard.js";
import { auth, messaging, rtdb } from "../../firebase/firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getToken } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

import { loadMapLinks } from "./map.js";
//import { loadInventory } from "./inventory.js";
import { initFullscreen } from "./fullscreen.js";

async function initPush(user) {
  try {
    if (!("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: "YOUR_KEY",
      serviceWorkerRegistration: registration
    });

    if (token) {
      await set(ref(rtdb, "fcmTokens/" + user.uid + "/" + token), {
        token,
        email: user.email,
        lastUpdated: Date.now()
      });
    }
  } catch (err) {
    console.error("Push error:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const logoutText = document.getElementById("logoutText");
  const inventoryBtn = document.getElementById("openInventoryBtn");

  // 🔐 PROTECT PAGE
  requireAuth(async (user) => {
    const container = document.querySelector(".container");
    container.style.display = "block";

    await initPush(user);

    initFullscreen();
    loadMapLinks().catch(console.error);
    loadInventory().catch(console.error);
  });

  // 🚪 Logout
  if (logoutText) {
    logoutText.addEventListener("click", () => {
      signOut(auth).then(() => {
        window.location.href = "./login.html";
      });
    });
  }

  // 📄 Open Inventory
  if (inventoryBtn) {
    inventoryBtn.addEventListener("click", () => {
      window.open("content-inventory.html", "_blank");
    });
  }
});