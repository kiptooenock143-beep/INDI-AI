/**
 * Live audio level helpers used to drive the arc reactor.
 * - micLevelMeter: real RMS from the microphone.
 * - speechLevelMeter: synthetic waveform that follows speech synthesis output.
 */

export interface LevelMeter {
  stop: () => void;
}

export async function micLevelMeter(onLevel: (v: number) => void): Promise<LevelMeter> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  let smooth = 0;

  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    smooth = smooth * 0.7 + Math.min(1, rms * 4) * 0.3;
    onLevel(smooth);
    raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    stop: () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
      ctx.close().catch(() => {});
      onLevel(0);
    },
  };
}

/** Animates a natural-looking speech envelope while text is being spoken. */
export function speechLevelMeter(onLevel: (v: number) => void): LevelMeter {
  let raf = 0;
  const start = performance.now();
  const tick = () => {
    const t = (performance.now() - start) / 1000;
    const v =
      0.35 +
      0.3 * Math.abs(Math.sin(t * 7.3)) +
      0.2 * Math.abs(Math.sin(t * 3.1 + 1.2)) +
      0.1 * Math.abs(Math.sin(t * 13.7));
    onLevel(Math.min(1, v));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return {
    stop: () => {
      cancelAnimationFrame(raf);
      onLevel(0);
    },
  };
}
