import { useCallback, useEffect, useState } from "react";
import { Activity, Bell, CheckCheck, MessageSquare, ShieldCheck, X } from "lucide-react";
import { loadAudit } from "@/lib/audit";
import { listTurns } from "@/lib/conversation";

type ActivityItem = {
  id: string;
  at: number;
  kind: string;
  title: string;
  summary: string;
};

type WhatsAppMessage = {
  id: string;
  jid: string;
  fromMe: boolean;
  name?: string;
  text?: string;
  timestamp: number;
};

const API = "http://127.0.0.1:8787";
const LAST_SEEN_KEY = "exile.activity.lastSeen.v1";

function initialLastSeen() {
  try {
    const stored = localStorage.getItem(LAST_SEEN_KEY);
    return stored ? Number(stored) || Date.now() : Date.now();
  } catch {
    return Date.now();
  }
}

function shortText(value: unknown, max = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function timeLabel(at: number) {
  if (!Number.isFinite(at)) return "Time unavailable";
  return new Date(at).toLocaleString();
}

export default function ActivityCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [lastSeen, setLastSeen] = useState(initialLastSeen);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const auditItems: ActivityItem[] = loadAudit().map((event) => ({
      id: `audit-${event.id}`,
      at: event.at,
      kind: event.kind,
      title: `System · ${event.kind}`,
      summary: shortText(event.summary),
    }));

    const chatItems: ActivityItem[] = listTurns().map((turn) => ({
      id: `turn-${turn.id}`,
      at: turn.at,
      kind: "ai",
      title: turn.role === "exile" ? "INDI AI · AI response" : "Chat · Your message",
      summary: shortText(turn.text),
    }));

    let whatsappItems: ActivityItem[] = [];
    try {
      const response = await fetch(`${API}/whatsapp/messages`);
      if (response.ok) {
        const data = await response.json();
        const messages: WhatsAppMessage[] = Array.isArray(data.messages)
          ? data.messages
          : [];
        whatsappItems = messages.map((message) => ({
          id: `wa-${message.jid}-${message.id}`,
          at: Number(message.timestamp) || 0,
          kind: "whatsapp",
          title: `WhatsApp · ${shortText(message.name || message.jid, 60)}`,
          summary: `${message.fromMe ? "You" : "Received"}: ${shortText(message.text || "(no text)")}`,
        }));
      }
    } catch {
      // The activity center still works offline from locally saved records.
    }

    const merged = [...auditItems, ...chatItems, ...whatsappItems]
      .filter((item) => Number.isFinite(item.at) && item.at > 0)
      .sort((a, b) => b.at - a.at);

    const unique = new Map<string, ActivityItem>();
    for (const item of merged) {
      if (!unique.has(item.id)) unique.set(item.id, item);
    }
    setItems([...unique.values()].slice(0, 150));
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const sync = () => void refresh();
    window.addEventListener("exile:audit", sync);
    window.addEventListener("exile:transcript", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("exile:audit", sync);
      window.removeEventListener("exile:transcript", sync);
    };
  }, [refresh]);

  const unread = items.filter((item) => item.at > lastSeen).length;

  const markRead = () => {
    const now = Date.now();
    setLastSeen(now);
    try {
      localStorage.setItem(LAST_SEEN_KEY, String(now));
    } catch {
      // Read state remains usable for this session if storage is unavailable.
    }
  };

  const toggle = () => {
    if (!open) markRead();
    setOpen((current) => !current);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Activity notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        title="Activity and notifications"
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/40 bg-slate-900/70 text-cyan-300 transition hover:bg-cyan-500/15"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-slate-950">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label="INDI AI activity history"
          className="fixed inset-x-2 top-[calc(4.5rem+env(safe-area-inset-top))] z-[70] flex max-h-[min(70dvh,36rem)] flex-col overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[min(92vw,25rem)] rounded-xl border border-cyan-500/30 bg-slate-950 text-cyan-100 shadow-2xl shadow-black/50"
        >
          <header className="flex items-center justify-between border-b border-cyan-500/20 p-3">
            <div>
              <h2 className="text-sm font-semibold tracking-wider">ACTIVITY CENTER</h2>
              <p className="mt-1 text-[11px] text-cyan-100/50">
                Saved WhatsApp, AI and system activity
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Refresh activity"
                aria-label="Refresh activity"
                disabled={refreshing}
                onClick={() => {
                  setRefreshing(true);
                  void refresh().finally(() => setRefreshing(false));
                }}
                className="rounded-lg p-2 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
              >
                <Activity className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Mark all as read"
                aria-label="Mark all as read"
                onClick={markRead}
                className="rounded-lg p-2 text-cyan-300 hover:bg-cyan-500/10"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Close activity"
                aria-label="Close activity"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-cyan-300 hover:bg-cyan-500/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Bell className="mx-auto mb-3 h-7 w-7 text-cyan-300/40" />
                <p className="text-sm">No recorded activity yet.</p>
                <p className="mt-1 text-xs text-cyan-100/50">
                  WhatsApp messages appear when the local INDI AI server is available.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <article
                  key={item.id}
                  className={`border-b border-cyan-500/10 px-4 py-3 ${
                    item.at > lastSeen ? "bg-cyan-500/[0.06]" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-cyan-300/80">
                      {item.kind === "whatsapp" ? (
                        <MessageSquare className="h-4 w-4" />
                      ) : item.kind === "ai" ? (
                        <Activity className="h-4 w-4" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{item.title}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-cyan-100/70">
                        {item.summary || "(empty record)"}
                      </p>
                      <p className="mt-2 text-[10px] text-cyan-100/40">
                        {timeLabel(item.at)}
                      </p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
          <footer className="border-t border-cyan-500/20 px-3 py-2 text-[10px] text-cyan-100/40">
            Showing up to 150 recent records. History comes from INDI AI's existing local stores.
          </footer>
        </section>
      )}
    </div>
  );
}
