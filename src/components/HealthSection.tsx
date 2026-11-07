import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { endpoint, authHeaders, detectLocalApi, LOCAL_API } from "@/lib/ai";

interface Subsystem { ok: boolean; status?: number; ms?: number; error?: string }

interface Health {
  ok: boolean;
  checkedAt: string;
  totalMs: number;
  subsystems: Record<string, Subsystem>;
}

const LABELS: Record<string, string> = {
  reasoning: "Reasoning core",
  database: "Database",
  telephony: "Telephony",
  home: "Home link",
  vehicle: "Vehicle link",
  local: "Local engine",
};

const HealthSection = () => {
  const [data, setData] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const probe = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await detectLocalApi(true);
      const r = await fetch(endpoint("exile-health"), { headers: authHeaders() });
      const j = (await r.json()) as Health;
      j.subsystems = { ...j.subsystems, local: { ok: !!LOCAL_API, error: LOCAL_API ? undefined : "no local server detected" } };
      setData(j);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void probe(); }, [probe]);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-cyan-300">
          <Activity className="w-4 h-4" />
          <span className="text-[11px] tracking-[0.3em]">SYSTEM HEALTH</span>
        </div>
        <Button size="sm" variant="ghost" onClick={probe} disabled={busy} className="text-cyan-300 hover:bg-cyan-500/10">
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && <p className="text-xs text-amber-400">Probe failed: {error}</p>}

      <div className="space-y-2">
        {data &&
          Object.entries(data.subsystems).map(([id, s]) => (
            <div key={id} className="flex items-center justify-between rounded-md border border-cyan-500/20 bg-slate-900/50 px-3 py-2">
              <span className="text-xs text-cyan-100/85">{LABELS[id] ?? id}</span>
              <span className={`text-[10px] tracking-widest ${s.ok ? "text-emerald-400" : "text-amber-400"}`}>
                {s.ok ? `ONLINE${s.ms ? ` · ${s.ms}ms` : ""}` : "OFFLINE"}
              </span>
            </div>
          ))}
        {data?.checkedAt && (
          <p className="text-[10px] text-cyan-500/50 pt-1">
            Checked {new Date(data.checkedAt).toLocaleTimeString()} · {data.totalMs}ms
          </p>
        )}
        {!data && !error && <p className="text-xs text-cyan-400/60">Probing subsystems…</p>}
      </div>
    </div>
  );
};

export default HealthSection;
