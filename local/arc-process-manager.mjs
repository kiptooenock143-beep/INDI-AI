import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PROTECTED_NAMES = new Set([
  "system", "registry", "smss", "csrss", "wininit",
  "services", "lsass", "winlogon", "svchost",
  "fontdrvhost", "dwm", "memory compression",
  "secure system", "idle", "system interrupts",
  "msmpeng", "nissrv", "securityhealthservice",
  "securityhealthsystray", "mssense", "sense",
  "explorer", "electron", "exile", "indi ai", "indi-ai", "arc",
]);

const PROTECTED_PATH_PARTS = [
  "\\windows\\system32\\",
  "\\windows\\syswow64\\",
  "\\windows\\winsxs\\",
];

function powershellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function runPowerShell(script) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", script,
    ],
    {
      windowsHide: true,
      timeout: 12000,
      maxBuffer: 1024 * 1024,
    }
  );
  return stdout.trim();
}

function isProtected(process) {
  const name = String(process.name ?? "").trim().toLowerCase();
  const path = String(process.path ?? "").toLowerCase();

  return (
    Number(process.pid) <= 4 ||
    PROTECTED_NAMES.has(name) ||
    /defender|antimalware|antivirus|endpoint security|exile-ai|indi ai|indi-ai|arc-ai/i.test(name) ||
    PROTECTED_PATH_PARTS.some((part) => path.includes(part))
  );
}

function safeProcessView(process) {
  return {
    pid: Number(process.pid),
    name: String(process.name ?? "Unknown"),
    memoryMB: Math.round(Number(process.memoryBytes ?? 0) / 1024 / 1024 * 10) / 10,
    protected: isProtected(process),
    startTime: process.startTime ?? null,
    action: isProtected(process) ? "protected" : "review-required",
  };
}

export async function listEligibleProcesses() {
  if (process.platform !== "win32") {
    throw new Error("ARC process management currently supports Windows only.");
  }

  const script = `
    $items = @(Get-Process -ErrorAction Stop | ForEach-Object {
      $p = $_
      $path = $null
      try { $path = $p.Path } catch {}
      [pscustomobject]@{
        pid = $p.Id
        name = $p.ProcessName
        path = $path
        memoryBytes = $p.WorkingSet64
        startTime = $(try { $p.StartTime.ToUniversalTime().ToString("o") } catch { $null })
      }
    })
    ConvertTo-Json -InputObject $items -Depth 4 -Compress
  `;

  const output = await runPowerShell(script);
  const parsed = JSON.parse(output || "[]");
  const processes = Array.isArray(parsed) ? parsed : [parsed];

  return processes
    .map(safeProcessView)
    .sort((a, b) => b.memoryMB - a.memoryMB)
    .slice(0, 100);
}

/**
 * This function only runs after an explicit user confirmation.
 * It rechecks the PID, process name, start time, and protection policy
 * inside the same PowerShell script before stopping the process.
 *
 * Force termination may lose unsaved work. The caller must require a
 * separate forceConfirmed=true acknowledgement before invoking this.
 */
