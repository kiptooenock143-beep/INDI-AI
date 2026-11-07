import { useEffect, useState } from "react";
import { ShieldCheck, FolderOpen, Image as ImageIcon, FileText, Mic, Camera, MapPin, Bell, Contact, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type PermStatus = "unknown" | "granted" | "denied" | "prompt" | "unsupported";

interface Grant {
  id: string;
  label: string;
  icon: any;
  status: PermStatus;
  request: () => Promise<void>;
  detail?: string;
}

interface PickedFile {
  name: string;
  size: number;
  type: string;
  url?: string;
}

const SystemAccessSection = () => {
  const [grants, setGrants] = useState<Record<string, PermStatus>>({});
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [images, setImages] = useState<PickedFile[]>([]);
  const [docs, setDocs] = useState<PickedFile[]>([]);
  const [dirName, setDirName] = useState<string>("");

  const setStatus = (id: string, s: PermStatus) =>
    setGrants((g) => ({ ...g, [id]: s }));

  useEffect(() => {
    // Best-effort initial probe of declarable permissions
    const probe = async (name: PermissionName, id: string) => {
      try {
        // @ts-ignore
        const p = await navigator.permissions.query({ name });
        setStatus(id, p.state as PermStatus);
      } catch {
        setStatus(id, "unknown");
      }
    };
    probe("geolocation" as PermissionName, "location");
    probe("notifications" as PermissionName, "notifications");
    // @ts-ignore
    probe("camera", "camera");
    // @ts-ignore
    probe("microphone", "microphone");
  }, []);

  const requestCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      setStatus("camera", "granted");
      toast.success("Camera access granted");
    } catch {
      setStatus("camera", "denied");
      toast.error("Camera permission denied");
    }
  };
  const requestMic = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setStatus("microphone", "granted");
      toast.success("Microphone access granted");
    } catch {
      setStatus("microphone", "denied");
      toast.error("Microphone permission denied");
    }
  };
  const requestLocation = async () =>
    new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => { setStatus("location", "granted"); toast.success("Location granted"); resolve(); },
        () => { setStatus("location", "denied"); toast.error("Location denied"); resolve(); },
      );
    });
  const requestNotifications = async () => {
    if (!("Notification" in window)) return setStatus("notifications", "unsupported");
    const p = await Notification.requestPermission();
    setStatus("notifications", p as PermStatus);
    if (p === "granted") new Notification("INDI AI", { body: "Notifications are live, Sir." });
  };
  const requestContacts = async () => {
    // @ts-ignore
    if (!("contacts" in navigator) || !navigator.contacts?.select) {
      setStatus("contacts", "unsupported");
      toast.error("Contacts API not supported on this device");
      return;
    }
    try {
      // @ts-ignore
      const list = await navigator.contacts.select(["name", "tel"], { multiple: true });
      setStatus("contacts", "granted");
      toast.success(`Loaded ${list.length} contacts`);
    } catch {
      setStatus("contacts", "denied");
    }
  };

  const pickFiles = async (
    accept: string,
    setter: (f: PickedFile[]) => void,
    label: string,
  ) => {
    try {
      // @ts-ignore
      if (window.showOpenFilePicker) {
        // @ts-ignore
        const handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: label, accept: { [accept]: [".*"] } }] });
        const out: PickedFile[] = [];
        for (const h of handles) {
          const f = await h.getFile();
          out.push({ name: f.name, size: f.size, type: f.type, url: URL.createObjectURL(f) });
        }
        setter(out);
        toast.success(`${out.length} ${label} loaded`);
        return;
      }
    } catch {
      toast.error("Selection cancelled");
      return;
    }
    // Fallback: classic input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => {
      const out = Array.from(input.files || []).map((f) => ({
        name: f.name, size: f.size, type: f.type, url: URL.createObjectURL(f),
      }));
      setter(out);
      toast.success(`${out.length} ${label} loaded`);
    };
    input.click();
  };

  const pickDirectory = async () => {
    // @ts-ignore
    if (!window.showDirectoryPicker) {
      toast.error("Directory picker not supported in this browser");
      return;
    }
    try {
      // @ts-ignore
      const dir = await window.showDirectoryPicker();
      setDirName(dir.name);
      const out: PickedFile[] = [];
      // @ts-ignore
      for await (const entry of dir.values()) {
        if (entry.kind === "file") {
          const f = await entry.getFile();
          out.push({ name: f.name, size: f.size, type: f.type });
          if (out.length >= 50) break;
        }
      }
      setFiles(out);
      toast.success(`Indexed ${out.length} files in ${dir.name}`);
    } catch {
      toast.error("Folder selection cancelled");
    }
  };

  const installedApps: { id: string; label: string; url: string }[] = [
    { id: "whatsapp", label: "WhatsApp", url: "whatsapp://" },
    { id: "tel", label: "Phone", url: "tel:" },
    { id: "sms", label: "Messages", url: "sms:" },
    { id: "mail", label: "Mail", url: "mailto:" },
    { id: "maps", label: "Maps", url: "geo:0,0" },
    { id: "yt", label: "YouTube", url: "vnd.youtube://" },
    { id: "spotify", label: "Spotify", url: "spotify:" },
    { id: "tg", label: "Telegram", url: "tg://" },
  ];

  const permList: Grant[] = [
    { id: "camera", label: "Camera", icon: Camera, status: grants.camera || "unknown", request: requestCamera },
    { id: "microphone", label: "Microphone", icon: Mic, status: grants.microphone || "unknown", request: requestMic },
    { id: "location", label: "Location", icon: MapPin, status: grants.location || "unknown", request: requestLocation },
    { id: "notifications", label: "Notifications", icon: Bell, status: grants.notifications || "unknown", request: requestNotifications },
    { id: "contacts", label: "Contacts", icon: Contact, status: grants.contacts || "unknown", request: requestContacts },
  ];

  const statusColor = (s: PermStatus) =>
    s === "granted" ? "text-emerald-300 border-emerald-400/40" :
    s === "denied" ? "text-rose-300 border-rose-400/40" :
    s === "unsupported" ? "text-amber-300 border-amber-400/40" :
    "text-cyan-300 border-cyan-400/40";

  return (
    <div className="h-[28rem] flex flex-col bg-slate-950 text-cyan-100">
      <div className="p-4 border-b border-cyan-500/30 flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2 tracking-widest">
          <ShieldCheck className="w-5 h-5 text-cyan-300" /> SYSTEM ACCESS
        </h2>
        <span className="text-[10px] tracking-widest text-cyan-400/70">PERMISSION-GATED</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          <section>
            <h3 className="text-xs tracking-widest text-cyan-400/80 mb-2">DEVICE PERMISSIONS</h3>
            <div className="grid grid-cols-2 gap-2">
              {permList.map((p) => (
                <button
                  key={p.id}
                  onClick={p.request}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-slate-900/60 hover:bg-cyan-500/10 ${statusColor(p.status)}`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <p.icon className="w-4 h-4" /> {p.label}
                  </span>
                  <span className="text-[10px] tracking-widest uppercase">{p.status}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs tracking-widest text-cyan-400/80 mb-2 flex items-center gap-2">
              <ImageIcon className="w-3 h-3" /> IMAGES
            </h3>
            <div className="flex gap-2 mb-2">
              <Button size="sm" onClick={() => pickFiles("image/*", setImages, "images")}
                className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 border border-cyan-400/40">
                Load Images
              </Button>
              <span className="text-xs text-cyan-400/70 self-center">{images.length} loaded</span>
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {images.slice(0, 8).map((f) => (
                  <div key={f.name} className="aspect-square rounded border border-cyan-500/30 overflow-hidden bg-slate-900">
                    {f.url && <img src={f.url} alt={f.name} className="w-full h-full object-cover" />}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs tracking-widest text-cyan-400/80 mb-2 flex items-center gap-2">
              <FileText className="w-3 h-3" /> DOCUMENTS
            </h3>
            <div className="flex gap-2 mb-2">
              <Button size="sm" onClick={() => pickFiles(".pdf,.doc,.docx,.txt,.md,.rtf,.csv,.xls,.xlsx,.ppt,.pptx", setDocs, "documents")}
                className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 border border-cyan-400/40">
                Load Documents
              </Button>
              <span className="text-xs text-cyan-400/70 self-center">{docs.length} loaded</span>
            </div>
            {docs.length > 0 && (
              <ul className="text-xs space-y-1">
                {docs.slice(0, 8).map((f) => (
                  <li key={f.name} className="flex justify-between border border-cyan-500/20 rounded px-2 py-1 bg-slate-900/60">
                    <span className="truncate">{f.name}</span>
                    <span className="text-cyan-400/70">{Math.round(f.size / 1024)} KB</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs tracking-widest text-cyan-400/80 mb-2 flex items-center gap-2">
              <FolderOpen className="w-3 h-3" /> FOLDER ACCESS
            </h3>
            <div className="flex gap-2 mb-2">
              <Button size="sm" onClick={pickDirectory}
                className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 border border-cyan-400/40">
                <HardDrive className="w-3 h-3 mr-1" /> Grant Folder
              </Button>
              <span className="text-xs text-cyan-400/70 self-center">
                {dirName ? `${dirName} · ${files.length} files` : "no folder mounted"}
              </span>
            </div>
            {files.length > 0 && (
              <ul className="text-xs space-y-1 max-h-32 overflow-auto">
                {files.map((f) => (
                  <li key={f.name} className="flex justify-between border border-cyan-500/20 rounded px-2 py-1 bg-slate-900/60">
                    <span className="truncate">{f.name}</span>
                    <span className="text-cyan-400/70">{Math.round(f.size / 1024)} KB</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs tracking-widest text-cyan-400/80 mb-2">INSTALLED APP LAUNCHERS</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {installedApps.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  className="px-2 py-3 rounded-md border border-cyan-500/20 bg-slate-900/60 text-center text-xs hover:bg-cyan-500/10"
                >
                  {a.label}
                </a>
              ))}
            </div>
          </section>


        </div>
      </ScrollArea>
    </div>
  );
};

export default SystemAccessSection;
