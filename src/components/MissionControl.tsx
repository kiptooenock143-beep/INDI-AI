import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Target, Zap, Bell, Activity, Sparkles, Brain, Trash2 } from 'lucide-react';
import { AGENTS } from '@/lib/agents';
import { CAPABILITIES } from '@/lib/capabilities';
import { loadMemory, removeMemory, addMemory, type MemoryEntry } from '@/lib/memory';
import { loadLog, clearLog, type ReasoningEvent, logReasoning } from '@/lib/reasoningLog';

interface MissionControlProps {
  onOpenSection: (id: string) => void;
}

const MissionControl = ({ onOpenSection }: MissionControlProps) => {
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [log, setLog] = useState<ReasoningEvent[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  useEffect(() => {
    const refresh = () => {
      setMemory(loadMemory());
      setLog(loadLog());
    };
    refresh();
    window.addEventListener('exile:memory-updated', refresh);
    window.addEventListener('exile:reasoning-updated', refresh);
    return () => {
      window.removeEventListener('exile:memory-updated', refresh);
      window.removeEventListener('exile:reasoning-updated', refresh);
    };
  }, []);

  const activeCaps = CAPABILITIES.filter((c) => c.status === 'live').length;
  const setupCaps = CAPABILITIES.filter((c) => c.status === 'needs-setup').length;
  const activeAgents = AGENTS.filter((a) => a.online).length;

  const suggestions = [
    'Ask me to research a topic — Research agent stands ready.',
    memory.length === 0 ? 'Teach me something — add your first memory below.' : `I remember ${memory.length} facts about you.`,
    setupCaps > 0 ? `${setupCaps} capabilities await your credentials.` : 'All capabilities online.',
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Agents', value: activeAgents, icon: Brain },
          { label: 'Capabilities', value: activeCaps, icon: Zap },
          { label: 'Memories', value: memory.length, icon: Sparkles },
          { label: 'Events', value: log.length, icon: Activity },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-900/60 border-cyan-500/30 p-3 text-center">
            <s.icon className="w-4 h-4 text-cyan-300 mx-auto mb-1" />
            <div className="text-xl font-mono text-cyan-100">{s.value}</div>
            <div className="text-[9px] tracking-widest text-cyan-400/60 uppercase">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Suggested next actions */}
      <Card className="bg-slate-900/60 border-cyan-500/30 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="w-4 h-4 text-cyan-300" />
          <h3 className="text-xs tracking-widest text-cyan-200 uppercase">Suggested Next Actions</h3>
        </div>
        <ul className="space-y-1 text-xs text-cyan-100/80">
          {suggestions.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-cyan-400">›</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Agent roster */}
      <Card className="bg-slate-900/60 border-cyan-500/30 p-3">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-cyan-300" />
          <h3 className="text-xs tracking-widest text-cyan-200 uppercase">Agent Society</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AGENTS.map((a) => (
            <div
              key={a.id}
              className={`p-2 rounded border ${
                a.online
                  ? 'bg-cyan-500/10 border-cyan-400/40'
                  : 'bg-slate-900/40 border-slate-700/60 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2">
                <a.icon className="w-4 h-4 text-cyan-300" />
                <div className="min-w-0">
                  <div className="text-xs text-cyan-100 truncate">{a.name}</div>
                  <div className="text-[9px] tracking-widest text-cyan-400/60 uppercase truncate">
                    {a.online ? a.role : 'coming online'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Capabilities */}
      <Card className="bg-slate-900/60 border-cyan-500/30 p-3">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-cyan-300" />
          <h3 className="text-xs tracking-widest text-cyan-200 uppercase">Capability Grid</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CAPABILITIES.map((c) => (
            <button
              key={c.id}
              onClick={() => c.section && onOpenSection(c.section)}
              className="text-left p-2 rounded border border-cyan-500/20 bg-slate-900/40 hover:bg-cyan-500/10 hover:border-cyan-400/50 transition"
            >
              <div className="flex items-center gap-2">
                <c.icon className="w-4 h-4 text-cyan-300" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-cyan-100 truncate">{c.name}</div>
                  <div
                    className={`text-[9px] tracking-widest uppercase truncate ${
                      c.status === 'live'
                        ? 'text-emerald-400/80'
                        : c.status === 'needs-setup'
                          ? 'text-amber-400/80'
                          : 'text-slate-500'
                    }`}
                  >
                    {c.status}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Memory */}
      <Card className="bg-slate-900/60 border-cyan-500/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-300" />
            <h3 className="text-xs tracking-widest text-cyan-200 uppercase">Persistent Memory</h3>
          </div>
          <span className="text-[9px] text-cyan-400/60 tracking-widest">{memory.length} FACTS</span>
        </div>
        <div className="flex gap-2 mb-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="fact key (e.g. name)"
            className="flex-1 bg-slate-950/60 border border-cyan-500/30 rounded px-2 py-1 text-xs text-cyan-100 placeholder-cyan-500/40"
          />
          <input
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            placeholder="value"
            className="flex-1 bg-slate-950/60 border border-cyan-500/30 rounded px-2 py-1 text-xs text-cyan-100 placeholder-cyan-500/40"
          />
          <Button
            size="sm"
            variant="ghost"
            className="text-cyan-200 border border-cyan-500/40 h-7"
            onClick={() => {
              if (!newKey.trim() || !newVal.trim()) return;
              addMemory('identity', newKey.trim(), newVal.trim());
              logReasoning('Memory', 'stored fact', `${newKey}: ${newVal}`, 1);
              setNewKey('');
              setNewVal('');
            }}
          >
            Add
          </Button>
        </div>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {memory.length === 0 && <div className="text-[11px] text-cyan-400/60 italic">No memories yet. Teach me anything about you.</div>}
          {memory.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-xs bg-slate-950/40 rounded px-2 py-1">
              <div className="min-w-0">
                <span className="text-cyan-400/70 uppercase text-[9px] tracking-widest mr-2">{m.category}</span>
                <span className="text-cyan-100">{m.key}:</span> <span className="text-cyan-300/90">{m.value}</span>
              </div>
              <button onClick={() => removeMemory(m.id)} className="text-cyan-500/50 hover:text-red-400 shrink-0 ml-2">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Reasoning log */}
      <Card className="bg-slate-900/60 border-cyan-500/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-300" />
            <h3 className="text-xs tracking-widest text-cyan-200 uppercase">Reasoning Stream</h3>
          </div>
          {log.length > 0 && (
            <button onClick={clearLog} className="text-[9px] text-cyan-500/70 hover:text-cyan-300 tracking-widest uppercase">
              Clear
            </button>
          )}
        </div>
        <div className="space-y-1 max-h-40 overflow-y-auto font-mono">
          {log.length === 0 && <div className="text-[11px] text-cyan-400/60 italic">Awaiting activity…</div>}
          {log.map((e) => (
            <div key={e.id} className="text-[10px] flex gap-2 text-cyan-100/80">
              <span className="text-cyan-500/60">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className="text-cyan-300">{e.agent}</span>
              <span className="text-cyan-100/60">→</span>
              <span className="flex-1 truncate">{e.action}{e.detail ? ` · ${e.detail}` : ''}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Goals placeholder */}
      <Card className="bg-slate-900/60 border-cyan-500/30 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-cyan-300" />
          <h3 className="text-xs tracking-widest text-cyan-200 uppercase">Goal Engine</h3>
        </div>
        <p className="text-xs text-cyan-100/60">
          Coming in Phase 3 — describe a long-term goal in the Console and I'll break it into a roadmap, timeline, and tracked milestones.
        </p>
      </Card>
    </div>
  );
};

export default MissionControl;
