import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const STORE = path.join(os.homedir(), ".exile-ai", "whatsapp-automation.json");

const DEFAULTS = {
  autoReply: {
    enabled: false,
    allowedJids: [],
    template: "Thanks for your message, {name}. I've received it and will get back to you soon.",
    dailyLimit: 20,
    cooldownMinutes: 30,
  },
  autoStart: {
    enabled: false,
    dailyLimit: 3,
    quietHours: { start: "21:00", end: "08:00" },
    rules: [],
  },
};

let state = {
  config: structuredClone(DEFAULTS),
  processedIds: [],
  replyTimes: {},
  sentLog: [],
};

let generateReply = null;
let sendMessage = null;
let schedulerStarted = false;
let schedulerBusy = false;
const inFlightReplyJids = new Set();
let autoReplyEpoch = 0;

function cleanJid(value) {
  const raw = String(value || "").trim();
  if (raw.endsWith("@s.whatsapp.net")) {
    const number = raw.slice(0, -"@s.whatsapp.net".length).replace(/\D/g, "");
    return number ? `${number}@s.whatsapp.net` : "";
  }
  if (raw.includes("@")) return "";
  const number = raw.replace(/\D/g, "");
  return number ? `${number}@s.whatsapp.net` : "";
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, Math.floor(number)))
    : fallback;
}

function validClock(value, fallback) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : fallback;
}

function normalizeConfig(input = {}) {
  const reply = input.autoReply || {};
  const start = input.autoStart || {};

  return {
    autoReply: {
      enabled: reply.enabled === true,
      allowedJids: [...new Set(
        (Array.isArray(reply.allowedJids) ? reply.allowedJids : [])
          .map(cleanJid).filter(Boolean)
      )].slice(0, 500),
      template: typeof reply.template === "string"
        ? reply.template.trim().slice(0, 2000)
        : DEFAULTS.autoReply.template,
      dailyLimit: boundedNumber(reply.dailyLimit, 20, 1, 100),
      cooldownMinutes: boundedNumber(reply.cooldownMinutes, 30, 1, 1440),
    },
    autoStart: {
      enabled: start.enabled === true,
      dailyLimit: boundedNumber(start.dailyLimit, 3, 1, 20),
      quietHours: {
        start: validClock(start.quietHours?.start, "21:00"),
        end: validClock(start.quietHours?.end, "08:00"),
      },
      rules: (Array.isArray(start.rules) ? start.rules : [])
        .slice(0, 100)
        .map((rule) => ({
          id: typeof rule.id === "string" && rule.id.length < 100
            ? rule.id : crypto.randomUUID(),
          jid: cleanJid(rule.jid),
          name: String(rule.name || "").trim().slice(0, 100),
          message: String(rule.message || "").trim().slice(0, 2000),
          enabled: rule.enabled === true,
          nextAt: typeof rule.nextAt === "string" &&
            Number.isFinite(Date.parse(rule.nextAt))
              ? new Date(rule.nextAt).toISOString() : "",
          repeat: ["once", "daily", "weekly"].includes(rule.repeat)
            ? rule.repeat : "once",
        }))
        .filter((rule) => rule.jid && rule.message && rule.nextAt),
    },
  };
}

