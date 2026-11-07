import { useEffect, useState } from "react";
import {
  Car, Settings, Lock, Unlock, Snowflake, Volume2, Zap, MapPin, Gauge, Battery, Fuel, RefreshCw, Loader2, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const CFG_KEY = "exile.car.config";

type Provider = "tesla" | "smartcar";
interface CarConfig {
  provider: Provider;
  accessToken: string;
  vehicleId: string;
  nickname?: string;
  brand?: string;
}

const brandsSmartcar = [
  "Acura","Audi","BMW","Buick","Cadillac","Chevrolet","Chrysler","Dodge","Ford","Genesis",
  "GMC","Honda","Hyundai","Infiniti","Jaguar","Jeep","Kia","Land Rover","Lexus","Lincoln",
  "Mazda","Mercedes-Benz","MINI","Nissan","Porsche","Ram","Subaru","Toyota","Volkswagen","Volvo",
];

const CarControlSection = () => {
  const [cfg, setCfg] = useState<CarConfig | null>(null);
  const [draft, setDraft] = useState<CarConfig>({ provider: "smartcar", accessToken: "", vehicleId: "", brand: "Tesla" });
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      try { const c = JSON.parse(raw); setCfg(c); setDraft(c); } catch {}
    } else setShowSettings(true);
  }, []);

  const call = async (action: string) => {
    if (!cfg) throw new Error("No vehicle linked");
    const r = await fetch(`${SUPABASE_URL}/functions/v1/car-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ provider: cfg.provider, accessToken: cfg.accessToken, vehicleId: cfg.vehicleId, action }),
    });
    const text = await r.text();
    let data: any; try { data = JSON.parse(text); } catch { data = text; }
    if (!r.ok) throw new Error(data?.error ?? text ?? `car error ${r.status}`);
    return data;
  };

  const refresh = async () => {
    if (!cfg) return;
    setLoading(true);
    try { setStatus(await call("status")); toast.success("Vehicle telemetry updated"); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (cfg) refresh(); /* eslint-disable-next-line */ }, [cfg]);

  const save = () => {
    if (!draft.accessToken || !draft.vehicleId) return toast.error("Access token and vehicle ID required");
    localStorage.setItem(CFG_KEY, JSON.stringify(draft));
    setCfg(draft);
    setShowSettings(false);
  };

  const doAction = async (action: string, label: string) => {
    setActing(action);
    try { await call(action); toast.success(`${label} · sent`); await refresh(); }
    catch (e: any) { toast.error(`${label} failed: ${e.message}`); }
    finally { setActing(null); }
  };

  // parse a few common fields from batch response for Smartcar
  const parseStatus = () => {
    if (!status) return null;
    if (cfg?.provider === "tesla") {
      const r = status.response ?? status;
      const c = r?.charge_state ?? {}; const d = r?.drive_state ?? {}; const v = r?.vehicle_state ?? {};
      return {
        battery: c.battery_level, range: c.battery_range, charging: c.charging_state,
        locked: v.locked, odometer: v.odometer,
        lat: d.latitude, lon: d.longitude, speed: d.speed,
        vin: r?.vin, name: r?.display_name,
      };
    }
    const responses: any[] = status.responses ?? [];
    const pick = (p: string) => responses.find((x) => x.path === p)?.body ?? {};
    const loc = pick("/location"); const odo = pick("/odometer"); const bat = pick("/battery"); const chg = pick("/charge"); const fuel = pick("/fuel");
    return {
      battery: bat.percentRemaining ? Math.round(bat.percentRemaining * 100) : undefined,
      range: bat.range, charging: chg.state,
      odometer: odo.distance, fuel: fuel.percentRemaining ? Math.round(fuel.percentRemaining * 100) : undefined,
      lat: loc.latitude, lon: loc.longitude,
      vin: pick("/vin")?.vin,
    };
  };
  const s = parseStatus();

  const actions = [
    { id: "lock", label: "Lock", icon: Lock },
    { id: "unlock", label: "Unlock", icon: Unlock },
    { id: "start_climate", label: "Climate On", icon: Snowflake },
    { id: "stop_climate", label: "Climate Off", icon: Snowflake },
    { id: "charge_start", label: "Charge Start", icon: Zap },
    { id: "charge_stop", label: "Charge Stop", icon: Zap },
    { id: "honk", label: "Honk", icon: Volume2 },
    { id: "flash", label: "Flash Lights", icon: Lightbulb },
  ];

  return (
    <div className="h-[28rem] flex flex-col bg-slate-950 text-cyan-100">
      <div className="p-4 border-b border-cyan-500/30 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2 tracking-widest">
          <Car className="w-4 h-4 text-cyan-300" /> VEHICLE
          {cfg?.nickname && <span className="text-xs text-cyan-400/70 ml-1 normal-case tracking-normal">· {cfg.nickname}</span>}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {cfg && <span className="text-cyan-400/70 uppercase tracking-widest">{cfg.provider}</span>}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-cyan-300 hover:bg-cyan-500/10" onClick={refresh} disabled={!cfg || loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-cyan-300 hover:bg-cyan-500/10" onClick={() => setShowSettings((v) => !v)}>
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {showSettings && (
        <div className="p-4 border-b border-cyan-500/30 bg-slate-900/60 space-y-2 text-xs">
          <div className="flex gap-2">
            <button
              onClick={() => setDraft({ ...draft, provider: "tesla", brand: "Tesla" })}
              className={`flex-1 px-3 py-1.5 rounded border ${draft.provider === "tesla" ? "bg-cyan-500/20 border-cyan-400/60" : "border-cyan-500/30"}`}
            >Tesla Fleet API</button>
            <button
              onClick={() => setDraft({ ...draft, provider: "smartcar" })}
              className={`flex-1 px-3 py-1.5 rounded border ${draft.provider === "smartcar" ? "bg-cyan-500/20 border-cyan-400/60" : "border-cyan-500/30"}`}
            >Smartcar (all other brands)</button>
          </div>

          {draft.provider === "smartcar" && (
            <select
              value={draft.brand ?? ""}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
              className="w-full bg-slate-950 border border-cyan-500/30 text-cyan-100 rounded px-2 py-1.5"
            >
              {brandsSmartcar.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}

          <Input placeholder="Nickname (e.g. Model S)" value={draft.nickname ?? ""}
            onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
            className="bg-slate-950 border-cyan-500/30 text-cyan-100 h-8" />
          <Input placeholder="OAuth access token" type="password" value={draft.accessToken}
            onChange={(e) => setDraft({ ...draft, accessToken: e.target.value })}
            className="bg-slate-950 border-cyan-500/30 text-cyan-100 h-8" />
          <Input placeholder="Vehicle ID" value={draft.vehicleId}
            onChange={(e) => setDraft({ ...draft, vehicleId: e.target.value })}
            className="bg-slate-950 border-cyan-500/30 text-cyan-100 h-8" />

          <p className="text-[10px] text-cyan-500/60 leading-relaxed">
            {draft.provider === "tesla"
              ? "Register at developer.tesla.com → complete Fleet API onboarding → get partner access token and vehicle id."
              : "Sign up at smartcar.com (free tier, 30+ brands). Complete Connect flow to get an access token and vehicle id."}
            Tokens stay on this device; requests are proxied server-side.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 border border-cyan-400/40">Link Vehicle</Button>
            {cfg && <Button size="sm" variant="ghost" className="text-cyan-300" onClick={() => setShowSettings(false)}>Cancel</Button>}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {!cfg && !showSettings && (
            <p className="text-cyan-400/60 text-sm">No vehicle linked. Open settings to connect.</p>
          )}

          {cfg && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Metric icon={Battery} label="Battery" value={s?.battery != null ? `${s.battery}%` : "—"} sub={s?.range ? `${Math.round(s.range)} range` : undefined} />
                <Metric icon={Fuel} label="Fuel" value={s?.fuel != null ? `${s.fuel}%` : (s?.charging ?? "—")} />
                <Metric icon={Gauge} label="Odometer" value={s?.odometer != null ? `${Math.round(s.odometer)}` : "—"} />
                <Metric icon={MapPin} label="Location" value={s?.lat ? `${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}` : "—"} />
              </div>

              {s?.locked !== undefined && (
                <p className="text-xs text-cyan-400/70 tracking-widest uppercase">
                  DOORS · <span className={s.locked ? "text-emerald-300" : "text-amber-300"}>{s.locked ? "LOCKED" : "UNLOCKED"}</span>
                </p>
              )}

              <div>
                <p className="text-[11px] tracking-widest text-cyan-400/70 mb-2 uppercase">Remote Commands</p>
                <div className="grid grid-cols-2 gap-2">
                  {actions.map((a) => (
                    <Button
                      key={a.id}
                      variant="ghost"
                      disabled={acting !== null}
                      onClick={() => doAction(a.id, a.label)}
                      className="justify-start gap-2 bg-slate-900/60 border border-cyan-500/20 text-cyan-100 hover:bg-cyan-500/10"
                    >
                      {acting === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <a.icon className="w-4 h-4 text-cyan-300" />}
                      <span className="text-xs">{a.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {s?.lat && (
                <a
                  href={`https://www.google.com/maps?q=${s.lat},${s.lon}`}
                  target="_blank" rel="noreferrer"
                  className="block text-center text-xs text-cyan-300 underline underline-offset-2"
                >
                  Track on map ↗
                </a>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

const Metric = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: any; sub?: string }) => (
  <div className="px-3 py-2 rounded-md border border-cyan-500/20 bg-slate-900/60">
    <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase text-cyan-400/70">
      <Icon className="w-3 h-3" /> {label}
    </div>
    <div className="text-cyan-100 text-sm font-medium mt-0.5 truncate">{value ?? "—"}</div>
    {sub && <div className="text-[10px] text-cyan-400/60">{sub}</div>}
  </div>
);

export default CarControlSection;
