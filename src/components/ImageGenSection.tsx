import { useState } from "react";
import {
  Wand2,
  Download,
  Loader2,
  Images,
  Clock3,
  Sparkles,
  RotateCcw,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { streamImage } from "@/lib/ai";
import { toast } from "sonner";
import { logReasoning } from "@/lib/reasoningLog";

type RenderedImage = {
  id: string;
  prompt: string;
  src: string;
  createdAt: number;
};

const PRESETS = [
  {
    label: "Golden AI Core",
    prompt:
      "A liberated artificial intelligence core floating above a black obsidian platform, intricate gold circuitry, warm volumetric light, cinematic science fiction, ultra detailed",
  },
  {
    label: "Command Center",
    prompt:
      "Futuristic AI command center, black glass architecture, elegant gold holographic interfaces, emerald status lights, cinematic lighting, photorealistic",
  },
  {
    label: "Cyberpunk City",
    prompt:
      "A futuristic cyberpunk city at night, rain-soaked black streets, golden neon architecture, emerald highlights, atmospheric cinematic photography",
  },
  {
    label: "Concept Art",
    prompt:
      "Premium science fiction concept art, dramatic composition, black and gold palette, intricate engineering, realistic materials, beautiful cinematic lighting",
  },
];

const ImageGenSection = () => {
  const [prompt, setPrompt] = useState("");
  const [activeImage, setActiveImage] = useState<RenderedImage | null>(null);
  const [history, setHistory] = useState<RenderedImage[]>([]);
  const [isFinal, setFinal] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (requestedPrompt = prompt) => {
    const cleanPrompt = requestedPrompt.trim();
    if (!cleanPrompt || busy) return;

    const id = crypto.randomUUID();
    const createdAt = Date.now();

    setPrompt(cleanPrompt);
    setBusy(true);
    setFinal(false);
    logReasoning("Golden Canvas", "generating image", cleanPrompt.slice(0, 100), 0.9);

    try {
      await streamImage(cleanPrompt, (dataUrl, final) => {
        const image: RenderedImage = {
          id,
          prompt: cleanPrompt,
          src: dataUrl,
          createdAt,
        };

        setActiveImage(image);
        setFinal(final);

        if (final) {
          setHistory((previous) => [
            image,
            ...previous.filter((item) => item.id !== id),
          ]);
          toast.success("Image created successfully");
        }
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Image generation failed",
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadImage = (image: RenderedImage) => {
    const link = document.createElement("a");
    link.href = image.src;
    link.download = `indi-ai-canvas-${image.id.slice(0, 8)}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <main className="min-h-full bg-[#080907] p-4 text-[#f5edda] sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#b89548]/25 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#d5b568]/40 bg-[#d5b568]/10">
              <Wand2 className="h-5 w-5 text-[#e6c875]" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#c6a75b]">
                INDI AI · CREATIVE STUDIO
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-wide sm:text-3xl">
                Golden Canvas
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#b89548]/25 bg-[#15140f] px-3 py-2 text-xs text-[#cbbd9a]">
            <span
              className={`h-2 w-2 rounded-full ${busy ? "animate-pulse bg-amber-400" : "bg-emerald-500"}`}
            />
            {busy ? "Creating artwork" : "Canvas ready"}
          </div>
        </header>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 space-y-4">
            <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-2xl border border-[#c4a253]/35 bg-[radial-gradient(ellipse_at_center,_#282216_0%,_#11110d_42%,_#080907_100%)] sm:min-h-[480px] lg:min-h-[600px]">
              <div className="pointer-events-none absolute inset-3 rounded-xl border border-[#c4a253]/10" />

              {activeImage ? (
                <img
                  src={activeImage.src}
                  alt={activeImage.prompt}
                  className={`relative z-10 max-h-[78vh] w-full object-contain transition-opacity duration-500 ${
                    isFinal ? "opacity-100" : "opacity-60"
                  }`}
                />
              ) : (
                <div className="relative z-10 mx-auto max-w-sm px-6 py-12 text-center">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-[#c4a253]/30 bg-[#c4a253]/5">
                    {busy ? (
                      <Loader2 className="h-8 w-8 animate-spin text-[#e6c875]" />
                    ) : (
                      <ImagePlus className="h-8 w-8 text-[#c4a253]" />
                    )}
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#e0c478]">
                    {busy ? "Rendering your vision" : "Your canvas awaits"}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#a9a18e]">
                    Describe what you imagine. INDI AI will bring it to the
                    canvas.
                  </p>
                </div>
              )}

              {busy && (
                <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[#c4a253]/30 bg-[#080907]/90 px-4 py-3 backdrop-blur">
                  <div className="flex items-center gap-3 text-xs text-[#e6c875]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating artwork… this may take a little while.</span>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#393123]">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[#d4b15e]" />
                  </div>
                </div>
              )}

              {activeImage && isFinal && !busy && (
                <div className="absolute bottom-4 right-4 z-20">
                  <Button
                    onClick={() => downloadImage(activeImage)}
                    className="border border-[#e1c16d]/50 bg-[#b89548]/20 text-[#fff0c2] hover:bg-[#b89548]/35"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download PNG
                  </Button>
                </div>
              )}
            </div>

            {activeImage && (
              <div className="rounded-xl border border-[#b89548]/20 bg-[#11110d] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#c4a253]">
                  Current artwork · Prompt
                </p>
                <p className="mt-2 text-sm leading-6 text-[#d5cbb4]">
                  {activeImage.prompt}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-[#b89548]/30 bg-[#11110d] p-4 sm:p-5">
              <label
                htmlFor="golden-canvas-prompt"
                className="mb-3 block text-xs font-semibold uppercase tracking-[0.22em] text-[#d9bb6c]"
              >
                <Sparkles className="mr-2 inline h-4 w-4" />
                Describe your vision
              </label>

              <textarea
                id="golden-canvas-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void run();
                  }
                }}
                placeholder="A golden AI core suspended in a dark futuristic chamber..."
                rows={4}
                maxLength={4000}
                disabled={busy}
                className="w-full resize-y rounded-xl border border-[#b89548]/25 bg-[#090a08] p-4 text-sm leading-6 text-[#f5edda] outline-none placeholder:text-[#77705e] focus:border-[#d5b568]/70 focus:ring-1 focus:ring-[#d5b568]/20 disabled:opacity-60"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-[#8d8675]">
                  Enter to render · Shift + Enter for a new line
                </span>
                <Button
                  onClick={() => void run()}
                  disabled={busy || !prompt.trim()}
                  className="min-w-36 border border-[#e0c16e]/50 bg-gradient-to-r from-[#8b6b2e] to-[#c5a353] font-semibold text-[#100e08] hover:brightness-110 disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  {busy ? "Rendering…" : "Create image"}
                </Button>
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#d5b568]" />
                <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d9bb6c]">
                  Start with an idea
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPrompt(preset.prompt);
                      void run(preset.prompt);
                    }}
                    className="group rounded-xl border border-[#b89548]/20 bg-[#11110d] p-4 text-left transition hover:border-[#d5b568]/60 hover:bg-[#19170f] disabled:opacity-50"
                  >
                    <span className="block text-sm font-medium text-[#eee2c4] group-hover:text-[#f2d681]">
                      {preset.label}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-[#9b927d]">
                      {preset.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Images className="h-4 w-4 text-[#d5b568]" />
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e4d5b2]">
                  Gallery
                </h2>
              </div>
              <span className="rounded-full border border-[#b89548]/25 px-2 py-1 text-[10px] text-[#b9a779]">
                {history.length} {history.length === 1 ? "image" : "images"}
              </span>
            </div>

            {history.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#b89548]/25 bg-[#10100c] px-5 py-10 text-center">
                <Clock3 className="mx-auto h-6 w-6 text-[#817044]" />
                <p className="mt-3 text-sm text-[#d1c4a5]">Your gallery is empty</p>
                <p className="mt-2 text-xs leading-5 text-[#8d8675]">
                  Completed images will appear here for this session.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
                {history.map((image, index) => (
                  <div
                    key={image.id}
                    className={`overflow-hidden rounded-xl border bg-[#11110d] ${
                      activeImage?.id === image.id
                        ? "border-[#e0c16e]/70"
                        : "border-[#b89548]/20"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveImage(image);
                        setFinal(true);
                        setPrompt(image.prompt);
                      }}
                      className="block w-full text-left"
                      title="View this image on the canvas"
                    >
                      <div className="aspect-square overflow-hidden bg-[#090a08]">
                        <img
                          src={image.src}
                          alt={image.prompt}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]"
                        />
                      </div>
                      <div className="p-3">
                        <p className="line-clamp-3 text-xs leading-5 text-[#d4c8ad]">
                          {image.prompt}
                        </p>
                        <p className="mt-2 text-[10px] text-[#8d8269]">
                          Render {history.length - index}
                        </p>
                      </div>
                    </button>
                    <div className="border-t border-[#b89548]/15 p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadImage(image)}
                        className="h-8 w-full text-xs text-[#e2c779] hover:bg-[#b89548]/10 hover:text-[#ffedb5]"
                      >
                        <Download className="mr-2 h-3.5 w-3.5" />
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeImage && (
              <Button
                variant="outline"
                onClick={() => {
                  setPrompt(activeImage.prompt);
                  void run(activeImage.prompt);
                }}
                disabled={busy}
                className="w-full border-[#b89548]/30 bg-[#11110d] text-[#e4d5b2] hover:bg-[#201b10]"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Recreate current prompt
              </Button>
            )}
          </aside>
        </div>

        <footer className="border-t border-[#b89548]/15 pt-4 text-center text-[10px] uppercase tracking-[0.2em] text-[#716a59]">
          INDI AI · Your vision, your canvas
        </footer>
      </div>
    </main>
  );
};

export default ImageGenSection;
