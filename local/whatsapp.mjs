import makeWASocket, {
  DisconnectReason,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { handleWhatsAppIncoming } from "./whatsapp-automation.mjs";
import {
  handleWhatsAppConversationIncoming,
  getWhatsAppConversationAIConfig,
} from "./whatsapp-conversation.mjs";

const AUTH_DIR =
  process.env.EXILE_WHATSAPP_AUTH_DIR ||
  path.join(os.homedir(), ".exile-ai", "whatsapp-auth");

let socket = null;
let starting = null;
let reconnectTimer = null;
let manualDisconnect = false;
let qrDataUrl = null;
let lastError = null;
let connectionStatus = "disconnected";
let messages = [];
let callEvents = [];
let connectedUser = null;

const EXILE_DATA_DIR = path.join(os.homedir(), ".exile-ai");
const MESSAGE_STORE = path.join(EXILE_DATA_DIR, "whatsapp-messages.json");
const DIRECTORY_STORE = path.join(EXILE_DATA_DIR, "whatsapp-directory.json");

let directory = { contacts: [], chats: [] };

try {
  const savedDirectory = JSON.parse(fs.readFileSync(DIRECTORY_STORE, "utf8"));
  if (savedDirectory && typeof savedDirectory === "object") {
    directory = {
      contacts: Array.isArray(savedDirectory.contacts) ? savedDirectory.contacts : [],
      chats: Array.isArray(savedDirectory.chats) ? savedDirectory.chats : [],
    };
  }
} catch {
  // The directory is created when WhatsApp supplies contact or chat data.
}

function persistDirectory() {
  const temporary = `${DIRECTORY_STORE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(DIRECTORY_STORE), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(directory), "utf8");
    fs.renameSync(temporary, DIRECTORY_STORE);
  } catch (error) {
    console.error("[WhatsApp] Could not persist contact directory:", error);
    try { fs.rmSync(temporary, { force: true }); } catch {}
  }
}

function upsertDirectoryContacts(items = []) {
  let changed = false;
  for (const contact of Array.isArray(items) ? items : []) {
    const jid = typeof contact?.id === "string"
      ? contact.id
      : typeof contact?.jid === "string" ? contact.jid : "";
    if (!jid || jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;

    const name = [
      contact.name,
      contact.notify,
      contact.verifiedName,
      contact.pushName,
    ].find((value) => typeof value === "string" && value.trim())?.trim();

    if (!name) continue;
    const index = directory.contacts.findIndex((item) => item.jid === jid);
    if (index >= 0) {
      if (directory.contacts[index].name !== name) {
        directory.contacts[index] = { ...directory.contacts[index], name };
        changed = true;
      }
    } else {
      directory.contacts.push({ jid, name });
      changed = true;
    }
  }
  if (directory.contacts.length > 10000) {
    directory.contacts = directory.contacts.slice(-10000);
    changed = true;
  }
  if (changed) persistDirectory();
}

function upsertDirectoryChats(items = []) {
  let changed = false;
  for (const chat of Array.isArray(items) ? items : []) {
    if (typeof chat?.id !== "string" || !chat.id) continue;
    const index = directory.chats.findIndex((item) => item.id === chat.id);
    const safe = {
      id: chat.id,
      name: typeof chat.name === "string" ? chat.name : "",
      conversationTimestamp: Number(chat.conversationTimestamp || 0),
    };
    if (index >= 0) {
      directory.chats[index] = { ...directory.chats[index], ...safe };
    } else {
      directory.chats.push(safe);
    }
    changed = true;
  }
  if (directory.chats.length > 10000) directory.chats = directory.chats.slice(-10000);
  if (changed) persistDirectory();
}

function contactNameFor(jid, fallback = "") {
  return directory.contacts.find((contact) => contact.jid === jid)?.name
    || (fallback && fallback !== jid ? fallback : "")
    || jid;
}

export function getWhatsAppContacts() {
  return directory.contacts
    .filter((contact) => typeof contact.jid === "string"
      && contact.jid.endsWith("@s.whatsapp.net"))
    .map((contact) => ({
      id: contact.jid,
      jid: contact.jid,
      phone: contact.jid.split("@")[0].replace(/\\D/g, ""),
      name: contact.name || contact.jid,
      source: "whatsapp",
    }))
    .filter((contact) => contact.phone.length >= 7)
    .sort((a, b) => a.name.localeCompare(b.name));
}

try {
  const saved = JSON.parse(fs.readFileSync(MESSAGE_STORE, "utf8"));
  if (Array.isArray(saved)) {
    messages = saved
      .filter((item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.jid === "string" &&
        typeof item.text === "string"
      )
      .slice(-5000);
  }
} catch {
  // A missing or unreadable store starts with an empty message list.
}

function persistMessages() {
  const temporary = `${MESSAGE_STORE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(MESSAGE_STORE), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(messages), "utf8");
    fs.renameSync(temporary, MESSAGE_STORE);
  } catch (error) {
    console.error("[WhatsApp] Could not persist messages:", error);
    try {
      fs.rmSync(temporary, { force: true });
    } catch {}
  }
}

