/* Self-contained theme toggle for the client portal — its own localStorage
 * key (cpTheme) and its own data-cp-theme attribute, deliberately not
 * sharing assets/js/theme.js or its "theme"/data-theme keys so this folder
 * has zero coupling to the internal app's code. */
const STORAGE_KEY = "cpTheme";

function apply(theme) {
  document.documentElement.setAttribute("data-cp-theme", theme);
  const icon = document.getElementById("cpThemeIcon");
  if (icon) icon.textContent = theme === "dark" ? "☀" : "☽";
}

function current() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

apply(current());

document.getElementById("cpThemeToggle")?.addEventListener("click", () => {
  const next = current() === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, next);
  apply(next);
});
