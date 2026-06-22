/* ── Theme toggle ────────────────────────
   Persists preference to localStorage.
   Works on both index.html (logo id = loginLogo)
   and any page that embeds the same markup.
─────────────────────────────────────────── */
export function initTheme() {
  const btn   = document.getElementById("themeToggle");
  const logo  = document.getElementById("loginLogo");
  const root  = document.documentElement;

  const saved = localStorage.getItem("scoop-theme") || "light";
  applyTheme(saved);

  btn?.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("scoop-theme", next);
  });

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (btn) btn.textContent = theme === "dark" ? "☀" : "☽";
    if (logo) {
      const base = window.location.pathname.includes("/pages/") ? "../" : "";
      logo.src = theme === "dark"
        ? `${base}images/scooplogo_white.png`
        : `${base}images/scooplogo.png`;
    }
  }
}
