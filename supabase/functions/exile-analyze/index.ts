// Document/image understanding — multimodal chat via Lovable AI Gateway
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { prompt, attachments } = await req.json() as {
      prompt: string;
      attachments?: Array<{ kind: "image" | "file"; mime: string; dataUrl: string; name?: string }>;
    };
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const content: any[] = [{ type: "text", text: prompt || "Analyze the attached material." }];
    for (const a of attachments ?? []) {
      if (a.kind === "image") content.push({ type: "image_url", image_url: { url: a.dataUrl } });
      else content.push({ type: "file", file: { filename: a.name || "file", file_data: a.dataUrl } });
    }

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You are INDI AI's Document Understanding module. Extract structure, key facts, action items, and cite sections. Be concise and organized." },
          { role: "user", content },
        ],
        stream: true,
      }),
    });

    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit — retry shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits depleted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) return new Response(JSON.stringify({ error: await r.text() }), { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
