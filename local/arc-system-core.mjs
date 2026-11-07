import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

$os = Get-CimInstance Win32_OperatingSystem
$processors = @(Get-CimInstance Win32_Processor)
$batteries = @(Get-CimInstance Win32_Battery)
$adapters = @(Get-NetAdapter)
$firewall = @(Get-NetFirewallProfile)
$defender = Get-MpComputerStatus
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3')
$processes = @(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 12)
$bluetooth = @(Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue)

$totalKB = [double]$os.TotalVisibleMemorySize
$freeKB = [double]$os.FreePhysicalMemory
$usedKB = [Math]::Max(0, $totalKB - $freeKB)

$cpuLoads = @($processors | Where-Object { $null -ne $_.LoadPercentage } | ForEach-Object { [double]$_.LoadPercentage })
$cpuLoad = $null
if ($cpuLoads.Count -gt 0) {
  $cpuLoad = [Math]::Round(($cpuLoads | Measure-Object -Average).Average, 1)
}

$batteryData = @($batteries | ForEach-Object {
  $design = $null
  $full = $null
  $health = $null

  if ($_.PSObject.Properties['DesignCapacity']) {
    if ($_.DesignCapacity -and [double]$_.DesignCapacity -gt 0) {
      $design = [double]$_.DesignCapacity
    }
  }
  if ($_.PSObject.Properties['FullChargeCapacity']) {
    if ($_.FullChargeCapacity -and [double]$_.FullChargeCapacity -gt 0) {
      $full = [double]$_.FullChargeCapacity
    }
  }
  if ($design -and $full) {
    $health = [Math]::Round(100 * $full / $design, 1)
  }

  [PSCustomObject]@{
    name = $_.Name
    chargePercent = $_.EstimatedChargeRemaining
    statusCode = $_.BatteryStatus
    designCapacityMWh = $design
    fullChargeCapacityMWh = $full
    healthPercent = $health
  }
})

$diskData = @($disks | ForEach-Object {
  $size = [double]$_.Size
  $free = [double]$_.FreeSpace
  [PSCustomObject]@{
    drive = $_.DeviceID
    totalGB = if ($size -gt 0) { [Math]::Round($size / 1GB, 2) } else { $null }
    freeGB = [Math]::Round($free / 1GB, 2)
    usedPercent = if ($size -gt 0) { [Math]::Round(100 * ($size - $free) / $size, 1) } else { $null }
  }
})

$processData = @($processes | ForEach-Object {
  [PSCustomObject]@{
    name = $_.ProcessName
    pid = $_.Id
    memoryMB = [Math]::Round([double]$_.WorkingSet64 / 1MB, 1)
    cpuSeconds = if ($null -ne $_.CPU) { [Math]::Round([double]$_.CPU, 1) } else { $null }
    responding = if ($_.PSObject.Properties['Responding']) { $_.Responding } else { $null }
  }
})

$networkData = @($adapters | ForEach-Object {
  [PSCustomObject]@{
    name = $_.Name
    description = $_.InterfaceDescription
    status = [string]$_.Status
    linkSpeed = [string]$_.LinkSpeed
    macAddress = $_.MacAddress
  }
})

$bluetoothData = @($bluetooth | Select-Object -First 30 | ForEach-Object {
  [PSCustomObject]@{
    name = $_.FriendlyName
    status = [string]$_.Status
    class = [string]$_.Class
  }
})

$firewallData = @($firewall | ForEach-Object {
  [PSCustomObject]@{
    profile = $_.Name
    enabled = $_.Enabled
  }
})

$defenderData = $null
if ($null -ne $defender) {
  $defenderData = [PSCustomObject]@{
    available = $true
    antivirusEnabled = $defender.AntivirusEnabled
    realTimeProtectionEnabled = $defender.RealTimeProtectionEnabled
    signatureLastUpdated = if ($defender.AntivirusSignatureLastUpdated) { $defender.AntivirusSignatureLastUpdated.ToString('o') } else { $null }
  }
} else {
  $defenderData = [PSCustomObject]@{
    available = $false
    antivirusEnabled = $null
    realTimeProtectionEnabled = $null
    signatureLastUpdated = $null
  }
}

$result = [PSCustomObject]@{
  timestamp = [DateTime]::UtcNow.ToString('o')
  platform = [PSCustomObject]@{
    os = $os.Caption
    version = $os.Version
    lastBoot = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToString('o') } else { $null }
  }
  memory = [PSCustomObject]@{
    totalGB = if ($totalKB -gt 0) { [Math]::Round($totalKB / 1MB, 2) } else { $null }
    usedGB = [Math]::Round($usedKB / 1MB, 2)
    availableGB = [Math]::Round($freeKB / 1MB, 2)
    usedPercent = if ($totalKB -gt 0) { [Math]::Round(100 * $usedKB / $totalKB, 1) } else { $null }
  }
  cpu = [PSCustomObject]@{
    loadPercent = $cpuLoad
    logicalProcessors = [Environment]::ProcessorCount
    name = if ($processors.Count -gt 0) { $processors[0].Name } else { $null }
  }
  batteries = $batteryData
  storage = $diskData
  networkAdapters = $networkData
  bluetoothDevices = $bluetoothData
  security = [PSCustomObject]@{
    firewallProfiles = $firewallData
    defender = $defenderData
  }
  topMemoryProcesses = $processData
}

