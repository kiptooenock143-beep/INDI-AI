// Home Assistant REST proxy — forwards calls to user's HA instance
// Bypasses browser CORS and lets us stream state/events safely.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface HAReq {
  baseUrl: string;   // e.g. https://ha.myhome.duckdns.org
  token: string;     // long-lived access token
  path: string;      // e.g. /api/states  or /api/services/light/turn_on
  method?: string;
  body?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { baseUrl, token, path, method = "GET", body } = (await req.json()) as HAReq;
    if (!baseUrl || !token || !path) {
      return new Response(JSON.stringify({ error: "baseUrl, token, path required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = baseUrl.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`);
    const r = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": r.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
