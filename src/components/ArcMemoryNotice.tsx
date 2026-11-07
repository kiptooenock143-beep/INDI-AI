import { useCallback, useEffect, useRef, useState } from "react";
import { speakWithProfile } from "@/lib/voiceProfiles";

type Candidate = {
  pid: number;
  name: string;
  memoryMB: number;
  protected: boolean;
  action: string;
  startTime?: string | null;
};

type ArcAlert = {
  id: string;
  level: "warning" | "critical";
  title: string;
  message: string;
  memoryPercent?: number | null;
  memoryMB?: number;
  memoryLimitMB?: number;
  processName?: string;
  kind?: string;
  status: string;
  candidateApps?: Candidate[];
};

type ArcConfig = {
  appMemoryLimitMB: number | null;
  appMemoryLimitConfigured: boolean;
  sustainedAppMemorySeconds: number;
  memoryCriticalPercent: number;
  automaticTerminationEnabled: boolean;
  automaticSystemChangesEnabled: boolean;
};

const API = "http://127.0.0.1:8787";

export default function ArcMemoryNotice() {
  const [alert, setAlert] = useState<ArcAlert | null>(null);
  const [apps, setApps] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showApps, setShowApps] = useState(false);
  const [config, setConfig] = useState<ArcConfig | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  const lastSpokenAlertId = useRef<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API}/arc/config`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not load ARC configuration.");
      }

      const nextConfig = data.config as ArcConfig;
      setConfig(nextConfig);
      setLimitInput(
        nextConfig.appMemoryLimitMB === null
          ? ""
          : String(nextConfig.appMemoryLimitMB)
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load ARC configuration."
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API}/arc/alerts`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      const pending = (data.alerts ?? []).find(
        (item: ArcAlert) => item.status === "pending"
      );
      setAlert(pending ?? null);
      if (pending && lastSpokenAlertId.current !== pending.id) {
        lastSpokenAlertId.current = pending.id;
        const isAppMemoryAlert =
          pending.kind?.startsWith("sustained-app-memory:") ?? false;

        speakWithProfile(
          isAppMemoryAlert
            ? `Per-app memory limit alert. ${pending.title}. ${pending.message}`
            : pending.level === "critical"
              ? `Critical system alert. ${pending.title}. ${pending.message}`
              : `System memory warning. ${pending.title}. ${pending.message}`
        );
      }
    } catch {
      // API may not be running yet; retry on the next poll.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function saveConfig(clear = false) {
    setConfigBusy(true);
    setMessage("");

    let value: number | null = null;

    if (!clear) {
      if (!limitInput.trim()) {
        setMessage("Enter a memory limit in MB, or choose Clear limit.");
        setConfigBusy(false);
        return;
      }

      value = Number(limitInput);
      if (!Number.isFinite(value) || value <= 0 || value > 102400) {
        setMessage("Enter a value greater than 0 and at most 102400 MB.");
        setConfigBusy(false);
        return;
      }
    }

    try {
      const response = await fetch(`${API}/arc/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appMemoryLimitMB: value }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not save ARC configuration.");
      }

      setConfig(data.config as ArcConfig);
      setLimitInput(
        data.config.appMemoryLimitMB === null
          ? ""
          : String(data.config.appMemoryLimitMB)
      );
      setMessage(
        data.config.appMemoryLimitMB === null
          ? "Per-app memory limit cleared. ARC will continue monitoring."
          : `Per-app memory limit saved: ${data.config.appMemoryLimitMB} MB. Alerts require 120 seconds above the limit.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save ARC configuration."
      );
    } finally {
      setConfigBusy(false);
    }
  }

  async function answer(decision: "review_apps" | "dismiss") {
    if (!alert) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `${API}/arc/alerts/${encodeURIComponent(alert.id)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not update ARC alert.");
      }

      if (decision === "dismiss") {
        setAlert(null);
        setShowApps(false);
      } else {
        await loadApps();
        setShowApps(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function loadApps() {
    const response = await fetch(`${API}/arc/processes`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not list apps.");
    setApps((data.processes ?? []).filter(
      (item: Candidate) => !item.protected && item.pid > 4
    ));
  }

  async function closeApp(app: Candidate) {
    const approved = window.confirm(
      `Close ${app.name} (PID ${app.pid})?\n\n` +
      "This may interrupt work. ARC will verify the process and current RAM before acting."
    );
    if (!approved) return;

    const forceApproved = window.confirm(
      `FORCE TERMINATION WARNING\n\n` +
      `${app.name} may lose unsaved work. Force termination cannot guarantee recovery.\n\n` +
      "Continue with force termination?"
    );
    if (!forceApproved) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API}/arc/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pid: app.pid,
          expectedName: app.name,
          expectedStartTime: app.startTime ?? null,
          confirmed: true,
          forceConfirmed: true,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "ARC did not terminate this process.");
      }
      setMessage(`${app.name}: ${data.message ?? "Request completed."}`);
      await loadApps();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      role="region"
      aria-label="ARC memory management"
      className="fixed bottom-5 right-5 z-[9999] w-[min(440px,calc(100vw-2rem))] rounded-xl border border-emerald-400/40 bg-[#080d0c] p-5 text-white shadow-2xl"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          INDI AI SYSTEM PROTECTION
        </span>
        {alert && (
          <span className={`rounded px-2 py-1 text-xs ${
            alert.level === "critical"
              ? "bg-red-500/20 text-red-300"
              : "bg-amber-500/20 text-amber-200"
          }`}>
            {alert.kind?.startsWith("sustained-app-memory:")
              ? `${alert.memoryMB ?? "?"} MB app`
              : alert.memoryPercent == null
                ? "RAM alert"
                : `${alert.memoryPercent}% RAM`}
          </span>
        )}
      </div>

      <section className="mb-4 rounded-lg border border-emerald-400/20 bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold text-white">
          Per-app memory limit
        </h2>
        <p className="mt-1 text-xs leading-5 text-white/60">
          Set a threshold for an individual app. ARC alerts only after usage
          stays above it for {config?.sustainedAppMemorySeconds ?? 120} seconds.
          No limit is assumed by default.
        </p>

        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveConfig(false);
          }}
        >
          <label className="min-w-0 flex-1 text-xs text-white/70">
            Memory threshold (MB)
            <input
              type="number"
              min="0.01"
              max="102400"
              step="any"
              value={limitInput}
              onChange={(event) => setLimitInput(event.target.value)}
              placeholder="Not configured"
              aria-label="Per-app memory threshold in megabytes"
              className="mt-1 w-full rounded-lg border border-white/20 bg-black px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            />
          </label>

          <button
            type="submit"
            disabled={configBusy}
            className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {configBusy ? "Saving…" : "Save limit"}
          </button>

          <button
            type="button"
            disabled={configBusy || !config?.appMemoryLimitConfigured}
            onClick={() => void saveConfig(true)}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            Clear limit
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
          <span>
            Current limit: {
              config?.appMemoryLimitConfigured
                ? `${config.appMemoryLimitMB} MB`
                : "Not configured"
            }
          </span>
          <span>Critical system RAM: {config?.memoryCriticalPercent ?? 90}%</span>
        </div>

        <p className="mt-2 text-xs text-emerald-200/80">
          Monitor and ask only. Automatic termination and automatic system
          changes are disabled.
        </p>
      </section>

      {alert && !showApps && (
        <>
          <h2 className="text-lg font-semibold">{alert.title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/75">{alert.message}</p>
          <p className="mt-2 text-xs text-white/50">
            ARC will not close anything unless you select an app and confirm.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              disabled={busy}
              onClick={() => void answer("review_apps")}
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              Yes, review apps
            </button>
            <button
              disabled={busy}
              onClick={() => void answer("dismiss")}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm disabled:opacity-50"
            >
              No, not now
            </button>
          </div>
        </>
      )}

      {showApps && (
        <>
          <h2 className="text-lg font-semibold">Apps using memory</h2>
          <p className="mt-1 text-sm text-white/65">
            Review the list. Protected processes are excluded. Nothing has been closed.
          </p>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {apps.map((app) => (
              <div
                key={`${app.pid}-${app.name}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{app.name}</div>
                  <div className="text-xs text-white/55">
                    PID {app.pid} · {app.memoryMB} MB
                  </div>
                </div>
                <button
                  disabled={busy}
                  onClick={() => void closeApp(app)}
                  className="shrink-0 rounded-md border border-red-400/50 px-3 py-1.5 text-xs text-red-200 disabled:opacity-50"
                >
                  Close…
                </button>
              </div>
            ))}
            {apps.length === 0 && (
              <p className="text-sm text-white/60">No eligible apps found.</p>
            )}
          </div>
          <button
            onClick={() => { setShowApps(false); setMessage(""); }}
            className="mt-3 rounded-lg border border-white/20 px-3 py-2 text-sm"
          >
            Back
          </button>
        </>
      )}

      {message && (
        <p className="mt-3 break-words text-sm text-emerald-200">{message}</p>
      )}
    </aside>
  );
}
