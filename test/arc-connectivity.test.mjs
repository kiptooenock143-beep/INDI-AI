import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectConnectivitySnapshot } from "../local/arc-connectivity.mjs";

function fixture(overrides = {}) {
  return {
    observedAt: "2026-10-29T09:00:00.000Z",
    wifi: {
      available: true,
      state: "connected",
      ssid: "Example-WiFi",
      interfaceName: "Wi-Fi",
    },
    savedWifiProfileNames: ["Example-WiFi", "Home-WiFi"],
    networkProfiles: [{
      name: "Example-WiFi",
      networkCategory: "Private",
      ipv4Connectivity: "Internet",
      ipv6Connectivity: "NoTraffic",
      interfaceAlias: "Wi-Fi",
    }],
    adapters: [{
      name: "Wi-Fi",
      description: "Wireless Adapter",
      status: "Up",
      linkSpeed: "433 Mbps",
      interfaceType: "Native 802.11",
    }],
    bluetooth: {
      available: true,
      devices: [{ name: "Bluetooth Device", status: "OK" }],
    },
    hotspot: {
      available: false,
      state: "unknown",
      reason: "Not exposed",
    },
    ...overrides,
  };
}

async function temporaryDirectory() {
  return fs.mkdtemp(path.join(os.tmpdir(), "arc-connectivity-test-"));
}

test("collects normalized read-only connectivity data and records a change", async () => {
  const dataDir = await temporaryDirectory();
  try {
    const snapshot = await collectConnectivitySnapshot({
      platform: "win32",
      dataDir,
      runCommand: async () => JSON.stringify(fixture()),
    });

    assert.equal(snapshot.mode, "read-only");
    assert.equal(snapshot.wifi.ssid, "Example-WiFi");
    assert.deepEqual(snapshot.savedWifiProfileNames, [
      "Example-WiFi",
      "Home-WiFi",
    ]);
    assert.equal(snapshot.connectionOrigin, "unknown");
    assert.equal(snapshot.history.recorded, true);

    const history = JSON.parse(await fs.readFile(
      path.join(dataDir, "arc-connectivity-history.json"),
      "utf8",
    ));
    assert.equal(history.length, 1);
    assert.equal(history[0].connectionOrigin, "unknown");
    assert.equal(JSON.stringify(history).includes("password"), false);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("rejects unsupported platforms without running a command", async () => {
  await assert.rejects(
    collectConnectivitySnapshot({
      platform: "linux",
      runCommand: async () => {
        throw new Error("Must not run");
      },
    }),
    /supports Windows only/,
  );
});

test("rejects empty and malformed command output", async () => {
  const dataDir = await temporaryDirectory();
  try {
    await assert.rejects(
      collectConnectivitySnapshot({
        platform: "win32",
        dataDir,
        runCommand: async () => "",
      }),
      /no data/,
    );

    await assert.rejects(
      collectConnectivitySnapshot({
        platform: "win32",
        dataDir,
        runCommand: async () => "not-json",
      }),
      /invalid JSON/,
    );
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("rejects an incomplete snapshot", async () => {
  const dataDir = await temporaryDirectory();
  try {
    await assert.rejects(
      collectConnectivitySnapshot({
        platform: "win32",
        dataDir,
        runCommand: async () => JSON.stringify({ wifi: {} }),
      }),
      /incomplete snapshot/,
    );
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("handles unavailable hardware without inventing readings", async () => {
  const dataDir = await temporaryDirectory();
  try {
    const snapshot = await collectConnectivitySnapshot({
      platform: "win32",
      dataDir,
      runCommand: async () => JSON.stringify(fixture({
        wifi: {
          available: false,
          state: "unknown",
          ssid: null,
          interfaceName: null,
        },
        savedWifiProfileNames: [],
        adapters: [],
        networkProfiles: [],
        bluetooth: { available: false, devices: [] },
        hotspot: {
          available: false,
          state: "unknown",
          reason: "Not exposed",
        },
      })),
    });

    assert.equal(snapshot.wifi.state, "unknown");
    assert.equal(snapshot.wifi.ssid, null);
    assert.equal(snapshot.bluetooth.available, false);
    assert.deepEqual(snapshot.bluetooth.devices, []);
    assert.equal(snapshot.hotspot.state, "unknown");
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("propagates command failures and timeouts safely", async () => {
  const dataDir = await temporaryDirectory();
  try {
    await assert.rejects(
      collectConnectivitySnapshot({
        platform: "win32",
        dataDir,
        runCommand: async () => {
          const error = new Error("command timed out");
          error.code = "ETIMEDOUT";
          throw error;
        },
      }),
      /timed out/,
    );
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("normalizes malformed optional fields and bounds list sizes", async () => {
  const dataDir = await temporaryDirectory();
  try {
    const snapshot = await collectConnectivitySnapshot({
      platform: "win32",
      dataDir,
      runCommand: async () => JSON.stringify(fixture({
        wifi: { available: true, state: "unexpected", ssid: 42, interfaceName: {} },
        savedWifiProfileNames: Array.from({ length: 150 }, (_, i) => `WiFi-${i}`),
        adapters: "malformed",
        networkProfiles: [null, { name: 42 }],
        bluetooth: { available: false, devices: "malformed" },
      })),
    });

    assert.equal(snapshot.wifi.state, "unknown");
    assert.equal(snapshot.wifi.ssid, null);
    assert.equal(snapshot.wifi.interfaceName, null);
    assert.equal(snapshot.savedWifiProfileNames.length, 100);
    assert.deepEqual(snapshot.adapters, []);
    assert.equal(snapshot.networkProfiles.length, 1);
    assert.deepEqual(snapshot.bluetooth.devices, []);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("does not add duplicate history entries when connectivity is unchanged", async () => {
  const dataDir = await temporaryDirectory();
  try {
    const runCommand = async () => JSON.stringify(fixture());
    const first = await collectConnectivitySnapshot({
      platform: "win32", dataDir, runCommand,
    });
    const second = await collectConnectivitySnapshot({
      platform: "win32", dataDir, runCommand,
    });

    assert.equal(first.history.recorded, true);
    assert.equal(second.history.recorded, false);

    const history = JSON.parse(await fs.readFile(
      path.join(dataDir, "arc-connectivity-history.json"),
      "utf8",
    ));
    assert.equal(history.length, 1);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("bounds persisted history to the configured maximum", async () => {
  const dataDir = await temporaryDirectory();
  try {
    for (let i = 0; i < 205; i += 1) {
      const observedAt = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
      await collectConnectivitySnapshot({
        platform: "win32",
        dataDir,
        runCommand: async () => JSON.stringify(fixture({
          observedAt,
          wifi: {
            available: true,
            state: "connected",
            ssid: `Network-${i}`,
            interfaceName: "Wi-Fi",
          },
        })),
      });
    }

    const history = JSON.parse(await fs.readFile(
      path.join(dataDir, "arc-connectivity-history.json"),
      "utf8",
    ));
    assert.equal(history.length, 200);
    assert.equal(history.at(-1).wifi.ssid, "Network-204");
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
