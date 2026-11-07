import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceClip, listVoiceClips, deleteVoiceClip, clearVoiceClips } from "@/lib/conversation";

const VoiceCommandsSection = () => {
  const [clips, setClips] = useState<VoiceClip[]>([]);

  useEffect(() => {
    const load = () => setClips(listVoiceClips());
    load();
    window.addEventListener("exile:voicelog", load);
    return () => window.removeEventListener("exile:voicelog", load);
  }, []);

  return (
    <div className="p-4 space-y-4 text-cyan-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm tracking-[0.3em] text-cyan-300">VOICE COMMANDS</h3>
          <p className="text-xs text-cyan-400/60 mt-1">
            Every spoken directive is recorded and stored locally. Play it back or delete it.
          </p>
        </div>
        {clips.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => clearVoiceClips()}
            className="text-red-300 border border-red-400/30 text-xs"
          >
            Delete all
          </Button>
        )}
      </div>

      <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
        {clips.length === 0 && <p className="text-xs text-cyan-400/50">No voice commands recorded yet.</p>}
        {clips
          .slice()
          .reverse()
          .map((c) => (
            <div key={c.id} className="rounded-md border border-cyan-500/25 bg-slate-900/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] tracking-[0.3em] text-cyan-400/70">
                  {new Date(c.at).toLocaleString()}
                </span>
                <button
                  onClick={() => deleteVoiceClip(c.id)}
                  aria-label="Delete recording"
                  className="text-red-300/70 hover:text-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm leading-6">{c.transcript || "(no transcript)"}</p>
              {c.audio && <audio controls src={c.audio} className="h-8 w-full" />}
            </div>
          ))}
      </div>
    </div>
  );
};

export default VoiceCommandsSection;
