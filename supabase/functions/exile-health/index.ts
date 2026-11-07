// INDI AI health probe — reports which backend subsystems are live.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const has = (name: string) => !!Deno.env.get(name);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = Date.now();
  let gateway: { ok: boolean; status: number; ms: number; error?: string } = { ok: false, status: 0, ms: 0 };

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (key) {
    try {
      const t0 = Date.now();
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });
      gateway = { ok: r.ok, status: r.status, ms: Date.now() - t0 };
      if (!r.ok) gateway.error = (await r.text()).slice(0, 200);
    } catch (e) {
      gateway = { ok: false, status: 0, ms: 0, error: String(e) };
    }
  } else {
    gateway.error = "LOVABLE_API_KEY missing";
  }

  return new Response(
    JSON.stringify({
      ok: gateway.ok,
      checkedAt: new Date().toISOString(),
      totalMs: Date.now() - started,
      subsystems: {
        reasoning: gateway,
        database: { ok: has("SUPABASE_URL") },
        telephony: { ok: has("TWILIO_ACCOUNT_SID") && has("TWILIO_AUTH_TOKEN") && has("TWILIO_FROM_NUMBER") },
        home: { ok: has("HOME_ASSISTANT_URL") && has("HOME_ASSISTANT_TOKEN") },
        vehicle: { ok: has("TESLA_API_KEY") || has("SMARTCAR_API_KEY") },
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
