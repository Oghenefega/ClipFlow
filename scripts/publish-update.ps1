# publish-update.ps1 -- upload the auto-update feed to Cloudflare R2 (#250)
#
# Uploads the three files electron-updater needs from the newest build in dist\:
#   the channel manifest (alpha.yml while versions are 0.3.0-alpha.N -- becomes
#   latest.yml if the prerelease tag ever comes off), the installer exe, and
#   its .blockmap
# to r2:clipflow-engine/updates/ (served at https://engine.flowve.app/updates/).
#
# Run AFTER `npm run build`. Repeatable: re-uploads overwrite in place, and
# the manifest is what flips installed apps to the new version -- it goes last
# so a half-finished upload can never advertise an installer that isn't there.
#
# Prereqs: same as publish-runtime.ps1 (rclone with [r2] remote, session 168+1).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\publish-update.ps1
#
# NOTE: ASCII only in this file -- PowerShell 5.1 parses .ps1 as ANSI.

param(
    [string]$DistDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "dist"),
    [string]$Bucket  = "clipflow-engine",
    [string]$Prefix  = "updates",
    [string]$CredsFile = "C:\Users\IAmAbsolute\.claude\r2_credentials.txt"
)

$ErrorActionPreference = "Stop"

function Find-Rclone {
    $cmd = Get-Command rclone -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $winget = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\rclone.exe"
    if (Test-Path $winget) { return $winget }
    throw "rclone not found (PATH or WinGet Links). Install: winget install Rclone.Rclone"
}

$rclone = Find-Rclone

# --- public URL from creds file (display only) ---
if (-not (Test-Path $CredsFile)) { throw "Credentials file not found: $CredsFile" }
$publicUrl = (Get-Content $CredsFile | Where-Object { $_ -match "^public_url=" } | Select-Object -First 1) -replace "^public_url=", ""
$publicUrl = $publicUrl.Trim().TrimEnd("/")

# --- find the channel manifest the build wrote ---
# Prerelease versions (0.3.0-alpha.N) get a channel file named alpha.yml;
# a stable version would get latest.yml. Prefer whichever is newest.
$manifest = Get-ChildItem $DistDir -Filter "*.yml" |
    Where-Object { $_.Name -in @("alpha.yml", "beta.yml", "latest.yml") } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $manifest) { throw "No channel manifest (alpha.yml/latest.yml) in $DistDir -- run 'npm run build' first (publish block must be in package.json)." }
$manifestPath = $manifest.FullName
$manifestName = $manifest.Name

$pathLine = (Get-Content $manifestPath | Where-Object { $_ -match "^path: " } | Select-Object -First 1) -replace "^path: ", ""
$exeName = $pathLine.Trim()
if (-not $exeName) { throw "Could not read 'path:' from $manifestPath" }

$exePath = Join-Path $DistDir $exeName
$mapPath = "$exePath.blockmap"
if (-not (Test-Path $exePath)) { throw "Installer named by latest.yml not found: $exePath" }
if (-not (Test-Path $mapPath)) { throw "Blockmap not found: $mapPath" }

$exeMB = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
Write-Host "Feed manifest: $manifestName"
Write-Host "Feed version : $exeName ($exeMB MB)"
Write-Host "Destination  : r2:$Bucket/$Prefix/"

# --- upload: payload first, manifest last ---
& $rclone copyto $exePath "r2:$Bucket/$Prefix/$exeName" --progress
if ($LASTEXITCODE -ne 0) { throw "rclone failed uploading installer" }
& $rclone copyto $mapPath "r2:$Bucket/$Prefix/$exeName.blockmap"
if ($LASTEXITCODE -ne 0) { throw "rclone failed uploading blockmap" }
& $rclone copyto $manifestPath "r2:$Bucket/$Prefix/$manifestName"
if ($LASTEXITCODE -ne 0) { throw "rclone failed uploading $manifestName" }

Write-Host ""
Write-Host "Done. Installed apps will see this version on next launch."
if ($publicUrl) { Write-Host "Feed: $publicUrl/$Prefix/$manifestName" }
