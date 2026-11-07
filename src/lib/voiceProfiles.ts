/**
 * Voice profiles: recorded samples + "active cloning" parameters applied to
 * browser speech synthesis (pitch / rate / timbre voice match).
 */

import { isVenomModeEnabled } from "@/lib/venomMode";

export interface VoiceProfile {
  id: string;
  name: string;
  /** base64 data URL of the recorded sample (optional) */
  sample?: string;
  voiceURI?: string;
  pitch: number;
  rate: number;
  createdAt: number;
  builtIn?: boolean;
  description?: string;
}

export const BUILT_IN_PROFILES: VoiceProfile[] = [
  {
    id: "builtin-goku",
    name: "GOKU",
    pitch: 1.25,
    rate: 1.1,
    createdAt: 0,
    builtIn: true,
    description: "Upbeat, high-energy and enthusiastic (style preset using your device voice).",
  },
  {
    id: "builtin-jarvis",
    name: "JARVIS",
    pitch: 1,
    rate: 0.96,
    createdAt: 0,
    builtIn: true,
    description: "Calm, polished, precise British-butler style (uses your device voice).",
  },
];

export function getBuiltInVoiceProfiles(): VoiceProfile[] {
  return BUILT_IN_PROFILES;
}

const KEY = "exile.voice.profiles";
const ACTIVE = "exile.voice.active";

export function listVoiceProfiles(): VoiceProfile[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveVoiceProfile(p: VoiceProfile) {
  const all = listVoiceProfiles().filter((x) => x.id !== p.id);
  all.push(p);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteVoiceProfile(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listVoiceProfiles().filter((p) => p.id !== id)));
  if (getActiveVoiceId() === id) localStorage.removeItem(ACTIVE);
}

export function setActiveVoice(id: string | null) {
  if (id) localStorage.setItem(ACTIVE, id);
  else localStorage.removeItem(ACTIVE);
}

export function getActiveVoiceId(): string | null {
  return localStorage.getItem(ACTIVE);
}

export function getActiveVoice(): VoiceProfile | null {
  const id = getActiveVoiceId();
  const selectedBuiltIn = BUILT_IN_PROFILES.find((p) => p.id === id);
  if (selectedBuiltIn) return selectedBuiltIn;

  const selectedCustom = listVoiceProfiles().find((p) => p.id === id);
  if (selectedCustom) return selectedCustom;

  return BUILT_IN_PROFILES.find((p) => p.id === "builtin-jarvis") ?? null;
}

/** Speak with the active profile, or use the desktop Venom-inspired audio path. */

import { cancelVenomAudio, speakVenomAudio } from "@/lib/venomAudio";

/**
 * Prepare assistant text for speech without reading source code or URLs aloud.
 * The original message remains unchanged in the chat.
 */
