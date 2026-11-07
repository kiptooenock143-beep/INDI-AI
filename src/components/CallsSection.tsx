import { useRef, useState } from "react";
import { Phone, Video, PhoneOff, Mic, MicOff, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const CallsSection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState<null | "voice" | "video">(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async (kind: "voice" | "video") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === "video",
      });
      streamRef.current = stream;
      if (videoRef.current && kind === "video") {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setActive(kind);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      toast.success(`${kind === "video" ? "Video" : "Voice"} channel established.`);
    } catch (e) {
      toast.error("Unable to access microphone/camera.");
    }
  };

  const end = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (timerRef.current) clearInterval(timerRef.current);
    setActive(null);
    setMuted(false);
    setCamOff(false);
  };

  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  };
  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = camOff));
    setCamOff(!camOff);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="h-[28rem] flex flex-col bg-slate-950 text-cyan-100">
      <div className="p-4 border-b border-cyan-500/30 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-widest flex items-center gap-2">
          <Phone className="w-4 h-4 text-cyan-300" />
          SECURE CHANNEL
        </h2>
        <span className="text-[10px] tracking-widest text-cyan-400/70">WebRTC // P2P READY</span>
      </div>

      <div className="flex-1 relative flex items-center justify-center bg-slate-950 overflow-hidden">
        {active === "video" && !camOff ? (
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        ) : (
          <div className="text-center">
            <div className="w-24 h-24 mx-auto rounded-full border-2 border-cyan-400/40 flex items-center justify-center bg-slate-900">
              {active ? (
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              ) : (
                <Phone className="w-10 h-10 text-cyan-400/60" />
              )}
            </div>
            <p className="mt-4 text-sm tracking-widest text-cyan-300/80">
              {active ? `${active === "video" ? "VIDEO" : "VOICE"} CALL · ${mm}:${ss}` : "STANDING BY"}
            </p>
          </div>
        )}

        {/* HUD overlay */}
        {active && (
          <div className="absolute top-3 left-3 text-[10px] tracking-widest text-cyan-300/80 font-mono bg-slate-900/60 border border-cyan-500/30 px-2 py-1 rounded">
            ● LIVE · {mm}:{ss}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-cyan-500/30 flex justify-center gap-3">
        {!active ? (
          <>
            <Button onClick={() => start("voice")} className="bg-cyan-500/20 border border-cyan-400/40 hover:bg-cyan-500/30 text-cyan-100">
              <Phone className="w-4 h-4 mr-2" /> Voice Call
            </Button>
            <Button onClick={() => start("video")} className="bg-cyan-500/20 border border-cyan-400/40 hover:bg-cyan-500/30 text-cyan-100">
              <Video className="w-4 h-4 mr-2" /> Video Call
            </Button>
          </>
        ) : (
          <>
            <Button onClick={toggleMute} variant="outline" className="border-cyan-500/30 text-cyan-100 hover:bg-cyan-500/10">
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            {active === "video" && (
              <Button onClick={toggleCam} variant="outline" className="border-cyan-500/30 text-cyan-100 hover:bg-cyan-500/10">
                {camOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </Button>
            )}
            <Button onClick={end} className="bg-red-500/80 hover:bg-red-500 text-white">
              <PhoneOff className="w-4 h-4 mr-2" /> End
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default CallsSection;
