# publish-callback.ps1 -- upload the hosted Meta sign-in return page to Cloudflare R2 (#391)
#
# Facebook Login for Business enforces https on every redirect URI once the app
# is Live ("Enforce HTTPS" is locked on), so Corva's return address cannot be
# localhost. This page lives at https://engine.flowve.app/auth/meta/callback,
# receives the sign-in result from facebook.com and hands it to the app's local
# callback server (src/main/oauth/meta.js). That URL is registered on the Meta
# dashboard and baked into every installed copy -- never move or rename the key.
#
# Prereqs: same as publish-update.ps1 (rclone with [r2] remote).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\publish-callback.ps1
#
# NOTE: ASCII only in this file -- PowerShell 5.1 parses .ps1 as ANSI.

param(
    [string]$Source    = (Join-Path $PSScriptRoot "hosted\meta-callback.html"),
    [string]$Bucket    = "clipflow-engine",
    [string]$Key       = "auth/meta/callback",
    [string]$PublicUrl = "https://engine.flowve.app"
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
if (-not (Test-Path $Source)) { throw "Return page not found: $Source" }

Write-Host "Uploading $Source -> r2:$Bucket/$Key"
& $rclone copyto $Source "r2:$Bucket/$Key" `
    --header-upload "Content-Type: text/html; charset=utf-8" `
    --header-upload "Cache-Control: no-cache"
if ($LASTEXITCODE -ne 0) { throw "rclone failed uploading the return page" }

# --- verify: it must come back as HTML, or the browser downloads it instead of running it ---
$resp = Invoke-WebRequest -Uri "$PublicUrl/$Key" -Method Head -UseBasicParsing
$type = "$($resp.Headers['Content-Type'])"
Write-Host "Live: $PublicUrl/$Key ($($resp.StatusCode), $type)"
if ($type -notlike "text/html*") {
    throw "Served as '$type', not text/html -- fix the object's content type before registering the URL with Meta"
}