export function prepareSpeechText(input: string): string {
  let text = String(input ?? "").replace(/\r\n?/g, "\n");
  let removedCode = false;

  // Remove complete or still-streaming fenced code blocks.
  text = text.replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, () => {
    removedCode = true;
    return " ";
  });

  // Replace inline code rather than spelling its punctuation aloud.
  text = text.replace(/`[^`\n]+`/g, () => {
    removedCode = true;
    return " code snippet ";
  });

  // Preserve readable link labels, but never speak the destination.
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/\b(?:https?:\/\/|www\.)[^\s]+/gi, " ");
  text = text.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " email address ");

  // Ignore markup and common Markdown decoration while keeping the words.
  text = text.replace(/<\/?[A-Za-z][^>]*>/g, " ");
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*\d+[.)]\s+/gm, "");
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/__(.*?)__/g, "$1");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/\*(.*?)\*/g, "$1");
  text = text.replace(/\$(\$)?[\s\S]*?\$(?:\$)?/g, " mathematical expression ");

  // If the remaining response is mostly raw source, don't read it line by line.
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const codeLine = /(?:^\s*(?:import|export|const|let|var|function|class|return|if|for|while|def|from|print|#include|SELECT|CREATE TABLE)\b|[{};=<>]{2,}|=>|^\s*[$#]\s)/i;
  const codeLines = lines.filter((line) => codeLine.test(line)).length;
  const proseLines = lines.filter(
    (line) => /[.!?]$/.test(line) && /[A-Za-z]{3,}/.test(line),
  ).length;

  if (
    lines.length > 0 &&
    codeLines / lines.length >= 0.6 &&
    proseLines === 0
  ) {
    return "The code is available in the written response.";
  }

  text = text.replace(/\s+/g, " ").trim();

  if (!text) {
    return removedCode ? "The code is available in the written response." : "";
  }

  if (removedCode && !/code is available in the written response/i.test(text)) {
    text += " The code is available in the written response.";
  }

  return text;
}

let speechRequestId = 0;

export function speakWithProfile(text: string, onEnd?: () => void) {
  const requestId = ++speechRequestId;
  cancelVenomAudio();
  text = prepareSpeechText(text);
  if (!text) {
    onEnd?.();
    return;
  }

  if (typeof speechSynthesis === "undefined") {
    onEnd?.();
    return;
  }

  const profile = getActiveVoice();
  const venomMode = isVenomModeEnabled();

  const fallbackToBrowserSpeech = () => {
    if (requestId !== speechRequestId) return;

    const u = new SpeechSynthesisUtterance(text);
    const isJarvis = profile?.id === "builtin-jarvis";
    const isGoku = profile?.id === "builtin-goku";
    const isVenom = profile
      ? profile.id === "builtin-venom"
      : venomMode;

    // JARVIS uses the confirmed male Microsoft David voice on Windows.
    // Never silently substitute a female voice when that voice is unavailable.
    u.lang = isJarvis || isGoku ? "en-US" : "en-GB";
    u.pitch = isVenom
      ? Math.min(profile?.pitch ?? 0.78, 0.82)
      : (profile?.pitch ?? 1);
    u.rate = isVenom
      ? Math.min(profile?.rate ?? 0.9, 0.94)
      : (profile?.rate ?? 0.96);

    const availableVoices = speechSynthesis.getVoices();
    // Without the Windows "Microsoft David" voice (e.g. on Android), JARVIS uses a
    // British English voice at a slightly lower pitch for the butler sound.
    const hasDavid = availableVoices.some((v) => /microsoft david/i.test(v.name));
    if (isJarvis && !hasDavid) {
      u.lang = "en-GB";
      u.pitch = Math.min(u.pitch, 0.88);
    }
    if (profile?.voiceURI) {
      const match = availableVoices.find((v) => v.voiceURI === profile.voiceURI);
      if (match) u.voice = match;
    } else {
      const englishVoices = availableVoices.filter(
        (v) => /^en(-|_)/i.test(v.lang),
      );
      const preferred = isJarvis
        ? englishVoices.find((v) => /microsoft david/i.test(v.name))
          ?? englishVoices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george|james|arthur/i.test(v.name))
          ?? englishVoices.find((v) => /male|david|mark|george|daniel|james/i.test(v.name))
          ?? englishVoices.find((v) => /en-GB/i.test(v.lang))
        : isGoku
          ? englishVoices.find((v) => /en-US/i.test(v.lang) && /male|david|mark|guy|james|aaron/i.test(v.name))
            ?? englishVoices.find((v) => /male|david|mark|george|daniel|james/i.test(v.name))
        : isVenom
          ? englishVoices.find((v) => /male|david|mark|george|daniel|james/i.test(v.name))
          : englishVoices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george|james/i.test(v.name))
            ?? englishVoices.find((v) => /en-GB/i.test(v.lang));
      if (preferred) u.voice = preferred;
    }

    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      onEnd?.();
    };

    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  speechSynthesis.cancel();

  // GOKU is a device-voice preset; only JARVIS / legacy Venom use the desktop synthesizer.
  const useDesktopVoice = Boolean(window.exileDesktop?.synthesizeVenom) &&
    profile?.id !== "builtin-goku" &&
    (Boolean(profile?.builtIn) || venomMode);

  if (!useDesktopVoice) {
    fallbackToBrowserSpeech();
    return;
  }

  const desktopProfile = profile?.id === "builtin-jarvis" ? "jarvis" : "venom";
  void window.exileDesktop.synthesizeVenom(text, desktopProfile).then(async (audioData) => {
    if (requestId !== speechRequestId) return;

    if (audioData) {
      const played = await speakVenomAudio(audioData, () => {
        if (requestId === speechRequestId) onEnd?.();
      });
      if (played || requestId !== speechRequestId) return;
    }

    fallbackToBrowserSpeech();
  }).catch(() => {
    fallbackToBrowserSpeech();
  });
}
