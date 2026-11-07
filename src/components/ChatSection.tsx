import { useEffect, useRef, useState } from "react";
import { Bot, User, Send, Mic, Volume2, VolumeX, Wifi, WifiOff, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { fileToDataUrl, streamChat, streamImage } from "@/lib/ai";
import { rememberGeneratedImage } from "@/lib/generatedImage";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import AssistantContent from "@/components/AssistantContent";
import { downloadWordDocument } from "@/lib/exportWord";
import { offlineRespond, speak } from "@/lib/offlineExile";
import { toast } from "sonner";
import { routeToAgent } from "@/lib/agents";
import { memoryContext } from "@/lib/memory";
import { logReasoning } from "@/lib/reasoningLog";
import { isVenomModeEnabled } from "@/lib/venomMode";
import { getExilePersonalityPrompt } from "@/lib/personality";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  originalRequest?: string;
  imageSrc?: string;
  imageGenerating?: boolean;
  imageFinal?: boolean;
  documentRequested?: boolean;
  attachmentPreviews?: Array<{ name: string; kind: "image" | "text" | "pdf"; dataUrl?: string }>;
}

type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<{ transcript: string }>>; };
type SpeechRecognitionInstance = { lang: string; interimResults: boolean; onresult: ((event: SpeechRecognitionEventLike) => void) | null; onerror: (() => void) | null; start: () => void; };
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
type SpeechRecognitionWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor; };

type ChatAttachment = {
  id: string;
  file: File;
  kind: "image" | "text" | "pdf";
  dataUrl?: string;
  extractedText?: string;
};

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 50;
const MAX_TEXT_CHARS = 40000;

