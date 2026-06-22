/* ── Shared utilities ───────────────────────────────────── */

/**
 * Show exactly one iframe or the app-content div, hide all others.
 * @param {string} frameId - element id to show
 */
export function showOnlyFrame(frameId) {
  // Legacy iframe IDs still used for mapFrame
  const iframeIds = ["mapFrame"];
  iframeIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === frameId ? "block" : "none";
  });

  // app-content container for all page views
  const appContent = document.getElementById("app-content");
  if (appContent) {
    appContent.style.display = frameId === "app-content" ? "block" : "none";
  }
}

/**
 * Load page-specific CSS once (no duplicates).
 */
export function loadCSS(href) {
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = Object.assign(document.createElement("link"), { rel:"stylesheet", href });
    document.head.appendChild(link);
  }
}

/**
 * Fetch a page HTML file, extract body content, inject into #app-content.
 * Module scripts are removed (view modules handle them).
 * Non-module scripts (inline + external) are re-executed in order.
 */
export async function loadPage(url, cssHref) {
  if (cssHref) loadCSS(cssHref);

  const text = await fetch(url).then(r => r.text());

  // Extract body content
  const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const html = bodyMatch ? bodyMatch[1] : text;

  const container = document.getElementById("app-content");
  container.innerHTML = html;

  // Re-execute scripts in document order
  const scripts = Array.from(container.querySelectorAll("script"));
  for (const oldScript of scripts) {
    oldScript.remove();
    if (oldScript.type === "module") continue; // view modules handle these

    const newScript = document.createElement("script");
    if (oldScript.src) {
      newScript.src = oldScript.getAttribute("src"); // resolves from document (root) URL
      newScript.async = false;
      await new Promise(r => { newScript.onload = newScript.onerror = r; document.head.appendChild(newScript); });
    } else if (oldScript.textContent.trim()) {
      newScript.textContent = oldScript.textContent;
      document.head.appendChild(newScript);
    }
  }
}

/**
 * Show / hide the Google-branding overlay.
 */
export function toggleOverlay(show) {
  const el = document.querySelector(".map-overlay");
  if (el) el.style.display = show ? "block" : "none";
}

/**
 * Push params to the URL query string without a reload.
 * Pass null as a value to remove that key.
 * @param {Object} params
 */
export function setURL(params = {}) {
  const url = new URL(window.location);
  Object.entries(params).forEach(([k, v]) => {
    if (v === null) url.searchParams.delete(k);
    else            url.searchParams.set(k, v);
  });
  window.history.pushState({}, "", url);
}

/** Copy the current Google Map link to clipboard. */
export function copyGoogleMapLink(url) {
  navigator.clipboard.writeText(url).then(() => alert("Google Map link copied!"));
}
