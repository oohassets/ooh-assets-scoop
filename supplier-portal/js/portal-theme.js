/* Self-contained theme toggle for the supplier portal — its own localStorage
 * key (spTheme) and its own data-sp-theme attribute, deliberately not
 * sharing assets/js/theme.js or client-portal/js/portal-theme.js's own
 * "theme"/data-cp-theme keys so this folder has zero coupling to either. */
const STORAGE_KEY = "spTheme";

function apply(theme) {
  document.documentElement.setAttribute("data-sp-theme", theme);
  const icon = document.getElementById("spThemeIcon");
  if (icon) icon.textContent = theme === "dark" ? "☀" : "☽";
}

function current() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

apply(current());

document.getElementById("spThemeToggle")?.addEventListener("click", () => {
  const next = current() === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, next);
  apply(next);
});