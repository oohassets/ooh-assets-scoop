import { auth, db } from "./firebase/firebase.js";

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

// DOM ELEMENTS (DEFINE THEM HERE)
const loginScreen = document.getElementById("loginScreen");
const loginBtn = document.getElementById("loginBtn");
const username = document.getElementById("username");
const password = document.getElementById("password");
const loginMessage = document.getElementById("loginMessage");
const logoutText = document.getElementById("logoutText");

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

// LOGIN HANDLER
loginBtn.addEventListener("click", async () => {
  const email = username.value.trim();
  const pass = password.value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, pass);

    loginMessage.style.color = "green";
    loginMessage.textContent = "Login successful!";

    setTimeout(() => {
      loginScreen.style.display = "none";
      document.querySelector(".container").style.display = "block";
      loadMapLinks();
      loadInventory();
    }, 600);

  } catch (error) {
    loginMessage.style.color = "#c00";
    loginMessage.textContent = error.message;
  }
});

// AUTO LOGIN CHECK
function checkLoginStatus() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginScreen.style.display = "none";
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
    loginScreen.style.display = "flex";
  });
};

// LOAD MAP LINKS
async function loadMapLinks() {
  const container = document.getElementById("assetLinks");
  container.innerHTML = "";

  const snapshot = await getDocs(collection(db, "maps"));

  snapshot.forEach((docItem) => {
    const data = docItem.data();
    const a = document.createElement("a");
    a.textContent = data.name;
    a.dataset.map = data.url;
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

// MAP LINK CLICK EVENTS
function attachMapEvents() {
  document.querySelectorAll("#assetLinks a").forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      document.getElementById("mapIframe").src = link.dataset.map;

      document
        .querySelectorAll("#assetLinks a")
        .forEach((l) => l.classList.remove("active"));

      link.classList.add("active");
    };
  });
}
