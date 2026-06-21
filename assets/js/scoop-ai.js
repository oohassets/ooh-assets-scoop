/* ══════════════════════════════════════════
   SCOOP AI — Intelligent OOH Assistant
   Floating chat widget powered by Claude.
   Reads live Firebase data as context so
   it can answer questions about campaigns,
   assets, rates, and operational metrics.
══════════════════════════════════════════ */

import { rtdb, db } from "../../firebase/firebase.js";
import { ref, get }  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { assetRate } from "./asset-rates.js";

/* ─── Firebase Cloud Function endpoint ───────────────────
   Update this URL after deploying functions/index.js.
   Format:  https://<region>-<project>.cloudfunctions.net/scoopAI
──────────────────────────────────────────────────────── */
const AI_ENDPOINT = "https://us-central1-scoopassets.cloudfunctions.net/scoopAI";

/* ─── Quick-action chips shown in the empty state ──────── */
const QUICK_ACTIONS = [
  "What campaigns are currently live?",
  "What is the rate for Underpass screens?",
  "How many pending campaigns are there?",
  "Which circuits are available next month?",
  "What are the dimensions for Mupi screens?",
  "Summarize today's campaign activity",
];

/* ─── Inject widget HTML + CSS ──────────────────────────── */
function injectWidget() {
  const style = document.createElement("style");
  style.textContent = `
    /* ── Floating button ─────────────────────────── */
    #scoop-ai-btn {
      position: fixed; bottom: 28px; right: 24px; z-index: 10000;
      width: 58px; height: 58px; border-radius: 50%;
      background: linear-gradient(135deg, #4F46E5, #7C3AED);
      border: none; cursor: pointer; box-shadow: 0 8px 30px rgba(79,70,229,0.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.25s, box-shadow 0.25s;
      color: #fff; font-size: 24px;
    }
    #scoop-ai-btn:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 14px 40px rgba(79,70,229,0.5); }
    #scoop-ai-btn .ai-pulse {
      position: absolute; inset: 0; border-radius: 50%;
      background: rgba(79,70,229,0.35);
      animation: aiPulse 2.5s ease-in-out infinite;
    }
    @keyframes aiPulse {
      0%,100% { transform: scale(1); opacity: 0.6; }
      50%      { transform: scale(1.35); opacity: 0; }
    }
    /* ── Chat panel ──────────────────────────────── */
    #scoop-ai-panel {
      position: fixed; bottom: 100px; right: 24px; z-index: 10000;
      width: 380px; max-height: 580px;
      background: var(--bg-secondary, #0A1628);
      border: 1px solid var(--border-glass, rgba(255,255,255,0.1));
      border-radius: 24px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(79,70,229,0.2);
      backdrop-filter: blur(24px);
      display: flex; flex-direction: column;
      overflow: hidden;
      transform: translateY(20px) scale(0.97); opacity: 0; pointer-events: none;
      transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.25s;
    }
    #scoop-ai-panel.open {
      transform: translateY(0) scale(1); opacity: 1; pointer-events: all;
    }
    /* ── Panel header ───────────────────────────── */
    .ai-header {
      display: flex; align-items: center; gap: 12px;
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--border-glass, rgba(255,255,255,0.08));
      flex-shrink: 0;
    }
    .ai-avatar {
      width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0;
      background: linear-gradient(135deg, #4F46E5, #7C3AED);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; box-shadow: 0 4px 14px rgba(79,70,229,0.4);
    }
    .ai-header-text { flex: 1; }
    .ai-name   { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; color: var(--text-primary, #F8FAFF); }
    .ai-status { font-size: 11px; color: var(--accent-emerald, #10B981); display: flex; align-items: center; gap: 5px; margin-top: 2px; }
    .ai-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent-emerald, #10B981); animation: aiPulse 2s infinite; }
    .ai-close  { background: none; border: none; color: var(--text-muted, #5A6A8A); font-size: 18px; cursor: pointer; padding: 4px; border-radius: 6px; transition: color 0.2s; line-height: 1; }
    .ai-close:hover { color: var(--text-primary, #F8FAFF); }
    /* ── Messages ───────────────────────────────── */
    .ai-messages {
      flex: 1; overflow-y: auto; padding: 16px 16px 8px;
      display: flex; flex-direction: column; gap: 12px;
      scroll-behavior: smooth;
    }
    .ai-messages::-webkit-scrollbar { width: 4px; }
    .ai-messages::-webkit-scrollbar-thumb { background: var(--border-glass, rgba(255,255,255,0.1)); border-radius: 999px; }
    .ai-msg {
      display: flex; gap: 10px; align-items: flex-end;
      animation: msgIn 0.3s ease both;
    }
    @keyframes msgIn { from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);} }
    .ai-msg.user { flex-direction: row-reverse; }
    .ai-bubble {
      max-width: 82%; padding: 10px 14px; border-radius: 18px;
      font-size: 13px; line-height: 1.55; word-break: break-word;
    }
    .ai-msg.bot  .ai-bubble { background: var(--bg-glass, rgba(255,255,255,0.05)); border: 1px solid var(--border-glass, rgba(255,255,255,0.08)); color: var(--text-primary, #F8FAFF); border-bottom-left-radius: 4px; }
    .ai-msg.user .ai-bubble { background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; border-bottom-right-radius: 4px; }
    .ai-msg-icon { width: 28px; height: 28px; border-radius: 9px; background: linear-gradient(135deg,#4F46E5,#7C3AED); display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
    /* ── Typing indicator ───────────────────────── */
    .ai-typing { display: flex; gap: 5px; padding: 12px 14px; }
    .ai-typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted, #5A6A8A); animation: typingDot 1.2s infinite; }
    .ai-typing span:nth-child(2) { animation-delay: 0.2s; }
    .ai-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typingDot { 0%,60%,100%{transform:translateY(0);opacity:0.4;}30%{transform:translateY(-6px);opacity:1;} }
    /* ── Quick chips ────────────────────────────── */
    .ai-chips {
      padding: 4px 16px 10px; display: flex; flex-wrap: wrap; gap: 7px; flex-shrink: 0;
    }
    .ai-chip {
      padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 600;
      background: var(--bg-glass, rgba(255,255,255,0.05));
      border: 1px solid var(--border-glass, rgba(255,255,255,0.1));
      color: var(--text-secondary, #94A3C0); cursor: pointer;
      transition: all 0.2s; font-family: 'Space Grotesk', sans-serif;
      white-space: nowrap;
    }
    .ai-chip:hover { background: rgba(79,70,229,0.15); border-color: #4F46E5; color: #818CF8; }
    /* ── Input area ─────────────────────────────── */
    .ai-input-row {
      display: flex; gap: 10px; align-items: center;
      padding: 12px 16px 16px; border-top: 1px solid var(--border-glass, rgba(255,255,255,0.08));
      flex-shrink: 0;
    }
    .ai-input {
      flex: 1; background: var(--bg-glass, rgba(255,255,255,0.05));
      border: 1px solid var(--border-glass, rgba(255,255,255,0.1));
      border-radius: 14px; padding: 10px 14px;
      color: var(--text-primary, #F8FAFF); font-family: 'DM Sans', sans-serif;
      font-size: 13px; outline: none; resize: none;
      transition: border-color 0.2s; min-height: 42px; max-height: 110px;
    }
    .ai-input::placeholder { color: var(--text-muted, #5A6A8A); }
    .ai-input:focus { border-color: #4F46E5; }
    .ai-send {
      width: 42px; height: 42px; border-radius: 12px; border: none; cursor: pointer;
      background: linear-gradient(135deg, #4F46E5, #7C3AED);
      color: #fff; font-size: 17px; display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(79,70,229,0.35);
    }
    .ai-send:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(79,70,229,0.45); }
    .ai-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    /* ── Empty state ────────────────────────────── */
    .ai-empty { text-align: center; padding: 24px 20px 8px; }
    .ai-empty-icon { font-size: 36px; margin-bottom: 10px; }
    .ai-empty-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; color: var(--text-primary, #F8FAFF); margin-bottom: 6px; }
    .ai-empty-sub   { font-size: 12px; color: var(--text-muted, #5A6A8A); line-height: 1.5; }
    /* ── Light mode ─────────────────────────────── */
    [data-theme="light"] #scoop-ai-panel { background: rgba(240,244,255,0.97); border-color: rgba(79,70,229,0.15); }
    [data-theme="light"] .ai-msg.bot .ai-bubble { background: rgba(255,255,255,0.8); border-color: rgba(79,70,229,0.12); }
    [data-theme="light"] .ai-chip { background: rgba(255,255,255,0.7); }
    /* ── Mobile ─────────────────────────────────── */
    @media(max-width:440px) {
      #scoop-ai-panel { width: calc(100vw - 24px); right: 12px; bottom: 90px; }
    }
  `;
  document.head.appendChild(style);

  const html = `
    <!-- Scoop AI floating button -->
    <button id="scoop-ai-btn" aria-label="Open Scoop AI">
      <span class="ai-pulse"></span>
      ✦
    </button>

    <!-- Scoop AI chat panel -->
    <div id="scoop-ai-panel" role="dialog" aria-label="Scoop AI Assistant">
      <div class="ai-header">
        <div class="ai-avatar">✦</div>
        <div class="ai-header-text">
          <div class="ai-name">Scoop AI</div>
          <div class="ai-status">Connected to Firebase</div>
        </div>
        <button class="ai-close" id="scoop-ai-close" aria-label="Close">✕</button>
      </div>

      <div class="ai-messages" id="scoop-ai-messages">
        <div class="ai-empty">
          <div class="ai-empty-icon">✦</div>
          <div class="ai-empty-title">Hi, I'm Scoop AI</div>
          <div class="ai-empty-sub">Ask me anything about campaigns,<br>assets, rates, or traffic reports.</div>
        </div>
      </div>

      <div class="ai-chips" id="scoop-ai-chips"></div>

      <div class="ai-input-row">
        <textarea
          class="ai-input"
          id="scoop-ai-input"
          placeholder="Ask about campaigns, assets, rates…"
          rows="1"
          aria-label="Message Scoop AI"
        ></textarea>
        <button class="ai-send" id="scoop-ai-send" aria-label="Send">➤</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", html);
}

/* ─── Fetch live context from Firebase ──────────────────── */
async function fetchContext() {
  const ctx = { campaigns: [], assetRates: assetRate };

  try {
    const snap = await get(ref(rtdb, "/"));
    if (snap.exists()) {
      const data = snap.val();

      // Collect all campaign booking rows
      const bookingTable = data["Campaigns_Booking"];
      if (bookingTable) {
        const entries = Array.isArray(bookingTable)
          ? bookingTable.entries()
          : Object.entries(bookingTable);
        for (const [, row] of entries) {
          if (row) ctx.campaigns.push(row);
        }
      }

      // Collect digital/static inventory rows for context
      ctx.inventory = {};
      Object.entries(data).forEach(([k, v]) => {
        if ((k.startsWith("d_") || k.startsWith("s_")) && v) {
          ctx.inventory[k] = Object.values(v).filter(Boolean);
        }
      });
    }
  } catch (e) {
    console.warn("Scoop AI: Firebase fetch failed", e);
  }

  return ctx;
}

/* ─── Build system prompt ───────────────────────────────── */
function buildSystemPrompt(ctx) {
  const now  = new Date();
  const date = now.toLocaleDateString("en-QA", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

  const campaignSummary = ctx.campaigns.slice(0, 60).map(c =>
    `• ${c.Client || "?"} | ${c["Brand Campaign"] || "?"} | Circuit: ${c.Circuits || "?"} | ${c["Start Date"] || "?"} → ${c["End Date"] || "?"} | Status: ${c.Status || "?"} | Person: ${c.Person || "?"}`
  ).join("\n");

  const rateLines = Object.entries(ctx.assetRates).map(([k, v]) => {
    const detail = v.screens
      ? `Screens: ${v.screens} | Rate: ${v.rate} | Upload Fee: ${v.uploadfee} | Duration: ${v.duration} | Dim: ${v.dimension}`
      : `Faces: ${v.faces} | Rate: ${v.rate} | Install: ${v.installation} | Duration: ${v.duration} | Dim: ${v.dimension}`;
    return `• ${v.title} [${k}]: ${detail}`;
  }).join("\n");

  return `You are Scoop AI, the intelligent assistant for SCOOP OOH Assets — an Out-of-Home (OOH) advertising platform operated by Scoop Media & Communication Co. in The Pearl, Qatar.

Today is ${date}.

Your role is to help the operations team with:
- Campaign status, scheduling, and bookings
- Asset availability, rates, and technical specifications
- Content inventory updates and publishing
- Vehicle traffic and footfall insights
- Operational metrics and reminders

Always be concise, professional, and data-driven. Format numbers clearly. When answering about campaigns or assets, reference the live data below.

━━━━━━━━━━━━━━━━━━━━━━━━
LIVE CAMPAIGN BOOKINGS (${ctx.campaigns.length} total)
━━━━━━━━━━━━━━━━━━━━━━━━
${campaignSummary || "No campaigns found."}

━━━━━━━━━━━━━━━━━━━━━━━━
ASSET RATE CARD
━━━━━━━━━━━━━━━━━━━━━━━━
${rateLines}

Rules:
- Only answer questions relevant to OOH advertising, campaigns, assets, and operations.
- If asked something outside this domain, politely redirect.
- Never fabricate campaign data — only cite what appears in the live data above.
- Use QAR for all monetary values.
- Keep responses under 300 words unless a detailed breakdown is explicitly requested.`;
}

/* ─── Call the AI endpoint (Firebase Function) ──────────── */
async function callAI(messages, ctx) {
  const systemPrompt = buildSystemPrompt(ctx);

  const payload = {
    system:   systemPrompt,
    messages: messages,
  };

  const res = await fetch(AI_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI error ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.content?.[0]?.text || json.reply || "I couldn't generate a response. Please try again.";
}

/* ─── Widget controller ─────────────────────────────────── */
export function initScoopAI() {
  injectWidget();

  const btn      = document.getElementById("scoop-ai-btn");
  const panel    = document.getElementById("scoop-ai-panel");
  const closeBtn = document.getElementById("scoop-ai-close");
  const input    = document.getElementById("scoop-ai-input");
  const sendBtn  = document.getElementById("scoop-ai-send");
  const msgs     = document.getElementById("scoop-ai-messages");
  const chips    = document.getElementById("scoop-ai-chips");

  let isOpen    = false;
  let isLoading = false;
  let context   = null;
  const history = []; // { role, content }

  // Render quick-action chips
  QUICK_ACTIONS.forEach(q => {
    const chip = document.createElement("button");
    chip.className   = "ai-chip";
    chip.textContent = q;
    chip.addEventListener("click", () => sendMessage(q));
    chips.appendChild(chip);
  });

  // Toggle panel
  function togglePanel() {
    isOpen = !isOpen;
    panel.classList.toggle("open", isOpen);
    if (isOpen) {
      // Lazily fetch context once
      if (!context) fetchContext().then(c => { context = c; });
      setTimeout(() => input.focus(), 300);
    }
  }

  btn.addEventListener("click", togglePanel);
  closeBtn.addEventListener("click", () => { isOpen = false; panel.classList.remove("open"); });

  // Auto-resize textarea
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 110) + "px";
  });

  // Send on Enter (Shift+Enter for new line)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  sendBtn.addEventListener("click", () => {
    const text = input.value.trim();
    if (text) sendMessage(text);
  });

  async function sendMessage(text) {
    if (isLoading || !text) return;

    // Remove empty state on first message
    const empty = msgs.querySelector(".ai-empty");
    if (empty) empty.remove();

    // Remove chips after first interaction
    chips.style.display = "none";

    // Add user bubble
    appendBubble("user", text);
    history.push({ role: "user", content: text });
    input.value = "";
    input.style.height = "auto";

    // Show typing indicator
    isLoading = true;
    sendBtn.disabled = true;
    const typingEl = appendTyping();
    scrollToBottom();

    try {
      // Ensure context is ready
      if (!context) context = await fetchContext();

      const reply = await callAI(history, context);

      typingEl.remove();
      appendBubble("bot", reply);
      history.push({ role: "assistant", content: reply });

    } catch (err) {
      typingEl.remove();
      appendBubble("bot", `⚠️ ${err.message || "Something went wrong. Please try again."}`);
      console.error("Scoop AI error:", err);
    } finally {
      isLoading        = false;
      sendBtn.disabled = false;
      scrollToBottom();
    }
  }

  function appendBubble(role, text) {
    const isBot = role === "bot";
    const el = document.createElement("div");
    el.className = `ai-msg ${role}`;
    el.innerHTML = isBot
      ? `<div class="ai-msg-icon">✦</div><div class="ai-bubble">${formatReply(text)}</div>`
      : `<div class="ai-bubble">${escapeHTML(text)}</div>`;
    msgs.appendChild(el);
    scrollToBottom();
    return el;
  }

  function appendTyping() {
    const el = document.createElement("div");
    el.className = "ai-msg bot";
    el.innerHTML = `<div class="ai-msg-icon">✦</div><div class="ai-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div>`;
    msgs.appendChild(el);
    return el;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
  }

  function escapeHTML(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function formatReply(text) {
    return escapeHTML(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code style='background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:12px;'>$1</code>")
      .replace(/\n/g, "<br>");
  }
}
