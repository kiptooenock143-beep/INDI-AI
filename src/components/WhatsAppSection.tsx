import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageSquare, Send, Plus, Trash2, RefreshCw, QrCode,
  Wifi, WifiOff, Loader2, Search, PhoneCall, PhoneOff, Video, Clock, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  phone: string;
  jid?: string;
  source?: "whatsapp";
}

interface WaMessage {
  id: string;
  jid: string;
  fromMe: boolean;
  name: string;
  text: string;
  timestamp: number;
}

interface WaStatus {
  status: string;
  connected: boolean;
  qrDataUrl?: string | null;
  user?: string | null;
  lastError?: string | null;
}

interface WaCall {
  id: string;
  from: string;
  chatId: string;
  status: string;
  isVideo: boolean;
  isGroup: boolean;
  timestamp: number;
  offline: boolean;
}

interface Conversation {
  jid: string;
  name: string;
  lastMessage: WaMessage;
}

interface AutomationRule {
  id: string;
  jid: string;
  name: string;
  message: string;
  enabled: boolean;
  nextAt: string;
  repeat: "once" | "daily" | "weekly";
}

interface AutomationConfig {
  autoReply: {
    enabled: boolean;
    allowedJids: string[];
    template: string;
    dailyLimit: number;
    cooldownMinutes: number;
  };
  autoStart: {
    enabled: boolean;
    dailyLimit: number;
    quietHours: { start: string; end: string };
    rules: AutomationRule[];
  };
}

const DEFAULT_AUTOMATION: AutomationConfig = {
  autoReply: {
    enabled: false,
    allowedJids: [],
    template: "Thanks for your message, {name}. I've received it and will get back to you soon.",
    dailyLimit: 20,
    cooldownMinutes: 30,
  },
  autoStart: {
    enabled: false,
    dailyLimit: 3,
    quietHours: { start: "21:00", end: "08:00" },
    rules: [],
  },
};

const KEY = "exile_wa_contacts";
const API = "http://127.0.0.1:8787";

