/* ══════════════════════════════════════════
   SCOOP AI — powered by Chatbase
   Loads the widget via index.html embed;
   this module just identifies the signed-in
   user so Chatbase can personalise the chat.
══════════════════════════════════════════ */

const CHATBASE_TOKEN_ENDPOINT =
  "https://us-central1-scoopassets.cloudfunctions.net/chatbaseToken";

export async function initScoopAI(user) {
  if (!user) return;

  // Wait for the Chatbase script to finish loading
  if (typeof window.chatbase !== "function") {
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (typeof window.chatbase === "function") { clearInterval(check); resolve(); }
      }, 200);
      // Give up after 10 s — widget still shows, just won't be identified
      setTimeout(() => { clearInterval(check); resolve(); }, 10000);
    });
  }

  try {
    const res = await fetch(CHATBASE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.uid, email: user.email }),
    });
    if (!res.ok) return;
    const { token } = await res.json();
    window.chatbase("identify", { token });
  } catch (err) {
    console.warn("Chatbase identify failed:", err);
  }
}
