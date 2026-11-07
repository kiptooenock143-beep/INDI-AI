import test from "node:test";
import assert from "node:assert/strict";
import { ArcAutonomyEngine } from "../local/arc-autonomy-engine.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeSnapshot(overrides = {}) {
  return {
    timestamp: "2026-10-18T07:00:00.000Z",
    memory: {
      totalGB: 8,
      usedGB: 4,
      availableGB: 4,
      usedPercent: 50,
    },
    cpu: { loadPercent: 20 },
    batteries: [{ chargePercent: 80 }],
    topMemoryProcesses: [],
    ...overrides,
  };
}

test("concurrent sampleNow calls share one collection operation", async () => {
  const gate = deferred();
  let collectionCalls = 0;
  const snapshot = makeSnapshot();

  const engine = new ArcAutonomyEngine({
    core: {
      collectSystemSnapshot: async () => {
        collectionCalls += 1;
        return gate.promise;
      },
    },
  });

  const first = engine.sampleNow();
  const second = engine.sampleNow();

  assert.equal(collectionCalls, 1);
  assert.equal(engine.getStatus().sampling, true);

  gate.resolve(snapshot);

  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.strictEqual(firstResult, snapshot);
  assert.strictEqual(secondResult, snapshot);
  assert.equal(collectionCalls, 1);
  assert.equal(engine.getHistory().length, 1);
  assert.equal(engine.getStatus().sampling, false);
});

test("sampling records the latest snapshot and telemetry history", async () => {
  const snapshot = makeSnapshot();
  const engine = new ArcAutonomyEngine({
    core: { collectSystemSnapshot: async () => snapshot },
  });

  const result = await engine.sampleNow();

  assert.strictEqual(result, snapshot);
  assert.strictEqual(engine.latestSnapshot, snapshot);
  assert.equal(engine.getHistory().length, 1);
  assert.equal(engine.getHistory()[0].memoryPercent, 50);
  assert.equal(engine.getHistory()[0].cpuPercent, 20);
  assert.equal(engine.getHistory()[0].batteryPercent, 80);
  assert.equal(engine.getStatus().lastError, null);
});

test("a failed collection records the error and permits a later retry", async () => {
  let calls = 0;
  const snapshot = makeSnapshot();

  const engine = new ArcAutonomyEngine({
    core: {
      collectSystemSnapshot: async () => {
        calls += 1;
        if (calls === 1) throw new Error("test collector failure");
        return snapshot;
      },
    },
  });

  await assert.rejects(engine.sampleNow(), /test collector failure/);
  assert.match(engine.getStatus().lastError, /test collector failure/);
  assert.equal(engine.getStatus().sampling, false);

  const result = await engine.sampleNow();

  assert.strictEqual(result, snapshot);
  assert.equal(calls, 2);
  assert.equal(engine.getStatus().lastError, null);
});

test("process eligibility reads the collector's topMemoryProcesses field", async () => {
  const engine = new ArcAutonomyEngine({
    core: {
      collectSystemSnapshot: async () => makeSnapshot({
        memory: {
          totalGB: 8,
          usedGB: 7.5,
          availableGB: 0.5,
          usedPercent: 95,
        },
        topMemoryProcesses: [
          { name: "example-app.exe", pid: 1234, WorkingSetMB: 700 },
        ],
      }),
    },
  });

  await engine.sampleNow();

  assert.equal(typeof engine.getEligibleApps, "function");
  const eligible = engine.getEligibleApps();
  assert.ok(eligible.some((app) =>
    (app.name ?? app.processName) === "example-app.exe"
  ));
});


