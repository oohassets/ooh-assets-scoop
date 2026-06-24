/* ══════════════════════════════════════════
   SCOOP OOH — Notification Bell
   Derives notifications from campaign data,
   reads manual entries from /notifications,
   and detects service-worker updates.
══════════════════════════════════════════ */
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

let allNotifs = [];

// ── Date helpers ─────────────────────────────────────────────
function parseDate(v) {
  if (!v) return null;
  const p = v.toString().trim().split("/").map(Number);
  if (p.length >= 3) return new Date(p[2] || new Date().getFullYear(), p[0] - 1, p[1]);
  return null;
}

function relTime(d) {
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7)   return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Per-user read state (localStorage) ──────────────────────
function uid() { return window.__currentUser?.uid || "anon"; }

function notifKey(n) {
  const ds = n.date ? n.date.toISOString().slice(0, 10) : "nd";
  return `${n.iconType}:${n.title}:${ds}`;
}

function getReadSet() {
  try { return new Set(JSON.parse(localStorage.getItem(`notif_read_${uid()}`) || "[]")); }
  catch { return new Set(); }
}

function saveReadSet(set) {
  try { localStorage.setItem(`notif_read_${uid()}`, JSON.stringify([...set])); }
  catch {}
}

function applyReadState() {
  const read = getReadSet();
  allNotifs.forEach(n => { n.unread = !read.has(notifKey(n)); });
}

function markAllAsRead() {
  const read = getReadSet();
  allNotifs.forEach(n => { n.unread = false; read.add(notifKey(n)); });
  saveReadSet(read);
}

function getClearedAt() {
  try { return parseInt(localStorage.getItem(`notif_cleared_${uid()}`) || "0", 10); }
  catch { return 0; }
}

function clearAll() {
  try { localStorage.setItem(`notif_cleared_${uid()}`, String(Date.now())); }
  catch {}
  allNotifs = [];
  updateBadge();
  renderList();
}

// ── Derive notifications from Firebase data ──────────────────
function deriveNotifications(tables) {
  const notifs = [];
  const today  = new Date(); today.setHours(0, 0, 0, 0);

  // Campaign_Logs → Published / Removed (last 7 days)
  const logs = tables?.Campaign_Logs || tables?.campaign_logs || {};
  Object.values(logs).forEach(log => {
    const raw  = log.Date || log.date;
    const type = (log.Type || log.type || "").toLowerCase();
    if (!raw || !type) return;
    const d = parseDate(raw);
    if (!d) return;
    d.setHours(0, 0, 0, 0);
    if ((today - d) / 86400000 > 7) return;

    const client  = log.Client   || "—";
    const circuit = log.Circuits || "—";

    if (type === "add") {
      notifs.push({ icon: "campaign", iconType: "published",
        title: "Campaign Published", desc: `${client} · ${circuit}`,
        time: relTime(d), date: d });
    } else if (type === "removed") {
      notifs.push({ icon: "remove_circle", iconType: "removed",
        title: "Campaign Removed", desc: `${client} · ${circuit}`,
        time: relTime(d), date: d });
    }
  });

  // Campaigns_Booking → starting soon / ending soon (within 7 days)
  const bookings = tables?.Campaigns_Booking || {};
  const entries  = Array.isArray(bookings)
    ? bookings.map((r, i) => [i, r])
    : Object.entries(bookings);

  entries.forEach(([, row]) => {
    if (!row) return;
    const sd      = parseDate(row["Start Date"]);
    const ed      = parseDate(row["End Date"]);
    const brand   = row["Brand Campaign"] || row.Client || "—";
    const circuit = row.Circuits || "—";

    if (sd) {
      sd.setHours(0, 0, 0, 0);
      const dts = Math.floor((sd - today) / 86400000);
      if (dts >= 0 && dts <= 7) {
        notifs.push({ icon: "event", iconType: "upcoming",
          title: "Campaign Starting Soon",
          desc: `${brand} · ${circuit}`,
          time: dts === 0 ? "Today" : `In ${dts}d`,
          date: new Date(sd) });
      }
    }

    if (ed) {
      ed.setHours(0, 0, 0, 0);
      const dte     = Math.floor((ed - today) / 86400000);
      const started = sd ? new Date(sd) <= today : true;
      if (dte >= 0 && dte <= 7 && started) {
        notifs.push({ icon: "event_busy", iconType: "ending",
          title: "Campaign Ending Soon",
          desc: `${brand} · ${circuit}`,
          time: dte === 0 ? "Today" : `In ${dte}d`,
          date: new Date(ed) });
      }
    }
  });

  return notifs;
}

