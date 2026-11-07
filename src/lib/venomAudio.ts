let activeAudio: HTMLAudioElement | null = null;
let activeContext: AudioContext | null = null;

function release(audio: HTMLAudioElement, context: AudioContext) {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();

  if (activeAudio === audio) activeAudio = null;
  if (activeContext === context) activeContext = null;

  if (context.state !== "closed") {
    void context.close().catch(() => {});
  }
}

export function cancelVenomAudio() {
  if (activeAudio) activeAudio.pause();

  if (activeAudio) {
    activeAudio.removeAttribute("src");
    activeAudio.load();
    activeAudio = null;
  }

  if (activeContext) {
    const context = activeContext;
    activeContext = null;
    if (context.state !== "closed") {
      void context.close().catch(() => {});
    }
  }
}

/**
 * Applies a modest bass shelf, gentle saturation and compression to generated
 * WAV audio. Returns false when Web Audio playback is unavailable so the
 * caller can use the existing speech-synthesis fallback.
 */
export async function speakVenomAudio(
  dataUrl: string,
  onEnd?: () => void,
): Promise<boolean> {
  cancelVenomAudio();

  let context: AudioContext | null = null;
  let audio: HTMLAudioElement | null = null;
  let started = false;
  let finished = false;

  const finish = (notify: boolean) => {
    if (finished) return;
    finished = true;

    if (audio && context) release(audio, context);
    if (notify) onEnd?.();
  };

  try {
    if (!dataUrl.startsWith("data:audio/wav;base64,")) return false;

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return false;

    context = new AudioContextConstructor();
    audio = new Audio(dataUrl);
    audio.preload = "auto";

    const source = context.createMediaElementSource(audio);

    const bass = context.createBiquadFilter();
    bass.type = "lowshelf";
    bass.frequency.value = 150;
    bass.gain.value = 10;

    const body = context.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 190;
    body.Q.value = 0.8;
    body.gain.value = 3;

    const shaper = context.createWaveShaper();
    const curve = new Float32Array(44100);
    const drive = 3.0;
    const normalization = Math.tanh(drive);
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (curve.length - 1) - 1;
      curve[i] = Math.tanh(drive * x) / normalization;
    }
    shaper.curve = curve;
    shaper.oversample = "2x";

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -23;
    compressor.knee.value = 16;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;

    source.connect(bass);
    bass.connect(body);
    body.connect(shaper);
    shaper.connect(compressor);
    compressor.connect(context.destination);

    activeAudio = audio;
    activeContext = context;

    audio.addEventListener("ended", () => finish(true), { once: true });
    audio.addEventListener("error", () => finish(started), { once: true });

    await context.resume();
    await audio.play();
    started = true;
    return true;
  } catch {
    if (audio && context) finish(false);
    else if (context && context.state !== "closed") {
      void context.close().catch(() => {});
    }
    return false;
  }
}
