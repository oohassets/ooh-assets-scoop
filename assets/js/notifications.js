/* ══════════════════════════════════════════
   SCOOP OOH — Notification Bell
   Derives notifications from campaign data
   and reads manual entries from /notifications
══════════════════════════════════════════ */
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

let allNotifs  = [];

// ── Helpers ──────────────────────────────────────────────────
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

// ── Derive from Firebase data ─────────────────────────────────
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
      notifs.push({
        icon: "campaign", iconType: "published",
        title: "Campaign Published",
        desc:  `${client} · ${circuit}`,
        time:  relTime(d), date: d, unread: true
      });
    } else if (type === "removed") {
      notifs.push({
        icon: "remove_circle", iconType: "removed",
        title: "Campaign Removed",
        desc:  `${client} · ${circuit}`,
        time:  relTime(d), date: d, unread: true
      });
    }
  });

  // Campaigns_Booking → upcoming start / ending soon (within 7 days)
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
        notifs.push({
          icon: "event", iconType: "upcoming",
          title: "Campaign Starting Soon",
          desc:  `${brand} · ${circuit}`,
          time:  dts === 0 ? "Today" : `In ${dts}d`,
          date:  new Date(sd),
          unread: dts <= 2
        });
      }
    }

    if (ed) {
      ed.setHours(0, 0, 0, 0);
      const dte     = Math.floor((ed - today) / 86400000);
      const started = sd ? new Date(sd) <= today : true;
      if (dte >= 0 && dte <= 7 && started) {
        notifs.push({
          icon: "event_busy", iconType: "ending",
          title: "Campaign Ending Soon",
          desc:  `${brand} · ${circuit}`,
          time:  dte === 0 ? "Today" : `In ${dte}d`,
          date:  new Date(ed),
          unread: dte <= 2
        });
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

// ── Public init ──────────────────────────────────────────────
export async function initNotifications() {
  const btn   = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");
  if (!btn || !panel) return;

  // Expose SW update trigger for "Update Now" button
  window.__swUpdate = () => {
    navigator.serviceWorker?.getRegistration?.().then(reg => {
      if (reg?.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      else window.location.reload();
    });
  };

  // Toggle panel
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const open = panel.classList.toggle("open");
    btn.classList.toggle("active", open);
    if (open) {
      // Mark visible items read after a short delay
      setTimeout(() => {
        allNotifs.forEach(n => { n.unread = false; });
        updateBadge();
        renderList();
      }, 2000);
    }
  });

  // Close on outside click
  document.addEventListener("click", e => {
    if (!document.getElementById("notifBell")?.contains(e.target)) {
      panel.classList.remove("open");
      btn.classList.remove("active");
    }
  });

  // Close on Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      panel.classList.remove("open");
      btn.classList.remove("active");
    }
  });

  // Mark all read button
  document.getElementById("notifMarkRead")?.addEventListener("click", () => {
    allNotifs.forEach(n => { n.unread = false; });
    updateBadge();
    renderList();
  });

  // Load data
  try {
    const snap   = await get(ref(rtdb, "/"));
    const tables = snap.exists() ? snap.val() : {};

    allNotifs = deriveNotifications(tables);

    // Manual notifications from /notifications in RTDB
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
        date:     d,
        unread:   n.unread !== false
      });
    });

    // Newest first
    allNotifs.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    updateBadge();
    renderList();
  } catch (err) {
    console.error("[Notifications]", err);
  }
}