async function resizeImageFor4K(dataUrl: string): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The attached image could not be decoded."));
  });

  const maxDimension = 3840;
  const scale = maxDimension / Math.max(image.naturalWidth, image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable in this browser.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const isImageGenerationRequest = (text: string) =>
  /\b(generate|create|make|draw|paint|design)\b.{0,100}\b(image|picture|artwork|illustration|logo|wallpaper|portrait|icon)\b/i.test(text) ||
  /\b(image|picture|artwork|illustration|logo|wallpaper)\b.{0,60}\b(of|showing|featuring)\b/i.test(text) ||
  /\b(draw|paint)\b/i.test(text) ||
  /\b(create|make|generate)\b.{0,80}\b(the|that|same)\b.{0,60}\b(we discussed|we talked about|from earlier|mentioned earlier)\b/i.test(text);

const buildImagePrompt = (request: string, history: Message[]) => {
  const context = history
    .slice(-10)
    .map((item) => {
      const role = item.sender === "user" ? "User" : "INDI AI";
      const content = String(item.content || "").trim();
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(-6000);

  if (!context) return request;

  return [
    "Create an image using the relevant conversation context below.",
    "Treat the CURRENT IMAGE REQUEST as the controlling instruction.",
    "Use earlier messages to resolve references such as 'the car we discussed'.",
    "Do not render the conversation text into the image unless explicitly requested.",
    "",
    "RECENT CONVERSATION:",
    context,
    "",
    "CURRENT IMAGE REQUEST:",
    request,
  ].join("\n").slice(0, 8000);
};

const ChatSection = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content:
        "INDI AI online. All systems nominal. Your AI, your PC, your rules. I'm at your service, Sir.",
      sender: "ai",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voiceOnRef = useRef(false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
    if (!voiceOn && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [voiceOn]);

  const addMessage = (
    content: string,
    sender: "user" | "ai",
    attachmentPreviews?: Message["attachmentPreviews"],
  ) => {
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        content,
        sender,
        timestamp: new Date(),
        ...(attachmentPreviews?.length ? { attachmentPreviews } : {}),
      },
    ]);
  };

  const fallback = async (userText: string, aiId: string) => {
    const r = offlineRespond(userText);
    setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, content: r.text } : x)));
    if (voiceOnRef.current) speak(r.text);
  };

  const handleSend = async (
    userText: string,
    history: Message[],
    selectedAttachments: ChatAttachment[] = [],
  ) => {
    setLoading(true);
    const aiId = crypto.randomUUID();
    const wantsImage = selectedAttachments.length === 0 &&
      isImageGenerationRequest(userText);
    const imagePrompt = wantsImage
      ? buildImagePrompt(userText, history)
      : userText;

    setMessages((m) => [...m, {
      id: aiId,
      content: "",
      sender: "ai",
      timestamp: new Date(),
      originalRequest: userText,
      ...(wantsImage ? { imageGenerating: true } : {}),
      ...( /\b(word document|docx|as a word|into word|word file|word format)\b/i.test(userText)
        ? { documentRequested: true }
        : {}),
    }]);

    const fileText = selectedAttachments
      .filter((a) => a.extractedText)
      .map((a) => `\n\n[Attached file: ${a.file.name}]\n${a.extractedText}`)
      .join("");
    const promptWithFiles = `${userText}${fileText}`.slice(0, 90000);
    const images = selectedAttachments.filter((a) => a.kind === "image" && a.dataUrl);

    // Provide an actual downloadable high-resolution resize for attached images.
    // This is standard interpolation, not AI detail reconstruction.
    if (images.length && /\b(4k|upscale|upscaling|resize to|increase resolution)\b/i.test(userText)) {
      try {
        const resized = await resizeImageFor4K(images[0].dataUrl!);
        setMessages((current) => current.map((message) =>
          message.id === aiId
            ? {
                ...message,
                content: "Your image has been resized with high-quality browser interpolation. This preserves its aspect ratio and does not invent missing detail like an AI super-resolution model.",
                imageSrc: resized,
                imageGenerating: false,
                imageFinal: true,
              }
            : message
        ));
        toast.success("Resized image is ready to download");
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Image resize failed.";
        setMessages((current) => current.map((message) =>
          message.id === aiId ? { ...message, content: reason } : message
        ));
        toast.error(reason);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Image generation runs through INDI AI's existing image API, independently
    // of cloud-chat availability. The canvas and final image share one message.
    if (wantsImage) {
      try {
        logReasoning("INDI AI Canvas", "generating image", userText.slice(0, 100), 0.9);

        await streamImage(imagePrompt, (dataUrl, isFinal) => {
          setMessages((current) => current.map((message) =>
            message.id === aiId
              ? {
                  ...message,
                  imageSrc: dataUrl,
                  imageGenerating: !isFinal,
                  imageFinal: isFinal,
                  content: "",
                }
              : message
          ));

          if (isFinal) {
            rememberGeneratedImage(dataUrl, imagePrompt);
            toast.success("Image created successfully");
          }
        });
      } catch (error) {
        const reason = error instanceof Error
          ? error.message
          : "Unknown image-generation error.";

        setMessages((current) => current.map((message) =>
          message.id === aiId
            ? {
                ...message,
                content: `Image generation failed: ${reason}`,
                imageGenerating: false,
              }
            : message
        ));
        toast.error(reason);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!online) {
      if (images.length) {
        const answer = "Image analysis needs an online AI provider. Your image was not analyzed. Reconnect and send it again.";
        setMessages((m) => m.map((x) => x.id === aiId ? { ...x, content: answer } : x));
        if (voiceOnRef.current) speak(answer);
      } else {
        await fallback(promptWithFiles, aiId);
      }
      setLoading(false);
      return;
    }

    try {
      const agent = routeToAgent(userText);
      const userContent = images.length
        ? [
            { type: "text", text: promptWithFiles },
            ...images.map((a) => ({
              type: "image_url",
              image_url: { url: a.dataUrl! },
            })),
          ]
        : promptWithFiles;

      let full = "";
      await streamChat(
        "exile-chat",
        {
          messages: [
            ...(memoryContext() ? [{ role: "system", content: memoryContext() }] : []),
            {
              role: "system",
              content: getExilePersonalityPrompt(isVenomModeEnabled()),
            },
            { role: "system", content: `Active agent: ${agent.name}. ${agent.systemPrompt}` },
            ...(/\b(?:create|build|make|generate|design|develop)\b.{0,80}\b(?:website|webpage|web page|landing page|html page)\b/i.test(userText)
              ? [{ role: "system", content: "For this webpage request, return one complete, standalone HTML document in a single ```html code block. Include a doctype and complete html, head, and body elements, with inline CSS and JavaScript as needed. Do not split the webpage across multiple code blocks." }]
              : []),
            ...history.map((m) => ({
              role: m.sender === "user" ? "user" : "assistant",
              content: m.content,
            })),
            { role: "user", content: userContent },
          ],
        },
        (delta) => {
          full += delta;
          setMessages((m) => m.map((x) => x.id === aiId ? { ...x, content: full } : x));
        },
      );
      if (!full.trim()) {
        setMessages((m) => m.map((x) => x.id === aiId
          ? { ...x, content: "The AI provider ended the response without returning text." }
          : x));
      }
      if (full.trim() && /\b(word document|docx|as a word|into word|word file|word format)\b/i.test(userText)) {
        try {
          await downloadWordDocument(full, "INDI-AI-Answers");
          toast.success("Word document generated");
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Word export failed.";
          toast.error(`The answer is ready, but Word export failed: ${reason}`);
        }
      }
      if (voiceOnRef.current && full) speak(full);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed.";
      toast.error(message);

      if (images.length) {
        const answer =
          "I couldn't analyze the attached image because the online AI request failed. The image was not analyzed. Check your AI provider and model's vision support, then try again.";
        setMessages((m) =>
          m.map((x) => (x.id === aiId ? { ...x, content: answer } : x))
        );
        if (voiceOnRef.current) speak(answer);
      } else {
        await fallback(promptWithFiles, aiId);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onGenerateImage = (event: Event) => {
      const prompt = (
        event as CustomEvent<{ prompt?: string }>
      ).detail?.prompt?.trim();

      if (!prompt || loading) return;

      addMessage(prompt, "user");
      void handleSend(prompt, messages, []);
    };

    window.addEventListener("exile:generate-image", onGenerateImage);
    return () => window.removeEventListener("exile:generate-image", onGenerateImage);
  }, [messages, loading, online, voiceOn]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;

    const allowedTextExtensions = /\.(txt|md|markdown|csv|json|log|xml|yaml|yml|js|jsx|ts|tsx|py|html|css|sql)$/i;
    const accepted: ChatAttachment[] = [];
    let totalBytes = attachments.reduce((sum, a) => sum + a.file.size, 0);

    for (const file of Array.from(fileList)) {
      if (attachments.length + accepted.length >= MAX_FILES) {
        toast.error(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} exceeds the 10 MB per-file limit.`);
        continue;
      }
      if (totalBytes + file.size > MAX_TOTAL_BYTES) {
        toast.error("Attachments cannot exceed 15 MB in total.");
        continue;
      }

      const name = file.name.toLowerCase();
      const isImage = /^image\/(png|jpeg|webp)$/i.test(file.type) ||
        /\.(png|jpe?g|webp)$/i.test(name);
      const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
      const isText = allowedTextExtensions.test(name) ||
        file.type.startsWith("text/") ||
        file.type === "application/json";

      if (!isImage && !isPdf && !isText) {
        toast.error(`${file.name}: unsupported file type.`);
        continue;
      }

      try {
        const attachment: ChatAttachment = {
          id: crypto.randomUUID(),
          file,
          kind: isImage ? "image" : isPdf ? "pdf" : "text",
        };

        if (isImage) {
          if (!/^image\/(png|jpeg|webp)$/i.test(file.type) &&
              !/\.(png|jpe?g|webp)$/i.test(name)) {
            toast.error(`${file.name}: unsupported image format.`);
            continue;
          }
          attachment.dataUrl = await fileToDataUrl(file);
        } else if (isPdf) {
          const pdf = await pdfjsLib.getDocument({
            data: new Uint8Array(await file.arrayBuffer()),
          }).promise;
          const pageTexts: string[] = [];
          const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);
          for (let pageNo = 1; pageNo <= pageLimit; pageNo++) {
            const page = await pdf.getPage(pageNo);
            const content = await page.getTextContent();
            const text = content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" ");
            pageTexts.push(text);
            if (pageTexts.join("\n").length >= MAX_TEXT_CHARS) break;
          }
          attachment.extractedText = pageTexts.join("\n").slice(0, MAX_TEXT_CHARS);
          if (pdf.numPages > MAX_PDF_PAGES) {
            toast.info(`${file.name}: extracted the first ${MAX_PDF_PAGES} pages only.`);
          }
          if (!attachment.extractedText.trim()) {
            toast.info(`${file.name}: no selectable text found; scanned PDFs may need OCR.`);
          }
        } else {
          attachment.extractedText = (await file.text()).slice(0, MAX_TEXT_CHARS);
        }

        accepted.push(attachment);
        totalBytes += file.size;
      } catch (error) {
        console.error("Attachment processing failed:", error);
        toast.error(`Could not read ${file.name}.`);
      }
    }

    if (accepted.length) {
      setAttachments((current) => [...current, ...accepted].slice(0, MAX_FILES));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const send = () => {
    const text = input.trim();
    const selected = attachments;
    if ((!text && selected.length === 0) || loading) return;

    const prompt = text || "Please analyze the attached file(s) and explain their contents.";
    const agent = routeToAgent(prompt);
    logReasoning(agent.name, "handling request", prompt.slice(0, 60), 0.85);

    const visibleText = [
      text,
      selected.length ? `Attachments: ${selected.map((a) => a.file.name).join(", ")}` : "",
    ].filter(Boolean).join("\n");

    setInput("");
    setAttachments([]);
    addMessage(
      visibleText,
      "user",
      selected.map((attachment) => ({
        name: attachment.file.name,
        kind: attachment.kind,
        ...(attachment.kind === "image" && attachment.dataUrl
          ? { dataUrl: attachment.dataUrl }
          : {}),
      })),
    );
    handleSend(prompt, messages, selected);
  };

  const startMic = () => {
    const SR =
      (window as SpeechRecognitionWindow).SpeechRecognition || (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input not supported in this browser.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => setInput(e.results[0][0].transcript);
    rec.onerror = () => toast.error("Microphone error");
    rec.start();
  };

  const modeLabel = online ? "CLOUD" : "LOCAL";

  return (
    <div className="h-[78vh] min-h-[32rem] flex flex-col bg-slate-950 text-cyan-100">
      <div className="p-4 border-b border-cyan-500/30 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2 tracking-widest">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          INDI AI
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`flex items-center gap-1 ${online ? "text-cyan-300" : "text-amber-400"}`}>
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {modeLabel}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-cyan-300 hover:bg-cyan-500/10"
            aria-label={voiceOn ? "Turn speech off" : "Turn speech on"}
            title={voiceOn ? "Turn speech off" : "Turn speech on"}
            onClick={() => setVoiceOn((v) => !v)}
          >
            {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.sender === "ai" && (
                <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-cyan-300" />
                </div>
              )}
              <div
                className={`max-w-[88%] px-4 py-3 rounded-md text-base leading-7 whitespace-pre-wrap break-words border ${
                  m.sender === "user"
                    ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-50"
                    : "bg-slate-900/80 border-cyan-500/20 text-cyan-100"
                }`}
              >
                {m.content
                  ? m.sender === "ai"
                    ? <AssistantContent content={m.content} originalRequest={m.originalRequest} />
                    : <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  : (!m.imageGenerating && !m.imageSrc
                    ? <span className="opacity-60">…</span>
                    : null)}

                {m.documentRequested && m.content.trim() && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void downloadWordDocument(m.content, "INDI-AI-Answers")
                      .then(() => toast.success("Word document downloaded"))
                      .catch((error) => toast.error(error instanceof Error ? error.message : "Word export failed"))}
                    className="mt-3 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Download Word document
                  </Button>
                )}

                {m.attachmentPreviews?.map((attachment, index) => (
                  <div key={`${m.id}-attachment-${index}`} className="mt-3 space-y-2">
                    <div className="text-xs text-cyan-300">
                      Attached: {attachment.name}
                    </div>
                    {attachment.kind === "image" && attachment.dataUrl && (
                      <img
                        src={attachment.dataUrl}
                        alt={`Attached image: ${attachment.name}`}
                        className="block max-h-[24rem] max-w-full rounded-md border border-cyan-500/20 object-contain"
                      />
                    )}
                  </div>
                ))}

                {m.imageGenerating && (
                  <div
                    className="mt-3 w-full min-w-[220px] max-w-xl aspect-square rounded-lg bg-[#F4D84A] text-[#25220F] flex flex-col items-center justify-center gap-4 p-6"
                    role="status"
                    aria-label="Generating image"
                  >
                    <div className="w-12 h-12 rounded-full border-4 border-[#25220F]/25 border-t-[#25220F] animate-spin" />
                    <ImageIcon className="w-8 h-8" />
                    <span className="font-semibold tracking-widest text-sm">
                      INDI AI CANVAS
                    </span>
                    <span className="text-sm text-center">
                      Creating your image locally…
                    </span>
                  </div>
                )}

                {m.imageSrc && (
                  <div className="mt-3 space-y-2">
                    <img
                      src={m.imageSrc}
                      alt="Image generated by INDI AI"
                      className="block h-auto max-h-[70vh] w-full max-w-xl rounded-lg object-contain"
                    />
                    {m.imageFinal && (
                      <a
                        href={m.imageSrc}
                        download={`indi-ai-image-${m.id.slice(0, 8)}.png`}
                        className="inline-flex items-center rounded-md border border-cyan-500/30 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10"
                      >
                        Download image
                      </a>
                    )}
                  </div>
                )}
              </div>
              {m.sender === "user" && (
                <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-cyan-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {attachments.length > 0 && (
        <div className="px-3 py-2 border-t border-cyan-500/20 bg-slate-900/70 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-md border border-cyan-500/30 bg-slate-950 px-2 py-1 text-xs text-cyan-100 max-w-full"
              title={attachment.file.name}
            >
              {attachment.kind === "image"
                ? <ImageIcon className="w-4 h-4 flex-shrink-0" />
                : <FileText className="w-4 h-4 flex-shrink-0" />}
              <span className="max-w-40 truncate">{attachment.file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${attachment.file.name}`}
                title={`Remove ${attachment.file.name}`}
                onClick={() => setAttachments((current) => current.filter((a) => a.id !== attachment.id))}
                className="text-cyan-300 hover:text-red-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 border-t border-cyan-500/30 bg-slate-900/80 flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.markdown,.csv,.json,.log,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.html,.css,.sql"
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <Button
          size="icon"
          variant="ghost"
          title="Attach images, PDFs, or text files"
          aria-label="Attach files"
          disabled={loading || attachments.length >= MAX_FILES}
          onClick={() => fileInputRef.current?.click()}
          className="text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/30"
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={startMic}
          className="text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/30"
        >
          <Mic className="w-4 h-4" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={
            online
              ? "Speak freely, Sir…"
              : "Offline mode — local commands only"
          }
          className="flex-1 bg-slate-950 border-cyan-500/30 text-cyan-100 placeholder:text-cyan-500/50 focus-visible:ring-cyan-500/40"
        />
        <Button
          onClick={send}
          disabled={loading || (!input.trim() && attachments.length === 0)}
          className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 border border-cyan-400/40"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default ChatSection;