export async function terminateSelectedProcess({
  pid,
  expectedName,
  expectedStartTime,
  confirmed = false,
  forceConfirmed = false,
} = {}) {
  if (process.platform !== "win32") {
    return { ok: false, error: "Windows process management only." };
  }

  const targetPid = Number(pid);
  if (!Number.isSafeInteger(targetPid) || targetPid <= 4) {
    return { ok: false, error: "Invalid or protected process ID." };
  }

  if (!confirmed) {
    return { ok: false, error: "Explicit user confirmation is required." };
  }

  if (!forceConfirmed) {
    return {
      ok: false,
      requiresForceConfirmation: true,
      error: "Force termination can discard unsaved work. Confirm this risk separately.",
    };
  }

  if (typeof expectedName !== "string" || !expectedName.trim()) {
    return { ok: false, error: "Expected process name is required." };
  }

  if (
    typeof expectedStartTime !== "string" ||
    !expectedStartTime.trim() ||
    !Number.isFinite(Date.parse(expectedStartTime))
  ) {
    return {
      ok: false,
      error: "Verified process start time is required. Refresh the app list and try again.",
    };
  }

  const script = `
    $targetId = ${targetPid}
    $expectedName = ${powershellQuote(expectedName)}
    $expectedStartTime = ${powershellQuote(expectedStartTime ?? "")}
    $p = Get-Process -Id $targetId -ErrorAction SilentlyContinue

    if ($null -eq $p) {
      [pscustomobject]@{ ok = $false; error = "Process no longer exists." } |
        ConvertTo-Json -Compress
      exit 0
    }

    $path = $null
    $startTime = $null
    try { $path = $p.Path } catch {}
    try { $startTime = $p.StartTime.ToUniversalTime().ToString("o") } catch {}

    $protectedNames = @(
      "system","registry","smss","csrss","wininit","services","lsass",
      "winlogon","svchost","fontdrvhost","dwm","memory compression",
      "secure system","idle","system interrupts","msmpeng","nissrv",
      "securityhealthservice","securityhealthsystray","mssense","sense",
      "explorer","electron","exile","indi ai","indi-ai","arc"
    )

    $name = $p.ProcessName
    $lowerName = $name.ToLowerInvariant()
    $lowerPath = [string]$path
    $isProtected = (
      $targetId -le 4 -or
      $protectedNames -contains $lowerName -or
      $lowerName -match "defender|antimalware|antivirus|endpoint security|exile-ai|indi ai|indi-ai|arc-ai" -or
      $lowerPath.ToLowerInvariant().Contains("\\windows\\system32\\") -or
      $lowerPath.ToLowerInvariant().Contains("\\windows\\syswow64\\") -or
      $lowerPath.ToLowerInvariant().Contains("\\windows\\winsxs\\")
    )

    if ($isProtected) {
      [pscustomobject]@{ ok = $false; error = "Protected process; termination refused." } |
        ConvertTo-Json -Compress
      exit 0
    }

    if ($name -ne $expectedName) {
      [pscustomobject]@{ ok = $false; error = "Process name changed; refresh the app list." } |
        ConvertTo-Json -Compress
      exit 0
    }

    if (-not $expectedStartTime) {
      [pscustomobject]@{ ok = $false; error = "Verified process start time is required; refresh the app list." } |
        ConvertTo-Json -Compress
      exit 0
    }

    if (-not $startTime) {
      [pscustomobject]@{ ok = $false; error = "Windows could not verify process identity; termination refused." } |
        ConvertTo-Json -Compress
      exit 0
    }

    if ($startTime -ne $expectedStartTime) {
      [pscustomobject]@{ ok = $false; error = "Process identity changed; refresh the app list." } |
        ConvertTo-Json -Compress
      exit 0
    }

    # Prefer a normal window-close request before using force.
    if ($p.MainWindowHandle -ne 0) {
      try {
        $closeRequested = $p.CloseMainWindow()
        if ($closeRequested) {
          Start-Sleep -Seconds 3
          $stillRunning = Get-Process -Id $targetId -ErrorAction SilentlyContinue
          if ($null -eq $stillRunning) {
            [pscustomobject]@{
              ok = $true
              pid = $targetId
              name = $name
              method = "graceful-close"
              message = "Application closed normally."
            } | ConvertTo-Json -Compress
            exit 0
          }
        }
      } catch {
        # If graceful close is unsupported, continue only because
        # the caller separately confirmed the force-termination risk.
      }
    }

    try {
      Stop-Process -Id $targetId -Force -ErrorAction Stop
      [pscustomobject]@{
        ok = $true
        pid = $targetId
        name = $name
        method = "force-termination"
        message = "Force-termination command sent after confirmation."
      } | ConvertTo-Json -Compress
    } catch {
      [pscustomobject]@{
        ok = $false
        error = "Windows refused to terminate this process."
      } | ConvertTo-Json -Compress
    }
  `;

  try {
    const output = await runPowerShell(script);
    const result = JSON.parse(output);

    return {
      ...result,
      ...(result.ok
        ? { warning: "Force termination can discard unsaved work." }
        : {}),
    };
  } catch {
    return {
      ok: false,
      error: "Could not safely complete the termination request.",
    };
  }
}
