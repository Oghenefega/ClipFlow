# publish-runtime.ps1 -- upload AI engine runtime packages + combined manifest to Cloudflare R2 (#146 session 2)
#
# Repeatable: zips already on R2 with matching size are skipped; the manifest is
# rebuilt and re-uploaded every run (it is tiny and this keeps it authoritative).
#
# #357: also publishes the word-timing voter models packaged by build-models.ps1
# (vendor\runtime-dist\manifest-models.json) to r2:<bucket>/models/ and lists
# them as "models" in the combined manifest. No manifest-models.json = no models.
#
# Prereqs (one-time, done session 168+1):
#   - rclone installed (winget) with an [r2] remote in %APPDATA%\rclone\rclone.conf
#   - credentials file at C:\Users\IAmAbsolute\.claude\r2_credentials.txt (public_url line used here)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\publish-runtime.ps1
#   ... -DeepVerify    also re-downloads the CPU zip from the public URL and checks its SHA-256
#
# NOTE: ASCII only in this file -- PowerShell 5.1 parses .ps1 as ANSI (session-1 lesson).

param(
    [string]$DistDir  = (Join-Path (Split-Path $PSScriptRoot -Parent) "vendor\runtime-dist"),
    [string]$Bucket   = "clipflow-engine",
    [string]$Prefix   = "engine",
    [string]$CredsFile = "C:\Users\IAmAbsolute\.claude\r2_credentials.txt",
    [switch]$DeepVerify
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

# --- public URL from creds file ---
if (-not (Test-Path $CredsFile)) { throw "Credentials file not found: $CredsFile" }
$publicUrl = (Get-Content $CredsFile | Where-Object { $_ -match "^public_url=" } | Select-Object -First 1) -replace "^public_url=", ""
$publicUrl = $publicUrl.Trim().TrimEnd("/")
if (-not $publicUrl) { throw "No public_url= line in $CredsFile" }

# --- read per-variant manifests written by build-runtime.ps1 ---
$variants = @{}
$version = $null
foreach ($v in @("cuda", "cpu")) {
    $mPath = Join-Path $DistDir "manifest-$v.json"
    if (-not (Test-Path $mPath)) { throw "Missing $mPath -- run build-runtime.ps1 first" }
    $m = Get-Content $mPath -Raw | ConvertFrom-Json
    if ($null -eq $version) { $version = $m.version }
    if ($m.version -ne $version) { throw "Variant manifests disagree on version ($version vs $($m.version))" }

    $zipPath = Join-Path $DistDir $m.file
    if (-not (Test-Path $zipPath)) { throw "Missing zip: $zipPath" }
    $actualSize = (Get-Item $zipPath).Length
    if ($actualSize -ne [int64]$m.sizeBytes) { throw "$($m.file): on-disk size $actualSize != manifest sizeBytes $($m.sizeBytes)" }

    # unpacked size from the zip central directory (setup screen disk preflight needs it)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try { $unpacked = ($zip.Entries | Measure-Object -Property Length -Sum).Sum } finally { $zip.Dispose() }

    $variants[$v] = [ordered]@{
        file          = $m.file
        url           = "$publicUrl/$Prefix/v$version/$($m.file)"
        sha256        = $m.sha256
        sizeBytes     = [int64]$m.sizeBytes
        unpackedBytes = [int64]$unpacked
        python        = $m.python
    }
}

# --- word-timing voter models (#357) ---
$models = @()
$modelsPath = Join-Path $DistDir "manifest-models.json"
if (Test-Path $modelsPath) {
    foreach ($m in (Get-Content $modelsPath -Raw | ConvertFrom-Json)) {
        $zipPath = Join-Path $DistDir $m.file
        if (-not (Test-Path $zipPath)) { throw "Missing model zip: $zipPath -- run build-models.ps1" }
        $actualSize = (Get-Item $zipPath).Length
        if ($actualSize -ne [int64]$m.sizeBytes) { throw "$($m.file): on-disk size $actualSize != manifest sizeBytes $($m.sizeBytes)" }
        $models += [ordered]@{
            id            = $m.id
            file          = $m.file
            url           = "$publicUrl/models/$($m.file)"
            sha256        = $m.sha256
            sizeBytes     = [int64]$m.sizeBytes
            unpackedBytes = [int64]$m.unpackedBytes
        }
    }
    Write-Host "[OK] $($models.Count) timing model(s) from $modelsPath"
} else {
    Write-Warning "no manifest-models.json in $DistDir -- publishing without timing models"
}

# --- build combined manifest ---
$manifest = [ordered]@{
    name        = "clipflow-runtime"
    version     = $version
    publishedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz")
    variants    = [ordered]@{ cuda = $variants["cuda"]; cpu = $variants["cpu"] }
    models      = @($models)
}
$manifestPath = Join-Path $DistDir "manifest.json"
$json = $manifest | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))  # no BOM -- Node JSON.parse rejects BOM
Write-Host "[OK] combined manifest built: $manifestPath"