ConvertTo-Json -InputObject $result -Depth 8 -Compress
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
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );

  return stdout.trim();
}

function parseJsonOutput(output) {
  if (typeof output !== "string" || !output.trim()) {
    throw new Error("Windows system query returned no data.");
  }

  try {
    return JSON.parse(output);
  } catch {
    throw new Error("Windows system query returned invalid JSON.");
  }
}

/**
 * Collect a read-only snapshot from Windows.
 * No processes, services, devices, or security settings are changed.
 *
 * runCommand is injectable so the data contract can be tested without
 * querying or changing the host machine.
 */
export async function collectSystemSnapshot({
  platform = process.platform,
  runCommand = runPowerShell,
} = {}) {
  if (platform !== "win32") {
    throw new Error("ARC AI System Core currently supports Windows only.");
  }

  const output = await runCommand(POWERSHELL_SCRIPT);
  const snapshot = parseJsonOutput(output);

  if (!snapshot || typeof snapshot !== "object" || !snapshot.memory) {
    throw new Error("Windows system query returned an incomplete snapshot.");
  }

  return snapshot;
}

/**
 * Evaluate basic diagnostic signals from a snapshot.
 * These checks report observations; they never perform remediation.
 */
export function evaluateDiagnostics(snapshot) {
  const findings = [];
  const memoryPercent = snapshot?.memory?.usedPercent;
  const cpuPercent = snapshot?.cpu?.loadPercent;

  if (Number.isFinite(memoryPercent)) {
    if (memoryPercent >= 90) {
      findings.push({
        id: "memory-critical",
        severity: "critical",
        title: "Critical memory pressure",
        detail: `Memory usage is ${memoryPercent}%, at or above the 90% threshold.`,
        action: "Inspect memory consumers and confirm sustained pressure before taking action.",
      });
    } else if (memoryPercent >= 80) {
      findings.push({
        id: "memory-high",
        severity: "warning",
        title: "High memory usage",
        detail: `Memory usage is ${memoryPercent}%.`,
        action: "Review the largest memory consumers.",
      });
    }
  }

  if (Number.isFinite(cpuPercent) && cpuPercent >= 95) {
    findings.push({
      id: "cpu-high",
      severity: "warning",
      title: "Very high CPU load",
      detail: `Reported CPU load is ${cpuPercent}%. This is a point-in-time reading.`,
      action: "Collect follow-up samples before attributing a sustained problem.",
    });
  }

  for (const battery of snapshot?.batteries ?? []) {
    if (Number.isFinite(battery.chargePercent) && battery.chargePercent <= 15) {
      findings.push({
        id: "battery-low",
        severity: "warning",
        title: "Low battery charge",
        detail: `${battery.name || "Battery"} is at ${battery.chargePercent}%.`,
        action: "Connect power if available.",
      });
    }

    if (Number.isFinite(battery.healthPercent) && battery.healthPercent < 60) {
      findings.push({
        id: "battery-health-low",
        severity: "warning",
        title: "Battery capacity is substantially reduced",
        detail: `Reported battery health is ${battery.healthPercent}%.`,
        action: "Check the manufacturer's battery diagnostics before deciding on replacement.",
      });
    }
  }

  const firewallProfiles = snapshot?.security?.firewallProfiles;
  if (Array.isArray(firewallProfiles)) {
    for (const profile of firewallProfiles) {
      if (profile?.enabled === false) {
        findings.push({
          id: "firewall-disabled",
          severity: "high",
          title: "Firewall profile is disabled",
          detail: `The ${profile.profile || "unknown"} firewall profile reports disabled.`,
          action: "Verify the setting and investigate before changing firewall configuration.",
        });
      }
    }
  }

  const defender = snapshot?.security?.defender;
  if (defender?.available && defender.realTimeProtectionEnabled === false) {
    findings.push({
      id: "defender-realtime-disabled",
      severity: "high",
      title: "Real-time antivirus protection is disabled",
      detail: "Windows reports that Microsoft Defender real-time protection is off.",
      action: "Verify the security provider and investigate the cause.",
    });
  }

  for (const disk of snapshot?.storage ?? []) {
    if (Number.isFinite(disk.freeGB) && disk.freeGB < 5) {
      findings.push({
        id: `disk-low-space-${disk.drive || "unknown"}`,
        severity: "warning",
        title: "Low disk space",
        detail: `${disk.drive || "A drive"} has ${disk.freeGB} GB free.`,
        action: "Review storage usage before removing any files.",
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: "read-only",
    findings,
    summary: findings.length === 0
      ? "No configured diagnostic thresholds were triggered by this snapshot."
      : `${findings.length} diagnostic finding(s) require review.`,
  };
}

export const arcSystemCore = Object.freeze({
  name: "ARC AI System Core",
  version: "0.1.0",
  mode: "read-only",
  collectSystemSnapshot,
  evaluateDiagnostics,
});
