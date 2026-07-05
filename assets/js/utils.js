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
 * Load page-specific CSS once (no duplicates). Returns a promise that
 * resolves once the stylesheet has actually applied, so callers can wait
 * for it before revealing unstyled content.
 */
export function loadCSS(href) {
  const existing = document.querySelector(`link[href="${href}"]`);
  if (existing) {
    if (existing.sheet) return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", resolve, { once: true });
    });
  }
  return new Promise((resolve) => {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href });
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
    document.head.appendChild(link);
  });
}

/**
 * Fetch a page HTML file, extract body content, inject into #app-content.
 * Module scripts are removed (view modules handle them).
 * Non-module scripts (inline + external) are re-executed in order.
 */
export async function loadPage(url, cssHref) {
  // Remove inline styles injected by the previous page so they don't bleed
  // into the map view or other pages (e.g. vehicle-report body { padding:20px })
  document.querySelectorAll("style[data-page-style]").forEach(s => s.remove());

  // Fetch HTML and load CSS in parallel, but don't inject the HTML until the
  // stylesheet has applied — otherwise buttons/tabs briefly render at their
  // unstyled browser-default size before snapping to the real layout.
  const cssReady = cssHref ? loadCSS(cssHref) : Promise.resolve();
  const text = await fetch(url).then(r => r.text());
  await cssReady;

  // Inject <style> blocks from <head> (e.g. vehicle-report inline CSS)
  const headMatch = text.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = styleRe.exec(headMatch[1])) !== null) {
      const tag = document.createElement("style");
      tag.dataset.pageStyle = url; // mark so we can clean up later if needed
      tag.textContent = m[1];
      document.head.appendChild(tag);
    }
  }

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
