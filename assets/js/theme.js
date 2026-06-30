/* ── Theme toggle ────────────────────────
   Persists preference to localStorage.
   Broadcasts to all iframes on change.
   Listens for parent postMessage if in iframe.
─────────────────────────────────────────── */
export function initTheme() {
  const logo = document.getElementById("loginLogo");
  const root = document.documentElement;

  const saved = localStorage.getItem("scoop-theme") || "light";
  applyTheme(saved);

  document.getElementById("userThemeToggle")?.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("scoop-theme", next);
    broadcastTheme(next);
  });

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    const themeIcon  = document.getElementById("userThemeIcon");
    const themeLabel = document.getElementById("userThemeLabel");
    if (themeIcon)  themeIcon.textContent  = theme === "dark" ? "light_mode" : "dark_mode";
    if (themeLabel) themeLabel.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
    if (logo) {
      const base = window.location.pathname.includes("/pages/") ? "../" : "";
      logo.src = theme === "dark"
        ? `${base}images/scooplogo_white.png`
        : `${base}images/scooplogo.png`;
    }
  }

  function broadcastTheme(theme) {
    document.querySelectorAll("iframe").forEach(frame => {
      try { frame.contentWindow?.postMessage({ type: "scoop-theme", theme }, "*"); } catch(e) {}
    });
  }
}

/* ── Iframe theme + user listener ────────
   Call once in any page loaded inside an
   index.html iframe so it stays in sync.
─────────────────────────────────────────── */
export function listenParentMessages(onUser) {
  window.addEventListener("message", (e) => {
    if (!e.data || typeof e.data !== "object") return;

    if (e.data.type === "scoop-theme") {
      document.documentElement.setAttribute("data-theme", e.data.theme);
      localStorage.setItem("scoop-theme", e.data.theme);
    }

    if (e.data.type === "scoop-user" && onUser) {
      onUser(e.data);
    }
  });
}
