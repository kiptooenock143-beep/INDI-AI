import { useEffect, useRef, useState } from "react";
import { ScanFace, Delete, Lock } from "lucide-react";

const PIN_KEY = "exile.pin.v1";

interface LockScreenProps {
  onUnlock: () => void;
}

const LockScreen = ({ onUnlock }: LockScreenProps) => {
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<"face" | "pin">("face");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const storedPin = localStorage.getItem(PIN_KEY) ?? "0000";
  const unlockRef = useRef(onUnlock);
  unlockRef.current = onUnlock;

  useEffect(() => {
    if (!scanning) return;
    const t = setTimeout(() => unlockRef.current(), 1800);
    return () => clearTimeout(t);
  }, [scanning]);

  const press = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setError("");
    if (next.length === 4) {
      if (next === storedPin) setTimeout(onUnlock, 180);
      else {
        setError("ACCESS DENIED");
        setTimeout(() => setPin(""), 500);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-between gap-6 py-8 sm:py-14 overflow-y-auto overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 35%, rgba(56,189,248,0.16), transparent 55%), linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)",
          backgroundSize: "auto, 44px 44px, 44px 44px",
        }}
      />

      <div className="relative text-center">
        <p className="text-[10px] tracking-[0.5em] text-cyan-400/60">INDI AI</p>
      </div>

      {mode === "face" ? (
        <button
          onClick={() => setScanning(true)}
          className="relative flex flex-col items-center gap-8 group"
          aria-label="Unlock with Face ID"
        >
          <div className="relative w-64 h-64 flex items-center justify-center">
            <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
              <g
                style={{ transformOrigin: "100px 100px", animation: "spin 14s linear infinite" }}
                stroke="#67e8f9"
                fill="none"
              >
                <circle cx="100" cy="100" r="82" strokeWidth="2.5" strokeDasharray="150 90" strokeLinecap="round" />
              </g>
              <g stroke="#7dd3fc" strokeWidth="1" opacity="0.55">
                <line x1="100" y1="6" x2="100" y2="22" />
                <line x1="100" y1="178" x2="100" y2="194" />
                <line x1="6" y1="100" x2="22" y2="100" />
                <line x1="178" y1="100" x2="194" y2="100" />
              </g>
              {/* head silhouette */}
              <path
                d="M100 42 C126 42 140 60 140 86 L140 112 C140 138 122 154 100 154 C78 154 60 138 60 112 L60 86 C60 60 74 42 100 42 Z"
                fill="rgba(8,47,73,0.55)"
                stroke="#38bdf8"
                strokeWidth="1.6"
              />
              <g stroke="#7dd3fc" strokeWidth="1.4" fill="none" opacity="0.8">
                <path d="M84 72 Q100 62 116 72" />
                <path d="M89 80 Q100 73 111 80" />
              </g>
              <g stroke="#bae6fd" strokeWidth="9" strokeLinecap="round">
                <line x1="84" y1="94" x2="116" y2="126" />
                <line x1="116" y1="94" x2="84" y2="126" />
              </g>
            </svg>

            {scanning && (
              <div
                className="absolute inset-x-10 h-0.5 bg-cyan-300 shadow-[0_0_18px_4px_rgba(103,232,249,0.7)]"
                style={{ animation: "exile-scan 1.6s ease-in-out infinite" }}
              />
            )}
          </div>

          <div className="text-center">
            <p className="text-2xl font-light text-cyan-50 leading-tight">
              {scanning ? "Scanning…" : "Unlock with"}
            </p>
            {!scanning && <p className="text-2xl font-light text-cyan-50">Face ID</p>}
            <p className="mt-2 text-[10px] tracking-[0.35em] text-cyan-400/60">
              {scanning ? "BIOMETRIC HANDSHAKE" : "TAP TO SCAN"}
            </p>
          </div>
        </button>
      ) : (
        <div className="relative flex flex-col items-center gap-6">
          <Lock className="w-6 h-6 text-cyan-300" />
          <div className="flex gap-4">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`w-3.5 h-3.5 rounded-full border ${
                  pin.length > i ? "bg-cyan-300 border-cyan-300" : "border-cyan-500/50"
                }`}
              />
            ))}
          </div>
          <p className="text-[10px] tracking-[0.35em] h-3 text-amber-400">{error}</p>
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "<"].map((k, i) =>
              k === "" ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  onClick={() => (k === "<" ? setPin((p) => p.slice(0, -1)) : press(k))}
                  className="w-16 h-16 rounded-full border border-cyan-500/30 bg-slate-900/60 text-cyan-100 text-xl font-light hover:bg-cyan-500/15 transition"
                >
                  {k === "<" ? <Delete className="w-5 h-5 mx-auto" /> : k}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setMode(mode === "face" ? "pin" : "face");
          setScanning(false);
          setPin("");
        }}
        className="relative text-[11px] tracking-[0.3em] text-cyan-400/70 hover:text-cyan-200 flex items-center gap-2"
      >
        {mode === "face" ? <Lock className="w-3.5 h-3.5" /> : <ScanFace className="w-3.5 h-3.5" />}
        {mode === "face" ? "USE PASSCODE" : "USE FACE ID"}
      </button>
    </div>
  );
};

export default LockScreen;
