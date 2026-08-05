/* Client portal sign-in. Uses the same Firebase Auth project as the
 * internal app (firebase/firebase.js is just SDK bootstrap config, not app
 * logic, so importing it doesn't couple this folder to the internal
 * pages/router/views) — but membership in the client portal itself is
 * enforced server-side by getClientPortalData (see functions/index.js),
 * never here. A staff account signing in here will still authenticate
 * (Firebase Auth has no concept of "portal"), it'll just get a clear
 * "not a registered client" message on the dashboard once it tries to
 * fetch data — never any actual booking data. */
import { auth } from "../../firebase/firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const emailEl = document.getElementById("cpEmail");
const passEl  = document.getElementById("cpPassword");
const btn     = document.getElementById("cpLoginBtn");
const msgEl   = document.getElementById("cpLoginMsg");

onAuthStateChanged(auth, user => {
  if (user) window.location.href = "./dashboard.html";
});

// Fast, client-side domain check — not the actual security boundary (that's
// getClientPortalData's userClient lookup, see the file header), just
// quicker, clearer feedback than a round-trip to Firebase Auth for someone
// who typed their staff/supplier email into this login by mistake. Runs on
// blur (leaving the field), not just on Sign In click.
function checkEmailDomain() {
  const email = emailEl.value.trim().toLowerCase();
  // Wait for "@" before flagging anything — otherwise every keystroke of
  // the local part (before the user's even reached the domain) falsely
  // trips the error.
  if (email.includes("@") && !email.includes("scoop.client")) {
    msgEl.textContent = "This login is for Client accounts only.";
    return false;
  }
  msgEl.textContent = "";
  return true;
}
emailEl.addEventListener("blur", checkEmailDomain);

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

document.getElementById("cpPwToggle")?.addEventListener("click", function () {
  const isText = passEl.type === "text";
  passEl.type = isText ? "password" : "text";
  this.querySelector(".material-symbols-outlined").textContent = isText ? "visibility" : "visibility_off";
});