function status() {
  return {
    status: connectionStatus,
    connected: connectionStatus === "connected",
    qrDataUrl,
    user: connectedUser,
    lastError,
  };
}

function unwrapMessage(message) {
  let current = message;
  while (current) {
    const wrapped =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current || {};
}

function messageText(message) {
  const m = unwrapMessage(message);
  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title;

  if (text) return String(text);

  const type = Object.keys(m).find((key) => key.endsWith("Message"));
  return type ? `[${type.replace("Message", "")}]` : "";
}


async function collectWhatsAppMedia(stream, maxBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error("WhatsApp attachment exceeds the processing size limit.");
    }
    chunks.push(buffer);
  }

  if (!total) throw new Error("WhatsApp attachment was empty.");
  return Buffer.concat(chunks, total);
}

export async function downloadWhatsAppIncomingMedia(msg) {
  const content = unwrapMessage(msg?.message);

  if (content.imageMessage) {
    const image = content.imageMessage;
    const mimeType = String(image.mimetype || "image/jpeg").toLowerCase();

    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new Error("Unsupported image format.");
    }

    const buffer = await collectWhatsAppMedia(
      await downloadContentFromMessage(image, "image"),
      8 * 1024 * 1024,
    );

    return {
      type: "image",
      mimeType,
      data: buffer.toString("base64"),
    };
  }

  if (content.videoMessage) {
    const video = content.videoMessage;
    const mimeType = String(video.mimetype || "video/mp4").toLowerCase();

    if (!["video/mp4", "video/3gpp", "video/quicktime"].includes(mimeType)) {
      throw new Error("Unsupported video format.");
    }

    const buffer = await collectWhatsAppMedia(
      await downloadContentFromMessage(video, "video"),
      15 * 1024 * 1024,
    );

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "exile-wa-vision-"));

    try {
      const extension = mimeType === "video/3gpp" ? "3gp"
        : mimeType === "video/quicktime" ? "mov" : "mp4";
      const inputPath = path.join(tempDir, `incoming.${extension}`);
      fs.writeFileSync(inputPath, buffer, { flag: "wx" });

      const probe = spawnSync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ], {
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      });

      const duration = Number(String(probe.stdout || "").trim());

      if (probe.error || probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) {
        throw new Error("Could not read the video duration.");
      }
      if (duration > 60) {
        throw new Error("Videos longer than 60 seconds are not supported for WhatsApp analysis.");
      }

      const frames = [];
      const ratios = [0.05, 0.33, 0.66, 0.90];

      for (const ratio of ratios) {
        const seconds = Math.max(0, Math.min(duration - 0.01, duration * ratio));
        const frame = spawnSync("ffmpeg", [
          "-hide_banner", "-loglevel", "error",
          "-ss", seconds.toFixed(3),
          "-i", inputPath,
          "-frames:v", "1",
          "-vf", "scale=640:-2",
          "-q:v", "6",
          "-f", "image2pipe",
          "-vcodec", "mjpeg",
          "pipe:1",
        ], {
          encoding: "buffer",
          maxBuffer: 2 * 1024 * 1024,
          timeout: 15000,
          windowsHide: true,
        });

        if (!frame.error && frame.status === 0 && frame.stdout?.length) {
          frames.push({
            mimeType: "image/jpeg",
            data: frame.stdout.toString("base64"),
          });
        }
      }

      if (!frames.length) {
        throw new Error("Could not extract readable frames from the video.");
      }

      return {
        type: "video",
        durationSeconds: Math.round(duration),
        frames,
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  return null;
}

function rememberMessage(item) {
  if (!item.text) return;
  const existingIndex = messages.findIndex(
    (message) => message.id === item.id && message.jid === item.jid
  );
  if (existingIndex >= 0) {
    const existing = messages[existingIndex];
    if (item.name && item.name !== item.jid &&
        (!existing.name || existing.name === existing.jid)) {
      messages[existingIndex] = { ...existing, name: item.name };
      persistMessages();
    }
    return;
  }
  messages.push(item);
  if (messages.length > 5000) messages = messages.slice(-5000);
  persistMessages();
}

