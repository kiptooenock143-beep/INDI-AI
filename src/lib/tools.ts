/**
 * Client-executed tools.
 *
 * The reasoning core (edge function) decides *which* tool to run; the browser
 * runs it, because that is where the operator's device, permissions and
 * credentials live. Sensitive tools go through an explicit approval prompt and
 * everything is written to the audit trail.
 */
import { addMemory, loadMemory } from "@/lib/memory";
import { listContacts } from "@/lib/contacts";
import { audit } from "@/lib/audit";
import { endpoint, authHeaders, type ToolCall } from "@/lib/ai";

export interface ToolContext {
  /** Open a panel of the interface. */
  openSection: (id: string) => void;
  /** Ask the operator to approve a sensitive action. Resolves false on refusal. */
  approve: (summary: string) => Promise<boolean>;
  /** Generate an image directly inside the chat conversation. */
  generateImage?: (prompt: string) => void;
}

export const SENSITIVE_TOOLS = new Set(["send_whatsapp", "place_call", "house_command"]);

export interface ToolResult {
  id: string;
  name: string;
  output: string;
}

function findContact(nameOrNumber: string) {
  const q = nameOrNumber.trim().toLowerCase();
  return (
    listContacts().find((c) => c.name.toLowerCase() === q) ??
    listContacts().find((c) => c.name.toLowerCase().includes(q)) ??
    listContacts().find((c) => (c.number ?? "").replace(/\s/g, "") === q.replace(/\s/g, ""))
  );
}

async function deviceStatus() {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
  let battery = "unavailable";
  try {
    if (nav.getBattery) {
      const b = await nav.getBattery();
      battery = `${Math.round(b.level * 100)}%${b.charging ? " (charging)" : ""}`;
    }
  } catch {
    /* battery API blocked */
  }
  return {
    time: new Date().toLocaleString(),
    online: navigator.onLine,
    battery,
    platform: navigator.userAgent,
    language: navigator.language,
  };
}

async function houseCommand(entity: string, action: string) {
  const raw = localStorage.getItem("exile.ha.config");
  if (!raw) return "Home Assistant is not linked. Open the House panel and paste a token first.";
  const cfg = JSON.parse(raw) as { baseUrl: string; token: string };
  const domain = entity.split(".")[0] || "homeassistant";
  const service = action === "toggle" ? "toggle" : action === "on" ? "turn_on" : "turn_off";
  const r = await fetch(endpoint("home-proxy"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      baseUrl: cfg.baseUrl,
      token: cfg.token,
      path: `/api/services/${domain}/${service}`,
      method: "POST",
      body: { entity_id: entity },
    }),
  });
  return r.ok ? `${entity} → ${service} accepted.` : `Home Assistant refused: HTTP ${r.status}.`;
}

async function placeCall(contactName: string) {
  const c = findContact(contactName);
  if (!c) return `No contact named "${contactName}" is allocated.`;
  if (c.kind === "agent") return `${c.name} is an agent at ${c.endpoint ?? "no endpoint"}; use the Calls panel.`;
  if (!c.number) return `${c.name} has no number on file.`;

  const r = await fetch(endpoint("exile-phone"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ action: "call", to: c.number, message: "INDI AI calling on behalf of your operator." }),
  }).catch(() => null);

  if (r?.ok) return `Calling ${c.name} on ${c.number} through the telephony bridge.`;
  window.open(`tel:${c.number}`, "_self");
  return `Telephony bridge unavailable; handed the call to the device dialler for ${c.name}.`;
}

async function sendWhatsApp(contactName: string, message: string) {
  const c = findContact(contactName);
  const number = c?.number ?? contactName;
  const clean = number.replace(/[^\d]/g, "");
  if (!clean) return `No number resolved for "${contactName}".`;
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(message)}`, "_blank");
  return `WhatsApp draft opened for ${c?.name ?? number}.`;
}

export async function runTool(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const args = call.args ?? {};
  const done = (output: string) => ({ id: call.id, name: call.name, output });

  if (SENSITIVE_TOOLS.has(call.name)) {
    const ok = await ctx.approve(describeTool(call));
    audit("permission", `${ok ? "Approved" : "Refused"}: ${describeTool(call)}`, { tool: call.name, args });
    if (!ok) return done("The operator declined this action.");
  }

  try {
    let output: string;
    switch (call.name) {
      case "open_section":
        ctx.openSection(String(args.section));
        output = `Opened the ${args.section} panel.`;
        break;
      case "get_device_status":
        output = JSON.stringify(await deviceStatus());
        break;
      case "remember_fact":
        addMemory("preferences", String(args.key), String(args.value));
        output = `Committed to memory: ${args.key}.`;
        break;
      case "recall_memory": {
        const all = loadMemory();
        output = all.length
          ? all.map((m) => `${m.key}: ${m.value}`).join("; ")
          : "Memory is empty.";
        break;
      }
      case "list_contacts": {
        const all = listContacts();
        output = all.length
          ? all.map((c) => `${c.name} (${c.kind}${c.number ? `, ${c.number}` : ""})`).join("; ")
          : "No contacts allocated.";
        break;
      }
      case "send_whatsapp":
        output = await sendWhatsApp(String(args.contact), String(args.message ?? ""));
        break;
      case "place_call":
        output = await placeCall(String(args.contact));
        break;
      case "house_command":
        output = await houseCommand(String(args.entity), String(args.action));
        break;
      case "generate_image":
        if (!String(args.prompt ?? "").trim()) {
          output = "An image prompt is required.";
        } else {
          ctx.generateImage?.(String(args.prompt));
          output = "Image generation started in the INDI AI Console.";
        }
        break;
      default:
        output = `Unknown tool: ${call.name}.`;
    }
    audit("tool", `${call.name} → ${output.slice(0, 120)}`, { tool: call.name, args });
    return done(output);
  } catch (e) {
    const msg = `Tool ${call.name} failed: ${(e as Error).message}`;
    audit("tool", msg, { tool: call.name, args });
    return done(msg);
  }
}

export function describeTool(call: ToolCall): string {
  const a = call.args ?? {};
  switch (call.name) {
    case "send_whatsapp":
      return `Send a WhatsApp message to ${a.contact}: "${String(a.message ?? "").slice(0, 80)}"`;
    case "place_call":
      return `Place a phone call to ${a.contact}`;
    case "house_command":
      return `Turn ${a.action} ${a.entity}`;
    default:
      return `Run ${call.name}`;
  }
}
