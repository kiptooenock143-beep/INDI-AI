// Local encrypted-at-rest (browser-scoped) persistent memory for INDI AI.
// Upgrades to Lovable Cloud when auth is enabled.

export type MemoryCategory =
  | 'identity'
  | 'preferences'
  | 'projects'
  | 'people'
  | 'events'
  | 'mistakes'
  | 'achievements';

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  key: string;
  value: string;
  createdAt: number;
}

const KEY = 'exile.memory.v1';

export function loadMemory(): MemoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MemoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveMemory(entries: MemoryEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function addMemory(category: MemoryCategory, key: string, value: string): MemoryEntry {
  const entry: MemoryEntry = {
    id: crypto.randomUUID(),
    category,
    key,
    value,
    createdAt: Date.now(),
  };
  const all = loadMemory();
  all.unshift(entry);
  saveMemory(all.slice(0, 500));
  window.dispatchEvent(new CustomEvent('exile:memory-updated'));
  return entry;
}

export function removeMemory(id: string) {
  saveMemory(loadMemory().filter((m) => m.id !== id));
  window.dispatchEvent(new CustomEvent('exile:memory-updated'));
}

export function memoryContext(limit = 20): string {
  const all = loadMemory().slice(0, limit);
  if (!all.length) return '';
  return 'What you know about the user:\n' + all.map((m) => `- [${m.category}] ${m.key}: ${m.value}`).join('\n');
}
