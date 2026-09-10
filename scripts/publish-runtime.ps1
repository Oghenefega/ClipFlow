# publish-runtime.ps1 -- upload AI engine runtime packages + combined manifest to Cloudflare R2 (#146 session 2)
#
# Repeatable: zips already on R2 with matching CONTENT are skipped; the manifest is
# rebuilt and re-uploaded every run (it is tiny and this keeps it authoritative).
#
# #403: "matching content" used to mean "matching size", which shipped a broken
# setup. build-models.ps1 rebuilds every zip on every run, and a rebuild of the
# same model differs only in a zip timestamp field -- same size, different
# sha256. The size check skipped the upload, so R2 kept the OLD object while the
# manifest advertised the NEW hash, and every customer's subtitle-timing step
# failed its checksum. Content is now compared by multipart ETag, and model zips
# are published under content-addressed names so a rebuild can never reuse an
# old object's key (nor be served stale from Cloudflare's edge cache).
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

# --- #403: exact "are the right bytes already up there?" check ---------------
# rclone uploads multipart with --s3-chunk-size 64M, and R2 forms a multipart
# object's ETag as md5(concatenated per-part md5s) + "-<partcount>". Recomputing
# that locally answers the question exactly, for free, with no download.
$ChunkBytes = 64MB

function Get-LocalMultipartETag([string]$Path) {
    $md5 = [System.Security.Cryptography.MD5]::Create()
    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $parts = [int][math]::Ceiling($fs.Length / $ChunkBytes)
        if ($parts -le 1) {
            return ([BitConverter]::ToString($md5.ComputeHash($fs)) -replace "-", "").ToLower()
        }
        $buf = New-Object byte[] ([int]$ChunkBytes)
        $concat = New-Object System.IO.MemoryStream
        for ($i = 0; $i -lt $parts; $i++) {
            $read = 0
            while ($read -lt $ChunkBytes) {
                $n = $fs.Read($buf, $read, [int]($ChunkBytes - $read))
                if ($n -le 0) { break }
                $read += $n
            }
            $d = $md5.ComputeHash($buf, 0, $read)
            $concat.Write($d, 0, $d.Length)
        }
        $concat.Position = 0
        $tag = ([BitConverter]::ToString($md5.ComputeHash($concat)) -replace "-", "").ToLower()
        return "$tag-$parts"
    } finally {
        $fs.Dispose()
        $md5.Dispose()
    }
}

# The cache-buster matters: an object under Cloudflare's max cacheable size can
# answer a HEAD from the edge carrying the PREVIOUS object's ETag -- the exact
# stale answer this check exists to catch. A unique query string forces origin.
function Get-RemoteETag([string]$Url) {
    try {
        $u = $Url + "?etagcheck=" + [guid]::NewGuid().ToString("N")
        $head = Invoke-WebRequest -UseBasicParsing -Uri $u -Method Head -ErrorAction Stop
        $tag = $head.Headers["ETag"]
        if ($tag) { return $tag.Trim('"').ToLower() }
    } catch { }
    return $null
}

