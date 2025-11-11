import { auth, db } from "../../firebase/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { loadMapLinks } from "./map.js";
import { loadInventory } from "./inventory.js";
import { initFullscreen } from "./fullscreen.js";




document.addEventListener("DOMContentLoaded", () => {
  const logoutText = document.getElementById("logoutText");
  const container = document.querySelector(".container");

  onAuthStateChanged(auth, user => {
    console.log("Auth status:", user);

    if (!user) {
      console.log("User not logged in, redirecting...");
      window.location.href = "./login.html";
      return;
    }

    console.log("User logged in, loading data...");

    container.style.display = "block";

    initFullscreen();  
    loadMapLinks().catch(err => console.error("Map load error:", err));
    loadInventory().catch(err => console.error("Inventory load error:", err));
  });

  logoutText.addEventListener("click", () => {
    signOut(auth).then(() => {
      console.log("User logged out");
      window.location.href = "./login.html";
    });
  });
});