# --- upload zips (skip when remote size already matches) ---
$remoteDir = "r2:$Bucket/$Prefix/v$version"
$remoteListRaw = & $rclone lsjson $remoteDir 2>$null
$remoteBySize = @{}
if ($LASTEXITCODE -eq 0 -and $remoteListRaw) {
    foreach ($e in ($remoteListRaw | ConvertFrom-Json)) { $remoteBySize[$e.Name] = [int64]$e.Size }
}
foreach ($v in @("cuda", "cpu")) {
    $f = $variants[$v].file
    if ($remoteBySize.ContainsKey($f) -and $remoteBySize[$f] -eq $variants[$v].sizeBytes) {
        Write-Host "[SKIP] $f already on R2 with matching size"
        continue
    }
    Write-Host "[UPLOAD] $f ..."
    & $rclone copyto (Join-Path $DistDir $f) "$remoteDir/$f" --s3-chunk-size 64M --s3-upload-concurrency 4 --stats 60s --stats-one-line -v
    if ($LASTEXITCODE -ne 0) { throw "rclone upload failed for $f" }
}

# --- upload model zips (same size-skip) ---
if ($models.Count -gt 0) {
    $modelsRemote = "r2:$Bucket/models"
    $remoteModelsRaw = & $rclone lsjson $modelsRemote 2>$null
    $remoteModelsBySize = @{}
    if ($LASTEXITCODE -eq 0 -and $remoteModelsRaw) {
        foreach ($e in ($remoteModelsRaw | ConvertFrom-Json)) { $remoteModelsBySize[$e.Name] = [int64]$e.Size }
    }
    foreach ($m in $models) {
        if ($remoteModelsBySize.ContainsKey($m.file) -and $remoteModelsBySize[$m.file] -eq $m.sizeBytes) {
            Write-Host "[SKIP] $($m.file) already on R2 with matching size"
            continue
        }
        Write-Host "[UPLOAD] $($m.file) ..."
        & $rclone copyto (Join-Path $DistDir $m.file) "$modelsRemote/$($m.file)" --s3-chunk-size 64M --s3-upload-concurrency 4 --stats 60s --stats-one-line -v
        if ($LASTEXITCODE -ne 0) { throw "rclone upload failed for $($m.file)" }
    }
}

# --- upload manifest (always) ---
& $rclone copyto $manifestPath "r2:$Bucket/$Prefix/manifest.json"
if ($LASTEXITCODE -ne 0) { throw "rclone upload failed for manifest.json" }
Write-Host "[OK] manifest uploaded"

# --- verify over the public URL ---
$manifestUrl = "$publicUrl/$Prefix/manifest.json"
$hosted = (Invoke-WebRequest -UseBasicParsing -Uri $manifestUrl).Content
if (($hosted | ConvertFrom-Json).version -ne $version) { throw "Hosted manifest version mismatch at $manifestUrl" }
Write-Host "[OK] hosted manifest readable: $manifestUrl"

foreach ($v in @("cuda", "cpu")) {
    $u = $variants[$v].url
    $head = Invoke-WebRequest -UseBasicParsing -Uri $u -Method Head
    $len = [int64]$head.Headers["Content-Length"]
    if ($len -ne $variants[$v].sizeBytes) { throw "$v HEAD Content-Length $len != $($variants[$v].sizeBytes) at $u" }
    # Range support is required for download resume in the app
    $req = [System.Net.HttpWebRequest]::Create($u)
    $req.AddRange(0, 1023)
    $resp = $req.GetResponse()
    $status = [int]$resp.StatusCode
    $resp.Close()
    if ($status -ne 206) { throw "$v Range request returned $status (want 206 Partial Content) at $u" }
    Write-Host "[OK] $v size + Range verified: $u"
}

foreach ($m in $models) {
    $head = Invoke-WebRequest -UseBasicParsing -Uri $m.url -Method Head
    $len = [int64]$head.Headers["Content-Length"]
    if ($len -ne $m.sizeBytes) { throw "$($m.id) HEAD Content-Length $len != $($m.sizeBytes) at $($m.url)" }
    Write-Host "[OK] model $($m.id) size verified: $($m.url)"
}

if ($DeepVerify) {
    $cpuUrl = $variants["cpu"].url
    $tmp = Join-Path $env:TEMP "clipflow-deepverify-cpu.zip"
    Write-Host "[DEEP] re-downloading CPU zip from public URL..."
    Invoke-WebRequest -UseBasicParsing -Uri $cpuUrl -OutFile $tmp
    $hash = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
    Remove-Item $tmp -Force
    if ($hash -ne $variants["cpu"].sha256.ToLower()) { throw "DeepVerify FAILED: hosted CPU zip sha256 $hash != $($variants['cpu'].sha256)" }
    Write-Host "[OK] DeepVerify: hosted CPU zip sha256 matches"
}

Write-Host ""
Write-Host "=== PUBLISHED ==="
Write-Host "manifest: $manifestUrl"
foreach ($v in @("cuda", "cpu")) { Write-Host ("{0,-5} : {1}" -f $v, $variants[$v].url) }
foreach ($m in $models) { Write-Host ("{0,-8} : {1}" -f $m.id, $m.url) }
