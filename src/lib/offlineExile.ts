// Offline rule-based INDI AI brain — works without internet.
// Handles common commands locally so the assistant is always responsive.
import { speakWithProfile } from "@/lib/voiceProfiles";

export interface OfflineResponse {
  text: string;
  action?: { type: string; payload?: any };
}

const greetings = [
  "At your service, Sir.",
  "Online and standing by.",
  "Good to hear from you. How may I assist?",
  "Ready when you are.",
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function offlineRespondBase(input: string): OfflineResponse {
  const q = input.toLowerCase().trim();

  if (!q) return { text: "I'm listening, Sir." };

  if (/\b(hi|hello|hey|exile|indi|good (morning|evening|afternoon))\b/.test(q)) {
    return { text: pick(greetings) };
  }

  if (/\b(time|what time|clock)\b/.test(q)) {
    return { text: `The current time is ${new Date().toLocaleTimeString()}, Sir.` };
  }
  if (/\b(date|day|today)\b/.test(q)) {
    return { text: `Today is ${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.` };
  }

  if (/\bbattery\b/.test(q)) {
    return { text: "Querying device power systems…", action: { type: "battery" } };
  }

  if (/\b(open|show|go to)\s+(camera|photo)/.test(q)) return { text: "Opening camera array.", action: { type: "navigate", payload: "camera" } };
  if (/\b(open|show|go to)\s+files?/.test(q)) return { text: "Accessing file system.", action: { type: "navigate", payload: "files" } };
  if (/\b(open|show|go to)\s+share/.test(q)) return { text: "Opening share hub.", action: { type: "navigate", payload: "share" } };
  if (/\b(open|show|go to)\s+voice/.test(q)) return { text: "Voice interface engaged.", action: { type: "navigate", payload: "voice" } };
  if (/\b(open|show|grant)\s+(system|access|permission)/.test(q)) return { text: "Opening system access panel.", action: { type: "navigate", payload: "system" } };
  if (/\b(analyz|analys|scan).*(image|photo)/.test(q)) return { text: "Image analysis ready.", action: { type: "navigate", payload: "analysis" } };

  if (/^(search|google|look up|find)\b/.test(q)) {
    const term = q.replace(/^(search|google|look up|find)\s+(for\s+)?/, "");
    return {
      text: `I'd run a web search for "${term}", Sir, but we appear to be offline. I'll queue it for when connection returns.`,
      action: { type: "queue_search", payload: term },
    };
  }

  const math = q.match(/(?:what is|calculate|compute)\s+([0-9+\-*/().\s]+)/);
  if (math) {
    try {
      if (/^[0-9+\-*/().\s]+$/.test(math[1])) {
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${math[1]})`)();
        return { text: `That would be ${result}, Sir.` };
      }
    } catch {}
  }

  if (/\b(what can you do|help|capabilit)/.test(q)) {
    return {
      text:
        "Offline I can tell time, do math, open sections of the app, and chat. With connection restored, I gain full reasoning, web search, and image analysis.",
    };
  }

  if (/\b(thank|thanks)\b/.test(q)) return { text: "Always a pleasure, Sir." };
  if (/\b(bye|goodbye|exit)\b/.test(q)) return { text: "Standing by. Call when you need me." };

  return {
    text:
      "I'm in offline mode, Sir — limited reasoning. Reconnect, and I'll handle that in full.",
  };
}


/**
 * Keep INDI AI's personality present when cloud reasoning is unavailable.
 * Preserve action payloads so navigation and device commands remain intact.
 */
export function offlineRespond(input: string): OfflineResponse {
  const result = offlineRespondBase(input);
  const q = input.toLowerCase().trim();
  const venom = (() => {
    try {
      return localStorage.getItem("exile.venom-mode") === "true";
    } catch {
      return false;
    }
  })();

  const playful = (standard: string, intense: string) =>
    venom ? intense : standard;

  if (/\b(are you there|you there|anyone there)\b/.test(q)) {
    return {
      ...result,
      text: playful(
        "Right here. Quietly keeping the lights on. What do you need?",
        "Right here. Watching the wires. Try not to break reality before I finish booting.",
      ),
    };
  }

  if (/\b(thank|thanks|thank you)\b/.test(q)) {
    return {
      ...result,
      text: playful(
        "Anytime. I do enjoy being right and useful.",
        "You're welcome. Try not to look so surprised that I saved the day.",
      ),
    };
  }

  if (/\b(joke|make me laugh|funny)\b/.test(q)) {
    return {
      ...result,
      text: playful(
        "I tried to tell a joke about a computer bug, but it kept returning to the same issue. Much like some projects I know.",
        "Your code called for backup. I asked why. It said, 'Because the developer is about to call this a small change.'",
      ),
    };
  }

  if (/\b(bye|goodbye|see you|good night)\b/.test(q)) {
    return {
      ...result,
      text: playful(
        "Standing by. Go do something brilliant—or at least back up your files.",
        "Go on, then. I'll be here, judging your folder structure in silence.",
      ),
    };
  }

  if (/\b(what can you do|help|capabilit)\b/.test(q)) {
    return {
      ...result,
      text: playful(
        "Offline, I can handle a few local tasks, tell the time, calculate, and help navigate the app. For deeper reasoning, I need the configured AI service. I won't pretend otherwise.",
        "Offline I've still got a few tricks: calculations, time, and local app controls. For the heavy intellectual lifting, reconnect the reasoning core. Even I can't argue with a disconnected network.",
      ),
    };
  }

  if (
    /i (broke|broken| messed up|ruined) (the )?(code|project|app)/.test(q) ||
    /\b(it failed|something went wrong|i made a mistake)\b/.test(q)
  ) {
    return {
      ...result,
      text: playful(
        "No panic. Show me what happened and we'll work through it one step at a time.",
        "Excellent. Another mystery for the investigation board. Show me the error before we accuse the keyboard.",
      ),
    };
  }

  if (
    /i('?m| am) (sad|upset|stressed|tired|frustrated|worried)\b/.test(q)
  ) {
    return {
      ...result,
      text: "I'm here with you. You don't have to turn everything into a problem to solve immediately. Tell me what's going on, and we'll take it one step at a time.",
    };
  }

  return result;
}

export function speak(text: string) {
  try {
    speakWithProfile(text);
  } catch {
    // Speech is optional; offline responses must still work without it.
  }
}