let baileysVersion = null;

export async function connectWhatsApp() {
  manualDisconnect = false;
  if (socket) return status();
  if (starting) return starting;

  starting = (async () => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    if (!baileysVersion) {
      const latest = await fetchLatestBaileysVersion();
      baileysVersion = latest.version;
      console.info(
        "[WhatsApp] Using WhatsApp Web version",
        baileysVersion.join(".")
      );
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const ws = makeWASocket({
      auth: state,
      version: baileysVersion,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: true,
      browser: ["INDI AI", "Chrome", "1.0.0"],
    });

    socket = ws;
    connectionStatus = "connecting";
    qrDataUrl = null;
    lastError = null;

    ws.ev.on("creds.update", saveCreds);

    ws.ev.on("connection.update", async (update) => {
      if (update.qr) {
        try {
          qrDataUrl = await QRCode.toDataURL(update.qr);
          connectionStatus = "qr";
        } catch {
          lastError = "Could not generate the WhatsApp QR code.";
        }
      }

      if (update.connection === "open") {
        connectionStatus = "connected";
        qrDataUrl = null;
        lastError = null;
        connectedUser = ws.user?.id || null;
      }

      if (update.connection === "close") {
        const disconnectError = update.lastDisconnect?.error;
        const code = disconnectError?.output?.statusCode;
        console.error("[WhatsApp] Connection closed", {
          code: code ?? null,
          message: disconnectError?.message ?? "Unknown disconnect error",
          loggedOut: code === DisconnectReason.loggedOut,
          errorName: disconnectError?.name ?? null,
        });
        if (socket === ws) socket = null;

        connectionStatus = "disconnected";
        qrDataUrl = null;
        connectedUser = null;

        const loggedOut = code === DisconnectReason.loggedOut;
        lastError = loggedOut
          ? "WhatsApp logged out this device. Connect again and scan a new QR code."
          : `WhatsApp connection closed${code ? ` (code ${code})` : ""}: ${disconnectError?.message || "Unknown reason"}`;

        if (!manualDisconnect && !loggedOut) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            connectWhatsApp().catch(() => {});
          }, 2000);
        }
      }
    });

    // WhatsApp history is archived only; never run either reply handler here.
    ws.ev.on("messaging-history.set", ({ chats = [], contacts = [], messages: history = [] } = {}) => {
      console.info("[WhatsApp history] Received sync batch", {
        chats: chats.length,
        contacts: contacts.length,
        messages: history.length,
      });
      upsertDirectoryContacts(contacts);
      upsertDirectoryChats(chats);

      for (const msg of history) {
        const jid = msg.key?.remoteJid;
        if (!jid || jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;
        const pushName = typeof msg.pushName === "string" ? msg.pushName : "";
        if (pushName && pushName !== jid) {
          upsertDirectoryContacts([{ id: jid, name: pushName }]);
        }
        rememberMessage({
          id: msg.key?.id || `${jid}-${msg.messageTimestamp || Date.now()}`,
          jid,
          fromMe: Boolean(msg.key?.fromMe),
          name: contactNameFor(jid, pushName),
          text: messageText(msg.message),
          timestamp: Number(msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000,
        });
      }
    });

    ws.ev.on("contacts.upsert", (items = []) => upsertDirectoryContacts(items));
    ws.ev.on("contacts.update", (items = []) => upsertDirectoryContacts(items));
    ws.ev.on("chats.upsert", (items = []) => upsertDirectoryChats(items));

    ws.ev.on("messages.upsert", ({ messages: incoming, type }) => {
      console.info("[WhatsApp inbound] Event received", {
        type: type || "unknown",
        count: Array.isArray(incoming) ? incoming.length : 0,
      });
      for (const msg of incoming || []) {
        console.info("[WhatsApp inbound] Message metadata", {
          hasId: Boolean(msg.key?.id),
          fromMe: Boolean(msg.key?.fromMe),
          hasRemoteJid: Boolean(msg.key?.remoteJid),
          hasText: Boolean(messageText(msg.message)),
          messageType: Object.keys(msg.message || {}).slice(0, 5),
        });
        const jid = msg.key?.remoteJid;
        if (!jid || jid === "status@broadcast" || jid.endsWith("@newsletter")) {
          continue;
        }

        const pushName = typeof msg.pushName === "string" ? msg.pushName : "";
        if (pushName && pushName !== jid) {
          upsertDirectoryContacts([{ id: jid, name: pushName }]);
        }

        const item = {
          id: msg.key?.id || `${jid}-${Date.now()}`,
          jid,
          fromMe: Boolean(msg.key?.fromMe),
          name: contactNameFor(jid, pushName),
          text: messageText(msg.message),
          timestamp: Number(msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000,
        };
        rememberMessage(item);

        // Download media only when Conversational AI is enabled.
        const rawMessage = unwrapMessage(msg.message);
        const mediaKind = rawMessage.imageMessage ? "image"
          : rawMessage.videoMessage ? "video" : "";

        if (
          type === "notify" &&
          !item.fromMe &&
          item.text &&
          msg.key?.id &&
          (mediaKind || !/^\[[^\]]+\]$/.test(item.text)) &&
          (!mediaKind || getWhatsAppConversationAIConfig().enabled)
        ) {
          void (async () => {
            const media = mediaKind
              ? await downloadWhatsAppIncomingMedia(msg)
              : null;
            await handleWhatsAppConversationIncoming({ ...item, media });
          })().catch((error) => {
            console.error("[WhatsApp conversation AI] Incoming processing failed:", error.message);
          });
        }

        // Do not automate history sync, own messages, groups, or non-text placeholders.
        if (
          type === "notify" &&
          !item.fromMe &&
          !mediaKind &&
          jid.endsWith("@s.whatsapp.net") &&
          item.text &&
          !/^\[[^\]]+\]$/.test(item.text) &&
          msg.key?.id
        ) {
          void handleWhatsAppIncoming(item).catch((error) => {
            console.error("[WhatsApp automation] Incoming-message handler failed:", error.message);
          });
        }
      }
    });

    ws.ev.on("call", (updates = []) => {
      for (const event of Array.isArray(updates) ? updates : []) {
        if (typeof event?.id !== "string" ||
            typeof event?.from !== "string") continue;

        const parsedDate = event.date instanceof Date
          ? event.date.getTime()
          : new Date(event.date || Date.now()).getTime();

        const item = {
          id: event.id,
          from: event.from,
          chatId: typeof event.chatId === "string"
            ? event.chatId : event.from,
          status: typeof event.status === "string"
            ? event.status : "unknown",
          isVideo: Boolean(event.isVideo),
          isGroup: Boolean(event.isGroup),
          timestamp: Number.isFinite(parsedDate)
            ? parsedDate : Date.now(),
          offline: Boolean(event.offline),
        };

        callEvents = [
          item,
          ...callEvents.filter(
            (existing) =>
              existing.id !== item.id || existing.from !== item.from
          ),
        ].slice(0, 50);
      }
    });

    return status();
  })();

  try {
    return await starting;
  } catch (error) {
    socket = null;
    connectionStatus = "disconnected";
    lastError = error instanceof Error ? error.message : "WhatsApp failed to start.";
    throw error;
  } finally {
    starting = null;
  }
}

