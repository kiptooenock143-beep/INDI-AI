import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);
const MAX_HISTORY_ENTRIES = 200;
const MAX_PROFILES = 100;
const MAX_ADAPTERS = 100;
const MAX_BLUETOOTH_DEVICES = 50;
const HISTORY_FILE = "arc-connectivity-history.json";

const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

$wifiText = (& netsh.exe wlan show interfaces 2>$null | Out-String)
$profileText = (& netsh.exe wlan show profiles 2>$null | Out-String)

$ssid = $null
$wifiName = $null
$wifiState = 'unknown'
$wifiAvailable = $false

if ($wifiText -match '(?im)^\s*SSID\s*:\s*(.+?)\s*$') {
  $ssid = $Matches[1].Trim()
}
if ($wifiText -match '(?im)^\s*Name\s*:\s*(.+?)\s*$') {
  $wifiName = $Matches[1].Trim()
}
if ($wifiText -match '(?im)^\s*State\s*:\s*(.+?)\s*$') {
  $wifiAvailable = $true
  $stateText = $Matches[1].Trim()
  if ($stateText -match '^(connected|connecté|conectado|verbunden)$') {
    $wifiState = 'connected'
  } elseif ($stateText -match '^(disconnected|déconnecté|desconectado|getrennt)$') {
    $wifiState = 'disconnected'
  }
}

$profiles = @()
foreach ($line in ($profileText -split '\r?\n')) {
  if ($line -match '^\s*All User Profile\s*:\s*(.+?)\s*$') {
    $profiles += $Matches[1].Trim()
  }
}
$profiles = @($profiles | Where-Object { $_ } | Select-Object -Unique -First 100)

$adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue |
  Select-Object -First 100 |
  ForEach-Object {
    [PSCustomObject]@{
      name = [string]$_.Name
      description = [string]$_.InterfaceDescription
      status = [string]$_.Status
      linkSpeed = [string]$_.LinkSpeed
      interfaceType = [string]$_.NdisPhysicalMedium
    }
  })

$networkProfiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue |
  Select-Object -First 100 |
  ForEach-Object {
    [PSCustomObject]@{
      name = [string]$_.Name
      networkCategory = [string]$_.NetworkCategory
      ipv4Connectivity = [string]$_.IPv4Connectivity
      ipv6Connectivity = [string]$_.IPv6Connectivity
      interfaceAlias = [string]$_.InterfaceAlias
    }
  })

$bluetoothCommandAvailable = $false
$bluetoothDevices = @()
try {
  $bluetoothDevices = @(Get-PnpDevice -Class Bluetooth -ErrorAction Stop |
    Select-Object -First 50 |
    ForEach-Object {
      [PSCustomObject]@{
        name = [string]$_.FriendlyName
        status = [string]$_.Status
      }
    })
  $bluetoothCommandAvailable = $true
} catch {
  $bluetoothCommandAvailable = $false
}

$result = [PSCustomObject]@{
  observedAt = [DateTime]::UtcNow.ToString('o')
  wifi = [PSCustomObject]@{
    available = $wifiAvailable
    state = $wifiState
    ssid = $ssid
    interfaceName = $wifiName
  }
  savedWifiProfileNames = $profiles
  networkProfiles = $networkProfiles
  adapters = $adapters
  bluetooth = [PSCustomObject]@{
    available = $bluetoothCommandAvailable
    devices = $bluetoothDevices
  }
  hotspot = [PSCustomObject]@{
    available = $false
    state = 'unknown'
    reason = 'A reliable hotspot-state source is not configured.'
  }
}

