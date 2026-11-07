import { useEffect, useState } from "react";
import { Trash2, FilePlus2, ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ChatSession,
  listSessions,
  deleteSession,
  clearSessions,
  openSession,
  startNewSession,
  getActiveSessionId,
  sessionToText,
} from "@/lib/conversation";

const TranscriptSection = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      setSessions(listSessions());
      setActiveId(getActiveSessionId());
    };
    load();
    window.addEventListener("exile:transcript", load);
    return () => window.removeEventListener("exile:transcript", load);
  }, []);

  const doc = sessions.find((s) => s.id === openId);

  const download = (s: ChatSession) => {
    const url = URL.createObjectURL(new Blob([sessionToText(s)], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.title.replace(/[^\w\s-]/g, "").slice(0, 40) || "conversation"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (doc) {
    return (
      <div className="p-4 space-y-4 text-cyan-100">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setOpenId(null)} className="flex items-center gap-2 text-xs text-cyan-300">
            <ArrowLeft className="w-4 h-4" /> All chats
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => download(doc)} className="text-cyan-300 text-xs">
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
            <Button
              variant="ghost"
              onClick={() => { openSession(doc.id); setOpenId(null); }}
              className="text-cyan-300 border border-cyan-500/30 text-xs"
            >
              Continue
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-sm text-cyan-200">{doc.title}</h3>
          <p className="text-[10px] tracking-[0.2em] text-cyan-400/50 mt-1">
            {new Date(doc.startedAt).toLocaleString()} · {doc.turns.length} messages
          </p>
        </div>

        <div className="max-h-[68vh] overflow-y-auto pr-1 space-y-4">
          {doc.turns.map((t) => (
            <div key={t.id}>
              <div className="text-[9px] tracking-[0.3em] text-cyan-400/60">
                {t.role === "user" ? "YOU" : "INDI AI"}
              </div>
              <p className="text-sm leading-7 whitespace-pre-wrap mt-1">{t.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 text-cyan-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm tracking-[0.3em] text-cyan-300">CHAT HISTORY</h3>
          <p className="text-xs text-cyan-400/60 mt-1">
            All your conversations with INDI AI, saved on this device.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => startNewSession()}
            className="text-cyan-300 border border-cyan-500/30 text-xs"
          >
            <FilePlus2 className="w-4 h-4 mr-1" /> New
          </Button>
          {sessions.length > 0 && (
            <Button variant="ghost" onClick={() => clearSessions()} className="text-red-300 text-xs">
              Clear all
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
        {sessions.length === 0 && <p className="text-xs text-cyan-400/50">No conversations saved yet.</p>}
        {sessions
          .slice()
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-md border p-3 ${
                activeId === s.id ? "border-cyan-400/50 bg-cyan-500/10" : "border-cyan-500/20 bg-slate-900/50"
              }`}
            >
              <button onClick={() => setOpenId(s.id)} className="flex-1 text-left">
                <div className="text-sm truncate">{s.title}</div>
                <div className="text-[10px] text-cyan-400/60 mt-0.5">
                  {s.turns.length} messages · {new Date(s.updatedAt).toLocaleString()}
                  {activeId === s.id ? " · active" : ""}
                </div>
              </button>
              <button
                onClick={() => deleteSession(s.id)}
                aria-label="Delete conversation"
                className="text-red-300/70 hover:text-red-200"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
};

export default TranscriptSection;
