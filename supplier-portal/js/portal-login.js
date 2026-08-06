/* Supplier portal sign-in. Uses the same Firebase Auth project as the
 * internal app and the client portal (firebase/firebase.js is just SDK
 * bootstrap config, not app logic, so importing it doesn't couple this
 * folder to either) — but membership in the supplier portal itself is
 * enforced server-side by getSupplierPortalData (see functions/index.js),
 * never here. A staff or client account signing in here will still
 * authenticate (Firebase Auth has no concept of "portal"), it'll just get a
 * clear "not a registered supplier" message on the dashboard once it tries
 * to fetch data — never any actual booking data. */
import { auth } from "../../firebase/firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const emailEl = document.getElementById("spEmail");
const passEl  = document.getElementById("spPassword");
const btn     = document.getElementById("spLoginBtn");
const msgEl   = document.getElementById("spLoginMsg");

onAuthStateChanged(auth, user => {
  if (user) window.location.href = "./dashboard.html";
});

// Fast, client-side domain check — not the actual security boundary (that's
// getSupplierPortalData's userSupplier lookup, see the file header), just
// quicker, clearer feedback than a round-trip to Firebase Auth for someone
// who typed their staff/client email into this login by mistake.
function isValidUsername() {
  return emailEl.value.trim().toLowerCase().includes("scoop.supplier");
}

// Sign In button reveal gate (see .sp-login-btn-hidden in portal.css) — runs
// on every keystroke ("input") so the button appears live the moment the
// domain matches, rather than waiting for the field to be left.
function updateButtonVisibility() {
  btn.classList.toggle("sp-login-btn-hidden", !isValidUsername());
}

// Error message only — deliberately blur-only (not "input"), so nothing
// shows while the user is still mid-typing the local part of their
// address, only once they've actually left the field.
function updateMessage() {
  const email = emailEl.value.trim().toLowerCase();
  msgEl.textContent = (email.includes("@") && !isValidUsername())
    ? "This login is for Supplier accounts only."
    : "";
}

function checkEmailDomain() {
  updateButtonVisibility();
  updateMessage();
  return isValidUsername();
}
emailEl.addEventListener("input", updateButtonVisibility);
emailEl.addEventListener("blur", updateMessage);
updateButtonVisibility();

async function doSignIn() {
  const email = emailEl.value.trim();
  const pass  = passEl.value;
  if (!email || !pass) {
    msgEl.textContent = "Please enter your email and password.";
    return;
  }
  if (!checkEmailDomain()) return;
  btn.disabled = true;
  btn.textContent = "Signing in…";
  msgEl.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    window.location.href = "./dashboard.html";
  } catch (err) {
    msgEl.textContent = "Email or password is incorrect.";
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
}

btn.addEventListener("click", doSignIn);
passEl.addEventListener("keydown", e => { if (e.key === "Enter") doSignIn(); });
emailEl.addEventListener("keydown", e => { if (e.key === "Enter") passEl.focus(); });

document.getElementById("spPwToggle")?.addEventListener("click", function () {
  const isText = passEl.type === "text";
  passEl.type = isText ? "password" : "text";
  this.querySelector(".material-symbols-outlined").textContent = isText ? "visibility" : "visibility_off";
});
