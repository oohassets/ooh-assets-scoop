import { auth } from "../../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

function getLoginUrl() {
  return window.location.pathname.includes("/pages/")
    ? "../home.html"
    : "./home.html";
}

export function requireAuth(onSuccess) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = getLoginUrl();
    } else {
      document.body.style.display = "block";
      if (onSuccess) onSuccess(user);
    }
  });
}
