/** User-added apps that INDI AI can launch (web apps, deep links, local protocols). */

export interface ExileApp {
  id: string;
  name: string;
  url: string;
  emoji: string;
  addedAt: number;
}

const KEY = "exile.apps";

export function listApps(): ExileApp[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function addApp(app: Omit<ExileApp, "id" | "addedAt">): ExileApp {
  const next: ExileApp = { ...app, id: crypto.randomUUID(), addedAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify([...listApps(), next]));
  return next;
}

export function removeApp(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listApps().filter((a) => a.id !== id)));
}

export function launchApp(app: ExileApp) {
  window.open(app.url, "_blank", "noopener,noreferrer");
}
