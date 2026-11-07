export interface ReasoningEvent {
  id: string;
  ts: number;
  agent: string;
  action: string;
  detail?: string;
  confidence?: number;
}

const KEY = 'exile.reasoning.v1';
const MAX = 100;

export function loadLog(): ReasoningEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReasoningEvent[]) : [];
  } catch {
    return [];
  }
}

export function logReasoning(agent: string, action: string, detail?: string, confidence?: number) {
  const events = loadLog();
  const event: ReasoningEvent = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    agent,
    action,
    detail,
    confidence,
  };
  events.unshift(event);
  localStorage.setItem(KEY, JSON.stringify(events.slice(0, MAX)));
  window.dispatchEvent(new CustomEvent('exile:reasoning-updated'));
  return event;
}

export function clearLog() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('exile:reasoning-updated'));
}
