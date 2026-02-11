const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// ===============================
// Helper: Parse DD-MMM-YYYY
// ===============================
function parseDate(dateStr) {
  if (!dateStr) return null;

  const match = dateStr.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const mmm = match[2];
  const year = parseInt(match[3], 10);

  const months = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"];

  const monthIndex = months.indexOf(mmm);
  if (monthIndex === -1) return null;

  const date = new Date(year, monthIndex, day);
  date.setHours(0,0,0,0);
  return date;
}

// ===============================
// Scheduled Function (Daily 8 AM Qatar Time)
// ===============================
exports.checkEndingCampaigns = functions.pubsub
  .schedule("1 6 * * *")
  .timeZone("Asia/Qatar")
  .onRun(async () => {

    const db = admin.database();
    const rootSnap = await db.ref("/").once("value");

    if (!rootSnap.exists()) {
      console.log("No data found");
      return null;
    }

    const allData = rootSnap.val();

    const today = new Date();
    today.setHours(0,0,0,0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const notificationsToSend = [];

    // ===============================
    // Scan all d_ and s_ tables
    // ===============================
    for (const tableName in allData) {

      if (!tableName.startsWith("d_") && !tableName.startsWith("s_")) continue;

      const locationName = tableName
        .replace(/^d_|^s_/, "")
        .replace(/_/g, " ");

      const table = allData[tableName];

      for (const key in table) {
        const row = table[key];
        if (!row || !row["End Date"]) continue;

        const endDate = parseDate(row["End Date"]);
        if (!endDate) continue;

        const diff = (endDate - today) / 86400000;

        if (diff === 0 || diff === 1) {

          notificationsToSend.push({
            client: row.Client || "—",
            location: locationName,
            endDate: row["End Date"],
            type: diff === 0 ? "today" : "tomorrow"
          });
        }
      }
    }

    if (notificationsToSend.length === 0) {
      console.log("No ending campaigns today/tomorrow");
      return null;
    }

    // ===============================
    // Get All FCM Tokens
    // ===============================
    const tokenSnap = await db.ref("fcmTokens").once("value");
    if (!tokenSnap.exists()) {
      console.log("No tokens found");
      return null;
    }

    const tokens = [];

    tokenSnap.forEach(userSnap => {
      userSnap.forEach(tokenSnap => {
        tokens.push(tokenSnap.key);
      });
    });

    if (tokens.length === 0) {
      console.log("No tokens available");
      return null;
    }

    // ===============================
    // Send Notification For Each Campaign
    // ===============================
    for (const campaign of notificationsToSend) {

      const title =
        campaign.type === "today"
          ? "⚠️ Campaign Ending Today"
          : "⏳ Campaign Ending Tomorrow";

      const body =
        `${campaign.client} at ${campaign.location} ends on ${campaign.endDate}`;

      const message = {
        notification: { title, body },
        tokens: tokens
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      console.log("Sent:", response.successCount);
    }

    return null;
  });
