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
  // staff login by mistake. Runs on blur (leaving the field), not just on
  // Sign In click.
  function checkEmailDomain() {
    const email = username.value.trim().toLowerCase();
    // Wait for "@" before flagging anything — otherwise every keystroke of
    // the local part (before the user's even reached the domain) falsely
    // trips the error.
    if (email.includes("@") && !email.includes("scoop.assets")) {
      loginMessage.style.color = "red";
      loginMessage.textContent = "This login is for Scoop staff accounts only.";
      return false;
    }
    loginMessage.textContent = "";
    return true;
  }
  username.addEventListener("blur", checkEmailDomain);

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