ConvertTo-Json -InputObject $result -Depth 6 -Compress
`;

async function runPowerShell(script = POWERSHELL_SCRIPT) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "RemoteSigned",
      "-Command",
      script,
    ],
    {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 512 * 1024,
    },
  );

  return stdout.trim();
}

function cleanString(value, maxLength = 256) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanList(value, mapper, limit) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map(mapper).filter(Boolean);
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Connectivity query returned an invalid object.");
  }

  const wifi = raw.wifi;
  const bluetooth = raw.bluetooth;
  if (!wifi || typeof wifi !== "object" ||
      !bluetooth || typeof bluetooth !== "object") {
    throw new Error("Connectivity query returned an incomplete snapshot.");
  }

  const wifiState = ["connected", "disconnected", "unknown"].includes(wifi.state)
    ? wifi.state
    : "unknown";

  const adapters = cleanList(raw.adapters, (item) => {
    if (!item || typeof item !== "object") return null;
    return {
      name: cleanString(item.name),
      description: cleanString(item.description),
      status: cleanString(item.status, 80),
      linkSpeed: cleanString(item.linkSpeed, 80),
      interfaceType: cleanString(item.interfaceType, 80),
    };
  }, MAX_ADAPTERS);

  const networkProfiles = cleanList(raw.networkProfiles, (item) => {
    if (!item || typeof item !== "object") return null;
    return {
      name: cleanString(item.name),
      networkCategory: cleanString(item.networkCategory, 80),
      ipv4Connectivity: cleanString(item.ipv4Connectivity, 80),
      ipv6Connectivity: cleanString(item.ipv6Connectivity, 80),
      interfaceAlias: cleanString(item.interfaceAlias),
    };
  }, MAX_ADAPTERS);

  const bluetoothDevices = cleanList(bluetooth.devices, (item) => {
    if (!item || typeof item !== "object") return null;
    return {
      name: cleanString(item.name),
      status: cleanString(item.status, 80),
    };
  }, MAX_BLUETOOTH_DEVICES);

  const profiles = cleanList(raw.savedWifiProfileNames,
    (item) => cleanString(item), MAX_PROFILES);

  return {
    observedAt: cleanString(raw.observedAt, 64) ?? new Date().toISOString(),
    mode: "read-only",
    wifi: {
      available: wifi.available === true,
      state: wifiState,
      ssid: cleanString(wifi.ssid),
      interfaceName: cleanString(wifi.interfaceName),
    },
    savedWifiProfileNames: profiles,
    networkProfiles,
    adapters,
    bluetooth: {
      available: bluetooth.available === true,
      devices: bluetoothDevices,
    },
    hotspot: {
      available: raw.hotspot?.available === true,
      state: raw.hotspot?.available === true &&
        ["on", "off"].includes(raw.hotspot?.state)
        ? raw.hotspot.state
        : "unknown",
      reason: cleanString(raw.hotspot?.reason, 240),
    },
    connectionOrigin: "unknown",
  };
}

async function readHistory(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_HISTORY_ENTRIES);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

function stateForComparison(snapshot) {
  return JSON.stringify({
    wifi: snapshot.wifi,
    savedWifiProfileNames: snapshot.savedWifiProfileNames,
    networkProfiles: snapshot.networkProfiles,
    adapters: snapshot.adapters,
    bluetooth: snapshot.bluetooth,
    hotspot: snapshot.hotspot,
  });
}

async function appendHistory(snapshot, dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const filePath = path.join(dataDir, HISTORY_FILE);
  const history = await readHistory(filePath);
  const fingerprint = stateForComparison(snapshot);
  const previous = history.at(-1);

  if (previous?.fingerprint === fingerprint) {
    return { recorded: false, entries: history.length };
  }

  const entry = {
    timestamp: snapshot.observedAt,
    connectionOrigin: "unknown",
    fingerprint,
    wifi: snapshot.wifi,
    networkProfiles: snapshot.networkProfiles,
    adapters: snapshot.adapters,
    bluetooth: snapshot.bluetooth,
    hotspot: snapshot.hotspot,
  };

  const bounded = [...history, entry].slice(-MAX_HISTORY_ENTRIES);
  const temporaryPath = path.join(
    dataDir,
    `.arc-connectivity-history-${crypto.randomUUID()}.tmp`,
  );

  try {
    await fs.writeFile(temporaryPath, JSON.stringify(bounded), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }

  return { recorded: true, entries: bounded.length };
}

/**
 * Read-only connectivity collection. Inject runCommand and dataDir in tests.
 * This module never connects to networks or changes device/system settings.
 */
export async function collectConnectivitySnapshot({
  platform = process.platform,
  runCommand = runPowerShell,
  dataDir = path.join(os.homedir(), ".exile-ai"),
} = {}) {
  if (platform !== "win32") {
    throw new Error("ARC connectivity monitoring currently supports Windows only.");
  }

  const output = await runCommand(POWERSHELL_SCRIPT);
  if (typeof output !== "string" || !output.trim()) {
    throw new Error("Connectivity query returned no data.");
  }

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Connectivity query returned invalid JSON.");
  }

  const snapshot = normalizeSnapshot(parsed);
  const history = await appendHistory(snapshot, dataDir);

  return {
    ...snapshot,
    history: {
      recorded: history.recorded,
      entries: history.entries,
      maxEntries: MAX_HISTORY_ENTRIES,
    },
  };
}

export const arcConnectivity = Object.freeze({
  name: "ARC Connectivity",
  version: "0.1.0",
  mode: "read-only",
  collectConnectivitySnapshot,
});