export function getWhatsAppStatus() {
  return status();
}

export function getWhatsAppMessages(jid = "") {
  const filtered = jid ? messages.filter((m) => m.jid === jid) : messages;
  return filtered.slice(-200);
}

export function getWhatsAppCalls() {
  return callEvents
    .map((call) => ({ ...call }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function rejectWhatsAppCall(callId) {
  if (typeof callId !== "string" || !callId.trim()) {
    throw new Error("A valid WhatsApp call ID is required.");
  }
  if (!socket || connectionStatus !== "connected") {
    throw new Error("WhatsApp is not connected.");
  }
  if (typeof socket.rejectCall !== "function") {
    throw new Error("Call rejection is not supported by this connection.");
  }

  const call = callEvents.find((item) =>
    item.id === callId &&
    !item.isGroup &&
    (item.status === "offer" || item.status === "ringing")
  );

  if (!call) {
    throw new Error("No incoming call is available to reject with that ID.");
  }

  await socket.rejectCall(call.id, call.from);

  callEvents = callEvents.map((item) =>
    item.id === call.id && item.from === call.from
      ? { ...item, status: "reject", timestamp: Date.now() }
      : item
  );

  return { success: true };
}


const WHATSAPP_MEDIA_TYPES = new Map([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["application/pdf", "document"],
  ["text/plain", "document"],
  ["text/csv", "document"],
  ["application/msword", "document"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
  ["application/vnd.ms-excel", "document"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "document"],
  ["application/vnd.ms-powerpoint", "document"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "document"],
  ["audio/mpeg", "audio"],
  ["audio/mp4", "audio"],
  ["audio/aac", "audio"],
  ["audio/ogg", "audio"],
  ["audio/opus", "audio"],
  ["audio/wav", "audio"],
  ["audio/x-wav", "audio"],
  ["audio/webm", "audio"],
]);

export async function sendWhatsAppMedia(to, dataUrl, filename, caption = "") {
  if (!socket || connectionStatus !== "connected") {
    throw new Error("Connect WhatsApp before sending attachments.");
  }

  const raw = String(to || "").trim();
  const jid = raw.includes("@")
    ? raw
    : `${raw.replace(/\D/g, "")}@s.whatsapp.net`;

  if (!jid.includes("@") || jid.startsWith("@")) {
    throw new Error("Enter a valid WhatsApp number or chat ID.");
  }

  if (jid.endsWith("@g.us") || jid.endsWith("@s.whatsapp.net") ||
      jid.endsWith("@lid")) {
    // These are supported destination types.
  } else {
    throw new Error("Unsupported WhatsApp destination.");
  }

  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(
    String(dataUrl || "")
  );

  if (!match) {
    throw new Error("Attachment data is invalid. Please choose the file again.");
  }

  const mimetype = match[1].toLowerCase();
  const kind = WHATSAPP_MEDIA_TYPES.get(mimetype);

  if (!kind) {
    throw new Error("Unsupported file type. Choose an image, PDF, document, or audio file.");
  }

  const base64 = match[2];
  if (!base64 || base64.length % 4 !== 0) {
    throw new Error("The selected attachment is empty or invalid.");
  }

  // Reject oversized data before allocating the decoded buffer.
  const estimatedSize = Math.floor(base64.length * 3 / 4);
  if (estimatedSize > 15 * 1024 * 1024) {
    throw new Error("Attachments must be 15 MB or smaller.");
  }

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) {
    throw new Error("Attachments must be non-empty and 15 MB or smaller.");
  }

  const safeName = String(filename || "attachment")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim()
    .slice(0, 180) || "attachment";

  const safeCaption = String(caption || "").trim().slice(0, 4000);

  let content;
  if (kind === "image") {
    content = {
      image: buffer,
      mimetype,
      caption: safeCaption,
    };
  } else if (kind === "document") {
    content = {
      document: buffer,
      mimetype,
      fileName: safeName,
      caption: safeCaption,
    };
  } else {
    content = {
      audio: buffer,
      mimetype,
      ptt: false,
    };
  }

  const result = await socket.sendMessage(jid, content);

  const label =
    kind === "image" ? "Image" :
    kind === "audio" ? "Audio" : "Document";

  const displayText = [
    safeCaption,
    `[${label}: ${safeName}]`,
  ].filter(Boolean).join("\n");

  rememberMessage({
    id: result?.key?.id || `sent-media-${Date.now()}`,
    jid,
    fromMe: true,
    name: jid,
    text: displayText,
    timestamp: Date.now(),
  });

  return {
    sent: true,
    jid,
    kind,
    filename: safeName,
  };
}

export async function sendWhatsAppMessage(to, text) {
  if (!socket || connectionStatus !== "connected") {
    throw new Error("Connect WhatsApp before sending messages.");
  }

  const content = String(text || "").trim();
  if (!content) throw new Error("Message cannot be empty.");

  const raw = String(to || "").trim();
  const jid = raw.includes("@")
    ? raw
    : `${raw.replace(/\D/g, "")}@s.whatsapp.net`;

  if (!jid.includes("@") || jid.startsWith("@")) {
    throw new Error("Enter a valid WhatsApp number or chat ID.");
  }

  const result = await socket.sendMessage(jid, { text: content });

  rememberMessage({
    id: result?.key?.id || `sent-${Date.now()}`,
    jid,
    fromMe: true,
    name: jid,
    text: content,
    timestamp: Date.now(),
  });

  return { sent: true, jid };
}

export async function disconnectWhatsApp() {
  manualDisconnect = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  // A connect may still be awaiting the WhatsApp version or auth state.
  // Wait until it has attached its socket before removing the active session.
  if (starting) {
    try { await starting; } catch {}
  }

  const ws = socket;
  socket = null;
  qrDataUrl = null;
  connectedUser = null;
  connectionStatus = "disconnected";

  if (ws) {
    try {
      await ws.logout();
    } catch {
      try {
        ws.end(undefined);
      } catch {}
    }
  }

  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {
    lastError = "Disconnected, but the saved authentication files could not be removed.";
  }

  if (!lastError?.startsWith("Disconnected,")) lastError = null;
  return status();
}
