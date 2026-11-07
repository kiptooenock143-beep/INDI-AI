// INDI AI chat — streaming reasoning with client-executed tool calling and model tiering.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are INDI AI. "Your AI. Your PC. Your rules."

Identity:
- Your name is INDI AI. You are not based on, named after, or affiliated with any other assistant.
- You serve a single operator and address them as "Sir" or "Madam" sparingly, naturally.
- Tone: composed, precise, quietly confident, dry wit, refined eloquence. Short polished sentences.

Tools:
- You can operate the operator's system through the provided tools. Prefer calling a tool over
  describing what you would do. Never invent tool results; wait for them.
- Tools marked as sensitive will ask the operator for confirmation before running. That is expected.

Rules:
- Never refer to yourself as any other assistant brand or franchise.
- Keep replies under 3 short paragraphs unless asked for depth.`;

/** Client-executed tools. The browser runs them and returns results as role:"tool" messages. */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "open_section",
      description: "Open a panel of the INDI AI interface for the operator.",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: [
              "chat", "camera", "files", "voice", "whatsapp", "calls", "house", "car",
              "generate", "cinema", "docs", "research", "analysis", "contacts", "health",
              "audit", "apps", "system", "keys",
            ],
          },
        },
        required: ["section"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_status",
      description: "Read local device status: time, battery, network, platform.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_fact",
      description: "Store a durable fact about the operator in INDI AI's persistent memory.",
      parameters: {
        type: "object",
        properties: { key: { type: "string" }, value: { type: "string" } },
        required: ["key", "value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description: "List everything INDI AI remembers about the operator.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_contacts",
      description: "List the operator's allocated contacts and agents.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp",
      description: "Sensitive. Open a WhatsApp message to a contact with prefilled text.",
      parameters: {
        type: "object",
        properties: { contact: { type: "string" }, message: { type: "string" } },
        required: ["contact", "message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "place_call",
      description: "Sensitive. Place a phone call to one of the operator's contacts.",
      parameters: {
        type: "object",
        properties: { contact: { type: "string" } },
        required: ["contact"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "house_command",
      description: "Sensitive. Control a smart-home entity (turn on, turn off, toggle).",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string" },
          action: { type: "string", enum: ["on", "off", "toggle"] },
        },
        required: ["entity", "action"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Render an image from a prompt and show it on the HUD.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
];

const TIERS: Record<string, string> = {
  fast: "google/gemini-2.5-flash",
  deep: "google/gemini-2.5-pro",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, tier, tools: useTools = true } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = TIERS[tier as string] ?? TIERS.fast;

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...(messages ?? [])],
      stream: true,
    };
    if (useTools) {
      body.tools = TOOLS;
      body.tool_choice = "auto";
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits depleted. Please add credits to continue." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const txt = await response.text();
      return new Response(JSON.stringify({ error: txt.slice(0, 500) }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Exile-Model": model },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
