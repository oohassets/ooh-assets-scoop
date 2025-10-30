<script>
// --- Firebase Config (same across all pages) ---
const firebaseConfig = {
  apiKey: "AIzaSyCKH-qxF9rqJds8Oi69MA8zpoHB0BL_jlk",
  authDomain: "scoop-ooh-assets.firebaseapp.com",
  projectId: "scoop-ooh-assets",
  storageBucket: "scoop-ooh-assets.appspot.com",
  messagingSenderId: "611605892213",
  appId: "1:611605892213:web:d71dc48fec993b80f6bc3c"
};

// Initialize Firebase only once
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// --- Protect the Page ---
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById("mainContainer").style.display = "block";
    const userEmailEl = document.getElementById("userEmail");
    if (userEmailEl) userEmailEl.textContent = user.email;
  } else {
    window.location.href = "index.html"; // Redirect to login if not logged in
  }
});

// --- Logout Button Support (optional) ---
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await auth.signOut();
      window.location.href = "index.html";
    });
  }
});
</script>