test("regression: telemetry gap resets sustained memory tracking", async () => {
  const snapshots = [
    makeSnapshot({
      timestamp: "2026-10-18T07:00:00.000Z",
      topMemoryProcesses: [{ name: "ordinary-app.exe", pid: 4242, WorkingSetMB: 600 }],
    }),
    makeSnapshot({
      timestamp: "2026-10-18T07:00:15.000Z",
      topMemoryProcesses: [{ name: "ordinary-app.exe", pid: 4242, WorkingSetMB: 600 }],
    }),
    makeSnapshot({
      timestamp: "2026-10-18T07:01:00.000Z",
      topMemoryProcesses: [{ name: "ordinary-app.exe", pid: 4242, WorkingSetMB: 600 }],
    }),
    makeSnapshot({
      timestamp: "2026-10-18T07:02:00.000Z",
      topMemoryProcesses: [{ name: "ordinary-app.exe", pid: 4242, WorkingSetMB: 600 }],
    }),
  ];

  const engine = new ArcAutonomyEngine({
    core: { collectSystemSnapshot: async () => snapshots.shift() },
  });
  engine.setAppMemoryLimitMB(500);

  await engine.sampleNow();
  await engine.sampleNow();
  await engine.sampleNow();

  assert.equal(
    engine.getAlerts().filter((alert) => alert.kind === "sustained-app-memory:4242").length,
    0,
    "a telemetry gap must restart the 120-second timer",
  );

  await engine.sampleNow();

  assert.equal(
    engine.getAlerts().filter((alert) => alert.kind === "sustained-app-memory:4242").length,
    0,
    "60 seconds after the reset must not trigger a 120-second alert",
  );
});

test("regression: consecutive high-memory samples preserve continuity", async () => {
  const engine = new ArcAutonomyEngine({ intervalMs: 15_000 });
  engine.appMemoryLimitMB = 500;

  const timestamps = Array.from(
    { length: 9 },
    (_, index) => new Date(Date.parse("2026-10-18T07:00:00.000Z") + index * 15_000)
      .toISOString()
  );

  for (const timestamp of timestamps) {
    const snapshot = makeSnapshot({
      timestamp,
      topMemoryProcesses: [
        { pid: 4243, name: "ordinary-app.exe", memoryMB: 600 }
      ]
    });

    engine.evaluateSustainedAppMemory(snapshot, timestamp);
  }

  const alerts = engine.alerts.filter(
    (alert) => alert.kind === "sustained-app-memory:4243"
  );

  assert.equal(alerts.length, 1);
});

test("regression: out-of-order timestamps cannot trigger a sustained-memory alert", async () => {
  const timestamps = [
    "2026-10-18T07:00:00.000Z",
    "2026-10-18T07:00:15.000Z",
    "2026-10-18T07:00:10.000Z",
  ];

  const snapshots = timestamps.map((timestamp) =>
    makeSnapshot({
      timestamp,
      topMemoryProcesses: [{ name: "ordinary-app.exe", pid: 4244, WorkingSetMB: 600 }],
    })
  );

  const engine = new ArcAutonomyEngine({
    core: { collectSystemSnapshot: async () => snapshots.shift() },
  });
  engine.setAppMemoryLimitMB(500);

  for (let i = 0; i < 3; i += 1) await engine.sampleNow();

  assert.equal(
    engine.getAlerts().filter((alert) => alert.kind === "sustained-app-memory:4244").length,
    0,
  );
});

test("regression: protected processes never receive sustained-memory alerts", async () => {
  const timestamps = [
    "2026-10-18T07:00:00.000Z",
    "2026-10-18T07:00:15.000Z",
    "2026-10-18T07:01:00.000Z",
    "2026-10-18T07:02:00.000Z",
  ];

  const snapshots = timestamps.map((timestamp) =>
    makeSnapshot({
      timestamp,
      topMemoryProcesses: [{ name: "MsMpEng.exe", pid: 4245, WorkingSetMB: 900 }],
    })
  );

  const engine = new ArcAutonomyEngine({
    core: { collectSystemSnapshot: async () => snapshots.shift() },
  });
  engine.setAppMemoryLimitMB(500);

  for (let i = 0; i < 4; i += 1) await engine.sampleNow();

  assert.equal(
    engine.getAlerts().filter((alert) => alert.kind === "sustained-app-memory:4245").length,
    0,
  );
});

test("safety policy remains monitor-and-ask with automatic actions disabled", () => {
  const engine = new ArcAutonomyEngine();
  const status = engine.getStatus();

  assert.equal(status.mode, "monitor-and-ask");
  assert.equal(status.automaticTerminationEnabled, false);
  assert.equal(status.automaticSystemChangesEnabled, false);
  assert.equal(status.policies.memoryCriticalPercent, 90);
  assert.equal(status.policies.sustainedAppMemorySeconds, 120);
  assert.equal(status.policies.askBeforeForceClose, true);
  assert.equal(status.policies.sampleIntervalMs, 15000);
});
