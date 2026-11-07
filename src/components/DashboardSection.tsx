import { useEffect, useState } from "react";
import { Activity, Brain, Cpu, Database, Eye, Lock, Network, Radio, Wifi, Zap, GitBranch, Layers, Sparkles, MessageSquare, Mic } from "lucide-react";

interface System {
  id: string;
  name: string;
  icon: any;
  load: number; // 0–100
  status: "ONLINE" | "STANDBY" | "LEARNING";
}

const baseSystems: Omit<System, "load">[] = [
  { id: "brain", name: "Cognitive Core", icon: Brain, status: "ONLINE" },
  { id: "orch", name: "Agent Orchestrator", icon: GitBranch, status: "ONLINE" },
  { id: "mem", name: "Cognitive Memory", icon: Database, status: "ONLINE" },
  { id: "ctx", name: "Context Engine", icon: Layers, status: "ONLINE" },
  { id: "proact", name: "Proactive Engine", icon: Sparkles, status: "STANDBY" },
  { id: "learn", name: "Learning System", icon: Activity, status: "LEARNING" },
  { id: "sec", name: "Security Layer", icon: Lock, status: "ONLINE" },
  { id: "tools", name: "Tool Registry", icon: Cpu, status: "ONLINE" },
  { id: "vis", name: "Vision System", icon: Eye, status: "STANDBY" },
  { id: "auto", name: "Automation Engine", icon: Zap, status: "STANDBY" },
  { id: "pers", name: "Personality Engine", icon: MessageSquare, status: "ONLINE" },
  { id: "hw", name: "Hardware Bridge", icon: Radio, status: "STANDBY" },
  { id: "router", name: "AI Router · 8 providers", icon: Network, status: "ONLINE" },
  { id: "voice", name: "TTS / STT Pipeline", icon: Mic, status: "ONLINE" },
  { id: "net", name: "Event Bus", icon: Wifi, status: "ONLINE" },
];

const statusColor = (s: System["status"]) =>
  s === "ONLINE" ? "text-cyan-300" : s === "LEARNING" ? "text-amber-300" : "text-cyan-500/60";

const DashboardSection = () => {
  const [systems, setSystems] = useState<System[]>(
    baseSystems.map((s) => ({ ...s, load: Math.floor(20 + Math.random() * 70) }))
  );
  const [events, setEvents] = useState<string[]>([
    "[BOOT] INDI AI Cognitive OS v5 online.",
    "[ROUTER] 8 providers registered. Primary: Lovable AI Gateway.",
    "[MEM] Episodic store loaded · 0 entries.",
    "[SEC] Audit log initialized.",
  ]);

  useEffect(() => {
    const t = setInterval(() => {
      setSystems((prev) =>
        prev.map((s) => ({
          ...s,
          load: Math.max(5, Math.min(99, s.load + Math.floor(Math.random() * 11) - 5)),
        }))
      );
      const samples = [
        "[CTX] Active surface refreshed.",
        "[PROACT] Pattern scan complete. No anomalies.",
        "[LEARN] Routing weights re-balanced.",
        "[ROUTER] Latency check · 142ms.",
        "[MEM] Working memory pruned.",
        "[EVT] Heartbeat OK.",
      ];
      setEvents((e) => [samples[Math.floor(Math.random() * samples.length)], ...e].slice(0, 12));
    }, 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col bg-slate-950 text-cyan-100 md:h-[28rem]">
      <div className="p-3 sm:p-4 border-b border-cyan-500/30 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm sm:text-lg font-semibold tracking-wider sm:tracking-widest flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-300" />
          COGNITIVE OS · 15 SYSTEMS
        </h2>
        <span className="text-[10px] tracking-widest text-cyan-400/70">ALL SYSTEMS NOMINAL</span>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 min-h-0">
        <div className="md:col-span-2 overflow-y-auto p-3 grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 border-b md:border-b-0 md:border-r border-cyan-500/20">
          {systems.map((s) => (
            <div key={s.id} className="border border-cyan-500/20 bg-slate-900/40 rounded p-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <s.icon className="w-3.5 h-3.5 text-cyan-300" />
                  <span className="text-[11px] text-cyan-100">{s.name}</span>
                </div>
                <span className={`text-[9px] tracking-widest ${statusColor(s.status)}`}>{s.status}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-all duration-700"
                  style={{ width: `${s.load}%` }}
                />
              </div>
              <div className="text-[9px] text-cyan-500/60 mt-0.5 font-mono text-right">{s.load}%</div>
            </div>
          ))}
        </div>

        <div className="overflow-y-auto max-h-64 md:max-h-none p-3 font-mono text-[10px] space-y-1">
          <div className="text-cyan-400/70 tracking-widest mb-2">// EVENT BUS</div>
          {events.map((e, i) => (
            <div key={i} className="text-cyan-300/80 border-l border-cyan-500/30 pl-2 leading-snug">
              {e}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardSection;
