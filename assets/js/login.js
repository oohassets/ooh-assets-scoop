import { auth } from "../../firebase/firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const loginScreen = document.getElementById("loginScreen");
  const loginBtn = document.getElementById("loginBtn");
  const username = document.getElementById("username");
  const password = document.getElementById("password");
  const loginMessage = document.getElementById("loginMessage");

  onAuthStateChanged(auth, user => {
    if (user) window.location.href = "index.html";
  });

  loginBtn.addEventListener("click", async () => {
    const email = username.value.trim();
    const pass = password.value.trim();

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      loginMessage.style.color = "green";
      loginMessage.textContent = "Login successful...";

      setTimeout(() => {
        window.location.href = "index.html";
      }, 600);

    } catch (error) {
      loginMessage.style.color = "red";
      loginMessage.textContent = error.message;
    }
  });
});

