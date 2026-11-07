/**
 * INDI AI tool execution registry.
 *
 * Central catalogue of every operation the task engine may perform. Each tool
 * declares a name, description, JSON input schema, required capabilities, risk
 * classification, whether explicit approval is required and an execution
 * adapter. The orchestrator can ONLY run tools registered here — the model
 * cannot invoke anything else, and there is no shell / arbitrary-code /
 * arbitrary-filesystem adapter by design.
 *
 * Existing local capabilities are reused: WhatsApp relay (whatsapp.mjs), ARC
 * read-only telemetry (arc modules), provider health, memory notes and audit.
 */
import { getWhatsAppStatus, sendWhatsAppMessage } from "./whatsapp.mjs";
import { arcAutonomyEngine } from "./arc-autonomy-engine.mjs";

export const RISKS = new Set(["safe", "reversible", "sensitive", "destructive"]);
const APPROVAL_REQUIRED_RISKS = new Set(["sensitive", "destructive"]);

/** Minimal JSON-Schema-subset validator (no dependency). */
export function validateArgs(schema, args, pathLabel = "$") {
  const errors = [];
  const value = args === undefined ? null : args;

  const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

  if (schema.type) {
    const t = typeOf(value);
    const ok =
      (schema.type === "object" && t === "object") ||
      (schema.type === "array" && t === "array") ||
      (schema.type === "string" && t === "string") ||
      (schema.type === "number" && t === "number" && Number.isFinite(value)) ||
      (schema.type === "integer" && t === "number" && Number.isSafeInteger(value)) ||
      (schema.type === "boolean" && t === "boolean");
    if (!ok) {
      errors.push(`${pathLabel}: expected type "${schema.type}", got "${t}".`);
      return errors;
    }
  }

  if (schema.type === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${pathLabel}: requires at least ${schema.minItems} items.`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${pathLabel}: allows at most ${schema.maxItems} items.`);
    if (schema.items) value.forEach((item, i) => errors.push(...validateArgs(schema.items, item, `${pathLabel}[${i}]`)));
    return errors;
  }
  if (typeOf(value) !== "object" || value === null) return errors;

  for (const key of schema.required ?? []) {
    const v = value[key];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      errors.push(`${pathLabel}.${key}: required argument missing.`);
    }
  }

  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const v = value[key];
    if (v === undefined) continue;
    if (prop.type) errors.push(...validateArgs(prop, v, `${pathLabel}.${key}`));
    if (prop.enum && !prop.enum.includes(v)) {
      errors.push(`${pathLabel}.${key}: must be one of ${prop.enum.join(", ")}.`);
    }
    if (typeof v === "string") {
      if (prop.minLength !== undefined && v.length < prop.minLength) {
        errors.push(`${pathLabel}.${key}: must be at least ${prop.minLength} characters.`);
      }
      if (prop.maxLength !== undefined && v.length > prop.maxLength) {
        errors.push(`${pathLabel}.${key}: must be at most ${prop.maxLength} characters.`);
      }
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) errors.push(`${pathLabel}.${key}: must be finite.`);
      if (prop.minimum !== undefined && v < prop.minimum) errors.push(`${pathLabel}.${key}: must be >= ${prop.minimum}.`);
      if (prop.maximum !== undefined && v > prop.maximum) errors.push(`${pathLabel}.${key}: must be <= ${prop.maximum}.`);
    }
    if (typeof v === "string" && prop.pattern) {
      let pattern;
      try { pattern = new RegExp(prop.pattern); } catch { errors.push(`${pathLabel}.${key}: schema pattern is invalid.`); }
      if (pattern && !pattern.test(v)) errors.push(`${pathLabel}.${key}: format is invalid.`);
    }
  }

  // Reject unknown arguments outright — a model must not smuggle extra inputs.
  const known = new Set(Object.keys(schema.properties ?? {}));
  for (const key of Object.keys(value)) {
    if (!known.has(key) && schema.additionalProperties !== true) errors.push(`${pathLabel}.${key}: unknown argument not allowed.`);
  }

  return errors;
}

