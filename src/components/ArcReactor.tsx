import { useMemo } from "react";

export type ReactorState = "idle" | "listening" | "thinking" | "speaking";
export type ReactorDock = "center" | "top-left" | "bottom-right";

interface ArcReactorProps {
  size?: number;
  state?: ReactorState;
  /** 0..1 live audio level — drives listening spikes and speech follow */
  amplitude?: number;
  className?: string;
}

/**
 * INDI AI core — HUD arc reactor: rotating arcs, dashed orbit, hex core,
 * corner brackets, plus a live amplitude spike ring.
 */
const ArcReactor = ({
  size = 320,
  state = "idle",
  amplitude = 0,
  className = "",
}: ArcReactorProps) => {
  const spin = state === "thinking" ? 4 : state === "listening" ? 8 : 16;
  const pulse = state === "speaking" ? "1.2s" : "3s";
  const amp = Math.min(1, Math.max(0, amplitude));
  const live = state === "listening" || state === "speaking";

  // Deterministic spike layout around the ring
  const spikes = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => ({
        angle: (i / 64) * Math.PI * 2,
        weight: 0.45 + 0.55 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.9)),
      })),
    [],
  );

  const coreScale = 1 + (live ? amp * 0.12 : 0);
  const glow = 0.45 + (live ? amp * 0.5 : 0);

  return (
    <div
      className={`exile-reactor relative select-none ${className}`}
      data-state={state}
      style={{ width: size, height: size }}
      aria-label="INDI AI core"
    >
      <div
        className="absolute inset-[18%] rounded-full blur-2xl transition-opacity duration-100"
        style={{
          background: `radial-gradient(circle, rgba(56,189,248,${glow}), transparent 70%)`,
          animation: `exile-breathe ${pulse} ease-in-out infinite`,
        }}
      />
      <svg viewBox="0 0 200 200" width={size} height={size} className="relative">
        <defs>
          <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.15" />
          </radialGradient>
        </defs>

        {/* corner brackets */}
        <g stroke="#7dd3fc" strokeWidth="1.2" fill="none" opacity="0.55">
          <path d="M14 34 V14 H34" />
          <path d="M166 14 H186 V34" />
          <path d="M186 166 V186 H166" />
          <path d="M34 186 H14 V166" />
        </g>

        {/* live amplitude spikes */}
        {live && (
          <g
            stroke={state === "listening" ? "#67e8f9" : "#a5f3fc"}
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity={0.35 + amp * 0.65}
          >
            {spikes.map((s, i) => {
              const r0 = 84;
              const len = 3 + amp * 22 * s.weight;
              const x1 = 100 + Math.cos(s.angle) * r0;
              const y1 = 100 + Math.sin(s.angle) * r0;
              const x2 = 100 + Math.cos(s.angle) * (r0 + len);
              const y2 = 100 + Math.sin(s.angle) * (r0 + len);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
          </g>
        )}

        {/* outer rotating arcs */}
        <g style={{ transformOrigin: "100px 100px", animation: `spin ${spin}s linear infinite` }}>
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke="url(#arcGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="120 70"
          />
          <circle cx="100" cy="22" r="3" fill="#67e8f9" />
          <circle cx="178" cy="100" r="2.5" fill="#67e8f9" />
        </g>

        {/* counter-rotating dashed orbit */}
        <g
          style={{
            transformOrigin: "100px 100px",
            animation: `spin ${spin * 2}s linear infinite reverse`,
          }}
        >
          <circle
            cx="100"
            cy="100"
            r="62"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1"
            strokeDasharray="2 6"
            opacity="0.7"
          />
          <circle cx="100" cy="38" r="2" fill="#7dd3fc" />
          <circle cx="62" cy="145" r="2" fill="#7dd3fc" />
          <circle cx="145" cy="145" r="2" fill="#7dd3fc" />
        </g>

        {/* inner ring */}
        <circle cx="100" cy="100" r="48" fill="none" stroke="#0ea5e9" strokeWidth="0.8" opacity="0.45" />

        {/* hex core — scales with live audio */}
        <g style={{ transformOrigin: "100px 100px", transform: `scale(${coreScale})` }}>
          <polygon
            points="100,60 135,80 135,120 100,140 65,120 65,80"
            fill="url(#coreGrad)"
            stroke="#38bdf8"
            strokeWidth="1.6"
            style={{ animation: `exile-breathe ${pulse} ease-in-out infinite` }}
          />
          <polygon
            points="100,72 124,86 124,114 100,128 76,114 76,86"
            fill="none"
            stroke="#7dd3fc"
            strokeWidth="0.8"
            opacity="0.6"
          />
          <circle cx="100" cy="100" r={6 + amp * 5} fill="#e0f2fe" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
};

export default ArcReactor;
