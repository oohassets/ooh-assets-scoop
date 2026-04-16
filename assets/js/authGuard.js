import { auth } from "../../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

export function requireAuth(onSuccess) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      console.log("Not logged in → redirect");
      window.location.href = "./login.html";
    } else {
      console.log("Authenticated:", user.email);
      document.body.style.display = "block";

      if (onSuccess) onSuccess(user);
    }
  });
}