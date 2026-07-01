const functions = require("firebase-functions");
const admin     = require("firebase-admin");
const https     = require("https");
const corsLib   = require("cors");
const jwt       = require("jsonwebtoken");

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
// SCOOP AI  — HTTP proxy to Anthropic Claude API
// POST { system, messages } → { content: [{ text }] }
// ═══════════════════════════════════════════════════════════
exports.scoopAI = functions
  .runWith({ secrets: ["ANTHROPIC_API_KEY"], memory: "256MB", timeoutSeconds: 60 })
  .https.onRequest((req, res) => {
    corsMiddleware(req, res, async () => {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const decoded = await verifyAuth(req);
    if (!decoded) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { system, messages } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY secret not set");
      res.status(500).json({ error: "AI service not configured" });
      return;
    }

    // Build request body for Claude
    const body = JSON.stringify({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system:     system || "You are Scoop AI, an OOH advertising assistant.",
      messages:   messages.map(m => ({
        role:    m.role === "bot" ? "assistant" : m.role,
        content: String(m.content),
      })),
    });

    // Call Anthropic Messages API
    const claudeRes = await new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: "api.anthropic.com",
        path:     "/v1/messages",
        method:   "POST",
        headers:  {
          "Content-Type":      "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key":         apiKey,
          "Content-Length":    Buffer.byteLength(body),
        },
      };

      const r = https.request(reqOptions, (response) => {
        let data = "";
        response.on("data", chunk => { data += chunk; });
        response.on("end",  ()    => resolve({ status: response.statusCode, body: data }));
      });

      r.on("error", reject);
      r.write(body);
      r.end();
    });

    if (claudeRes.status !== 200) {
      console.error("Anthropic error:", claudeRes.body);
      res.status(502).json({ error: "Upstream AI error", detail: claudeRes.body });
      return;
    }

    try {
      const parsed = JSON.parse(claudeRes.body);
      res.status(200).json(parsed);
    } catch (parseErr) {
      console.error("Parse error:", parseErr);
      res.status(500).json({ error: "Failed to parse AI response" });
    }
    }); // end corsMiddleware callback
  });   // end onRequest


// ═══════════════════════════════════════════════════════════
// CHATBASE TOKEN  — signs a JWT so Chatbase can identify the user
// POST (Authorization: Bearer <Firebase ID token>) → { token }
// uid/email come from the verified token, never from the request
// body, so a caller can't mint an identity token for someone else.
// Requires CHATBOT_IDENTITY_SECRET in Firebase Secrets Manager
// ═══════════════════════════════════════════════════════════
exports.chatbaseToken = functions
  .runWith({ secrets: ["CHATBOT_IDENTITY_SECRET"] })
  .https.onRequest((req, res) => {
    corsMiddleware(req, res, async () => {
      if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

      const decoded = await verifyAuth(req);
      if (!decoded) { res.status(401).json({ error: "Unauthorized" }); return; }

      const secret = process.env.CHATBOT_IDENTITY_SECRET;
      if (!secret) { res.status(500).json({ error: "Secret not configured" }); return; }

      const token = jwt.sign({ user_id: decoded.uid, email: decoded.email }, secret, { expiresIn: "1h" });
      res.status(200).json({ token });
    });
  });


// ═══════════════════════════════════════════════════════════
// CHATBASE DATA SYNC  — pushes live RTDB snapshot to Chatbase
// Runs every 6 hours (Qatar time) so the chatbot always has
// current campaign, circuit, and availability data.
// Requires CHATBASE_API_KEY in Firebase Secrets Manager.
// ═══════════════════════════════════════════════════════════
const CHATBOT_ID = "0rwe9Qe63NSTaz30U9HXA";

