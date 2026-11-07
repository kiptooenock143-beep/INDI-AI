import { useEffect, useState } from "react";
import { ShieldCheck, Trash2, AlertTriangle } from "lucide-react";
import { loadAudit, clearAudit, wipeEverything, type AuditEvent } from "@/lib/audit";

const AuditSection = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    const sync = () => setEvents(loadAudit());
    sync();
    window.addEventListener("exile:audit", sync);
    return () => window.removeEventListener("exile:audit", sync);
  }, []);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-cyan-300">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-[11px] tracking-[0.3em]">AUDIT TRAIL</span>
        </div>
        <button
          onClick={clearAudit}
          className="flex items-center gap-1 text-[10px] tracking-widest text-cyan-400/70 hover:text-cyan-100"
        >
          <Trash2 className="w-3.5 h-3.5" /> CLEAR
        </button>
      </div>

      <div className="max-h-[52vh] overflow-y-auto space-y-2">
        {events.length === 0 && <p className="text-xs text-cyan-400/60">No recorded actions yet.</p>}
        {events.map((e) => (
          <div key={e.id} className="rounded-md border border-cyan-500/20 bg-slate-900/50 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] tracking-[0.3em] text-cyan-400/60 uppercase">{e.kind}</span>
              <span className="text-[9px] text-cyan-500/50">{new Date(e.at).toLocaleString()}</span>
            </div>
            <p className="text-xs text-cyan-100/85 mt-1 leading-5">{e.summary}</p>
            {e.synced && <span className="text-[9px] text-emerald-400/70">mirrored to cloud</span>}
          </div>
        ))}
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
        <div className="flex items-center gap-2 text-amber-400 text-[10px] tracking-[0.3em]">
          <AlertTriangle className="w-3.5 h-3.5" /> PRIVACY CONTROL
        </div>
        <p className="text-[11px] text-amber-200/70 leading-5">
          Erase every conversation, memory, contact, key and log stored by INDI AI on this device and in your account.
        </p>
        {confirmWipe ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmWipe(false)}
              className="flex-1 rounded-md border border-cyan-500/30 py-2 text-[10px] tracking-[0.3em] text-cyan-300/80 hover:bg-cyan-500/10"
            >
              CANCEL
            </button>
            <button
              onClick={async () => { await wipeEverything(); setConfirmWipe(false); }}
              className="flex-1 rounded-md border border-amber-400/60 bg-amber-500/15 py-2 text-[10px] tracking-[0.3em] text-amber-100 hover:bg-amber-500/25"
            >
              WIPE EVERYTHING
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmWipe(true)}
            className="w-full rounded-md border border-amber-500/40 py-2 text-[10px] tracking-[0.3em] text-amber-300 hover:bg-amber-500/10"
          >
            WIPE ALL DATA
          </button>
        )}
      </div>
    </div>
  );
};

export default AuditSection;