# #361: true once a 1 KB Range request answers 206. Retries across a short
# pause because a cache MISS at the edge answers 200 for a while after upload.
function Test-RangeSupport([string]$u, [int]$Attempts = 3, [int]$PauseSec = 15) {
    for ($i = 1; $i -le $Attempts; $i++) {
        $req = [System.Net.HttpWebRequest]::Create($u)
        $req.AddRange(0, 1023)
        $resp = $req.GetResponse()
        $status = [int]$resp.StatusCode
        $resp.Close()
        if ($status -eq 206) { return $true }
        if ($i -lt $Attempts) {
            Write-Host "[WAIT] Range request returned $status (attempt $i/$Attempts), retrying in ${PauseSec}s..."
            Start-Sleep -Seconds $PauseSec
        }
    }
    return $false
}

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
$modelLocal = @{}   # #403: id -> local zip path (the published name no longer matches it)
$modelsPath = Join-Path $DistDir "manifest-models.json"
if (Test-Path $modelsPath) {
    foreach ($m in (Get-Content $modelsPath -Raw | ConvertFrom-Json)) {
        $zipPath = Join-Path $DistDir $m.file
        if (-not (Test-Path $zipPath)) { throw "Missing model zip: $zipPath -- run build-models.ps1" }
        $actualSize = (Get-Item $zipPath).Length
        if ($actualSize -ne [int64]$m.sizeBytes) { throw "$($m.file): on-disk size $actualSize != manifest sizeBytes $($m.sizeBytes)" }
        # #403: the PUBLISHED name carries the content hash. Two consequences,
        # both load-bearing: a rebuilt model can never be mistaken for the old
        # object under the same key, and a brand-new key is never already in
        # Cloudflare's edge cache (there is no purge token on this machine, so a
        # same-name re-upload of a sub-512MB zip could serve stale for hours).
        $sha8 = $m.sha256.Substring(0, 8)
        $remoteName = [System.IO.Path]::GetFileNameWithoutExtension($m.file) + "-$sha8" + [System.IO.Path]::GetExtension($m.file)
        $modelLocal[$m.id] = $zipPath
        $models += [ordered]@{
            id            = $m.id
            file          = $remoteName
            url           = "$publicUrl/models/$remoteName"
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

# --- upload zips (skip only when the remote CONTENT already matches, #403) ---
$remoteDir = "r2:$Bucket/$Prefix/v$version"
foreach ($v in @("cuda", "cpu")) {
    $f = $variants[$v].file
    $localZip = Join-Path $DistDir $f
    $wantTag = Get-LocalMultipartETag $localZip
    if ((Get-RemoteETag $variants[$v].url) -eq $wantTag) {
        Write-Host "[SKIP] $f already on R2 with matching content"
        continue
    }
    Write-Host "[UPLOAD] $f ..."
    & $rclone copyto $localZip "$remoteDir/$f" --s3-chunk-size 64M --s3-upload-concurrency 4 --stats 60s --stats-one-line -v
    if ($LASTEXITCODE -ne 0) { throw "rclone upload failed for $f" }
}

# --- upload model zips (same content-skip, #403) ---
if ($models.Count -gt 0) {
    $modelsRemote = "r2:$Bucket/models"
    foreach ($m in $models) {
        $localZip = $modelLocal[$m.id]
        $wantTag = Get-LocalMultipartETag $localZip
        if ((Get-RemoteETag $m.url) -eq $wantTag) {
            Write-Host "[SKIP] $($m.file) already on R2 with matching content"
            continue
        }
        Write-Host "[UPLOAD] $($m.file) ..."
        & $rclone copyto $localZip "$modelsRemote/$($m.file)" --s3-chunk-size 64M --s3-upload-concurrency 4 --stats 60s --stats-one-line -v
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
    # #403: size was never proof. Prove the hosted bytes are the bytes whose
    # sha256 this run just wrote into the manifest.
    $wantTag = Get-LocalMultipartETag (Join-Path $DistDir $variants[$v].file)
    $gotTag = Get-RemoteETag $u
    if ($gotTag -ne $wantTag) { throw "$v hosted content does not match the manifest sha256 (etag $gotTag != $wantTag) at $u" }
    # Range support is required for download resume in the app. #361: a freshly
    # uploaded object can answer a Range request with 200 + full body while the
    # Cloudflare cache is still MISS (Accept-Ranges advertised, 206 only once the
    # object is cached). That is a cache-warmth artefact, not a broken upload --
    # everything above is already published -- so retry a few times and warn
    # instead of throwing. The app restarts a resume that gets a 200 from zero
    # (setup-runtime.js), which is correct, just slower.
    if (Test-RangeSupport $u) {
        Write-Host "[OK] $v size + Range verified: $u"
    } else {
        Write-Warning "$v Range request still answers 200 (cache MISS) at $u -- resume will restart from zero until the edge caches it. Re-check later: curl -r 0-1023 -sI $u"
    }
}

foreach ($m in $models) {
    $head = Invoke-WebRequest -UseBasicParsing -Uri $m.url -Method Head
    $len = [int64]$head.Headers["Content-Length"]
    if ($len -ne $m.sizeBytes) { throw "$($m.id) HEAD Content-Length $len != $($m.sizeBytes) at $($m.url)" }
    # #403: the check whose absence shipped the broken setup -- size matched all
    # along; the content did not.
    $wantTag = Get-LocalMultipartETag $modelLocal[$m.id]
    $gotTag = Get-RemoteETag $m.url
    if ($gotTag -ne $wantTag) { throw "$($m.id) hosted content does not match the manifest sha256 (etag $gotTag != $wantTag) at $($m.url)" }
    Write-Host "[OK] model $($m.id) size + content verified: $($m.url)"
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
