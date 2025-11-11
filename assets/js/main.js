import { auth } from "../firebase/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { loadMapLinks } from "./map.js";
import { loadInventory } from "./inventory.js";

document.addEventListener("DOMContentLoaded", () => {
  const logoutText = document.getElementById("logoutText");

  onAuthStateChanged(auth, user => {
    if (!user) {
      window.location.href = "./login.html";
    } else {
      document.querySelector(".container").style.display = "block";
      loadMapLinks();
      loadInventory();
    }
  });

  logoutText.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.href = "./login.html";
    });
  });
});