function redactOutput(text) {
  return String(text ?? "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,})\b/g, "[redacted]")
    .slice(0, 4000);
}

function ok(data) {
  return { ok: true, output: redactOutput(typeof data === "string" ? data : JSON.stringify(data)), data };
}

function fail(error, recoverable = false) {
  return { ok: false, error: redactOutput(error), recoverable };
}

/**
 * Tool definitions. `approvalRequired` tools pause the task until the operator
 * approves the EXACT operation (see permission-gateway.mjs). Risk classes:
 *   safe         - read-only, no side effects
 *   reversible   - writes that are contained/undoable (memory note)
 *   sensitive    - external consequence (messages) -> always needs approval
 *   destructive  - irreversible -> always needs approval; none ship enabled in Phase 1
 */
export const TOOL_DEFINITIONS = [
  {
    name: "provider_health",
    description: "Read which AI providers and subsystems are configured and healthy.",
    inputSchema: { type: "object", properties: {}, required: [] },
    capabilities: ["providers"],
    risk: "safe",
    approvalRequired: false,
    available: () => true,
    async execute() {
      const status = await fetch(`http://127.0.0.1:${process.env.EXILE_PORT || 8787}/exile-health`).catch(() => null);
      if (!status) return fail("Local API is unreachable.", true);
      return ok(await status.json().catch(() => ({ checkedAt: new Date().toISOString() })));
    },
  },
  {
    name: "arc_system_snapshot",
    description: "Read-only ARC system telemetry snapshot (memory, CPU, battery, security state).",
    inputSchema: { type: "object", properties: {}, required: [] },
    capabilities: ["arc_readonly"],
    risk: "safe",
    approvalRequired: false,
    available: () => !!arcAutonomyEngine.latestSnapshot,
    async execute() {
      const snap = arcAutonomyEngine.latestSnapshot;
      if (!snap) return fail("ARC telemetry is still initializing; retry shortly.", true);
      return ok(snap);
    },
  },
  {
    name: "arc_status",
    description: "Read-only ARC autonomy engine status and policy configuration.",
    inputSchema: { type: "object", properties: {}, required: [] },
    capabilities: ["arc_readonly"],
    risk: "safe",
    approvalRequired: false,
    available: () => true,
    async execute() {
      return ok(arcAutonomyEngine.getStatus());
    },
  },
  {
    name: "whatsapp_status",
    description: "Check whether the WhatsApp relay is connected.",
    inputSchema: { type: "object", properties: {}, required: [] },
    capabilities: ["whatsapp"],
    risk: "safe",
    approvalRequired: false,
    available: () => true,
    async execute() {
      return ok(getWhatsAppStatus());
    },
  },
  {
    name: "save_memory_note",
    description: "Store a durable note in INDI AI's task memory store (local file, reversible).",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", minLength: 1, maxLength: 120 },
        value: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["key", "value"],
    },
    capabilities: ["memory"],
    risk: "reversible",
    approvalRequired: false,
    available: () => true,
    async execute(args, ctx) {
      if (!ctx?.recordMemoryNote) return fail("Memory adapter is not wired.", false);
      ctx.recordMemoryNote(String(args.key), String(args.value));
      return ok(`Memory note saved: ${args.key}`);
    },
  },
  {
    name: "verify_memory_note",
    description: "Independently read persisted task memory and verify an exact value.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", minLength: 1, maxLength: 120 },
        expectedValue: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["key", "expectedValue"],
    },
    capabilities: ["memory", "verification"],
    risk: "safe",
    approvalRequired: false,
    available: () => true,
    async execute(args, ctx) {
      if (typeof ctx?.readMemoryNote !== "function") {
        return fail("Memory verification adapter is not wired.", false);
      }

      const actual = ctx.readMemoryNote(String(args.key));
      const verified = !!actual && actual.value === String(args.expectedValue);

      if (!verified) {
        return fail(
          `Persisted memory does not contain the expected value for key "${args.key}".`,
          false
        );
      }

      return {
        ...ok(`Persisted memory verified for key "${args.key}".`),
        verificationEvidence: {
          verified: true,
          source: "local task-memory.json read-back",
          key: String(args.key),
          observedAt: actual.at ?? null,
        },
      };
    },
  },
  {
    name: "append_audit_entry",
    description: "Persist an entry in the local JSONL audit trail.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", minLength: 1, maxLength: 500 },
      },
      required: ["summary"],
    },
    capabilities: ["audit"],
    risk: "reversible",
    approvalRequired: false,
    available: () => true,
    async execute(args, ctx) {
      if (!ctx?.recordAudit) return fail("Audit adapter is not wired.", false);
      ctx.recordAudit(String(args.summary));
      return ok("Audit entry appended.");
    },
  },
  {
    name: "send_whatsapp_message",
    description: "Send a WhatsApp message to a specific recipient through the relay.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", minLength: 3, maxLength: 100 },
        text: { type: "string", minLength: 1, maxLength: 4000 },
      },
      required: ["to", "text"],
    },
    capabilities: ["whatsapp"],
    risk: "sensitive",
    approvalRequired: true,
    available: () => getWhatsAppStatus()?.connectionStatus === "connected",
    async execute(args) {
      try {
        const result = await sendWhatsAppMessage(String(args.to), String(args.text));
        return ok(result);
      } catch (e) {
        // Sending is a side effect; if it failed mid-way the outcome is uncertain.
        return fail(e?.message ?? "WhatsApp send failed.", /timeout|network/i.test(String(e?.message)));
      }
    },
  },
  {
    name: "record_verification_note",
    description: "Record the operator-visible verification evidence for a finished step.",
    inputSchema: {
      type: "object",
      properties: {
        note: { type: "string", minLength: 1, maxLength: 1000 },
      },
      required: ["note"],
    },
    capabilities: ["verification"],
    risk: "safe",
    approvalRequired: false,
    available: () => true,
    async execute(args) {
      return ok(`Verification recorded: ${args.note}`);
    },
  },
];

