import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// SPLASH SCREEN
window.addEventListener("load", () => {
  const splash = document.getElementById("splash-screen");
  const logo = document.getElementById("splash-logo");
  logo.classList.add("visible");

  setTimeout(() => {
    splash.classList.add("fade-out");
    setTimeout(() => {
      splash.remove();
      checkLoginStatus();
    }, 900);
  }, 2200);
});

// LOGIN
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = username.value.trim();
  const pass = password.value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    loginMessage.style.color = "green";
    loginMessage.textContent = "Login successful!";

    setTimeout(() => {
      login-screen.style.display = "none";
      document.querySelector(".container").style.display = "block";
      loadMapLinks();
      loadInventory();
    }, 600);

  } catch (error) {
    loginMessage.style.color = "#c00";
    loginMessage.textContent = error.message;
  }
});

// AUTO LOGIN
function checkLoginStatus() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      login-screen.style.display = "none";
      document.querySelector(".container").style.display = "block";
      loadMapLinks();
      loadInventory();
    }
  });
}

// LOGOUT
logoutText.onclick = () => {
  signOut(auth).then(() => {
    document.querySelector(".container").style.display = "none";
    login-screen.style.display = "flex";
  });
};

// LOAD MAP LINKS
async function loadMapLinks() {
  const container = document.getElementById("assetLinks");
  container.innerHTML = "";

  const snapshot = await getDocs(collection(db, "maps"));

  snapshot.forEach((doc) => {
    const a = document.createElement("a");
    a.textContent = doc.data().name;
    a.dataset.map = doc.data().url;
    container.appendChild(a);
  });

  attachMapEvents();
}

// LOAD INVENTORY
async function loadInventory() {
  const ref = doc(db, "inventory", "contentInventory");
  const snap = await getDoc(ref);

  if (snap.exists()) {
    document.getElementById("inventoryIframe").src = snap.data().iframeUrl;
  }
}

// CLICK EVENTS FOR MAP LINKS
function attachMapEvents() {
  document.querySelectorAll(".asset-links a").forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      document.getElementById("mapIframe").src = link.dataset.map;
      document.querySelectorAll(".asset-links a").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
    };
  });
}