async function api<T>(route: string, options?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API}${route}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch {
    throw new Error(
      "Cannot reach INDI AI's local API. Start the local server on port 8787."
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data as T;
}

const WhatsAppSection = () => {
  const [view, setView] = useState<"chats" | "contacts" | "automation">("chats");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [syncedContacts, setSyncedContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [activeJid, setActiveJid] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WaStatus>({
    status: "disconnected",
    connected: false,
  });
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [calls, setCalls] = useState<WaCall[]>([]);
  const [rejectingCallId, setRejectingCallId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [automation, setAutomation] = useState<AutomationConfig>(DEFAULT_AUTOMATION);
  const [autoAllowedNumbers, setAutoAllowedNumbers] = useState("");
  const [autoStartNumber, setAutoStartNumber] = useState("");
  const [autoStartName, setAutoStartName] = useState("");
  const [autoStartMessage, setAutoStartMessage] = useState("");
  const [autoStartAt, setAutoStartAt] = useState("");
  const [autoStartRepeat, setAutoStartRepeat] = useState<"once" | "daily" | "weekly">("once");
  const [automationSaving, setAutomationSaving] = useState(false);
  const [conversationAIEnabled, setConversationAIEnabled] = useState(false);
  const [conversationAISaving, setConversationAISaving] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setContacts(JSON.parse(raw));
    } catch {
      // Ignore invalid saved contact data.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void api<AutomationConfig>("/whatsapp/automation")
      .then((config) => {
        if (!active) return;
        setAutomation(config);
        setAutoAllowedNumbers(
          config.autoReply.allowedJids
            .map((jid) => jid.split("@")[0])
            .join(", ")
        );
      })
      .catch((error) => {
        if (active) {
          toast.error(
            error instanceof Error
              ? `Could not load WhatsApp automation settings: ${error.message}`
              : "Could not load WhatsApp automation settings."
          );
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void api<{ enabled: boolean }>("/whatsapp/conversation-ai")
      .then((config) => { if (active) setConversationAIEnabled(config.enabled === true); })
      .catch((error) => { if (active) console.warn("Could not load WhatsApp conversational AI settings:", error); });
    return () => { active = false; };
  }, []);

  const persist = (next: Contact[]) => {
    setContacts(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const refresh = useCallback(async (showError = false) => {
    try {
      const [nextStatus, result, callResult, contactResult] = await Promise.all([
        api<WaStatus>("/whatsapp/status"),
        api<{ messages: WaMessage[] }>("/whatsapp/messages"),
        api<{ calls: WaCall[] }>("/whatsapp/calls"),
        api<{ contacts: Contact[] }>("/whatsapp/contacts"),
      ]);

      setStatus(nextStatus);
      setMessages(result.messages || []);
      setCalls(callResult.calls || []);
      setSyncedContacts(contactResult.contacts || []);
    } catch (error) {
      if (showError) {
        toast.error(
          error instanceof Error ? error.message : "Could not reach WhatsApp service."
        );
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const allContacts = useMemo<Contact[]>(() => {
    const manualPhones = new Set(contacts.map((contact) => contact.phone));
    return [
      ...contacts,
      ...syncedContacts.filter((contact) => !manualPhones.has(contact.phone)),
    ];
  }, [contacts, syncedContacts]);

  const conversations = useMemo<Conversation[]>(() => {
    const groups = new Map<string, WaMessage[]>();

    for (const item of messages) {
      const list = groups.get(item.jid) || [];
      list.push(item);
      groups.set(item.jid, list);
    }

    return [...groups.entries()]
      .map(([jid, items]) => {
        const lastMessage = items.reduce(
          (latest, item) => item.timestamp > latest.timestamp ? item : latest,
          items[0]
        );
        const contact = allContacts.find(
          (c) => c.jid === jid || c.phone === jid.split("@")[0].replace(/\D/g, "")
        );

        return {
          jid,
          name: contact?.name || lastMessage.name || jid,
          lastMessage,
        };
      })
      .sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
  }, [messages, allContacts]);

  const selectedJid = activeJid || (
    activeContact
      ? activeContact.jid || messages.find(
          (m) => m.jid.replace(/\D/g, "") === activeContact.phone
        )?.jid || `${activeContact.phone}@s.whatsapp.net`
      : ""
  );

  // On phones the contact list and the open chat are shown one at a time.
  const chatOpen = Boolean(activeJid || activeContact);

  const selectedMessages = useMemo(
    () => messages
      .filter((item) => item.jid === selectedJid)
      .sort((a, b) => a.timestamp - b.timestamp),
    [messages, selectedJid]
  );

  const addContact = () => {
    const clean = phone.replace(/\D/g, "");

    if (!name.trim() || clean.length < 7) {
      toast.error("Enter a name and full phone number with country code.");
      return;
    }

    if (allContacts.some((c) => c.phone === clean)) {
      toast.error("That number is already in your contacts.");
      return;
    }

    const contact: Contact = {
      id: crypto.randomUUID(),
      name: name.trim(),
      phone: clean,
    };

    persist([contact, ...contacts]);
    setActiveContact(contact);
    setActiveJid("");
    setName("");
    setPhone("");
    toast.success(`Contact ${contact.name} added.`);
  };

  const removeContact = (id: string) => {
    const contact = contacts.find((c) => c.id === id);
    if (!contact) return; // Synced WhatsApp contacts are read-only.
    persist(contacts.filter((c) => c.id !== id));

    if (activeContact?.id === id) setActiveContact(null);

    if (contact && activeJid.replace(/\D/g, "") === contact.phone) {
      setActiveJid("");
    }
  };

  const connect = async () => {
    setConnecting(true);
    try {
      await api<WaStatus>("/whatsapp/connect", { method: "POST", body: "{}" });
      await refresh(true);
      toast.success("WhatsApp connection requested. Waiting for QR code...");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection failed.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setLoading(true);
    try {
      const next = await api<WaStatus>("/whatsapp/disconnect", {
        method: "POST",
        body: "{}",
      });
      setStatus(next);
      toast.success("WhatsApp disconnected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Disconnect failed.");
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = message.trim();

    if (!status.connected) {
      toast.error("Connect WhatsApp first.");
      return;
    }

    if (!selectedJid) {
      toast.error("Choose a conversation or contact first.");
      return;
    }

    if (!text) {
      toast.error("Write a message first.");
      return;
    }

    setSending(true);
    try {
      await api("/whatsapp/send", {
        method: "POST",
        body: JSON.stringify({ to: selectedJid, text }),
      });

      setMessage("");
      await refresh();
      toast.success("Message submitted to WhatsApp.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const toggleConversationAI = async () => {
    if (conversationAISaving) return;
    const next = !conversationAIEnabled;
    setConversationAISaving(true);
    try {
      const result = await api<{ enabled: boolean }>("/whatsapp/conversation-ai", {
        method: "POST",
        body: JSON.stringify({ enabled: next }),
      });
      setConversationAIEnabled(result.enabled === true);
      toast.success(result.enabled ? "WhatsApp conversational AI enabled." : "WhatsApp conversational AI disabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update WhatsApp AI.");
    } finally {
      setConversationAISaving(false);
    }
  };

  const toggleAutoReply = async (enabled: boolean) => {
    if (automationSaving) return;

    setAutomationSaving(true);
    try {
      // Read the persisted configuration so this master switch changes
      // only the enabled flag, not other unsaved form edits.
      const persisted = await api<AutomationConfig>("/whatsapp/automation");
      const next: AutomationConfig = {
        ...persisted,
        autoReply: {
          ...persisted.autoReply,
          enabled,
        },
      };

      const saved = await api<AutomationConfig>("/whatsapp/automation", {
        method: "POST",
        body: JSON.stringify(next),
      });

      // Preserve any unrelated edits currently visible in the form.
      setAutomation((current) => ({
        ...current,
        autoReply: {
          ...current.autoReply,
          enabled: saved.autoReply.enabled,
        },
      }));
      toast.success(
        enabled
          ? "WhatsApp AI auto-replies enabled."
          : "WhatsApp AI auto-replies stopped."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not change auto-reply: ${error.message}`
          : "Could not change WhatsApp auto-reply."
      );
    } finally {
      setAutomationSaving(false);
    }
  };

  const saveAutomation = async () => {
    setAutomationSaving(true);
    try {
      const next = {
        ...automation,
        autoReply: {
          ...automation.autoReply,
          allowedJids: autoAllowedNumbers
            .split(",")
            .map((number) => number.trim())
            .filter(Boolean),
        },
      };
      const saved = await api<AutomationConfig>("/whatsapp/automation", {
        method: "POST",
        body: JSON.stringify(next),
      });
      setAutomation(saved);
      setAutoAllowedNumbers(
        saved.autoReply.allowedJids
          .map((jid) => jid.split("@")[0])
          .join(", ")
      );
      toast.success("WhatsApp automation settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save automation settings."
      );
    } finally {
      setAutomationSaving(false);
    }
  };

  const addAutoStartRule = () => {
    const digits = autoStartNumber.replace(/\D/g, "");
    if (digits.length < 7 || !autoStartMessage.trim() || !autoStartAt) {
      toast.error("Enter a full country-code number, message, and scheduled time.");
      return;
    }
    const scheduled = new Date(autoStartAt);
    if (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() <= Date.now()) {
      toast.error("Choose a future date and time for the scheduled message.");
      return;
    }

    const rule: AutomationRule = {
      id: `rule-${Date.now()}`,
      jid: digits,
      name: autoStartName.trim() || digits,
      message: autoStartMessage.trim(),
      enabled: true,
      nextAt: scheduled.toISOString(),
      repeat: autoStartRepeat,
    };

    setAutomation((current) => ({
      ...current,
      autoStart: {
        ...current.autoStart,
        rules: [...current.autoStart.rules, rule],
      },
    }));
    setAutoStartMessage("");
    toast.success("Schedule added. Save settings to keep it.");
  };

  return (
    <div className="h-full min-h-0 w-full flex flex-col bg-[#111b21] text-[#e9edef] rounded-none border-0 overflow-hidden">
      <header className="px-3 py-3 sm:px-5 border-b border-[#26353d] bg-[#202c33] flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-widest flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#00a884]" />
          WhatsApp
        </h2>

        <div className="flex items-center gap-2 text-xs">
          {status.connected ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Wifi className="w-4 h-4" /> CONNECTED
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-400">
              <WifiOff className="w-4 h-4" /> {status.status.toUpperCase()}
            </span>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh(true)}
            className="border-cyan-500/30 text-cyan-100"
            aria-label="Refresh WhatsApp"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <nav
        aria-label="WhatsApp sections"
        className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-[#26353d] bg-[#152128] overflow-x-auto"
      >
        {([
          ["chats", "Chats"],
          ["contacts", "Contacts"],
          ["automation", "Automation"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-current={view === key ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm transition-colors ${
              view === key
                ? "bg-[#00a884] text-[#071b16] font-semibold"
                : "text-[#b6c4cb] hover:bg-[#202c33]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {!status.connected && (
        <section className="p-4 border-b border-cyan-500/20 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[12rem]">
            <p className="text-sm font-medium">
              {status.qrDataUrl ? "Scan to link WhatsApp" : "Link your WhatsApp account"}
            </p>
            <p className="text-xs text-cyan-400/70 mt-1">
              Open WhatsApp on your phone → Linked devices → Link a device.
              Keep your QR code private.
            </p>
            {status.lastError && (
              <p className="text-xs text-amber-300 mt-2">{status.lastError}</p>
            )}
          </div>

          {status.qrDataUrl ? (
            <img
              src={status.qrDataUrl}
              alt="WhatsApp device-linking QR code"
              className="w-40 h-40 bg-white p-2 rounded"
            />
          ) : (
            <Button
              onClick={() => void connect()}
              disabled={connecting}
              className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-100"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <QrCode className="w-4 h-4 mr-2" />
              )}
              {connecting ? "Starting..." : "Connect WhatsApp"}
            </Button>
          )}
        </section>
      )}

      {status.connected && (
        <div className="px-4 py-2 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-emerald-300">
            Linked account: {status.user || "WhatsApp account connected"}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void disconnect()}
            className="border-red-500/30 text-red-300 hover:bg-red-500/10"
          >
            Disconnect
          </Button>
        </div>
      )}

      {view === "automation" && (
      <section className="flex-1 min-h-0 overflow-y-auto border-b border-[#26353d] bg-[#152128] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#00a884]">WhatsApp Automation</h3>
            <p className="text-xs text-[#8696a0] mt-1">
              Both modes start off. Only enable automatic sending when your rules are ready.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => void saveAutomation()}
            disabled={automationSaving}
            className="bg-[#00a884] text-[#071b16] hover:bg-[#06cf9c]"
          >
            {automationSaving ? "Saving..." : "Save automation"}
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#30434c] p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={automation.autoReply.enabled}
                disabled={automationSaving}
                onChange={(e) => void toggleAutoReply(e.target.checked)}
                className="accent-[#00a884] disabled:opacity-50"
              />
              Enable AI auto-replies
            </label>
            <p className="text-xs text-[#8696a0]">
              Replies only to new direct messages from numbers in your allowlist.
            </p>
            <label className="block text-xs text-[#b6c4cb]">
              Approved numbers, including country codes (comma-separated)
              <Input
                value={autoAllowedNumbers}
                onChange={(e) => setAutoAllowedNumbers(e.target.value)}
                placeholder="2547..., 2348..."
                className="mt-1 bg-[#202c33] border-[#30434c] text-[#e9edef]"
              />
            </label>
            <label className="block text-xs text-[#b6c4cb]">
              Fallback reply template
              <Textarea
                value={automation.autoReply.template}
                onChange={(e) => setAutomation((current) => ({
                  ...current,
                  autoReply: { ...current.autoReply, template: e.target.value },
                }))}
                placeholder="Use {name} for the contact name."
                className="mt-1 min-h-16 bg-[#202c33] border-[#30434c] text-[#e9edef]"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-[#b6c4cb]">
                Daily reply limit
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={automation.autoReply.dailyLimit}
                  onChange={(e) => setAutomation((current) => ({
                    ...current,
                    autoReply: {
                      ...current.autoReply,
                      dailyLimit: Number(e.target.value),
                    },
                  }))}
                  className="mt-1 bg-[#202c33] border-[#30434c] text-[#e9edef]"
                />
              </label>
              <label className="text-xs text-[#b6c4cb]">
                Contact cooldown (minutes)
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={automation.autoReply.cooldownMinutes}
                  onChange={(e) => setAutomation((current) => ({
                    ...current,
                    autoReply: {
                      ...current.autoReply,
                      cooldownMinutes: Number(e.target.value),
                    },
                  }))}
                  className="mt-1 bg-[#202c33] border-[#30434c] text-[#e9edef]"
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-[#30434c] p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={automation.autoStart.enabled}
                onChange={(e) => setAutomation((current) => ({
                  ...current,
                  autoStart: { ...current.autoStart, enabled: e.target.checked },
                }))}
                className="accent-[#00a884]"
              />
              Enable scheduled auto-start
            </label>
            <p className="text-xs text-[#8696a0]">
              Messages go only to recipients you schedule here. Daily cap and quiet hours apply.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-[#b6c4cb]">
                Daily send limit
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={automation.autoStart.dailyLimit}
                  onChange={(e) => setAutomation((current) => ({
                    ...current,
                    autoStart: { ...current.autoStart, dailyLimit: Number(e.target.value) },
                  }))}
                  className="mt-1 bg-[#202c33] border-[#30434c] text-[#e9edef]"
                />
              </label>
              <label className="text-xs text-[#b6c4cb]">
                Repeat
                <select
                  value={autoStartRepeat}
                  onChange={(e) => setAutoStartRepeat(e.target.value as "once" | "daily" | "weekly")}
                  className="mt-1 w-full h-10 rounded-md border border-[#30434c] bg-[#202c33] px-2 text-[#e9edef]"
                >
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-[#b6c4cb]">
                Quiet hours start
                <Input
                  type="time"
                  value={automation.autoStart.quietHours.start}
                  onChange={(e) => setAutomation((current) => ({
                    ...current,
                    autoStart: {
                      ...current.autoStart,
                      quietHours: { ...current.autoStart.quietHours, start: e.target.value },
                    },
                  }))}
                  className="mt-1 bg-[#202c33] border-[#30434c] text-[#e9edef]"
                />
              </label>
              <label className="text-xs text-[#b6c4cb]">
                Quiet hours end
                <Input
                  type="time"
                  value={automation.autoStart.quietHours.end}
                  onChange={(e) => setAutomation((current) => ({
                    ...current,
                    autoStart: {
                      ...current.autoStart,
                      quietHours: { ...current.autoStart.quietHours, end: e.target.value },
                    },
                  }))}
                  className="mt-1 bg-[#202c33] border-[#30434c] text-[#e9edef]"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                value={autoStartName}
                onChange={(e) => setAutoStartName(e.target.value)}
                placeholder="Contact name (optional)"
                className="bg-[#202c33] border-[#30434c] text-[#e9edef]"
              />
              <Input
                value={autoStartNumber}
                onChange={(e) => setAutoStartNumber(e.target.value)}
                placeholder="Recipient number + country code"
                className="bg-[#202c33] border-[#30434c] text-[#e9edef]"
              />
            </div>
            <Textarea
              value={autoStartMessage}
              onChange={(e) => setAutoStartMessage(e.target.value)}
              placeholder="Exact message to send on schedule"
              className="min-h-16 bg-[#202c33] border-[#30434c] text-[#e9edef]"
            />
            <Input
              type="datetime-local"
              value={autoStartAt}
              onChange={(e) => setAutoStartAt(e.target.value)}
              className="bg-[#202c33] border-[#30434c] text-[#e9edef]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addAutoStartRule}
              className="border-[#00a884]/50 text-[#9be5d2]"
            >
              Add scheduled message
            </Button>
            {automation.autoStart.rules.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#b6c4cb]">Scheduled messages</p>
                {automation.autoStart.rules.map((rule) => (
                  <div key={rule.id} className="rounded border border-[#30434c] p-2 text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => setAutomation((current) => ({
                          ...current,
                          autoStart: {
                            ...current.autoStart,
                            rules: current.autoStart.rules.map((item) =>
                              item.id === rule.id ? { ...item, enabled: e.target.checked } : item
                            ),
                          },
                        }))}
                        aria-label={`Enable schedule for ${rule.name}`}
                        className="mt-1 accent-[#00a884]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{rule.name} · {rule.repeat}</p>
                        <p className="text-[#8696a0] break-all">{rule.jid}</p>
                        <p className="text-[#8696a0]">
                          Next: {new Date(rule.nextAt).toLocaleString()}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{rule.message}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutomation((current) => ({
                          ...current,
                          autoStart: {
                            ...current.autoStart,
                            rules: current.autoStart.rules.filter((item) => item.id !== rule.id),
                          },
                        }))}
                        className="text-red-300 hover:text-red-200"
                        aria-label={`Remove schedule for ${rule.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      {view !== "automation" && (
      <div className="grid grid-cols-1 md:grid-cols-[minmax(10rem,0.85fr)_minmax(0,1.5fr)] flex-1 min-h-0">
        <aside className={`${chatOpen ? "hidden md:flex" : "flex"} border-r border-cyan-500/20 flex-col min-h-0`}>
          {view === "contacts" && (
          <div className="p-3 space-y-2 border-b border-cyan-500/20">
            <p className="text-[10px] tracking-widest text-cyan-400/70">
              ADD CONTACT
            </p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="bg-slate-900 border-cyan-500/30 text-cyan-100 h-8 text-sm"
            />
            <div className="flex gap-2">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Country code + number"
                className="bg-slate-900 border-cyan-500/30 text-cyan-100 h-8 text-sm"
              />
              <Button
                size="sm"
                onClick={addContact}
                aria-label="Add contact"
                className="bg-cyan-500/20 border border-cyan-400/40 h-8"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="sticky top-0 z-10 bg-[#111b21] p-3 border-b border-[#26353d]">
              <div className="flex items-center gap-2 rounded-lg bg-[#202c33] px-3">
                <Search className="w-4 h-4 shrink-0 text-[#8696a0]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search chats or contacts"
                  aria-label="Search chats and contacts"
                  className="h-9 border-0 bg-transparent text-sm text-[#e9edef] placeholder:text-[#8696a0] focus-visible:ring-0"
                />
              </div>
            </div>
{view === "chats" && (
            <>
<p className="px-3 pt-3 pb-1 text-xs font-medium text-[#8696a0]">
              CHATS
            </p>
            {conversations.filter((conversation) =>
              [conversation.name, conversation.lastMessage.text, conversation.jid]
                .some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))
            ).map((conversation) => (
              <button
                key={conversation.jid}
                onClick={() => {
                  setActiveJid(conversation.jid);
                  setActiveContact(null);
                }}
                className={`w-full text-left px-3 py-3 border-b border-[#26353d] transition-colors ${
                  selectedJid === conversation.jid
                    ? "bg-[#2a3942]"
                    : "hover:bg-[#202c33]"
                }`}
              >
                <div className="text-sm truncate">{conversation.name}</div>
                <div className="text-[11px] text-cyan-400/60 truncate">
                  {conversation.lastMessage.fromMe ? "You: " : ""}
                  {conversation.lastMessage.text}
                </div>
              </button>
            ))}

            {calls.length > 0 && (
              <div className="border-t border-[#26353d] mt-2 pt-2">
                <div className="px-3 py-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-[#8696a0]">RECENT CALLS</p>
                  <Clock className="w-3.5 h-3.5 text-[#8696a0]" />
                </div>
                {calls.slice(0, 8).map((call) => {
                  const canReject =
                    status.connected &&
                    !call.isGroup &&
                    (call.status === "offer" || call.status === "ringing");

                  return (
                    <div
                      key={`${call.from}-${call.id}`}
                      className="px-3 py-2 flex items-center gap-2 hover:bg-[#202c33]"
                    >
                      <div className="w-8 h-8 shrink-0 rounded-full bg-[#374248] flex items-center justify-center">
                        {call.isVideo
                          ? <Video className="w-4 h-4 text-[#00a884]" />
                          : <PhoneCall className="w-4 h-4 text-[#00a884]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#e9edef] truncate">{call.from}</p>
                        <p className="text-[10px] text-[#8696a0] truncate">
                          {call.isVideo ? "Video" : "Voice"} · {call.status}
                        </p>
                      </div>
                      {canReject && (
                        <button
                          type="button"
                          title="Reject incoming call"
                          aria-label={`Reject call from ${call.from}`}
                          disabled={rejectingCallId === call.id}
                          onClick={async () => {
                            setRejectingCallId(call.id);
                            try {
                              await api<{ success: boolean }>("/whatsapp/reject-call", {
                                method: "POST",
                                body: JSON.stringify({ callId: call.id }),
                              });
                              toast.success("Call rejection requested.");
                              await refresh();
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Could not reject the call."
                              );
                            } finally {
                              setRejectingCallId(null);
                            }
                          }}
                          className="p-1.5 rounded-full text-red-300 hover:bg-[#374248] disabled:opacity-50"
                        >
                          {rejectingCallId === call.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <PhoneOff className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            </>
            )}

{view === "contacts" && (
            <>
<p className="px-3 pt-3 pb-1 text-[10px] tracking-widest text-cyan-400/70">
              CONTACTS
            </p>
            {allContacts.length === 0 && (
              <p className="p-3 text-xs text-cyan-500/60">No contacts yet. WhatsApp contacts appear here after syncing.</p>
            )}

            {allContacts.filter((contact) =>
              [contact.name, contact.phone]
                .some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))
            ).map((contact) => (
              <div
                key={contact.id}
                className={`px-3 py-2 border-b border-cyan-500/10 flex items-center gap-2 ${
                  activeContact?.id === contact.id ? "bg-cyan-500/15" : ""
                }`}
              >
                <button
                  onClick={() => {
                    setActiveContact(contact);
                    setActiveJid("");
                    setView("chats");
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="text-sm truncate">{contact.name}</div>
                  <div className="text-[11px] text-cyan-400/60 font-mono truncate">
                    +{contact.phone}
                  </div>
                </button>
                {contact.source !== "whatsapp" && (
                  <button
                    onClick={() => removeContact(contact.id)}
                    aria-label={`Remove ${contact.name}`}
                    className="text-cyan-500/50 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            </>
            )}
          </div>
        </aside>

        <section className={`${chatOpen ? "flex" : "hidden md:flex"} flex-col min-w-0 min-h-0`}>
          <div className="min-h-[64px] px-2 sm:px-4 py-2 border-b border-[#26353d] bg-[#202c33] text-sm text-[#e9edef] flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => { setActiveContact(null); setActiveJid(""); }}
              aria-label="Back to chat list"
              className="md:hidden shrink-0 rounded-full p-2 text-[#aebac1] hover:bg-[#374248] hover:text-[#e9edef]"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 shrink-0 rounded-full bg-[#374248] flex items-center justify-center text-[#d1d7db] font-semibold">
              {(activeJid
                ? conversations.find((c) => c.jid === activeJid)?.name
                : activeContact?.name)?.slice(0, 1).toUpperCase() || <MessageSquare className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">
                {activeJid
                  ? conversations.find((c) => c.jid === activeJid)?.name || activeJid
                  : activeContact
                    ? activeContact.name
                    : "WhatsApp"}
              </p>
              <p className="text-xs text-[#8696a0] truncate">
                {activeJid
                  ? status.connected ? "online via linked session" : "Linked session disconnected"
                  : activeContact
                    ? `+${activeContact.phone}`
                    : "Select a chat to start messaging"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={conversationAISaving}
                aria-label="Toggle WhatsApp conversational AI"
                title="Global setting: answer incoming WhatsApp questions, including from unsaved contacts"
                onClick={() => void toggleConversationAI()}
                className={conversationAIEnabled
                  ? "h-9 border-[#00a884] text-[#00a884] hover:bg-[#00a884]/10"
                  : "h-9 border-[#52636b] text-[#aebac1]"}
              >
                {conversationAISaving ? "Saving…" : conversationAIEnabled ? "AI ON" : "AI OFF"}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Voice call"
                title="Live WhatsApp calling is not supported by the current connector"
                onClick={() => toast.error("Placing WhatsApp voice calls is not supported by the current connector yet.")}
                className="h-9 w-9 text-[#aebac1] hover:bg-[#374248] hover:text-[#e9edef]"
              >
                <PhoneCall className="w-5 h-5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Video call"
                title="Live WhatsApp calling is not supported by the current connector"
                onClick={() => toast.error("Placing WhatsApp video calls is not supported by the current connector yet.")}
                className="h-9 w-9 text-[#aebac1] hover:bg-[#374248] hover:text-[#e9edef]"
              >
                <Video className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 space-y-2 bg-[#0b141a]">
            {!selectedJid && (
              <div className="h-full flex flex-col items-center justify-center text-center text-cyan-500/60 gap-2">
                <div className="w-14 h-14 rounded-2xl border border-[#00a884]/40 bg-[#00a884]/10 flex items-center justify-center">
                  <MessageSquare className="w-7 h-7 text-[#00a884]" />
                </div>
                <h3 className="text-lg font-semibold text-[#e9edef]">Welcome to INDI AI</h3>
                <p className="max-w-sm text-sm text-[#aebac1]">
                  Your private AI companion is ready. Choose a conversation or open Contacts to start a WhatsApp chat.
                </p>
                <p className="text-xs text-[#00a884]">Your AI. Your PC. Your rules.</p>
              </div>
            )}

            {selectedJid && selectedMessages.length === 0 && (
              <p className="text-xs text-cyan-500/60 text-center mt-6">
                No messages recorded for this conversation yet. Send a message to start.
              </p>
            )}

            {selectedMessages.map((item) => (
              <div
                key={`${item.jid}-${item.id}`}
                className={`flex ${item.fromMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    item.fromMe
                      ? "bg-[#005c4b] border border-[#005c4b]"
                      : "bg-[#202c33] border border-[#202c33]"
                  }`}
                >
                  <p>{item.text}</p>
                  <p className="text-[9px] text-cyan-400/50 mt-1 text-right">
                    {new Date(item.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-[#26353d] bg-[#202c33] space-y-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Write a WhatsApp message... (Enter to send)"
              disabled={!status.connected}
              className="bg-[#2a3942] border-[#2a3942] text-[#e9edef] placeholder:text-[#8696a0] resize-none text-sm min-h-14 rounded-lg"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-cyan-500/50">
                Shift+Enter for a new line
              </span>
              <Button
                onClick={() => void sendMessage()}
                disabled={!status.connected || sending || !selectedJid || !message.trim()}
                className="bg-[#00a884] border border-[#00a884] hover:bg-[#06cf9c] text-[#071b16]"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send
              </Button>
            </div>
          </div>
        </section>
      </div>
      )}

      <footer className="px-3 py-2 border-t border-cyan-500/10 text-[10px] text-cyan-500/50">
        LOCAL WHATSAPP WEB SESSION · Manual messages send when you press Send. Automation sends only under your saved, enabled rules.
        Call notifications and rejection are supported where Baileys exposes them; live voice/video conversations and answering calls are not implemented.
      </footer>
    </div>
  );
};

export default WhatsAppSection;
