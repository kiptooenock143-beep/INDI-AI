import { useEffect, useMemo, useState } from "react";
import { Home, Settings, Zap, Lightbulb, Lock, Thermometer, Fan, Tv, Power, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const CFG_KEY = "exile.ha.config";

interface HAConfig { baseUrl: string; token: string; }
interface HAEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
}

const iconFor = (id: string) => {
  if (id.startsWith("light.")) return Lightbulb;
  if (id.startsWith("lock.")) return Lock;
  if (id.startsWith("climate.")) return Thermometer;
  if (id.startsWith("fan.")) return Fan;
  if (id.startsWith("media_player.")) return Tv;
  if (id.startsWith("switch.")) return Power;
  return Zap;
};

const controllableDomains = ["light", "switch", "lock", "fan", "media_player", "climate", "cover"];

const HouseSection = () => {
  const [cfg, setCfg] = useState<HAConfig | null>(null);
  const [draft, setDraft] = useState<HAConfig>({ baseUrl: "", token: "" });
  const [entities, setEntities] = useState<HAEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      try {
        const c = JSON.parse(raw);
        setCfg(c);
        setDraft(c);
      } catch {}
    } else {
      setShowSettings(true);
    }
  }, []);

  const call = async (path: string, method = "GET", body?: unknown) => {
    if (!cfg) throw new Error("Not configured");
    const r = await fetch(`${SUPABASE_URL}/functions/v1/home-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ baseUrl: cfg.baseUrl, token: cfg.token, path, method, body }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || `HA error ${r.status}`);
    }
    return r.json();
  };

  const loadStates = async () => {
    if (!cfg) return;
    setLoading(true);
    try {
      const data: HAEntity[] = await call("/api/states");
      setEntities(data.filter((e) => controllableDomains.includes(e.entity_id.split(".")[0])));
      toast.success(`Linked · ${data.length} entities`);
    } catch (e: any) {
      toast.error(`Home Assistant: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cfg) loadStates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  const saveConfig = () => {
    if (!draft.baseUrl || !draft.token) return toast.error("URL and token required");
    localStorage.setItem(CFG_KEY, JSON.stringify(draft));
    setCfg(draft);
    setShowSettings(false);
  };

  const toggle = async (e: HAEntity) => {
    const domain = e.entity_id.split(".")[0];
    const on = e.state === "on" || e.state === "unlocked" || e.state === "open" || e.state === "playing";
    let service = on ? "turn_off" : "turn_on";
    if (domain === "lock") service = on ? "lock" : "unlock";
    if (domain === "cover") service = on ? "close_cover" : "open_cover";
    if (domain === "media_player") service = on ? "media_pause" : "media_play";
    try {
      await call(`/api/services/${domain}/${service}`, "POST", { entity_id: e.entity_id });
      // optimistic
      setEntities((es) =>
        es.map((x) =>
          x.entity_id === e.entity_id
            ? { ...x, state: on ? (domain === "lock" ? "locked" : "off") : (domain === "lock" ? "unlocked" : "on") }
            : x,
        ),
      );
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const grouped = useMemo(() => {
    const q = filter.toLowerCase();
    const list = entities.filter(
      (e) =>
        !q ||
        e.entity_id.includes(q) ||
        (e.attributes.friendly_name ?? "").toLowerCase().includes(q),
    );
    const map: Record<string, HAEntity[]> = {};
    for (const e of list) {
      const d = e.entity_id.split(".")[0];
      (map[d] ??= []).push(e);
    }
    return map;
  }, [entities, filter]);

  const activeCount = entities.filter((e) => ["on", "unlocked", "playing", "open"].includes(e.state)).length;

  return (
    <div className="h-[28rem] flex flex-col bg-slate-950 text-cyan-100">
      <div className="p-4 border-b border-cyan-500/30 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2 tracking-widest">
          <Home className="w-4 h-4 text-cyan-300" /> RESIDENCE
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-cyan-400/70">
            {entities.length} devices · <span className="text-emerald-300">{activeCount} active</span>
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-cyan-300 hover:bg-cyan-500/10" onClick={loadStates} disabled={!cfg || loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-cyan-300 hover:bg-cyan-500/10" onClick={() => setShowSettings((s) => !s)}>
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {showSettings && (
        <div className="p-4 border-b border-cyan-500/30 bg-slate-900/60 space-y-2">
          <p className="text-[11px] tracking-widest text-cyan-400/80">HOME ASSISTANT LINK</p>
          <Input
            placeholder="https://your-home.duckdns.org"
            value={draft.baseUrl}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            className="bg-slate-950 border-cyan-500/30 text-cyan-100"
          />
          <Input
            type="password"
            placeholder="Long-lived access token"
            value={draft.token}
            onChange={(e) => setDraft({ ...draft, token: e.target.value })}
            className="bg-slate-950 border-cyan-500/30 text-cyan-100"
          />
          <p className="text-[10px] text-cyan-500/60">
            Generate a token in HA → Profile → Security → Long-Lived Access Tokens. Credentials stay on this device.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveConfig} className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 border border-cyan-400/40">
              Link Residence
            </Button>
            {cfg && (
              <Button size="sm" variant="ghost" className="text-cyan-300" onClick={() => setShowSettings(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {!showSettings && cfg && (
        <div className="px-4 pt-3">
          <Input
            placeholder="Filter devices…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-slate-950 border-cyan-500/30 text-cyan-100 h-8 text-sm"
          />
        </div>
      )}

      <ScrollArea className="flex-1 mt-2">
        <div className="p-4 space-y-4">
          {!cfg && !showSettings && (
            <p className="text-cyan-400/60 text-sm">No residence linked. Open settings to connect Home Assistant.</p>
          )}
          {cfg && entities.length === 0 && !loading && (
            <p className="text-cyan-400/60 text-sm">No controllable entities returned.</p>
          )}
          {Object.entries(grouped).map(([domain, items]) => (
            <div key={domain}>
              <p className="text-[11px] tracking-widest text-cyan-400/70 mb-2 uppercase">{domain}</p>
              <div className="grid grid-cols-2 gap-2">
                {items.map((e) => {
                  const Icon = iconFor(e.entity_id);
                  const active = ["on", "unlocked", "playing", "open"].includes(e.state);
                  return (
                    <button
                      key={e.entity_id}
                      onClick={() => toggle(e)}
                      className={`text-left px-3 py-2 rounded-md border transition-all ${
                        active
                          ? "bg-cyan-500/15 border-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                          : "bg-slate-900/60 border-cyan-500/20 hover:bg-cyan-500/10"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${active ? "text-cyan-200" : "text-cyan-400/70"}`} />
                        <span className="text-xs font-medium truncate">
                          {e.attributes.friendly_name ?? e.entity_id.split(".")[1]}
                        </span>
                      </div>
                      <p className="text-[10px] mt-1 tracking-widest text-cyan-400/60 uppercase">{e.state}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default HouseSection;
