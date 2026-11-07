// INDI AI telephony — real outbound calls and SMS via Twilio.
// Requires secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function creds() {
  return {
    sid: Deno.env.get("TWILIO_ACCOUNT_SID") ?? "",
    token: Deno.env.get("TWILIO_AUTH_TOKEN") ?? "",
    from: Deno.env.get("TWILIO_FROM_NUMBER") ?? "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { sid, token, from } = creds();

  if (req.method === "GET") {
    return json({ configured: !!(sid && token && from), from: from ? `***${from.slice(-4)}` : null });
  }

  try {
    const { action, to, message } = await req.json();

    if (!sid || !token || !from) {
      return json(
        { error: "Telephony not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER." },
        400,
      );
    }
    if (!to || !/^\+\d{7,15}$/.test(String(to))) {
      return json({ error: "Destination must be in international format, e.g. +254712345678." }, 400);
    }

    const auth = "Basic " + btoa(`${sid}:${token}`);
    const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;

    if (action === "sms") {
      const form = new URLSearchParams({ To: to, From: from, Body: String(message ?? "").slice(0, 1500) });
      const r = await fetch(`${base}/Messages.json`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const data = await r.json();
      return json(r.ok ? { ok: true, sid: data.sid } : { error: data.message ?? "SMS failed" }, r.ok ? 200 : r.status);
    }

    if (action === "call") {
      const spoken = String(message ?? "This is INDI AI calling on behalf of your operator.").slice(0, 900);
      const twiml = `<Response><Say voice="Polly.Brian">${spoken.replace(/[<>&]/g, " ")}</Say></Response>`;
      const form = new URLSearchParams({ To: to, From: from, Twiml: twiml });
      const r = await fetch(`${base}/Calls.json`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const data = await r.json();
      return json(r.ok ? { ok: true, sid: data.sid } : { error: data.message ?? "Call failed" }, r.ok ? 200 : r.status);
    }

    return json({ error: "Unknown action. Use 'call' or 'sms'." }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
