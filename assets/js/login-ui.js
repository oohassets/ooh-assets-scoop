import { initTheme } from "./theme.js";

initTheme();

// PASSWORD TOGGLE
document.getElementById("pwToggle").addEventListener("click", function () {
  const pw = document.getElementById("password");
  const isText = pw.type === "text";
  pw.type = isText ? "password" : "text";
  this.querySelector(".material-symbols-outlined").textContent = isText ? "visibility" : "visibility_off";
});

// ENTER KEY
document.getElementById("password").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});
document.getElementById("username").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("password").focus();
});
