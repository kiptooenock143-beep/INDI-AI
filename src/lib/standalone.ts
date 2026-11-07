/**
 * Standalone (phone app) mode.
 *
 * Inside the Android app there is no local server. The app talks straight to the
 * AI providers over the phone's data/Wi-Fi connection, using keys stored on the
 * phone (localStorage). Requests go through Capacitor's native HTTP so provider
 * CORS rules do not matter; in a normal browser it falls back to fetch().
 */

export function isNativeApp(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export interface DirectProvider {
  id: string;
  key: string;
  base: string;
  chat: string;
}

export interface ActiveProvider extends DirectProvider {
  apiKey: string;
}

// Same provider list as local/server.mjs.
export const DIRECT_PROVIDERS: DirectProvider[] = [
  { id: "openai",     key: "OPENAI_API_KEY",     base: "https://api.openai.com/v1",              chat: "gpt-4o-mini" },
  { id: "groq",       key: "GROQ_API_KEY",       base: "https://api.groq.com/openai/v1",         chat: "llama-3.3-70b-versatile" },
  { id: "openrouter", key: "OPENROUTER_API_KEY", base: "https://openrouter.ai/api/v1",           chat: "openrouter/free" },
  { id: "together",   key: "TOGETHER_API_KEY",   base: "https://api.together.xyz/v1",            chat: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { id: "deepseek",   key: "DEEPSEEK_API_KEY",   base: "https://api.deepseek.com/v1",            chat: "deepseek-chat" },
  { id: "mistral",    key: "MISTRAL_API_KEY",    base: "https://api.mistral.ai/v1",              chat: "mistral-large-latest" },
  { id: "xai",        key: "XAI_API_KEY",        base: "https://api.x.ai/v1",                    chat: "grok-2-latest" },
  { id: "perplexity", key: "PERPLEXITY_API_KEY", base: "https://api.perplexity.ai",              chat: "sonar" },
  { id: "gemini",     key: "GEMINI_API_KEY",     base: "https://generativelanguage.googleapis.com/v1beta/openai", chat: "gemini-2.5-flash" },
];

const KEYS = "indi.keys";
const PRIMARY = "indi.primary";

function readMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEYS) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export interface KeysPayload {
  keys: { name: string; set: boolean }[];
  providers: string[];
  primary: string;
}

export function directKeysPayload(): KeysPayload {
  const map = readMap();
  return {
    keys: Object.keys(map).map((name) => ({ name, set: !!map[name] })),
    providers: DIRECT_PROVIDERS.filter((p) => !!map[p.key]).map((p) => p.id),
    primary: localStorage.getItem(PRIMARY) || "",
  };
}

/** Same rules as the local server: an empty value keeps the saved key; deleted rows are removed. */
export function saveDirectKeys(input: { keys: { name: string; value: string }[]; primary?: string }): KeysPayload {
  const map = readMap();
  const next: Record<string, string> = {};
  for (const item of input.keys.slice(0, 200)) {
    const name = String(item.name || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!name) continue;
    const value = String(item.value ?? "").trim();
    next[name] = value || map[name] || "";
  }
  localStorage.setItem(KEYS, JSON.stringify(next));
  const primary = String(input.primary || "").trim().toLowerCase();
  if (primary) localStorage.setItem(PRIMARY, primary);
  else localStorage.removeItem(PRIMARY);
  return directKeysPayload();
}

/** Providers that have a key, preferred provider first. */
export function activeProviders(): ActiveProvider[] {
  const map = readMap();
  const list = DIRECT_PROVIDERS.filter((p) => !!map[p.key]).map((p) => ({ ...p, apiKey: map[p.key] }));
  const preferred = (localStorage.getItem(PRIMARY) || "").trim().toLowerCase();
  if (!preferred) return list;
  return [...list.filter((p) => p.id === preferred), ...list.filter((p) => p.id !== preferred)];
}

/** Optional per-provider model override: add a key row such as GEMINI_MODEL. */
export function modelFor(p: DirectProvider): string {
  const override = readMap()[`${p.id.toUpperCase()}_MODEL`];
  return override || p.chat;
}

export interface HttpResult {
  status: number;
  text: string;
}

function namedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

/** POST JSON. Uses the phone's native HTTP stack inside the app, fetch() elsewhere. */
export async function httpPostJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<HttpResult> {
  if (signal?.aborted) throw namedError("AbortError", "aborted");

  const plugin = (window as unknown as {
    Capacitor?: { Plugins?: { CapacitorHttp?: { request?: (o: Record<string, unknown>) => Promise<{ status: number; data: unknown }> } } };
  }).Capacitor?.Plugins?.CapacitorHttp;

  if (isNativeApp() && plugin?.request) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(namedError("TimeoutError", "timeout")), timeoutMs);
      onAbort = () => reject(namedError("AbortError", "aborted"));
      signal?.addEventListener("abort", onAbort);
    });
    try {
      const r = await Promise.race([
        plugin.request({
          url,
          method: "POST",
          headers,
          data: body,
          responseType: "text",
          connectTimeout: 30000,
          readTimeout: timeoutMs,
        }),
        guard,
      ]);
      const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? "");
      return { status: r.status, text };
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") throw e;
      throw namedError("NetworkError", (e as Error)?.message || "network error");
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) signal?.removeEventListener("abort", onAbort);
    }
  }

  // Browser fallback (works for providers that allow CORS).
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    if (signal?.aborted) throw namedError("AbortError", "aborted");
    if (ctl.signal.aborted) throw namedError("TimeoutError", "timeout");
    throw namedError("NetworkError", (e as Error)?.message || "network error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
