import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  MessageCircle, Camera, Search, Mic, Files, Share2, Wifi, WifiOff, Activity,
  MessageSquare, Phone, ShieldCheck, Home, Car, LayoutDashboard, Wand2, Film,
  FileText, BookOpen, Settings, Send, X, AudioLines, Grid3x3, KeyRound,
  History, FilePlus2, Radio, Contact2, Menu, Volume2, VolumeX,
  Paperclip, FileText as AttachmentFileIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import CodeCanvas from '@/components/CodeCanvas';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import CameraSection from '@/components/CameraSection';
import FilesSection from '@/components/FilesSection';
import ShareSection from '@/components/ShareSection';
import VoiceSection from '@/components/VoiceSection';
import ImageAnalysisSection from '@/components/ImageAnalysisSection';
import WhatsAppSection from '@/components/WhatsAppSection';
import CallsSection from '@/components/CallsSection';
import DashboardSection from '@/components/DashboardSection';
import SystemAccessSection from '@/components/SystemAccessSection';
import HouseSection from '@/components/HouseSection';
import CarControlSection from '@/components/CarControlSection';
import MissionControl from '@/components/MissionControl';
import VideoStoryboardSection from '@/components/VideoStoryboardSection';
import DocumentSection from '@/components/DocumentSection';
import ResearchSection from '@/components/ResearchSection';
import VoiceStudio from '@/components/VoiceStudio';
import AppsSection from '@/components/AppsSection';
import ApiKeysSection from '@/components/ApiKeysSection';
import ArcReactor, { ReactorDock } from '@/components/ArcReactor';
import LockScreen from '@/components/LockScreen';
import { streamChat, streamImage, fileToDataUrl } from '@/lib/ai';
import { offlineRespond } from '@/lib/offlineExile';
import { speakWithProfile } from '@/lib/voiceProfiles';
import { getExilePersonalityPrompt } from '@/lib/personality';
import { isVenomModeEnabled } from '@/lib/venomMode';
import { micLevelMeter, speechLevelMeter, LevelMeter } from '@/lib/audioLevel';
import { routeToAgent } from '@/lib/agents';
import { memoryContext } from '@/lib/memory';
import { logReasoning } from '@/lib/reasoningLog';
import ChatSection from '@/components/ChatSection';
import TranscriptSection from '@/components/TranscriptSection';
import ImageGenSection from '@/components/ImageGenSection';
import VoiceCommandsSection from '@/components/VoiceCommandsSection';
import ContactsSection from '@/components/ContactsSection';
import {
  TranscriptTurn, listTurns, addTurn, updateTurn, addVoiceClip, startNewSession,
} from '@/lib/conversation';
import HealthSection from '@/components/HealthSection';
import AuditSection from '@/components/AuditSection';
import { runTool, type ToolContext } from '@/lib/tools';
import { AiError, type ToolCall, type ModelTier } from '@/lib/ai';
import { rememberGeneratedImage } from '@/lib/generatedImage';
import ActivityCenter from '@/components/ActivityCenter';

const menuItems = [
  { id: 'api', icon: KeyRound, label: 'API' },
  { id: 'transcript', icon: History, label: 'Chat History' },
  { id: 'imagegen', icon: Wand2, label: 'Golden Canvas' },
  { id: 'contacts', icon: Contact2, label: 'Contacts' },
  { id: 'voicecmd', icon: Radio, label: 'Voice Cmds' },
  { id: 'health', icon: Activity, label: 'Health' },
  { id: 'audit', icon: ShieldCheck, label: 'Audit' },

  { id: 'mission', icon: LayoutDashboard, label: 'Mission' },
  { id: 'research', icon: BookOpen, label: 'Research' },

  { id: 'cinema', icon: Film, label: 'Cinema' },
  { id: 'docs', icon: FileText, label: 'Docs' },
  { id: 'analysis', icon: Search, label: 'Vision' },
  { id: 'voicestudio', icon: AudioLines, label: 'Voice Lab' },
  { id: 'apps', icon: Grid3x3, label: 'Apps' },
  { id: 'voice', icon: Mic, label: 'Voice' },
  { id: 'dashboard', icon: Activity, label: 'Systems' },
  { id: 'system', icon: ShieldCheck, label: 'Access' },
  { id: 'house', icon: Home, label: 'House' },
  { id: 'car', icon: Car, label: 'Vehicle' },
  { id: 'whatsapp', icon: MessageSquare, label: 'WhatsApp' },
  { id: 'calls', icon: Phone, label: 'Calls' },
  { id: 'camera', icon: Camera, label: 'Optics' },
  { id: 'files', icon: Files, label: 'Vault' },
  { id: 'share', icon: Share2, label: 'Share' },
];

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type ConsoleAttachment = {
  id: string;
  file: File;
  kind: 'image' | 'pdf' | 'text';
  dataUrl?: string;
  extractedText?: string;
};

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 50;
const MAX_ATTACHMENT_TEXT = 40000;
const MAX_COMBINED_PROMPT = 90000;
const TEXT_FILE_EXTENSIONS = /\.(txt|md|markdown|csv|json|log|xml|yaml|yml|toml|js|jsx|ts|tsx|py|html|css|sql|java|c|h|cpp|hpp|rs|go|sh)$/i;

/** Panels that display large media → reactor docks bottom-right. */
const MEDIA_PANELS = new Set(['cinema', 'camera', 'analysis', 'docs', 'files']);