// ── Badge ────────────────────────────────────────────────────
function updateBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const count = allNotifs.filter(n => n.unread).length;
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

// ── Render list ──────────────────────────────────────────────
function renderList() {
  const list = document.getElementById("notifList");
  if (!list) return;

  if (!allNotifs.length) {
    list.innerHTML = `
      <div class="notif-empty">
        <span class="material-symbols-outlined">notifications_none</span>
        <p>All caught up</p>
      </div>`;
    return;
  }

  list.innerHTML = allNotifs.map((n, i) => `
    <div class="notif-item${n.unread ? " unread" : ""}" data-idx="${i}">
      <div class="notif-icon-wrap notif-type-${n.iconType || "system"}">
        <span class="material-symbols-outlined">${n.icon}</span>
      </div>
      <div class="notif-content">
        <div class="notif-title">${n.title}</div>
        <div class="notif-desc">${n.desc}</div>
        <div class="notif-time">${n.time}</div>
        ${n.iconType === "update"
          ? `<button class="notif-update-btn" onclick="window.__swUpdate?.()">Update Now</button>`
          : ""}
      </div>
      ${n.unread ? `<span class="notif-dot"></span>` : ""}
    </div>
  `).join("");
}

// ── SW update detection ──────────────────────────────────────
function injectSWNotif(title, desc, icon, iconType) {
  const i = allNotifs.findIndex(n => n._sw);
  if (i !== -1) allNotifs.splice(i, 1);
  allNotifs.unshift({
    icon, iconType, title, desc,
    time: "Just now", date: new Date(),
    unread: true, _sw: true
  });
  updateBadge();
  renderList();
}

async function checkSWUpdate() {
  if (!("serviceWorker" in navigator)) return;

  try {
    // pwa.js registers the SW and exposes it as window.__swReg.
    // Poll briefly for it rather than racing navigator.serviceWorker.ready,
    // which can return before pwa.js has called .register().
    const reg = await new Promise(resolve => {
      if (window.__swReg) return resolve(window.__swReg);
      const t = setInterval(() => {
        if (window.__swReg) { clearInterval(t); resolve(window.__swReg); }
      }, 100);
      setTimeout(() => { clearInterval(t); resolve(null); }, 5000);
    });
    if (!reg) { console.warn("[SCOOP SW] Registration not available"); return; }
    console.log(`[SCOOP SW] Active: ${reg.active?.state ?? "none"} | Waiting: ${!!reg.waiting} | Installing: ${!!reg.installing}`);

    // ── 1. Version comparison — detects updates from previous sessions ────────
    // Ask the active SW which cache version it is running.
    if (reg.active) {
      const version = await new Promise(resolve => {
        let settled = false;
        const handler = e => {
          if (e.data?.type === "SW_VERSION" && !settled) {
            settled = true;
            navigator.serviceWorker.removeEventListener("message", handler);
            resolve(e.data.version);
          }
        };
        navigator.serviceWorker.addEventListener("message", handler);
        reg.active.postMessage({ type: "GET_VERSION" });
        setTimeout(() => {
          if (!settled) { settled = true; navigator.serviceWorker.removeEventListener("message", handler); resolve(null); }
        }, 1000);
      });

      if (version) {
        const prev = localStorage.getItem("scoop_sw_ver");
        console.log(`[SCOOP SW] Version: ${version} (prev: ${prev ?? "none"})`);
        if (prev && prev !== version) {
          injectSWNotif("SCOOP Updated", "You're now on the latest version.", "check_circle", "published");
        }
        localStorage.setItem("scoop_sw_ver", version);
      }
    }

    // ── 2. "Reload" is all that's needed — new SW already activated ──────────
    window.__swUpdate = () => window.location.reload();

    // ── 3. SW already waiting (rare with skipWaiting-in-install) ─────────────
    if (reg.waiting) {
      injectSWNotif("App Update Available", "A new version of SCOOP is ready.", "system_update_alt", "update");
    }

    // ── 4. Live detection: new SW found while the page is open ───────────────
    // The SW goes installing → (skipWaiting) → activating fast; catch any state.
    let notified = false;
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        if (notified) return;
        if (sw.state === "installed" || sw.state === "activating" || sw.state === "activated") {
          notified = true;
          console.log(`[SCOOP SW] New SW detected via statechange: ${sw.state}`);
          injectSWNotif("App Update Available", "A new version of SCOOP is ready.", "system_update_alt", "update");
        }
      });
    });

    // ── 5. Fallback: controllerchange fires when skipWaiting completes ───────
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !notified) {
        notified = true;
        console.log("[SCOOP SW] controllerchange — new SW took control");
        injectSWNotif("App Update Available", "A new version of SCOOP is ready.", "system_update_alt", "update");
      }
    });
  } catch (err) {
    console.error("[SCOOP SW] Update check error:", err);
  }
}

