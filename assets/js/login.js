import { auth, db, rtdb } from "../../firebase/firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// A client-portal or supplier-portal account (see userClient/userSupplier
// in database.rules.json) can still authenticate here — Firebase Auth itself
// has no concept of "portal", it's the same project for all three — but it
// must never be let into the internal app. Reading "user" is what actually
// decides that: root .read grants any signed-in *staff* account access to
// it, but a userClient- or userSupplier-listed account gets a hard
// .read:false there (and everywhere else), so this throws permission-denied
// specifically for them. RTDB rules have no way to tell which of the two
// portals such an account belongs to (both hit this same denial), so the
// signal just bounces them back to the hero page to pick the right one —
// not after they've already loaded the internal shell (see app.js's
// loadUserProfile(), which does the same check as a defense-in-depth backstop
// for the case of an existing session landing directly on index.html without
// going through this page at all).
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
        loginMessage.textContent = "This account isn't for the internal dashboard — redirecting...";
      }
      setTimeout(() => { window.location.href = "./home.html"; }, 900);
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

  // Fast, client-side domain check — not the actual security boundary
  // (that's the userClient/userSupplier root .read:false + this page's own
  // permission-denied bounce above), just quicker, clearer feedback than a
  // round-trip to Firebase Auth followed by a generic "wrong password"
  // message for someone who typed their client/supplier email into the
  // staff login by mistake.
  function isValidUsername() {
    return username.value.trim().toLowerCase().includes("scoop.assets");
  }

  // Sign In button reveal gate (see .login-btn-hidden in login.css) — runs
  // on every keystroke ("input") so the button appears live the moment the
  // domain matches, rather than waiting for the field to be left.
  function updateButtonVisibility() {
    loginBtn.classList.toggle("login-btn-hidden", !isValidUsername());
  }

  // Error message only — deliberately blur-only (not "input"), so nothing
  // shows while the user is still mid-typing the local part of their
  // address, only once they've actually left the field.
  function updateMessage() {
    const email = username.value.trim().toLowerCase();
    if (email.includes("@") && !isValidUsername()) {
      loginMessage.style.color = "red";
      loginMessage.textContent = "This login is for Scoop staff accounts only.";
    } else {
      loginMessage.textContent = "";
    }
  }

  function checkEmailDomain() {
    updateButtonVisibility();
    updateMessage();
    return isValidUsername();
  }
  username.addEventListener("input", updateButtonVisibility);
  username.addEventListener("blur", updateMessage);
  updateButtonVisibility();

  onAuthStateChanged(auth, user => {
    if (user) routeAfterAuth(loginMessage);
  });

  loginBtn.addEventListener("click", async () => {
    const email = username.value.trim();
    const pass = password.value.trim();

    if (!checkEmailDomain()) return;

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