const navGroups = [
  { id: 'Home', label: 'Home', icon: Home, items: [] },
  { id: 'Messages', label: 'Messages', icon: MessageSquare, items: ['whatsapp', 'calls', 'contacts'] },
  { id: 'AI Studio', label: 'AI Studio', icon: Wand2, items: ['analysis', 'research', 'cinema', 'imagegen', 'voicestudio', 'voice'] },
  { id: 'My Tools', label: 'My Tools', icon: Files, items: ['transcript', 'docs', 'files', 'camera', 'share', 'apps'] },
  { id: 'System', label: 'System', icon: Activity, items: ['mission', 'dashboard', 'system', 'house', 'car', 'health', 'audit', 'voicecmd'] },
  { id: 'Settings', label: 'Settings', icon: Settings, items: ['api'] },
];


function renderExileMessage(text: string): ReactNode[] {
  const pattern = /```([a-zA-Z0-9_+#.-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;

    if (start > cursor) {
      nodes.push(
          <span key={`text-${index++}`} className="whitespace-pre-wrap">
            {text.slice(cursor, start)}
          </span>
        );
      }

    const code = match[2].replace(/\r?\n$/, "");
    if (code.trim()) {
      nodes.push(
        <div key={`code-${index++}`} className="my-3 text-left">
          <CodeCanvas code={code} language={match[1] || undefined} />
        </div>,
      );
    }

    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(
      <span key={`text-${index++}`} className="whitespace-pre-wrap">
        {text.slice(cursor)}
      </span>,
    );
  }

  return nodes;
}

const Index = () => {
  const [locked, setLocked] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuCategory, setMenuCategory] = useState('Messages');
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [time, setTime] = useState(new Date());
  const [input, setInput] = useState('');
  const [reply, setReply] = useState('');
  const [attachments, setAttachments] = useState<ConsoleAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('exile.console.muted') === 'true';
    } catch {
      return false;
    }
  });
  const [generatedImage, setGeneratedImage] = useState<{ dataUrl: string; prompt: string } | null>(null);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageFullscreen, setImageFullscreen] = useState(false);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [state, setState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [tier, setTier] = useState<ModelTier>(
    () => ((typeof localStorage !== 'undefined' && localStorage.getItem('exile.tier')) as ModelTier) || 'fast',
  );
  const [pending, setPending] = useState<{ summary: string; resolve: (ok: boolean) => void } | null>(null);
  const [level, setLevel] = useState(0);
  const recRef = useRef<any>(null);
  const meterRef = useRef<LevelMeter | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const clipRef = useRef<BlobPart[]>([]);
  const lastAudio = useRef<string | undefined>(undefined);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    const sync = () => setTurns(listTurns());
    sync();
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    window.addEventListener('exile:transcript', sync);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.removeEventListener('exile:transcript', sync);
      meterRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, reply]);

  useEffect(() => {
    if (!imageFullscreen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImageFullscreen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [imageFullscreen]);


  const generateConsoleImage = async (prompt: string): Promise<boolean> => {
    setImageGenerating(true);
    setImageError('');

    try {
      await streamImage(prompt, (dataUrl, isFinal) => {
        if (!isFinal) return;

        const image = new Image();
        image.onload = () => {
          setGeneratedImage({ dataUrl, prompt });
          rememberGeneratedImage(dataUrl, prompt);
          setImageError('');
        };
        image.onerror = () => {
          setImageError('The generated image could not be decoded. Your previous image has been preserved.');
        };
        image.src = dataUrl;
      });
      return true;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unknown image-generation error.';
      setImageError(message);
      return false;
    } finally {
      setImageGenerating(false);
    }
  };

  const stopMeter = () => {
    meterRef.current?.stop();
    meterRef.current = null;
    setLevel(0);
  };

  // Reactor docking: media panels → bottom-right, conversation → top-left, else center.
  const dock: ReactorDock = panel && MEDIA_PANELS.has(panel)
    ? 'bottom-right'
    : panel || turns.length > 0
      ? 'top-left'
      : 'center';
  const reactorSize = dock === 'center' ? 320 : dock === 'bottom-right' ? 132 : 108;

  const dockStyle: Record<ReactorDock, React.CSSProperties> = {
    center: { top: '50%', left: '50%', transform: 'translate(-50%, -58%)' },
    'top-left': { top: 16, left: 16, transform: 'none' },
    'bottom-right': { top: 'calc(100% - 172px)', left: 'calc(100% - 172px)', transform: 'none' },
  };

  const renderPanel = (id: string) => {
    switch (id) {
      case 'api': return <ApiKeysSection />;
      case 'transcript': return <TranscriptSection />;
      case 'imagegen': return <ImageGenSection />;
      case 'contacts': return <ContactsSection />;

      case 'voicecmd': return <VoiceCommandsSection />;
      case 'health': return <HealthSection />;
      case 'audit': return <AuditSection />;
      case 'mission': return <MissionControl onOpenSection={setPanel} />;
      case 'research': return <ResearchSection />;
      case 'cinema': return <VideoStoryboardSection />;
      case 'docs': return <DocumentSection />;
      case 'dashboard': return <DashboardSection />;
      case 'system': return <SystemAccessSection />;
      case 'house': return <HouseSection />;
      case 'car': return <CarControlSection />;
      case 'whatsapp': return <WhatsAppSection />;
      case 'calls': return <CallsSection />;
      case 'camera': return <CameraSection />;
      case 'analysis': return <ImageAnalysisSection />;
      case 'voice': return <VoiceSection />;
      case 'voicestudio': return <VoiceStudio />;
      case 'apps': return <AppsSection />;
      case 'files': return <FilesSection />;
      case 'share': return <ShareSection />;
      default: return null;
    }
  };

  const say = (text: string) => {
    if (muted) {
      stopMeter();
      setState('idle');
      return;
    }

    stopMeter();
    setState('speaking');
    meterRef.current = speechLevelMeter(setLevel);
    speakWithProfile(text, () => {
      stopMeter();
      setState('idle');
    });
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);

    try {
      localStorage.setItem('exile.console.muted', String(next));} catch {
      // The mute button still works for this session if storage is unavailable.
    }

    if (next) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      stopMeter();
      setState((current) => current === 'speaking' ? 'idle' : current);
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setAttachmentError('');
    const accepted: ConsoleAttachment[] = [];
    let totalBytes = attachments.reduce((sum, item) => sum + item.file.size, 0);

    for (const file of Array.from(fileList)) {
      if (attachments.length + accepted.length >= MAX_ATTACHMENTS) {
        setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
        break;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(`${file.name} exceeds the 10 MB per-file limit.`);
        continue;
      }
      if (totalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        setAttachmentError('Attachments cannot exceed 15 MB in total.');
        continue;
      }

      const name = file.name.toLowerCase();
      const isImage = /^image\/(png|jpeg|webp)$/i.test(file.type) || /\.(png|jpe?g|webp)$/i.test(name);
      const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
      const isText = TEXT_FILE_EXTENSIONS.test(name) || file.type.startsWith('text/') || file.type === 'application/json';
      if (!isImage && !isPdf && !isText) {
        setAttachmentError(`${file.name}: unsupported file type.`);
        continue;
      }

      try {
        const item: ConsoleAttachment = {
          id: crypto.randomUUID(), file,
          kind: isImage ? 'image' : isPdf ? 'pdf' : 'text',
        };
        if (isImage) {
          if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
            setAttachmentError(`${file.name}: choose a valid PNG, JPEG, or WebP image.`);
            continue;
          }
          item.dataUrl = await fileToDataUrl(file);
        } else if (isPdf) {
          const pdf = await pdfjsLib.getDocument({
            data: new Uint8Array(await file.arrayBuffer()),
          }).promise;
          const pages: string[] = [];
          let chars = 0;
          const limit = Math.min(pdf.numPages, MAX_PDF_PAGES);
          for (let pageNo = 1; pageNo <= limit && chars < MAX_ATTACHMENT_TEXT; pageNo++) {
            const page = await pdf.getPage(pageNo);
            const content = await page.getTextContent();
            const pageText = content.items.map((part) => ('str' in part ? part.str : '')).join(' ');
            pages.push(pageText);
            chars += pageText.length;
          }
          item.extractedText = pages.join('\n').slice(0, MAX_ATTACHMENT_TEXT);
          if (pdf.numPages > MAX_PDF_PAGES) {
            setAttachmentError(`${file.name}: only the first ${MAX_PDF_PAGES} pages will be read.`);
          }
          if (!item.extractedText.trim()) {
            setAttachmentError(`${file.name}: no selectable text found; scanned PDFs need OCR.`);
          }
        } else {
          item.extractedText = (await file.text()).slice(0, MAX_ATTACHMENT_TEXT);
        }
        accepted.push(item);
        totalBytes += file.size;
      } catch (error) {
        console.error('Attachment processing failed:', error);
        setAttachmentError(`Could not read ${file.name}.`);
      }
    }
    if (accepted.length) setAttachments((current) => [...current, ...accepted].slice(0, MAX_ATTACHMENTS));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const ask = async (text: string, audio?: string, attached: ConsoleAttachment[] = []) => {
    if (!text.trim() && !attached.length) return;
    const directive = text.trim() || 'Please inspect and summarize the attached file(s).';
    const attachmentLabels = attached.length
      ? `\n\n[Attached files: ${attached.map((item) => item.file.name).join(', ')}]`
      : '';
    const userTurnText = `${directive}${attachmentLabels}`;
    const extracted = attached
      .filter((item) => item.extractedText)
      .map((item) => `\n\n[Attached file: ${item.file.name}]\n${item.extractedText}`)
      .join('');
    const promptWithFiles = `${directive}${extracted}`.slice(0, MAX_COMBINED_PROMPT);
    const imageAttachments = attached.filter((item) => item.kind === 'image' && item.dataUrl);
    setInput('');
    setAttachments([]);
    setAttachmentError('');
    setReply('');
    stopMeter();
    setState('thinking');

    const userTurn = addTurn('user', userTurnText);
    if (audio !== undefined) {
      addVoiceClip({ id: crypto.randomUUID(), audio, transcript: directive, at: Date.now() });
    }
    const exileTurn = addTurn('exile', '…');

    // Generate images directly in the Console without requiring cloud chat.
    if (!attached.length && (/\b(generate|create|make|draw|paint|design)\b.{0,100}\b(image|picture|artwork|illustration|logo|wallpaper|portrait|icon)\b/i.test(directive)
      || /\b(image|picture|artwork|illustration|logo|wallpaper)\b.{0,60}\b(of|showing|featuring)\b/i.test(directive)
      || /\b(draw|paint)\b/i.test(directive))) {
      const succeeded = await generateConsoleImage(directive);
      const result = succeeded
        ? 'Image generated successfully in the Console.'
        : 'Image generation failed. See the image error displayed in the Console.';
      updateTurn(exileTurn.id, result);
      setReply(result);
      setState('idle');
      if (succeeded) say(result);
      return;
    }

    const agent = routeToAgent(directive);
    logReasoning(agent.name, 'Received directive', directive);

    const finish = (t: string) => {
      updateTurn(exileTurn.id, t);
      setReply(t);
      say(t);
    };

    if (!online) {
      if (imageAttachments.length) {
        return finish('Image analysis requires an online AI provider with vision support. The attached image was not analyzed.');
      }
      return finish(offlineRespond(promptWithFiles).text);
    }

    const convo: Record<string, unknown>[] = [
      ...(memoryContext() ? [{ role: 'system', content: memoryContext() }] : []),
      { role: 'system', content: getExilePersonalityPrompt(isVenomModeEnabled()) },
      { role: 'system', content: `Active agent: ${agent.name}. ${agent.systemPrompt}` },
      ...listTurns()
        .slice(-20)
        .filter((t) => t.text && t.text !== '…' && t.id !== exileTurn.id)
        .map((t) => {
          if (t.id !== userTurn.id) return { role: t.role === 'user' ? 'user' : 'assistant', content: t.text };
          const contentText = promptWithFiles;
          const content = imageAttachments.length
            ? [
                { type: 'text', text: contentText },
                ...imageAttachments.map((item) => ({ type: 'image_url', image_url: { url: item.dataUrl! } })),
              ]
            : contentText;
          return { role: 'user', content };
        }),
    ];

    const toolCtx: ToolContext = {
      openSection: (id) => setPanel(id),
      approve: (summary) => new Promise<boolean>((resolve) => setPending({ summary, resolve })),
      generateImage: (prompt) => {
        void generateConsoleImage(prompt);
      },
    };

    try {
      let full = '';
      for (let hop = 0; hop < 4; hop++) {
        let calls: ToolCall[] = [];
        let chunk = '';
        await streamChat(
          'exile-chat',
          { messages: convo, tier },
          (d) => {
            chunk += d;
            setReply(full + chunk);
            updateTurn(exileTurn.id, full + chunk);
          },
          { onToolCalls: (c) => { calls = c; } },
        );
        full += chunk;
        if (!calls.length) break;

        convo.push({
          role: 'assistant',
          content: chunk || null,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
          })),
        });

        for (const call of calls) {
          logReasoning(agent.name, `Tool ${call.name}`, JSON.stringify(call.args ?? {}).slice(0, 120));
          const result = await runTool(call, toolCtx);
          convo.push({ role: 'tool', tool_call_id: result.id, content: result.output });
        }
      }

      logReasoning(agent.name, 'Response delivered', full.slice(0, 120));
      if (full.trim()) finish(full);
      else {
        updateTurn(exileTurn.id, '(no response)');
        setState('idle');
      }
    } catch (err) {
      const reason = err instanceof AiError || err instanceof Error ? err.message : 'unknown fault';
      logReasoning(agent.name, 'Cloud link failed — local reasoning engaged', reason);
      if (imageAttachments.length) {
        finish(`I couldn't analyze the attached image. Check that your online provider and selected model support vision. (${reason})`);
      } else {
        finish(`${offlineRespond(promptWithFiles).text}\n\n— cloud link unavailable (${reason}); answered locally.`);
      }
    }
  };

  const listen = async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-GB';
    rec.interimResults = false;

    // record the spoken command so it can be replayed / deleted later
    lastAudio.current = undefined;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      clipRef.current = [];
      mr.ondataavailable = (e) => clipRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(clipRef.current, { type: mr.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => { lastAudio.current = reader.result as string; };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRef.current = mr;
    } catch {
      /* recording is optional */
    }

    const stopClip = () => {
      if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
      mediaRef.current = null;
    };

    rec.onresult = (e: any) => {
      stopMeter();
      const transcript = e.results[0][0].transcript;
      stopClip();
      // give the FileReader a moment to finish encoding the clip
      setTimeout(() => ask(transcript, lastAudio.current), 300);
    };
    rec.onend = () => {
      if (meterRef.current) stopMeter();
      stopClip();
        setState((s) => (s === 'listening' ? 'idle' : s));

  };
    recRef.current = rec;
    setState('listening');
    try {
      meterRef.current = await micLevelMeter(setLevel);
    } catch {
      /* level spikes are optional */
    }
    rec.start();
  };


  const startNewChat = () => {
    startNewSession();
    setInput("");
    setReply("");
    setTurns([]);
    setGeneratedImage(null);
    setImageError("");
    setImageFullscreen(false);
    setPanel(null);
    setSettingsOpen(false);
    setState("idle");
  };

  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;

  // WhatsApp is a full-window workspace, not a small modal overlay.
  if (panel === 'whatsapp') {
    return (
      <div className="exile-panel-enter fixed inset-0 z-[55] flex flex-col bg-slate-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-cyan-100">
        <header className="h-12 shrink-0 flex items-center justify-between border-b border-cyan-500/20 bg-slate-950 px-4">
          <button
            onClick={() => setPanel(null)}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10"
            aria-label="Return to INDI AI"
          >
            <X className="h-4 w-4" />
            Back to INDI AI
          </button>
          <span className="text-xs tracking-[0.2em] text-cyan-400/70">MESSAGES</span>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          {renderPanel('whatsapp')}
        </main>
      </div>
    );
  }

  return (
    <div className="relative isolate flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-cyan-100">
      <img src={`${import.meta.env.BASE_URL}exile-chat-background.jpg`} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-60" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-slate-950/25" />
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 45%, rgba(56,189,248,0.14), transparent 55%), linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)',
          backgroundSize: 'auto, 44px 44px, 44px 44px',
        }}
      />

      {/* top bar */}
      <header className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 pt-2 sm:px-4 sm:pt-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-lg font-black text-cyan-200 shadow-[0_0_22px_rgba(34,211,238,0.18)]">I</div>
          <div>
            <div className="mb-1 text-xs font-semibold tracking-[0.32em] text-slate-100">INDI <span className="text-cyan-300">AI</span></div>
            <div className="text-[10px] tracking-[0.4em] text-cyan-400/70 space-y-1">
              <div className="flex items-center gap-1.5">
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3 text-amber-400" />}
            <span>{online ? 'DATA LINK ACTIVE' : 'LOCAL MODE'}</span>
          </div>
              <div className="font-mono text-cyan-400/50">{time.toLocaleTimeString()}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <ActivityCenter />
          <button
            type="button"
            onClick={startNewChat}
            aria-label="Start a new chat"
            title="Start a new chat"
            className="h-11 px-3 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition flex items-center justify-center gap-2 text-[9px] tracking-[0.15em]"
          >
            <FilePlus2 className="w-4 h-4" />
            <span className="hidden sm:inline">NEW CHAT</span>
          </button>
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute INDI AI voice' : 'Mute INDI AI voice'}
            aria-pressed={muted}
            title={muted ? 'Unmute INDI AI voice' : 'Mute INDI AI voice'}
            className={`h-11 px-3 rounded-full border text-[9px] tracking-[0.2em] transition flex items-center justify-center gap-2 ${
              muted
                ? 'border-amber-400/50 bg-amber-500/10 text-amber-300'
                : 'border-cyan-500/40 bg-slate-900/50 text-cyan-300 hover:bg-cyan-500/15'
            }`}
          >
            {muted
              ? <VolumeX className="w-4 h-4" />
              : <Volume2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{muted ? 'MUTED' : 'VOICE ON'}</span>
          </button>
          <button
            onClick={() => {
              const next: ModelTier = tier === 'fast' ? 'deep' : 'fast';
              setTier(next);
              try { localStorage.setItem('exile.tier', next); } catch { /* storage blocked */ }
            }}
            aria-label="Reasoning tier"
            className="h-11 px-3 rounded-full border border-cyan-500/40 bg-slate-900/50 text-[9px] tracking-[0.3em] text-cyan-300 hover:bg-cyan-500/15 transition"
          >
            {tier === 'fast' ? 'FAST' : 'DEEP'}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Open navigation menu"
            title="Menu"
            className="w-11 h-11 rounded-xl border border-cyan-500/40 bg-slate-900/70 flex items-center justify-center text-cyan-300 hover:bg-cyan-500/15 transition"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* X-UI primary navigation */}
      <aside className="fixed left-3 top-[4.5rem] bottom-3 z-20 hidden w-52 flex-col rounded-2xl border border-cyan-500/20 bg-slate-950/85 p-2 shadow-2xl backdrop-blur-xl lg:flex">
        <div className="mb-3 px-3 pt-2 text-[9px] font-semibold tracking-[0.3em] text-cyan-500/60">COMMAND NAVIGATION</div>
        <button onClick={() => setPanel(null)} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${panel === null ? 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-100' : 'text-slate-400 hover:bg-white/5 hover:text-cyan-100'}`}>
          <Home className="h-4 w-4" /><span>Home</span>
        </button>
        <button onClick={() => setPanel('transcript')} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${panel === 'transcript' ? 'bg-cyan-400/10 text-cyan-100' : 'text-slate-400 hover:bg-white/5 hover:text-cyan-100'}`}>
          <MessageCircle className="h-4 w-4" /><span>Chat History</span>
        </button>
        <div className="my-3 border-t border-cyan-500/15" />
        <div className="mb-2 px-3 text-[9px] tracking-[0.25em] text-cyan-500/60">WORKSPACES</div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {menuItems.filter((item) => !['api', 'transcript'].includes(item.id)).map((item) => {
            const ItemIcon = item.icon;
            return (
              <button key={item.id} onClick={() => setPanel(item.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-400 transition hover:bg-cyan-400/10 hover:text-cyan-100">
                <ItemIcon className="h-4 w-4 text-cyan-400/80" /><span>{item.label}</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => setSettingsOpen(true)} className="mt-3 flex items-center gap-3 rounded-xl border border-cyan-500/20 px-3 py-3 text-xs text-cyan-200 hover:bg-cyan-400/10">
          <Settings className="h-4 w-4" /> Settings
        </button>
        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-[9px] tracking-widest text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> SYSTEM READY</div>
          <div className="mt-1 text-[10px] text-slate-500">INDI AI local workspace</div>
        </div>
      </aside>

      {/* JARVIS companion and live system context */}
      <aside className="fixed right-3 top-[4.5rem] bottom-3 z-20 hidden w-60 min-h-0 flex-col gap-2 overflow-y-auto rounded-2xl border border-cyan-500/20 bg-slate-950/85 p-3 shadow-2xl backdrop-blur-xl xl:flex">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold tracking-[0.3em] text-cyan-400">JARVIS COMPANION</span>
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
        </div>
        <div className="flex flex-col items-center rounded-xl border border-cyan-500/15 bg-gradient-to-b from-cyan-500/10 to-transparent px-3 py-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/5 shadow-[0_0_35px_rgba(34,211,238,0.16)]">
            <ArcReactor size={68} state={state} amplitude={level} />
          </div>
          <div className="mt-4 text-sm font-semibold tracking-[0.2em] text-slate-100">JARVIS</div>
          <div className="mt-1 text-[9px] tracking-widest text-cyan-400/70">PERSONAL AI COMPANION</div>
        </div>
        <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Assistant</span><span className="text-emerald-300">{state.toUpperCase()}</span></div>
          <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Connection</span><span className={online ? 'text-emerald-300' : 'text-amber-300'}>{online ? 'ONLINE' : 'LOCAL'}</span></div>
          <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Reasoning</span><span className="text-cyan-200">{tier.toUpperCase()}</span></div>
          <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Voice</span><span className="text-cyan-200">{muted ? 'MUTED' : 'ENABLED'}</span></div>
        </div>
        <div className="mt-auto space-y-2">
          <div className="px-1 text-[9px] tracking-[0.25em] text-cyan-500/60">QUICK ACTIONS</div>
          <button onClick={startNewChat} className="flex w-full items-center gap-2 rounded-lg border border-cyan-500/20 px-3 py-2.5 text-left text-xs text-cyan-100 hover:bg-cyan-500/10"><FilePlus2 className="h-4 w-4" /> New conversation</button>
          <button onClick={listen} className="flex w-full items-center gap-2 rounded-lg border border-cyan-500/20 px-3 py-2.5 text-left text-xs text-cyan-100 hover:bg-cyan-500/10"><Mic className="h-4 w-4" /> Voice command</button>
          <button onClick={() => setPanel('dashboard')} className="flex w-full items-center gap-2 rounded-lg border border-cyan-500/20 px-3 py-2.5 text-left text-xs text-cyan-100 hover:bg-cyan-500/10"><Activity className="h-4 w-4" /> System monitor</button>
        </div>
      </aside>

      {/* The companion sidebar owns the home-screen reactor; avoid a large centre overlay. */}
      {dock !== "center" && (
        <button
          onClick={listen}
          aria-label="Speak to INDI AI"
          className="fixed z-30 hidden transition-all duration-700 ease-in-out lg:block"
          style={dockStyle[dock]}
        >
          <ArcReactor size={reactorSize} state={state} amplitude={level} />
        </button>
      )}

      {/* core — persistent conversation feed */}
      <main
        className="relative z-10 mx-3 my-2 flex min-h-0 min-w-0 w-auto max-w-[1800px] flex-1 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-950/35 px-2 py-2 sm:px-4 lg:ml-[14.5rem] lg:mr-3 xl:mr-[16rem]"
      >
        {turns.length === 0 && (
          <section className="relative z-10 mx-auto w-full max-w-4xl shrink-0 py-1">
            <div className="mb-2 text-center text-[9px] font-semibold tracking-[0.45em] text-cyan-300/70">INDI AI INTELLIGENCE SYSTEM</div>
            <h1 className="text-center text-xl font-semibold tracking-[0.12em] text-white sm:text-2xl">YOUR COMMAND CENTER</h1>
            <p className="mt-1 text-center text-[10px] tracking-wide text-slate-300/70">One workspace. Your tools, your data, your control.</p>
            <div className="mt-2 text-center text-[8px] tracking-[0.2em] text-cyan-300/60">SYSTEM STATUS · {online ? 'CONNECTED' : 'LOCAL MODE'} · {time.toLocaleDateString()}</div>
          </section>
        )}
        <div
          ref={feedRef}
          className="w-full max-w-4xl min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-4"
        >
          {turns.length === 0 ? (
            <p className="text-center text-[10px] tracking-[0.4em] text-cyan-400/50">
              {state === 'listening' ? 'LISTENING…' : state === 'thinking' ? 'PROCESSING…' : 'INDI AI STANDING BY'}
            </p>
          ) : (
            turns.map((t) => (
              <div key={t.id} className={`exile-message-enter min-w-0 break-words ${t.role === 'user' ? 'ml-auto max-w-[88%] text-right' : 'mr-auto max-w-[95%]'}`}>
                <div className="text-[9px] tracking-[0.3em] text-cyan-400/50 mb-1">
                  {t.role === 'user' ? 'YOU' : 'INDI AI'}
                </div>
                <div
                  className={`text-base sm:text-lg leading-7 sm:leading-8 whitespace-pre-wrap break-words ${
                    t.role === 'user' ? 'text-cyan-300/85' : 'text-cyan-100/90'
                  }`}
                >
                  {t.role === 'user' ? (
                    <span>{t.text}</span>
                  ) : (
                    renderExileMessage(t.text)
                  )}
                </div>
              </div>
            ))
          )}

          {turns.length > 0 && state !== 'idle' && (
            <p className="text-center text-[10px] tracking-[0.4em] text-cyan-400/50">
              {state === 'listening' ? 'LISTENING…' : state === 'thinking' ? 'PROCESSING…' : 'SPEAKING…'}
            </p>
          )}
        </div>

        {(imageGenerating || imageError || generatedImage) && (
          <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-[#c4a253]/45 bg-[#080907] p-3 text-[#f5edda] shadow-[0_0_24px_rgba(196,162,83,0.08)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#e0c478]">
                  GOLDEN CANVAS
                </p>
                <p className="mt-1 text-[10px] text-[#a9a18e]">
                  {imageGenerating ? 'Creating your artwork…' : imageError ? 'Generation notice' : 'Your artwork · Click to expand'}
                </p>
              </div>
              {generatedImage && (
                <a
                  href={generatedImage.dataUrl}
                  download="indi-ai-generated-image.png"
                  className="shrink-0 rounded-md border border-[#c4a253]/40 px-3 py-2 text-xs text-[#e6c875] hover:bg-[#c4a253]/10"
                >
                  Save image
                </a>
              )}
            </div>

            <div className="relative flex min-h-36 max-h-[35vh] items-center justify-center overflow-hidden rounded-lg border border-[#c4a253]/30 bg-[radial-gradient(ellipse_at_center,_#282216_0%,_#11110d_55%,_#080907_100%)] p-2">
              <div className="pointer-events-none absolute inset-2 rounded-md border border-[#c4a253]/10" />

              {generatedImage && (
                <button
                  type="button"
                  onClick={() => setImageFullscreen(true)}
                  aria-label="Open generated image full screen"
                  className="relative z-10 flex max-h-[33vh] max-w-full cursor-zoom-in items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e6c875]"
                >
                  <img
                    src={generatedImage.dataUrl}
                    alt={generatedImage.prompt}
                    className="max-h-[33vh] max-w-full rounded-md object-contain"
                  />
                </button>
              )}

              {!generatedImage && imageGenerating && (
                <div className="relative z-10 px-4 py-8 text-center">
                  <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-[#c4a253]/25 border-t-[#e6c875]" />
                  <p className="text-xs tracking-wide text-[#e6c875]">Rendering your vision</p>
                  <p className="mt-1 text-[10px] text-[#a9a18e]">Generating locally on your device</p>
                </div>
              )}

              {!generatedImage && !imageGenerating && imageError && (
                <p className="relative z-10 max-w-md px-4 py-6 text-center text-sm text-red-300" role="alert">
                  {imageError}
                </p>
              )}
            </div>

            {imageError && generatedImage && (
              <p role="alert" className="mt-2 text-xs text-amber-300">{imageError}</p>
            )}

            {generatedImage && (
              <p className="mt-2 break-words text-xs leading-5 text-[#c6a75b]">
                {generatedImage.prompt}
              </p>
            )}
          </section>
        )}
      </main>



      {/* type bar */}
      <footer className="relative z-10 mx-3 w-auto max-w-[1800px] shrink-0 px-0 pb-2 sm:px-2 lg:ml-[14.5rem] lg:mr-3 xl:mr-[16rem]">
        {turns.length === 0 && (
          <div className="mx-auto mb-3 grid w-full max-w-4xl grid-cols-2 gap-2 md:grid-cols-3">
            {[
              { id: 'transcript', title: 'Chat History', detail: 'All your conversations with INDI AI', icon: MessageCircle },
              { id: 'research', title: 'Research', detail: 'Explore and analyse information', icon: Search },
              { id: 'cinema', title: 'Creative Studio', detail: 'Build visual storyboards', icon: Film },
              { id: 'files', title: 'File Vault', detail: 'Access your stored files', icon: Files },
              { id: 'dashboard', title: 'System Monitor', detail: 'Inspect system activity', icon: Activity },
              { id: 'api', title: 'Integrations', detail: 'Manage provider connections', icon: Grid3x3 },
            ].map((action) => {
              const ActionIcon = action.icon;
              return (
                <button key={action.id} onClick={() => setPanel(action.id)} className="group min-h-0 rounded-lg border border-cyan-400/20 bg-slate-950/65 p-2.5 text-left backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-cyan-500/10 sm:p-3">
                  <ActionIcon className="mb-1.5 h-4 w-4 text-cyan-300 transition group-hover:text-white" />
                  <div className="text-xs font-semibold text-slate-100">{action.title}</div>
                  <div className="mt-0.5 text-[9px] leading-3 text-slate-400">{action.detail}</div>
                </button>
              );
            })}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="mx-auto mb-2 flex max-w-xl flex-wrap gap-2" aria-label="Attached files">
            {attachments.map((item) => (
              <div key={item.id} title={item.file.name} className="flex max-w-full items-center gap-2 rounded-lg border border-[#c4a253]/50 bg-[#080907] px-2 py-1 text-xs text-[#f5edda]">
                {item.kind === 'image' ? <Camera className="h-3.5 w-3.5 text-[#e0c478]" /> : <AttachmentFileIcon className="h-3.5 w-3.5 text-[#e0c478]" />}
                <span className="max-w-48 truncate">{item.file.name}</span>
                <button type="button" aria-label={`Remove ${item.file.name}`} title={`Remove ${item.file.name}`} onClick={() => setAttachments((current) => current.filter((entry) => entry.id !== item.id))} className="text-[#e0c478] hover:text-red-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {attachmentError && <p role="status" className="mx-auto mb-2 max-w-xl text-xs text-amber-300">{attachmentError}</p>}
        <form
          onSubmit={(e) => { e.preventDefault(); void ask(input, undefined, attachments); }}
          className="mx-auto flex w-full max-w-4xl items-center gap-1 rounded-xl border border-cyan-500/35 bg-slate-950/90 px-2 py-2 sm:gap-2 sm:px-3 shadow-[0_0_30px_rgba(34,211,238,0.15)] backdrop-blur-xl"
        >
          <input ref={fileInputRef} type="file" multiple className="hidden" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,application/json,.txt,.md,.markdown,.csv,.json,.log,.xml,.yaml,.yml,.toml,.js,.jsx,.ts,.tsx,.py,.html,.css,.sql,.java,.c,.h,.cpp,.hpp,.rs,.go,.sh" onChange={(event) => void handleFiles(event.target.files)} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attachments.length >= MAX_ATTACHMENTS} className="p-2 text-[#e0c478] hover:text-[#f5edda] disabled:opacity-40" aria-label="Attach files" title="Attach files">
            <Paperclip className="h-4 w-4" />
          </button>
          <button type="button" onClick={listen} className="p-2 text-cyan-300/80 hover:text-cyan-100" aria-label="Voice input">
            <Mic className="w-4 h-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Speak or type a directive…"
            className="min-w-0 flex-1 bg-transparent outline-none text-base sm:text-sm placeholder:text-cyan-500/40 text-cyan-50"
          />
          <Button type="submit" disabled={!input.trim() && attachments.length === 0} size="icon" variant="ghost" className="h-8 w-8 rounded-full text-cyan-300 hover:bg-cyan-500/15">
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="mt-1 text-center text-[8px] tracking-[0.2em] text-cyan-500/40">
          INDI AI // YOUR AI · YOUR PC · YOUR RULES
        </p>
      </footer>

      {/* settings */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm bg-slate-950 border-cyan-500/30 text-cyan-100 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-cyan-100 tracking-[0.3em] text-sm">INDI AI MENU</SheetTitle>
          </SheetHeader>
          <div className="mt-5 space-y-2">
            <button
              onClick={() => { setPanel(null); setSettingsOpen(false); }}
              className="flex w-full items-center gap-3 rounded-lg border border-cyan-500/20 bg-slate-900/60 px-3 py-3 text-left text-sm text-cyan-100 hover:bg-cyan-500/10"
            >
              <Home className="h-5 w-5 text-cyan-300" />
              <span className="flex-1">Home</span>
            </button>

            {navGroups.filter((group) => group.id !== 'Home').map((group) => {
              const GroupIcon = group.icon;
              const selected = menuCategory === group.id;
              const tools = menuItems.filter((item) => group.items.includes(item.id));
              return (
                <div key={group.id} className="overflow-hidden rounded-lg border border-cyan-500/20">
                  <button
                    onClick={() => setMenuCategory(selected ? '' : group.id)}
                    aria-expanded={selected}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition ${
                      selected ? 'bg-cyan-500/10 text-cyan-100' : 'bg-slate-900/60 text-cyan-200 hover:bg-cyan-500/10'
                    }`}
                  >
                    <GroupIcon className="h-5 w-5 text-cyan-300" />
                    <span className="flex-1">{group.label}</span>
                    <span className="text-xs text-cyan-500/70">{tools.length}</span>
                    <span className="text-cyan-400/70">{selected ? '−' : '+'}</span>
                  </button>
                  {selected && (
                    <div className="space-y-1 border-t border-cyan-500/15 bg-slate-950/70 p-2">
                      {tools.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() => { setPanel(item.id); setSettingsOpen(false); }}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-cyan-100/85 transition hover:bg-cyan-500/10 hover:text-cyan-50"
                          >
                            <ItemIcon className="h-4 w-4 text-cyan-400/80" />
                            <span className="flex-1">{item.label}</span>
                            <span className="text-cyan-500/50">›</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={() => { setSettingsOpen(false); setLocked(true); }}
            className="mt-6 w-full rounded-md border border-cyan-500/30 py-2 text-[10px] tracking-[0.3em] text-cyan-300/80 hover:bg-cyan-500/10"
          >
            LOCK INDI AI
          </button>
        </SheetContent>
      </Sheet>

      {imageFullscreen && generatedImage && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-[#080907]/[0.98] p-3 text-[#f5edda] sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Golden Canvas full-screen image"
          onClick={() => setImageFullscreen(false)}
        >
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 pb-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#e6c875]">
                INDI AI · GOLDEN CANVAS
              </p>
              <p className="mt-1 truncate text-xs text-[#a9a18e]">{generatedImage.prompt}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <a
                href={generatedImage.dataUrl}
                download="indi-ai-generated-image.png"
                onClick={(event) => event.stopPropagation()}
                className="rounded-md border border-[#c4a253]/40 px-3 py-2 text-xs text-[#e6c875] hover:bg-[#c4a253]/10"
              >
                Save
              </a>
              <button
                type="button"
                onClick={() => setImageFullscreen(false)}
                aria-label="Close full-screen image"
                className="rounded-md border border-[#c4a253]/40 p-2 text-[#e6c875] hover:bg-[#c4a253]/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-[#c4a253]/30 bg-[radial-gradient(ellipse_at_center,_#282216_0%,_#11110d_55%,_#080907_100%)] p-3 sm:p-6">
            <img
              src={generatedImage.dataUrl}
              alt={generatedImage.prompt}
              onClick={(event) => event.stopPropagation()}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <p className="pt-3 text-center text-[10px] tracking-widest text-[#a9a18e]">
            PRESS ESC OR CLICK OUTSIDE TO RETURN TO CHAT
          </p>
        </div>
      )}

      {/* section overlay */}
      {panel && (
        <div className="fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-sm overflow-y-auto overflow-x-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <div className="exile-panel-enter max-w-5xl mx-auto p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] tracking-[0.35em] text-cyan-400/70 uppercase">
                {menuItems.find((m) => m.id === panel)?.label}
              </span>
              <button onClick={() => setPanel(null)} aria-label="Close" className="-m-2 p-2 text-cyan-300 hover:text-cyan-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-lg border border-cyan-500/30 bg-slate-900/60 overflow-hidden">
              {renderPanel(panel)}
            </div>
          </div>
        </div>
      )}

      {/* sensitive action approval */}
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 sm:p-6">
          <div className="w-full max-w-sm rounded-lg border border-cyan-500/40 bg-slate-900/95 p-5 shadow-[0_0_40px_rgba(34,211,238,0.25)]">
            <p className="text-[10px] tracking-[0.35em] text-cyan-400/70 mb-2">AUTHORISATION REQUIRED</p>
            <p className="text-sm text-cyan-100/90 leading-6">{pending.summary}</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => { pending.resolve(false); setPending(null); }}
                className="flex-1 rounded-md border border-cyan-500/30 py-2 text-[10px] tracking-[0.3em] text-cyan-300/80 hover:bg-cyan-500/10"
              >
                REFUSE
              </button>
              <button
                onClick={() => { pending.resolve(true); setPending(null); }}
                className="flex-1 rounded-md border border-cyan-400/60 bg-cyan-500/15 py-2 text-[10px] tracking-[0.3em] text-cyan-100 hover:bg-cyan-500/25"
              >
                APPROVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );


}

export default Index;
