// Universal car proxy — supports Tesla Fleet API and Smartcar (covers 30+ brands
// incl. Ford, BMW, Mercedes, VW, Audi, Kia, Hyundai, Nissan, Honda, Toyota, etc).
// Client sends provider + user's OAuth access token + a semantic action; we translate.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "tesla" | "smartcar";
type Action =
  | "status"          // location, battery/fuel, odometer, lock
  | "lock" | "unlock"
  | "start_climate" | "stop_climate"
  | "honk" | "flash"
  | "charge_start" | "charge_stop";

interface CarReq {
  provider: Provider;
  accessToken: string;
  vehicleId: string;   // Tesla id or Smartcar vehicle id
  action: Action;
  params?: Record<string, unknown>;
}

const teslaBase = "https://fleet-api.prd.na.vn.cloud.tesla.com";
const smartcarBase = "https://api.smartcar.com/v2.0";

async function tesla(t: string, id: string, a: Action, params?: any) {
  const H = { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
  const cmd = (name: string, body?: any) =>
    fetch(`${teslaBase}/api/1/vehicles/${id}/command/${name}`, {
      method: "POST", headers: H, body: body ? JSON.stringify(body) : undefined,
    });
  switch (a) {
    case "status": {
      const r = await fetch(`${teslaBase}/api/1/vehicles/${id}/vehicle_data`, { headers: H });
      return r;
    }
    case "lock": return cmd("door_lock");
    case "unlock": return cmd("door_unlock");
    case "start_climate": return cmd("auto_conditioning_start");
    case "stop_climate": return cmd("auto_conditioning_stop");
    case "honk": return cmd("honk_horn");
    case "flash": return cmd("flash_lights");
    case "charge_start": return cmd("charge_start");
    case "charge_stop": return cmd("charge_stop");
  }
}

async function smartcar(t: string, id: string, a: Action, params?: any) {
  const H = { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
  const g = (p: string) => fetch(`${smartcarBase}/vehicles/${id}${p}`, { headers: H });
  const p = (p: string, body?: any) =>
    fetch(`${smartcarBase}/vehicles/${id}${p}`, {
      method: "POST", headers: H, body: body ? JSON.stringify(body) : "{}",
    });
  switch (a) {
    case "status": {
      // Batch: location, odometer, fuel, battery, charge, tires
      const r = await fetch(`${smartcarBase}/vehicles/${id}/batch`, {
        method: "POST", headers: H,
        body: JSON.stringify({
          requests: [
            { path: "/location" }, { path: "/odometer" },
            { path: "/fuel" }, { path: "/battery" },
            { path: "/charge" }, { path: "/vin" },
          ],
        }),
      });
      return r;
    }
    case "lock": return p("/security", { action: "LOCK" });
    case "unlock": return p("/security", { action: "UNLOCK" });
    case "start_climate":
    case "stop_climate":
    case "honk":
    case "flash":
      return new Response(JSON.stringify({ error: `${a} not supported by Smartcar universal API` }), { status: 400 });
    case "charge_start": return p("/charge", { action: "START" });
    case "charge_stop": return p("/charge", { action: "STOP" });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { provider, accessToken, vehicleId, action, params } = (await req.json()) as CarReq;
    if (!provider || !accessToken || !vehicleId || !action) {
      return new Response(JSON.stringify({ error: "provider, accessToken, vehicleId, action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const r = provider === "tesla"
      ? await tesla(accessToken, vehicleId, action, params)
      : await smartcar(accessToken, vehicleId, action, params);
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
