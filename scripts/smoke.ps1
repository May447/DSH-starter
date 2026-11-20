# Unattended smoke run without the pwsh pipeline hang.
#
# Why this exists: piping the app's stdout into `Select-String` makes the shell
# wait for every inherited handle to close. A Windows `conhost.exe` or crashpad
# child can outlive the app by a moment and keep that pipe open, so the command
# looks hung even though the app already exited. This launches the app detached,
# polls for the screenshot, then reaps anything left behind.

param(
  [string]$Out = '.dev-shots/smoke',
  [int]$Delay = 1500,
  # Test dir for settings/theme state. Empty = <temp>\DSH-starter-smoke (ASCII-safe).
  [string]$UserData = '',
  # Launch dsh before capturing. Off = capture the idle stage (empty-state check).
  [switch]$NoAutostart,
  # Click a `[data-action]` control first, e.g. 'settings' or 'log'.
  [string]$Ui = '',
  # Packaged exe to test instead of the dev electron binary.
  [string]$Exe = '',
  # Also grab the composited window (native min/max/close included).
  [switch]$WindowCapture
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($UserData -eq '') { $UserData = Join-Path ([System.IO.Path]::GetTempPath()) 'DSH-starter-smoke' }
if ($Exe -ne '') {
  $exe = $Exe
  $appArg = @()
} else {
  $exe = Join-Path $root 'node_modules\electron\dist\electron.exe'
  $appArg = @('.')
}
$png = Join-Path $root "$Out.png"
$txt = Join-Path $root "$Out.txt"
$log = Join-Path $root "$Out.log"

Remove-Item $png, $txt, $log -Force -ErrorAction SilentlyContinue

$appArgs = $appArg + @('--no-sandbox')
if (-not $NoAutostart) { $appArgs += '--autostart' }
if ($Ui -ne '') { $appArgs += @('--ui', $Ui) }
$appArgs += @('--capture', $png, '--dump-dom', $txt, '--capture-delay', "$Delay")
$winPng = ''
if ($WindowCapture) {
  $winPng = Join-Path $root "$Out-window.png"
  Remove-Item $winPng -Force -ErrorAction SilentlyContinue
  $appArgs += @('--capture-window', $winPng)
}

$env:DSH_STARTER_USER_DATA = $UserData
$proc = Start-Process -FilePath $exe `
  -ArgumentList $appArgs `
  -WorkingDirectory $root -PassThru `
  -RedirectStandardOutput $log -RedirectStandardError "$Out.err.log"

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if ((Test-Path $png) -and (Test-Path $txt)) { break }
  if ($proc.HasExited) { break }
  Start-Sleep -Milliseconds 500
}

# Give the app a moment to shut its child tree down, then reap what is left.
$reap = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $reap) {
  if ($proc.HasExited) { break }
  Start-Sleep -Milliseconds 500
}
if (-not $proc.HasExited) {
  Write-Host 'smoke: app did not exit, terminating'
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

$orphans = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'bin\.js" "web" "--no-open"' }
if ($orphans) {
  Write-Host "smoke: killing $($orphans.Count) orphan(s)"
  $orphans | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} else {
  Write-Host 'smoke: no dsh orphans'
}

if (Test-Path $png) {
  $size = (Get-Item $png).Length
  Write-Host "smoke: ok  png=$([math]::Round($size / 1KB, 0))KB  exit=$($proc.ExitCode)"
} else {
  Write-Host 'smoke: FAILED — no screenshot produced'
  if (Test-Path $log) { Get-Content $log -Tail 20 }
  exit 1
}
if (Test-Path $txt) { Write-Host "smoke: dom=$txt" }
