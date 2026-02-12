import { auth, db, messaging, rtdb } from "../../firebase/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getToken } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

import { loadMapLinks } from "./map.js";
import { loadInventory } from "./inventory.js";
import { initFullscreen } from "./fullscreen.js";


async function initPush(user) {
  try {
    if (!("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    // Wait for the already-registered PWA service worker
    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: "BOEOz9dvragMRiAJHTr0DpF8NUxJR_C3ppqtIeNG3C27--2cIHBAV_yfduVWx0gNNjQU72g0-9YvqdQVUgMNxK0",
      serviceWorkerRegistration: registration
    });

    if (token) {
      console.log("FCM Token:", token);

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
  const container = document.querySelector(".container");
  const inventoryBtn = document.getElementById("openInventoryBtn");

  // 🔐 Auth check
  onAuthStateChanged(auth, async user => {
    console.log("Auth status:", user);

    if (!user) {
      console.log("User not logged in, redirecting...");
      window.location.href = "./login.html";
      return;
    }

    console.log("User logged in, loading data...");
    container.style.display = "block";

    await initPush(user); // 🔔 Initialize push after login


    initFullscreen();
    loadMapLinks().catch(err => console.error("Map load error:", err));
    loadInventory().catch(err => console.error("Inventory load error:", err));
  });

  // 🚪 Logout
  if (logoutText) {
    logoutText.addEventListener("click", () => {
      signOut(auth).then(() => {
        console.log("User logged out");
        window.location.href = "./login.html";
      });
    });
  }

  // 📄 Open Content Inventory (NEW PAGE)
  if (inventoryBtn) {
    inventoryBtn.addEventListener("click", () => {
      window.open("content-inventory.html", "_blank");
    });
  }
});
