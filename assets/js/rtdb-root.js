/* ── Shared full-root RTDB read ─────────────────────────────
   app.js's notification bell (on every app bootstrap) and the Dashboard/
   Bookings views (loadAll(), on their own init) each independently read
   the entire "/" root — every table in the database — since that's the
   simplest way to get at Campaigns_Booking/Campaign_Logs/etc. On a
   ?page=home or ?page=bookings deep link, app.js's own bootstrap fetch and
   that view's loadAll() fire within the same tick, so both were issuing a
   full duplicate read of the whole database. loadRootTables() shares one
   in-flight request across simultaneous callers — it does NOT cache the
   *resolved* result, so a call made after the previous one has already
   settled still triggers a brand-new read and sees fully fresh data (e.g.
   Bookings re-reading after a save). This only removes the redundant
   *concurrent* reads, never staleness. */
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

let pending = null;

export function loadRootTables() {
  if (!pending) {
    pending = get(ref(rtdb, "/")).finally(() => { pending = null; });
  }
  return pending;
}
