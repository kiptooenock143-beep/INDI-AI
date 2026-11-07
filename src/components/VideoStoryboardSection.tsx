import { useState } from "react";
import { Film, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamImage } from "@/lib/ai";
import { toast } from "sonner";
import { logReasoning } from "@/lib/reasoningLog";

// INDI AI storyboard: generates N cinematic keyframes for a scene.
// Real motion video requires the native/desktop build (Veo/Runway/etc.).
const VideoStoryboardSection = () => {
  const [prompt, setPrompt] = useState("");
  const [frames, setFrames] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const build = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setFrames([]);
    logReasoning("Cinema", "generating storyboard", prompt.slice(0, 60), 0.8);
    const beats = [
      `Cinematic wide establishing shot: ${prompt}. Golden hour, film grain.`,
      `Medium shot, dynamic action: ${prompt}. Motion blur, dramatic lighting.`,
      `Close-up detail, emotional moment: ${prompt}. Shallow depth of field.`,
      `Final hero shot, epic composition: ${prompt}. Volumetric light, cinematic color grade.`,
    ];
    const out: string[] = [];
    try {
      for (const beat of beats) {
        let last = "";
        await streamImage(beat, (d, final) => { if (final) last = d; });
        if (last) { out.push(last); setFrames([...out]); }
      }
      toast.success("Storyboard ready — press Play");
    } catch (e: any) {
      toast.error(e.message || "Storyboard failed");
    } finally { setBusy(false); }
  };

  const play = async () => {
    if (!frames.length) return;
    setPlaying(true);
    for (let i = 0; i < frames.length; i++) {
      await new Promise((r) => setTimeout(r, 900));
    }
    setPlaying(false);
  };

  return (
    <div className="p-4 space-y-4 bg-slate-950 text-cyan-100 min-h-[28rem]">
      <div className="flex items-center gap-2">
        <Film className="w-4 h-4 text-cyan-300" />
        <h2 className="text-sm tracking-widest">CINEMA · STORYBOARD</h2>
      </div>
      <p className="text-[11px] text-cyan-400/70">Generates 4 cinematic keyframes. Real motion video is enabled in the native build.</p>
      <div className="flex gap-2">
        <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Scene description…"
          className="bg-slate-900 border-cyan-500/30 text-cyan-100 placeholder:text-cyan-500/40" />
        <Button onClick={build} disabled={busy} className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/30">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Build"}
        </Button>
        <Button onClick={play} disabled={!frames.length || playing} variant="ghost" className="border border-cyan-500/30 text-cyan-100">Play</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {frames.map((f, i) => (
          <div key={i} className="relative aspect-video border border-cyan-500/30 rounded overflow-hidden">
            <img src={f} alt={`frame ${i + 1}`} className="w-full h-full object-cover" />
            <div className="absolute top-1 left-1 text-[10px] tracking-widest bg-slate-950/70 px-1.5 py-0.5 rounded">F{i + 1}</div>
            <a href={f} download={`indi-ai-frame-${i + 1}.png`} className="absolute bottom-1 right-1 bg-cyan-500/20 border border-cyan-400/40 rounded p-1">
              <Download className="w-3 h-3" />
            </a>
          </div>
        ))}
        {!frames.length && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-video border border-cyan-500/20 rounded bg-slate-900/40 flex items-center justify-center text-cyan-500/40 text-[10px] tracking-widest">
            F{i + 1}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoStoryboardSection;