function persist() {
  const temp = `${STORE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(temp, STORE);
    return true;
  } catch (error) {
    console.error("[WhatsApp automation] Could not save settings:", error.message);
    try { fs.rmSync(temp, { force: true }); } catch {}
    return false;
  }
}

try {
  const saved = JSON.parse(fs.readFileSync(STORE, "utf8"));
  state.config = normalizeConfig(saved.config || {});
  state.processedIds = Array.isArray(saved.processedIds)
    ? saved.processedIds.filter((id) => typeof id === "string").slice(-2000)
    : [];
  state.replyTimes = saved.replyTimes && typeof saved.replyTimes === "object"
    ? saved.replyTimes : {};
  state.sentLog = Array.isArray(saved.sentLog)
    ? saved.sentLog.filter((item) => item && Number.isFinite(item.at)).slice(-2000)
    : [];
} catch {
  // First run: automation remains disabled.
}

export function getWhatsAppAutomationConfig() {
  return structuredClone(state.config);
}

export function updateWhatsAppAutomationConfig(input) {
  const previous = state.config;
  const next = normalizeConfig(input);
  const invalidatesPendingReplies =
    previous.autoReply.enabled !== next.autoReply.enabled ||
    previous.autoReply.allowedJids.join(",") !== next.autoReply.allowedJids.join(",");

  state.config = next;

  if (!persist()) {
    state.config = previous;
    throw new Error("Could not save WhatsApp automation settings to disk.");
  }

  if (invalidatesPendingReplies) autoReplyEpoch++;
  return getWhatsAppAutomationConfig();
}

export function configureWhatsAppAutomation({ generate, send }) {
  generateReply = generate;
  sendMessage = send;
}

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayCount(kind) {
  const today = localDayKey();
  return state.sentLog.filter((item) =>
    item.day === today && (!kind || item.kind === kind)
  ).length;
}

function recordSent(kind, jid) {
  state.sentLog.push({
    at: Date.now(),
    day: localDayKey(),
    kind,
    jid,
  });
  state.sentLog = state.sentLog.slice(-2000);
  persist();
}

function inQuietHours() {
  const { start, end } = state.config.autoStart.quietHours;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (clock) => {
    const [h, m] = clock.split(":").map(Number);
    return h * 60 + m;
  };
  const from = toMinutes(start);
  const until = toMinutes(end);

  if (from === until) return false;
  return from < until
    ? current >= from && current < until
    : current >= from || current < until;
}

function nextSchedule(rule) {
  if (rule.repeat === "once") return "";
  const date = new Date(rule.nextAt);
  date.setTime(date.getTime() + (rule.repeat === "daily" ? 86400000 : 604800000));
  return date.toISOString();
}

export async function handleWhatsAppIncoming(item) {
  const id = String(item?.id || "");
  const jid = cleanJid(item?.jid);
  const text = String(item?.text || "").trim();

  if (!id || !jid || !text) return { skipped: true };

  // Message IDs are scoped to the sender to avoid cross-contact collisions.
  const processedKey = `${jid}:${id}`;
  if (state.processedIds.includes(processedKey)) {
    return { skipped: true, duplicate: true };
  }

  state.processedIds.push(processedKey);
  state.processedIds = state.processedIds.slice(-2000);
  persist();

  const config = state.config.autoReply;
  if (!config.enabled || !config.allowedJids.includes(jid)) {
    return { skipped: true, reason: "not-enabled-or-not-approved" };
  }
  if (!sendMessage) return { skipped: true, reason: "sender-unavailable" };
  if (todayCount("reply") >= config.dailyLimit) {
    return { skipped: true, reason: "daily-limit" };
  }

  const last = Number(state.replyTimes[jid] || 0);
  if (Date.now() - last < config.cooldownMinutes * 60000) {
    return { skipped: true, reason: "cooldown" };
  }
  if (inFlightReplyJids.has(jid)) {
    return { skipped: true, reason: "reply-in-progress" };
  }

  // Lock this contact before any asynchronous AI generation or sending.
  const replyEpoch = autoReplyEpoch;
  inFlightReplyJids.add(jid);
  try {
    return await generateAndSendReply(item, jid, text, config, replyEpoch);
  } finally {
    inFlightReplyJids.delete(jid);
  }
}

async function generateAndSendReply(item, jid, text, config, replyEpoch) {
  const name = String(item.name || "there").slice(0, 100);
  const fallback = (config.template || DEFAULTS.autoReply.template)
    .replaceAll("{name}", name)
    .replaceAll("{message}", text.slice(0, 500));

  let reply = fallback;
  if (generateReply) {
    try {
      const generated = await generateReply({
        name,
        incomingText: text.slice(0, 4000),
        jid,
      });
      if (typeof generated === "string" && generated.trim()) {
        reply = generated.trim().slice(0, 4000);
      }
    } catch (error) {
      console.warn("[WhatsApp automation] AI generation failed; using template:", error.message);
    }
  }

  // A switch-off or allowlist change while AI was generating cancels
  // this unsent reply, even if auto-reply is quickly switched on again.
  if (
    replyEpoch !== autoReplyEpoch ||
    !state.config.autoReply.enabled ||
    !state.config.autoReply.allowedJids.includes(jid)
  ) {
    return { skipped: true, reason: "disabled-before-send" };
  }

  try {
    await sendMessage(jid, reply);
    state.replyTimes[jid] = Date.now();
    recordSent("reply", jid);
    return { sent: true };
  } catch (error) {
    console.error("[WhatsApp automation] Reply failed:", error.message);
    return { sent: false, reason: "send-failed" };
  }
}

async function runScheduledMessages() {
  if (schedulerBusy || !state.config.autoStart.enabled || !sendMessage) return;
  if (inQuietHours()) return;
  if (todayCount("start") >= state.config.autoStart.dailyLimit) return;

  schedulerBusy = true;
  try {
    const rules = state.config.autoStart.rules;
    for (const rule of rules) {
      if (!rule.enabled || !rule.nextAt || Date.parse(rule.nextAt) > Date.now()) continue;
      if (todayCount("start") >= state.config.autoStart.dailyLimit) break;

      // Send before advancing the schedule so a failed send stays due.
      // A crash after delivery but before persistence may cause a repeat.
      try {
        await sendMessage(rule.jid, rule.message);
        recordSent("start", rule.jid);

        const following = nextSchedule(rule);
        if (following) {
          rule.nextAt = following;
        } else {
          rule.enabled = false;
          rule.nextAt = "";
        }

        if (!persist()) {
          console.error(
            "[WhatsApp automation] Message sent, but schedule persistence failed."
          );
        }
        console.info("[WhatsApp automation] Scheduled message sent.");
      } catch (error) {
        console.warn("[WhatsApp automation] Scheduled send failed:", error.message);
      }
    }
  } finally {
    schedulerBusy = false;
  }
}

export function startWhatsAppAutomationScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const timer = setInterval(() => {
    void runScheduledMessages();
  }, 60000);
  timer.unref?.();
}
