import { useState } from "react";
import { FileText, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamChat, fileToDataUrl } from "@/lib/ai";
import { toast } from "sonner";
import { logReasoning } from "@/lib/reasoningLog";

type Att = { kind: "image" | "file"; mime: string; dataUrl: string; name: string };

const DocumentSection = () => {
  const [prompt, setPrompt] = useState("Summarize this and extract key facts, dates and action items.");
  const [atts, setAtts] = useState<Att[]>([]);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  const onUpload = async (files: FileList | null) => {
    if (!files) return;
    const next: Att[] = [];
    for (const f of Array.from(files)) {
      const dataUrl = await fileToDataUrl(f);
      next.push({
        kind: f.type.startsWith("image/") ? "image" : "file",
        mime: f.type || "application/octet-stream",
        dataUrl, name: f.name,
      });
    }
    setAtts((prev) => [...prev, ...next]);
  };

  const run = async () => {
    if (busy) return;
    if (!atts.length && !prompt.trim()) return toast.error("Attach a file or type a prompt");
    setBusy(true); setOutput("");
    logReasoning("Docs", "analyzing", atts.map((a) => a.name).join(", ") || "prompt only", 0.9);
    try {
      await streamChat("exile-analyze", { prompt, attachments: atts }, (d) => setOutput((o) => o + d));
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="p-4 space-y-4 bg-slate-950 text-cyan-100 min-h-[28rem]">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-cyan-300" />
        <h2 className="text-sm tracking-widest">DOCUMENT INTELLIGENCE</h2>
      </div>
      <div className="flex gap-2 items-center">
        <label className="flex items-center gap-2 cursor-pointer bg-cyan-500/15 border border-cyan-400/40 px-3 py-2 rounded text-xs tracking-widest hover:bg-cyan-500/25">
          <Upload className="w-4 h-4" /> ATTACH
          <input type="file" multiple accept="image/*,application/pdf,.txt,.md,.csv" hidden onChange={(e) => onUpload(e.target.files)} />
        </label>
        <span className="text-[11px] text-cyan-400/70">{atts.length ? `${atts.length} file(s) queued` : "PDFs, images, text"}</span>
      </div>
      {atts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {atts.map((a, i) => (
            <span key={i} className="text-[10px] px-2 py-1 border border-cyan-500/30 rounded bg-slate-900/60">{a.name}</span>
          ))}
        </div>
      )}
      <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What do you want to know?"
        className="bg-slate-900 border-cyan-500/30 text-cyan-100 placeholder:text-cyan-500/40" />
      <Button onClick={run} disabled={busy} className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/30">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyzing…</> : "Analyze"}
      </Button>
      <div className="min-h-[10rem] p-3 rounded border border-cyan-500/20 bg-slate-900/60 text-sm whitespace-pre-wrap leading-relaxed">
        {output || <span className="text-cyan-500/50 text-xs tracking-widest">AWAITING INPUT</span>}
      </div>
    </div>
  );
};

export default DocumentSection;
