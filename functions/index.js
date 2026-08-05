const functions = require("firebase-functions");
const admin     = require("firebase-admin");
const corsLib   = require("cors");

admin.initializeApp();

const corsMiddleware = corsLib({
  origin: [
    "https://oohassets.github.io",
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  ],
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
});

// ═══════════════════════════════════════════════════════════
// AUTH HELPER — verifies a Firebase ID token from the
// Authorization header. CORS only stops browser cross-origin
// calls; it does nothing against a direct curl/server request,
// so every callable HTTP function below must check this itself.
// ═══════════════════════════════════════════════════════════
async function verifyAuth(req) {
  const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (err) {
    console.error("ID token verification failed:", err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// CLIENT PORTAL DATA  — the *only* way a client-portal account can ever
// see booking data (see database.rules.json: userClient-listed accounts
// get a hard root .read:false, same as an unauthenticated request). This
// function uses the Admin SDK, which bypasses rules entirely, to filter
// server-side before anything reaches the browser — so even a client
// reading the network response or poking at the page in devtools only
// ever receives their own bookings in full, plus every other client's
// bookings stripped down to a status bar with no identifying fields.
// POST (Authorization: Bearer <Firebase ID token>) →
//   { clientName, circuits, myBookings, otherBookings }
// ═══════════════════════════════════════════════════════════
function sanitizeEmailKey(email) {
  return email.replace(/\./g, ",");
}

exports.getClientPortalData = functions.https.onRequest((req, res) => {
  corsMiddleware(req, res, async () => {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const decoded = await verifyAuth(req);
    if (!decoded || !decoded.email) { res.status(401).json({ error: "Unauthorized" }); return; }

    try {
      const db = admin.database();

      const clientSnap = await db.ref(`userClient/${sanitizeEmailKey(decoded.email)}`).once("value");
      if (!clientSnap.exists()) {
        res.status(403).json({ error: "This account is not registered as a client." });
        return;
      }
      const clientRecord = clientSnap.val();
      const clientName   = (clientRecord.clientName || "").trim();
      const contactName  = (clientRecord.contactName || "").trim();
      if (!clientName) {
        res.status(403).json({ error: "This client account has no assigned client name." });
        return;
      }

      const [bookingsSnap, circuitsSnap] = await Promise.all([
        db.ref("Campaigns_Booking").once("value"),
        db.ref("oohassets").once("value"),
      ]);

      // Same shape loadCircuitSlots() builds client-side in bookings.js —
      // needed so the portal's calendar can render one row per circuit/slot
      // even for circuits this client has never booked.
      const circuitRows = circuitsSnap.exists() ? Object.values(circuitsSnap.val()) : [];
      const circuits = circuitRows
        .filter(r => r && r.Circuits)
        .map(r => ({ name: r.Circuits.trim(), slots: parseInt(r.Slot || 1, 10) }));

      const bookingData  = bookingsSnap.exists() ? bookingsSnap.val() : {};
      const bookingRows  = Object.entries(bookingData).filter(([, row]) => row);

      const myBookings    = [];
      const otherBookings = [];
      const clientNameLc  = clientName.toLowerCase();

      for (const [key, row] of bookingRows) {
        const status = (row.Status || "").toLowerCase();
        if (status === "cancelled") continue; // a cancelled booking no longer holds its slot

        if ((row.Client || "").trim().toLowerCase() === clientNameLc) {
          myBookings.push({
            key,
            BO: row.BO || "", Client: row.Client, "Brand Campaign": row["Brand Campaign"] || "",
            Circuits: row.Circuits || "", Slot: row.Slot || 1,
            "Start Date": row["Start Date"] || "", "End Date": row["End Date"] || "",
            Status: row.Status || "", Person: row.Person || "",
          });
        } else {
          // No Client/Brand/BO/Person/raw Status — only enough to draw a
          // same-color-scheme-but-anonymous bar on the calendar.
          otherBookings.push({
            Circuits: row.Circuits || "", Slot: row.Slot || 1,
            "Start Date": row["Start Date"] || "", "End Date": row["End Date"] || "",
            label: status === "pending" ? "Reserve" : "Booked",
          });
        }
      }

      res.status(200).json({ clientName, contactName, circuits, myBookings, otherBookings });
    } catch (err) {
      console.error("[getClientPortalData] error:", err);
      res.status(500).json({ error: "Failed to load client portal data" });
    }
  });
});


// ═══════════════════════════════════════════════════════════
// SUPPLIER PORTAL DATA — the *only* way a supplier-portal account can ever
// see booking data (see database.rules.json: userSupplier-listed accounts
// get a hard root .read:false, same treatment as userClient). Unlike the
// client portal, there's no per-supplier data split to enforce here (no
// "which assets belong to which supplier" field exists on oohassets) — the
// scoping this function does is by asset TYPE, not by tenant: it returns
// every Static-type asset and its bookings, and nothing Digital, to any
// authenticated userSupplier account.
// POST (Authorization: Bearer <Firebase ID token>) →
//   { supplierName, contactName, assets: [{ id, name, Circuits, bookings }] }
// ═══════════════════════════════════════════════════════════
exports.getSupplierPortalData = functions.https.onRequest((req, res) => {
  corsMiddleware(req, res, async () => {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const decoded = await verifyAuth(req);
    if (!decoded || !decoded.email) { res.status(401).json({ error: "Unauthorized" }); return; }

    try {
      const db = admin.database();

      const supplierSnap = await db.ref(`userSupplier/${sanitizeEmailKey(decoded.email)}`).once("value");
      if (!supplierSnap.exists()) {
        res.status(403).json({ error: "This account is not registered as a supplier." });
        return;
      }
      const supplierRecord = supplierSnap.val();
      const supplierName   = (supplierRecord.supplierName || "").trim();
      const contactName    = (supplierRecord.contactName || "").trim();

      const [assetsSnap, bookingsSnap] = await Promise.all([
        db.ref("oohassets").once("value"),
        db.ref("Campaigns_Booking").once("value"),
      ]);

      const assetRows = assetsSnap.exists() ? Object.values(assetsSnap.val()) : [];
      const bookingRows = bookingsSnap.exists() ? Object.values(bookingsSnap.val()).filter(Boolean) : [];

      // Join: Campaigns_Booking.Circuits == oohassets.Circuits (trim +
      // case-insensitive, same convention bookings.js uses throughout).
      const staticAssets = assetRows
        .filter(r => r && r.type === "Static" && r.Circuits && r.id)
        .map(r => {
          const circuitLc = String(r.Circuits).trim().toLowerCase();
          const bookings = bookingRows
            .filter(b => (b.Circuits || "").trim().toLowerCase() === circuitLc)
            .map(b => ({
              Client: b.Client || "", "Brand Campaign": b["Brand Campaign"] || "",
              Circuits: b.Circuits || "", Slot: b.Slot || 1,
              "Start Date": b["Start Date"] || "", "End Date": b["End Date"] || "",
              Status: b.Status || "",
            }));
          return { id: r.id, name: r.name || r.Circuits, Circuits: r.Circuits, bookings };
        });

      res.status(200).json({ supplierName, contactName, assets: staticAssets });
    } catch (err) {
      console.error("[getSupplierPortalData] error:", err);
      res.status(500).json({ error: "Failed to load supplier portal data" });
    }
  });
});


// ═══════════════════════════════════════════════════════════
// CAMPAIGN ENDING NOTIFICATIONS  (Daily 8 AM Qatar Time)
// ═══════════════════════════════════════════════════════════
function parseDate(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthIndex = months.indexOf(match[2]);
  if (monthIndex === -1) return null;
  const d = new Date(parseInt(match[3]), monthIndex, parseInt(match[1]));
  d.setHours(0,0,0,0);
  return d;
}

exports.checkEndingCampaigns = functions.pubsub
  .schedule("0 7 * * *")
  .timeZone("Asia/Qatar")
  .onRun(async () => {
    const db       = admin.database();
    const rootSnap = await db.ref("/").once("value");
    if (!rootSnap.exists()) { console.log("No data found"); return null; }

    const allData = rootSnap.val();
    const today   = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const notificationsToSend = [];

    for (const tableName in allData) {
      if (!tableName.startsWith("d_") && !tableName.startsWith("s_")) continue;
      const locationName = tableName.replace(/^d_|^s_/, "").replace(/_/g, " ");
      const table = allData[tableName];
      for (const key in table) {
        const row = table[key];
        if (!row || !row["End Date"]) continue;
        const endDate = parseDate(row["End Date"]);
        if (!endDate) continue;
        const diff = (endDate - today) / 86400000;
        if (diff === 0 || diff === 1) {
          notificationsToSend.push({
            client:   row.Client || "—",
            location: locationName,
            endDate:  row["End Date"],
            type:     diff === 0 ? "today" : "tomorrow",
          });
        }
      }
    }

    if (notificationsToSend.length === 0) { console.log("No ending campaigns"); return null; }

    const tokenSnap = await db.ref("fcmTokens").once("value");
    if (!tokenSnap.exists()) { console.log("No FCM tokens"); return null; }

    const tokens = [];
    tokenSnap.forEach(u => u.forEach(t => tokens.push(t.key)));
    if (!tokens.length) { console.log("No tokens available"); return null; }

    for (const campaign of notificationsToSend) {
      const title = campaign.type === "today" ? "⚠️ Campaign Ending Today" : "⏳ Campaign Ending Tomorrow";
      const body  = `${campaign.client} at ${campaign.location} ends on ${campaign.endDate}`;
      await admin.messaging().sendEachForMulticast({ notification: { title, body }, tokens });
    }

    return null;
  });
