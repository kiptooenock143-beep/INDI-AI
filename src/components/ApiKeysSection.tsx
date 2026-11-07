import { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, Zap, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { detectLocalApi, setLocalApi } from '@/lib/ai';
import { isNativeApp, directKeysPayload, saveDirectKeys } from '@/lib/standalone';

type Row = { name: string; value: string };

const SUGGESTED = [
  'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY', 'TOGETHER_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY',
  'XAI_API_KEY', 'PERPLEXITY_API_KEY', 'ELEVENLABS_API_KEY', 'TAVILY_API_KEY',
];

const blank = (): Row => ({ name: '', value: '' });

export default function ApiKeysSection() {
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);
  const [primary, setPrimary] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [base, setBase] = useState('');
  const [probing, setProbing] = useState(true);
  // Phone app: keys live on the phone and the app talks to the providers directly.
  const native = isNativeApp();

  const loadFrom = async (url: string) => {
    const d = await fetch(`${url}/keys`).then((r) => r.json());
    const existing: Row[] = (d.keys || []).map((k: any) => ({ name: k.name, value: '' }));
    setRows(existing.length ? [...existing, blank()] : [blank(), blank()]);
    setPrimary(d.primary || '');
    setProviders(d.providers || []);
  };

  const probe = async (force = false) => {
    setProbing(true);
    const found = await detectLocalApi(force);
    setBase(found);
    if (found) await loadFrom(found).catch(() => {});
    setProbing(false);
    return found;
  };

  useEffect(() => {
    if (native) {
      const d = directKeysPayload();
      const existing: Row[] = d.keys.map((k) => ({ name: k.name, value: '' }));
      setRows(existing.length ? [...existing, blank()] : [blank(), blank()]);
      setPrimary(d.primary);
      setProviders(d.providers);
      setProbing(false);
      return;
    }
    probe();
  }, []);


  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const connect = async () => {
    if (native) {
      const keys = rows
        .filter((r) => r.name.trim())
        .map((r) => ({ name: r.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'), value: r.value.trim() }));
      const data = saveDirectKeys({ keys, primary: primary.trim() });
      setProviders(data.providers);
      setRows(data.keys.map((k) => ({ name: k.name, value: '' })).concat([blank()]));
      setStatus({
        ok: data.providers.length > 0,
        text: data.providers.length > 0
          ? `Saved on this phone. Active providers: ${data.providers.join(', ')}. Go back and send a message.`
          : 'Saved, but no known provider key was found. Use names like GEMINI_API_KEY or GROQ_API_KEY.',
      });
      return;
    }
    let target = base;
    if (!target) target = await probe(true);
    if (!target) {
      setStatus({
        ok: false,
        text:
          window.location.protocol === 'https:'
            ? 'Local API not reachable from this hosted page. Run INDI AI locally (python main.py) and open http://localhost:8080 — keys only work in the local/desktop build.'
            : 'Local API not detected on ports 8787-8789. Start it with: python main.py',
      });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const keys = rows
        .filter((r) => r.name.trim())
        .map((r) => ({ name: r.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'), value: r.value.trim() }));
      const res = await fetch(`${target}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys, primary: primary.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProviders(data.providers || []);
      setRows(
        (data.keys || []).map((k: any) => ({ name: k.name, value: '' })).concat([blank()]),
      );
      setStatus({
        ok: (data.providers || []).length > 0,
        text:
          (data.providers || []).length > 0
            ? `Connected. Active providers: ${(data.providers || []).join(', ')}`
            : 'Saved, but no cloud provider answered — INDI AI will use offline rules.',
      });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-cyan-200">
        <KeyRound className="w-5 h-5" />
        <h2 className="text-sm tracking-[0.3em] uppercase">API Keys</h2>
      </div>

      <p className="text-xs text-cyan-400/60 leading-relaxed">
        {native
          ? 'Paste a provider key below (for example GEMINI_API_KEY). Keys are stored only on this phone and are sent only to the provider you chose, over your data or Wi-Fi connection. One key is enough; add more for backup.'
          : <>Paste any provider key below — name it whatever you like (2 minimum, 200 maximum). Keys are written to
        your local <span className="font-mono text-cyan-300">.env</span> and never leave this machine.</>}
      </p>

      {!native && <div className="rounded-md border border-cyan-500/20 p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase">
          <span className="text-cyan-400/60">Local engine</span>
          <span className={base ? 'text-cyan-200' : 'text-amber-300'}>
            {probing ? 'SCANNING…' : base ? `ONLINE · ${base}` : 'NOT DETECTED'}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            value={base}
            onChange={(e) => { setBase(e.target.value); setLocalApi(e.target.value); }}
            placeholder="http://localhost:8787"
            className="flex-1 bg-slate-900/60 border-cyan-500/25 text-cyan-100 text-xs font-mono placeholder:text-cyan-500/30"
          />
          <Button
            onClick={() => probe(true)}
            variant="ghost"
            className="text-[10px] tracking-[0.2em] text-cyan-200 border border-cyan-500/25"
          >
            RETRY
          </Button>
        </div>
      </div>}



      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <Input
              list="exile-key-names"
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="KEY NAME"
              className="w-2/5 bg-slate-900/60 border-cyan-500/25 text-cyan-100 text-xs font-mono placeholder:text-cyan-500/30"
            />
            <Input
              type="password"
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder={row.name && !row.value ? '•••••• saved' : 'paste key'}
              className="flex-1 bg-slate-900/60 border-cyan-500/25 text-cyan-100 text-xs font-mono placeholder:text-cyan-500/30"
            />
            <button
              onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : [blank()]))}
              className="text-cyan-500/50 hover:text-red-400 px-1"
              aria-label="Remove key"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <datalist id="exile-key-names">
          {SUGGESTED.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>

      <button
        onClick={() => setRows((r) => (r.length < 200 ? [...r, blank()] : r))}
        className="flex items-center gap-1.5 text-[10px] tracking-[0.25em] text-cyan-300/80 hover:text-cyan-100"
      >
        <Plus className="w-3.5 h-3.5" /> ADD KEY
      </button>

      <div className="space-y-1.5">
        <label className="text-[10px] tracking-[0.25em] text-cyan-400/60 uppercase">Preferred provider (optional)</label>
        <Input
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
          placeholder="groq | openai | gemini | openrouter…"
          className="bg-slate-900/60 border-cyan-500/25 text-cyan-100 text-xs font-mono placeholder:text-cyan-500/30"
        />
      </div>

      {providers.length > 0 && (
        <div className="text-[10px] tracking-widest text-cyan-400/60 uppercase">
          Ready: {providers.join(' · ')}
        </div>
      )}

      {status && (
        <div
          className={`flex items-start gap-2 rounded-md border p-3 text-xs ${
            status.ok ? 'border-cyan-500/30 text-cyan-200' : 'border-amber-500/40 text-amber-300'
          }`}
        >
          {status.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
          <span>{status.text}</span>
        </div>
      )}

      <Button
        onClick={connect}
        disabled={busy}
        className="w-full rounded-full bg-cyan-500/15 border border-cyan-400/50 text-cyan-100 hover:bg-cyan-500/25 tracking-[0.3em] text-[11px] h-11"
      >
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
        {busy ? 'CONNECTING…' : 'CONNECT & RUN'}
      </Button>
    </div>
  );
}