// ── Public init ──────────────────────────────────────────────
export async function initNotifications() {
  const btn   = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");
  if (!btn || !panel) return;

  // SW update check runs immediately (independent of Firebase)
  checkSWUpdate();

  function closePanel() {
    panel.classList.remove("open");
    btn.classList.remove("active");
    // Persist read state when the panel closes
    markAllAsRead();
    updateBadge();
    renderList();
  }

  // Toggle
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const open = panel.classList.toggle("open");
    btn.classList.toggle("active", open);
  });

  // Close on outside click
  document.addEventListener("click", e => {
    if (panel.classList.contains("open") &&
        !document.getElementById("notifBell")?.contains(e.target)) {
      closePanel();
    }
  });

  // Close on Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && panel.classList.contains("open")) closePanel();
  });

  // Mark all read button
  document.getElementById("notifMarkRead")?.addEventListener("click", () => {
    markAllAsRead();
    updateBadge();
    renderList();
  });

  // Clear all button
  document.getElementById("notifClearAll")?.addEventListener("click", () => {
    clearAll();
  });

  // Load Firebase data
  try {
    const snap   = await get(ref(rtdb, "/"));
    const tables = snap.exists() ? snap.val() : {};

    allNotifs = deriveNotifications(tables);

    // Manual entries from /notifications in RTDB
    const sysRaw = tables?.notifications || {};
    Object.values(sysRaw).forEach(n => {
      if (!n) return;
      const d = n.timestamp ? new Date(n.timestamp) : null;
      allNotifs.push({
        icon:     n.icon        || "info",
        iconType: n.type        || "system",
        title:    n.title       || "",
        desc:     n.description || "",
        time:     d ? relTime(d) : (n.time || ""),
        date:     d
      });
    });

    // Drop anything the user has already cleared
    const clearedAt = getClearedAt();
    if (clearedAt > 0) {
      allNotifs = allNotifs.filter(n => n.date && n.date.getTime() > clearedAt);
    }

    // Newest first, then apply per-user read state
    allNotifs.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    applyReadState();

    // Re-inject any SW notif that was added before Firebase finished
    // (it was unshifted to index 0, sort may have moved it — restore it)
    const swNotif = allNotifs.find(n => n._sw);
    if (swNotif) {
      allNotifs.splice(allNotifs.indexOf(swNotif), 1);
      allNotifs.unshift(swNotif);
    }

    const unread = allNotifs.filter(n => n.unread).length;
    console.log(`[SCOOP Notifications] ${allNotifs.length} loaded, ${unread} unread`);

    updateBadge();
    renderList();
  } catch (err) {
    console.error("[SCOOP Notifications] Load error:", err);
  }
}
