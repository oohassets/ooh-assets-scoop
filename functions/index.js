const functions = require("firebase-functions");
const admin     = require("firebase-admin");
const https     = require("https");
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
// SCOOP AI  — HTTP proxy to Anthropic Claude API
// POST { system, messages } → { content: [{ text }] }
// ═══════════════════════════════════════════════════════════
exports.scoopAI = functions
  .runWith({ secrets: ["ANTHROPIC_API_KEY"], memory: "256MB", timeoutSeconds: 60 })
  .https.onRequest((req, res) => {
    corsMiddleware(req, res, async () => {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

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
