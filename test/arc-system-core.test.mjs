import test from "node:test";
import assert from "node:assert/strict";
import {
  collectSystemSnapshot,
  evaluateDiagnostics,
} from "../local/arc-system-core.mjs";

const fixture = {
  timestamp: "2026-10-17T18:00:00.000Z",
  platform: { os: "Microsoft Windows 11 Pro", version: "10.0" },
  memory: {
    totalGB: 8,
    usedGB: 7.3,
    availableGB: 0.7,
    usedPercent: 91.2,
  },
  cpu: { loadPercent: 97, logicalProcessors: 8, name: "Test CPU" },
  batteries: [{
    name: "Primary",
    chargePercent: 12,
    designCapacityMWh: null,
    fullChargeCapacityMWh: null,
    healthPercent: null,
  }],
  storage: [{ drive: "C:", totalGB: 100, freeGB: 3, usedPercent: 97 }],
  networkAdapters: [],
  bluetoothDevices: [],
  security: {
    firewallProfiles: [{ profile: "Public", enabled: false }],
    defender: {
      available: true,
      antivirusEnabled: true,
      realTimeProtectionEnabled: false,
      signatureLastUpdated: null,
    },
  },
  topMemoryProcesses: [],
};

test("collects and parses a Windows snapshot through an injected reader", async () => {
  let called = false;

  const snapshot = await collectSystemSnapshot({
    platform: "win32",
    runCommand: async () => {
      called = true;
      return JSON.stringify(fixture);
    },
  });

  assert.equal(called, true);
  assert.equal(snapshot.memory.usedPercent, 91.2);
  assert.equal(snapshot.batteries[0].healthPercent, null);
});

test("refuses to query Windows on other platforms", async () => {
  await assert.rejects(
    collectSystemSnapshot({
      platform: "linux",
      runCommand: async () => {
        throw new Error("Should not be called");
      },
    }),
    /supports Windows only/,
  );
});

test("reports diagnostic findings without executing remediation", () => {
  const result = evaluateDiagnostics(fixture);
  const ids = result.findings.map((finding) => finding.id);

  assert.equal(result.mode, "read-only");
  assert.ok(ids.includes("memory-critical"));
  assert.ok(ids.includes("cpu-high"));
  assert.ok(ids.includes("battery-low"));
  assert.ok(ids.includes("disk-low-space-C:"));
  assert.ok(ids.includes("firewall-disabled"));
  assert.ok(ids.includes("defender-realtime-disabled"));
});

test("does not invent battery health when capacity data is missing", () => {
  const result = evaluateDiagnostics({
    memory: { usedPercent: 40 },
    cpu: { loadPercent: 20 },
    batteries: [{
      name: "Primary",
      chargePercent: 93,
      designCapacityMWh: null,
      fullChargeCapacityMWh: null,
      healthPercent: null,
    }],
    storage: [],
    security: { firewallProfiles: [], defender: { available: false } },
  });

  assert.equal(result.findings.some((item) => item.id === "battery-health-low"), false);
  assert.equal(result.findings.length, 0);
});

test("rejects malformed snapshot output", async () => {
  await assert.rejects(
    collectSystemSnapshot({
      platform: "win32",
      runCommand: async () => "not-json",
    }),
    /invalid JSON/,
  );
});
