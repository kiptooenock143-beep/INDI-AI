import { randomUUID } from "node:crypto";
import { arcSystemCore } from "./arc-system-core.mjs";

const POLICIES = Object.freeze({
  memoryWarningPercent: 80,
  memoryCriticalPercent: 90,
  sustainedAppMemorySeconds: 120,
  askBeforeForceClose: true,
  protectSystemProcesses: true,
  protectSecurityProcesses: true,
  protectEssentialProcesses: true,
  automaticTerminationEnabled: false,
  automaticSystemChangesEnabled: false,
  sampleIntervalMs: 15000,
  maxHistoryEntries: 240,
  maxPendingAlerts: 50,
});

const PROTECTED_PROCESS = /^(system|registry|smss|csrss|wininit|services|lsass|winlogon|svchost|fontdrvhost|dwm|memory compression|secure system|idle|system interrupts|msmpeng|nissrv|securityhealthservice|securityhealthsystray|mssense|sense|explorer|electron|exile|arc)$/i;

function numericValue(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readMemoryPercent(snapshot) {
  const memory = snapshot?.memory ?? snapshot?.ram ?? {};
  const directValues = [
    memory.usagePercent,
    memory.usedPercent,
    memory.percentUsed,
    snapshot?.memoryUsagePercent,
    snapshot?.ramUsagePercent,
  ];

  for (const value of directValues) {
    const number = numericValue(value);
    if (number !== null) {
      return number >= 0 && number <= 100 ? number : null;
    }
  }

  // Keep units paired: GB with GB, bytes with bytes.
  const capacityPairs = [
    [memory.totalGB, memory.usedGB, memory.availableGB],
    [memory.totalBytes, memory.usedBytes, memory.availableBytes],
  ];

  for (const [rawTotal, rawUsed, rawAvailable] of capacityPairs) {
    const total = numericValue(rawTotal);
    const used = numericValue(rawUsed);
    const available = numericValue(rawAvailable);

    if (total === null || total <= 0) continue;

    if (used !== null) {
      if (used < 0 || used > total) return null;
      return (used / total) * 100;
    }

    if (available !== null) {
      if (available < 0 || available > total) return null;
      return ((total - available) / total) * 100;
    }
  }

  return null;
}

function readProcesses(snapshot) {
  const candidates = [
    snapshot?.processes,
    snapshot?.topProcesses,
    snapshot?.topMemoryProcesses,
    snapshot?.memory?.topProcesses,
    snapshot?.processesByMemory,
  ];
  return candidates.find(Array.isArray) ?? [];
}

function processName(process) {
  return String(process?.name ?? process?.processName ?? process?.Name ?? "Unknown");
}

function processMemoryMB(process) {
  const raw =
    process?.workingSetMB ??
    process?.memoryMB ??
    process?.memoryUsageMB ??
    process?.WorkingSetMB;

  if (raw === null || raw === undefined ||
      (typeof raw === "string" && raw.trim() === "")) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function isProtectedProcess(process) {
  const name = processName(process).trim();
  return PROTECTED_PROCESS.test(name) ||
    /defender|antimalware|antivirus|endpoint security|exile|indi ai|indi-ai|arc-autonomy/i.test(name);
}

export class ArcAutonomyEngine {
  constructor({
    core = arcSystemCore,
    intervalMs = POLICIES.sampleIntervalMs,
    now = () => new Date(),
  } = {}) {
    this.core = core;
    this.intervalMs = intervalMs;
    this.now = now;
    this.timer = null;
    this.sampling = false;
    this.samplePromise = null;
    this.latestSnapshot = null;
    this.history = [];
    this.alerts = [];
    this.highMemoryEpisode = false;
    this.lastError = null;
    this.appMemorySince = new Map();
    this.appMemoryLimitMB = null;
  }

  setAppMemoryLimitMB(value) {
    if (value === null || value === undefined || value === "") {
      this.appMemoryLimitMB = null;
      this.appMemorySince.clear();
      return { ok: true, appMemoryLimitMB: null };
    }

    const limit = Number(value);
    if (!Number.isFinite(limit) || limit <= 0 || limit > 102400) {
      return {
        ok: false,
        error: "The per-app memory limit must be greater than 0 and at most 102400 MB.",
      };
    }

    this.appMemoryLimitMB = Math.round(limit * 100) / 100;
    this.appMemorySince.clear();
    return { ok: true, appMemoryLimitMB: this.appMemoryLimitMB };
  }

  getStatus() {
    return {
      name: "ARC AI Autonomy Engine",
      mode: "monitor-and-ask",
      running: Boolean(this.timer),
      sampling: this.sampling,
      policies: { ...POLICIES },
      appMemoryLimitMB: this.appMemoryLimitMB,
      appMemoryLimitConfigured: this.appMemoryLimitMB !== null,
      latestSampleAt: this.latestSnapshot?.timestamp ?? null,
      historyEntries: this.history.length,
      pendingAlerts: this.alerts.filter((item) => item.status === "pending").length,
      lastError: this.lastError,
      automaticTerminationEnabled: false,
      automaticSystemChangesEnabled: false,
    };
  }

  getHistory() {
    return this.history.map((entry) => ({ ...entry }));
  }

  getAlerts() {
    return this.alerts.map((alert) => ({
      ...alert,
      candidateApps: alert.candidateApps?.map((app) => ({ ...app })) ?? [],
    }));
  }

  start() {
    if (this.timer) return this.getStatus();

    // Run once immediately, then sample periodically.
    void this.sampleNow().catch(() => {});
    this.timer = setInterval(() => {
      void this.sampleNow().catch(() => {});
    }, this.intervalMs);

    this.timer.unref?.();
    return this.getStatus();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return this.getStatus();
  }

  async sampleNow() {
    if (this.samplePromise) return this.samplePromise;

    const operation = this.collectSample();
    this.samplePromise = operation;

    try {
      return await operation;
    } finally {
      if (this.samplePromise === operation) {
        this.samplePromise = null;
      }
    }
  }

  async collectSample() {
    this.sampling = true;
    try {
      const snapshot = await this.core.collectSystemSnapshot();
      const sampledAt = snapshot?.timestamp ?? this.now().toISOString();
      const memoryPercent = readMemoryPercent(snapshot);

      this.latestSnapshot = snapshot;
      this.lastError = null;

      const sample = {
        sampledAt,
        memoryPercent,
        cpuPercent: Number.isFinite(Number(snapshot?.cpu?.loadPercent))
          ? Number(snapshot.cpu.loadPercent)
          : Number.isFinite(Number(snapshot?.cpuLoadPercent))
            ? Number(snapshot.cpuLoadPercent)
            : null,
        batteryPercent: (() => {
          const batteries = Array.isArray(snapshot?.batteries) ? snapshot.batteries : [];
          const charge = snapshot?.battery?.chargePercent ?? batteries.find((item) => Number.isFinite(Number(item?.chargePercent)))?.chargePercent;
          return charge !== undefined && charge !== null && Number.isFinite(Number(charge)) ? Number(charge) : null;
        })(),
      };

      this.history.push(sample);
      if (this.history.length > POLICIES.maxHistoryEntries) {
        this.history.splice(0, this.history.length - POLICIES.maxHistoryEntries);
      }

      this.evaluateMemoryPressure(snapshot, memoryPercent, sampledAt);
      this.evaluateSustainedAppMemory(snapshot, sampledAt);

      return snapshot;
    } catch (error) {
      this.lastError = String(error?.message ?? "System sampling failed");
      throw error;
    } finally {
      this.sampling = false;
    }
  }

  evaluateMemoryPressure(snapshot, memoryPercent, sampledAt) {
    if (memoryPercent === null || memoryPercent < 0 || memoryPercent > 100) return;

    if (memoryPercent < POLICIES.memoryWarningPercent - 5) {
      this.highMemoryEpisode = false;
      return;
    }

    if (memoryPercent >= POLICIES.memoryCriticalPercent) {
      if (!this.highMemoryEpisode) {
        this.createAlert({
          level: "critical",
          kind: "high-system-memory",
          title: "System memory is critically high",
          message: `RAM usage is ${memoryPercent.toFixed(1)}%. Would you like to review apps you could close?`,
          sampledAt,
          memoryPercent: Number(memoryPercent.toFixed(1)),
          candidateApps: this.getEligibleApps(snapshot),
          choices: ["review_apps", "dismiss"],
        });
      }
      this.highMemoryEpisode = true;
      return;
    }

    if (memoryPercent >= POLICIES.memoryWarningPercent && !this.highMemoryEpisode) {
      this.createAlert({
        level: "warning",
        kind: "high-system-memory",
        title: "System memory usage is high",
        message: `RAM usage is ${memoryPercent.toFixed(1)}%. Would you like to review the apps using the most memory?`,
        sampledAt,
        memoryPercent: Number(memoryPercent.toFixed(1)),
        candidateApps: this.getEligibleApps(snapshot),
        choices: ["review_apps", "dismiss"],
      });
      this.highMemoryEpisode = true;
    }
  }

  evaluateSustainedAppMemory(snapshot, sampledAt) {
    const candidates = [
      snapshot?.processes,
      snapshot?.topProcesses,
      snapshot?.topMemoryProcesses,
      snapshot?.memory?.topProcesses,
      snapshot?.processesByMemory,
    ];

    // Missing process telemetry is not evidence that an app disappeared.
    // Fail closed by resetting timers rather than generating alerts.
    if (!candidates.some(Array.isArray)) {
      this.appMemorySince.clear();
      return;
    }

    const processes = readProcesses(snapshot);
    const timestamp = Date.parse(sampledAt);

    if (!Number.isFinite(timestamp)) {
      this.appMemorySince.clear();
      return;
    }

    const activeKeys = new Set(
      processes.map((process) => {
        const pid = process?.pid ?? process?.processId ?? process?.ProcessId ?? "";
        return `${processName(process)}:${pid}`;
      })
    );

    for (const key of this.appMemorySince.keys()) {
      if (!activeKeys.has(key)) this.appMemorySince.delete(key);
    }

    // An unset limit means monitor-only. Do not invent a threshold.
    if (this.appMemoryLimitMB === null) {
      this.appMemorySince.clear();
      return;
    }

    for (const process of processes) {
      const name = processName(process).trim();
      const pid = process?.pid ?? process?.processId ?? process?.ProcessId;

      if (!pid) continue;

      const key = `${name}:${pid}`;

      if (isProtectedProcess(process)) {
        this.appMemorySince.delete(key);
        continue;
      }

      const memoryMB = processMemoryMB(process);

      // Missing/invalid readings or usage at/below the limit break continuity.
      if (memoryMB === null || memoryMB <= this.appMemoryLimitMB) {
        this.appMemorySince.delete(key);
        continue;
      }

      let state = this.appMemorySince.get(key);

      if (!state || timestamp < Date.parse(state.firstSeenAt)) {
        state = {
          firstSeenAt: sampledAt,
          lastSeenAt: sampledAt,
          memoryMB,
          alerted: false,
        };
        this.appMemorySince.set(key, state);
        continue;
      }

      const lastSeenAt = Date.parse(state.lastSeenAt);

      // A telemetry gap must not count as continuous high memory usage.
      if (
        !Number.isFinite(lastSeenAt) ||
        timestamp < lastSeenAt ||
        timestamp - lastSeenAt > POLICIES.sampleIntervalMs * 2
      ) {
        this.appMemorySince.set(key, {
          firstSeenAt: sampledAt,
          lastSeenAt: sampledAt,
          memoryMB,
          alerted: false,
        });
        continue;
      }

      state.lastSeenAt = sampledAt;
      state.memoryMB = memoryMB;

      const firstSeenAt = Date.parse(state.firstSeenAt);
      if (!Number.isFinite(firstSeenAt)) {
        state.firstSeenAt = sampledAt;
        state.alerted = false;
        continue;
      }

      const sustainedMs = timestamp - firstSeenAt;
      if (sustainedMs < POLICIES.sustainedAppMemorySeconds * 1000 ||
          state.alerted) {
        continue;
      }

      this.createAlert({
        level: "warning",
        kind: `sustained-app-memory:${pid}`,
        title: "An app has exceeded its memory limit",
        message:
          `${name} (PID ${pid}) has used ${memoryMB.toFixed(1)} MB, ` +
          `above your ${this.appMemoryLimitMB} MB limit for at least ` +
          `${POLICIES.sustainedAppMemorySeconds} seconds. Review the app before taking action.`,
        sampledAt,
        processId: pid,
        processName: name,
        memoryMB: Number(memoryMB.toFixed(1)),
        memoryLimitMB: this.appMemoryLimitMB,
        sustainedSeconds: Math.floor(sustainedMs / 1000),
        candidateApps: [{
          pid,
          name,
          memoryMB: Number(memoryMB.toFixed(1)),
          protected: false,
          action: "user-review-required",
        }],
        choices: ["review_apps", "dismiss"],
      });

      // Avoid repeating the alert every sample for the same sustained episode.
      state.alerted = true;
    }
  }

  getEligibleApps(snapshot = this.latestSnapshot) {
    return readProcesses(snapshot)
      .filter((process) => !isProtectedProcess(process))
      .map((process) => ({
        pid: process.pid ?? process.processId ?? process.ProcessId ?? null,
        name: processName(process),
        memoryMB: processMemoryMB(process),
        protected: false,
        action: "user-review-required",
      }))
      .filter((process) => process.pid !== null)
      .sort((a, b) => (b.memoryMB ?? -1) - (a.memoryMB ?? -1))
      .slice(0, 12);
  }

  createAlert(details) {
    const pending = this.alerts.filter((item) => item.status === "pending");
    if (pending.some((item) => item.kind === details.kind)) return null;

    const alert = {
      id: randomUUID(),
      createdAt: this.now().toISOString(),
      status: "pending",
      decision: null,
      ...details,
    };

    this.alerts.push(alert);
    if (this.alerts.length > POLICIES.maxPendingAlerts) {
      const removableIndex = this.alerts.findIndex((item) => item.status !== "pending");
      if (removableIndex >= 0) this.alerts.splice(removableIndex, 1);
    }
    return alert;
  }

  decideAlert(id, decision) {
    const alert = this.alerts.find((item) => item.id === id);
    if (!alert) return { ok: false, error: "Alert not found." };
    if (alert.status !== "pending") {
      return { ok: false, error: "This alert has already been answered." };
    }

    if (!["review_apps", "dismiss"].includes(decision)) {
      return { ok: false, error: "Choose review_apps or dismiss." };
    }

    alert.status = decision === "dismiss" ? "dismissed" : "review_requested";
    alert.decision = decision;
    alert.decidedAt = this.now().toISOString();

    if (decision === "review_apps") {
      alert.candidateApps = this.getEligibleApps();
      alert.message = "Choose which apps to review. ARC has not closed or suspended anything.";
    }

    return {
      ok: true,
      alert: {
        ...alert,
        candidateApps: alert.candidateApps?.map((app) => ({ ...app })) ?? [],
      },
      actionTaken: "none",
      automaticTerminationEnabled: false,
    };
  }
}

export const arcAutonomyEngine = new ArcAutonomyEngine();
export { POLICIES as ARC_AUTONOMY_POLICIES };