function buildChatbaseSnapshot(allData) {
  const now = new Date().toLocaleString("en-GB", { timeZone: "Asia/Qatar", hour12: false });
  const lines = [
    "SCOOP OOH Assets — Live Campaign & Circuit Data",
    `Last updated: ${now} (Qatar Time)`,
    "",
  ];

  // ── Digital Circuits ──────────────────────────────────────
  lines.push("=== DIGITAL CIRCUITS ===");
  for (const key of Object.keys(allData).sort()) {
    if (!key.startsWith("d_")) continue;
    const location = key.replace(/^d_/, "").replace(/_/g, " ");
    lines.push(`\nLocation: ${location}`);
    const table = allData[key];
    for (const row of Object.values(table)) {
      if (!row || !row.Client) continue;
      const sn    = row["SN"]         || "—";
      const bo    = row["BO"]         ? ` | BO: ${row["BO"]}` : "";
      const start = row["Start Date"] || "—";
      const end   = row["End Date"]   || "—";
      lines.push(`  SN: ${sn} | Client: ${row.Client}${bo} | ${start} → ${end}`);
    }
  }

  // ── Static Circuits ───────────────────────────────────────
  lines.push("\n=== STATIC CIRCUITS ===");
  for (const key of Object.keys(allData).sort()) {
    if (!key.startsWith("s_")) continue;
    const location = key.replace(/^s_/, "").replace(/_/g, " ");
    lines.push(`\nLocation: ${location}`);
    const table = allData[key];
    for (const row of Object.values(table)) {
      if (!row) continue;
      const circuit = row["Circuit"]    || "—";
      const client  = row["Client"]     || "—";
      const bo      = row["BO"]         ? ` | BO: ${row["BO"]}` : "";
      const start   = row["Start Date"];
      const end     = row["End Date"]   || "—";
      const status  = !start || start === "—" ? "AVAILABLE" : `${start} → ${end}`;
      lines.push(`  Circuit: ${circuit} | Client: ${client}${bo} | ${status}`);
    }
  }

  // ── Summary counts ────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let active = 0, available = 0, endingThisWeek = 0;

  for (const key of Object.keys(allData)) {
    if (!key.startsWith("d_") && !key.startsWith("s_")) continue;
    for (const row of Object.values(allData[key])) {
      if (!row) continue;
      const start = parseDate(row["Start Date"]);
      const end   = parseDate(row["End Date"]);
      if (start && end && start <= today && end >= today) {
        active++;
        const daysLeft = (end - today) / 86400000;
        if (daysLeft <= 7) endingThisWeek++;
      } else if (!row["Start Date"] || row["Start Date"] === "—") {
        available++;
      }
    }
  }

  lines.push("\n=== SUMMARY ===");
  lines.push(`Active campaigns today: ${active}`);
  lines.push(`Available (unbooked) circuits: ${available}`);
  lines.push(`Campaigns ending within 7 days: ${endingThisWeek}`);

  return lines.join("\n");
}

exports.syncChatbaseData = functions
  .runWith({ secrets: ["CHATBASE_API_KEY"] })
  .pubsub.schedule("0 */6 * * *")
  .timeZone("Asia/Qatar")
  .onRun(async () => {
    const apiKey = process.env.CHATBASE_API_KEY;
    if (!apiKey) { console.error("CHATBASE_API_KEY not set"); return null; }

    const db   = admin.database();
    const snap = await db.ref("/").once("value");
    if (!snap.exists()) { console.log("No RTDB data"); return null; }

    const sourceText = buildChatbaseSnapshot(snap.val());

    // Chatbase API: update the "Live Data" text source
    // Docs: https://www.chatbase.co/docs/api-reference
    const payload = JSON.stringify({
      chatbotId:  CHATBOT_ID,
      sourceText,
    });

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "www.chatbase.co",
        path:     "/api/v1/update-chatbot-data",
        method:   "POST",
        headers:  {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type":  "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      }, (res) => {
        let body = "";
        res.on("data", c => { body += c; });
        res.on("end",  ()  => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    console.log(`Chatbase sync ${result.status}:`, result.body);
    return null;
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
