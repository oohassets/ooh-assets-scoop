import { auth, db, rtdb } from "../../firebase/firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// A client-portal account (see clientUsers/database.rules.json) can still
// authenticate here — Firebase Auth itself has no concept of "portal", it's
// the same project for both — but it must never be let into the internal
// app. Reading "user" is what actually decides that: root .read grants any
// signed-in *staff* account access to it, but a clientUsers-listed account
// gets a hard .read:false there (and everywhere else), so this throws
// permission-denied specifically for them. That's the signal to sign them
// back out and send them to where they actually belong, right here at the
// login gate — not after they've already loaded the internal shell (see
// app.js's loadUserProfile(), which does the same check as a defense-in-depth
// backstop for the case of an existing session landing directly on
// index.html without going through this page at all).
function isPermissionDenied(e) {
  return e.code === "PERMISSION_DENIED" || /permission_denied/i.test(e.message || "");
}

// signInWithEmailAndPassword() itself triggers onAuthStateChanged, so a
// fresh sign-in would otherwise call this twice (once from the click
// handler's own .then, once from the listener) — guard so only the first
// call actually runs.
let routed = false;
async function routeAfterAuth(loginMessage) {
  if (routed) return;
  routed = true;
  try {
    await get(ref(rtdb, "user"));
    window.location.href = "index.html";
  } catch (e) {
    if (isPermissionDenied(e)) {
      await signOut(auth).catch(() => {});
      if (loginMessage) {
        loginMessage.style.color = "red";
        loginMessage.textContent = "This account isn't for the internal dashboard — redirecting to the client portal...";
      }
      setTimeout(() => { window.location.href = "./client-portal/login.html"; }, 900);
      return;
    }
    console.error("[SCOOP] Failed to verify account:", e);
    window.location.href = "index.html";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginScreen = document.getElementById("loginScreen");
  const loginBtn = document.getElementById("loginBtn");
  const username = document.getElementById("username");
  const password = document.getElementById("password");
  const loginMessage = document.getElementById("loginMessage");

  onAuthStateChanged(auth, user => {
    if (user) routeAfterAuth(loginMessage);
  });

  loginBtn.addEventListener("click", async () => {
    const email = username.value.trim();
    const pass = password.value.trim();

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      loginMessage.style.color = "green";
      loginMessage.textContent = "Login successful...";

      setTimeout(() => {
        routeAfterAuth(loginMessage);
      }, 600);

    } catch (error) {
      loginMessage.style.color = "red";
      loginMessage.textContent = "Username or Password is incorrect";
    }
  });
});