export class ToolRegistry {
  constructor(definitions = TOOL_DEFINITIONS) {
    this.tools = new Map();
    for (const def of definitions) this.register(def);
  }

  register(def) {
    if (!def?.name || !def.inputSchema || !RISKS.has(def.risk) || typeof def.execute !== "function") {
      throw new Error(`Invalid tool definition: ${def?.name ?? "(unnamed)"}`);
    }
    this.tools.set(def.name, def);
  }

  get(name) {
    return this.tools.get(String(name));
  }

  /** Names + schemas only — what the planner is allowed to know about. */
  catalog() {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      capabilities: t.capabilities,
      risk: t.risk,
      approvalRequired: !!t.approvalRequired || APPROVAL_REQUIRED_RISKS.has(t.risk),
    }));
  }

  availability() {
    const out = {};
    for (const [name, t] of this.tools) {
      let avail = true;
      try {
        avail = !!t.available();
      } catch {
        avail = false;
      }
      out[name] = avail;
    }
    return out;
  }

  validateCall(name, args) {
    const tool = this.get(name);
    if (!tool) return [`Unknown tool "${name}". Only registered tools may run.`];
    return validateArgs(tool.inputSchema, args ?? {});
  }

  requiresApproval(name) {
    const tool = this.get(name);
    return !!tool && (!!tool.approvalRequired || APPROVAL_REQUIRED_RISKS.has(tool.risk));
  }

  /** Validate, check availability, then run the registered adapter. */
  async invoke(name, args, ctx) {
    const tool = this.get(name);
    if (!tool) return { ok: false, error: `Unknown tool "${name}" — not in registry.`, recoverable: false };

    const errors = validateArgs(tool.inputSchema, args ?? {});
    if (errors.length) {
      return { ok: false, error: `Argument validation failed: ${errors.join(" ")}`, recoverable: false };
    }
    let avail = true;
    try {
      avail = !!tool.available();
    } catch {
      avail = false;
    }
    if (!avail) {
      return { ok: false, error: `Tool "${name}" is currently unavailable (capability offline).`, recoverable: true };
    }
    if (tool.approvalRequired || APPROVAL_REQUIRED_RISKS.has(tool.risk)) {
      if (typeof ctx?.authorizeExecution !== "function") {
        return { ok: false, error: "Sensitive operation blocked: permission gateway is not connected.", recoverable: false };
      }
      const authorization = ctx.authorizeExecution({ tool: name, args: args ?? {} });
      if (!authorization?.allowed) {
        return { ok: false, error: `Sensitive operation blocked: ${authorization?.error ?? "approval required"}`, recoverable: false };
      }
    }
    try {
      const result = await tool.execute(args ?? {}, ctx);
      return {
        ...result,
        tool: name,
        risk: tool.risk,
        at: new Date().toISOString(),
      };
    } catch (e) {
      return { ok: false, error: redactOutput(e?.message ?? String(e)), recoverable: true, tool: name };
    }
  }
}
