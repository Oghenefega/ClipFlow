# Package the word-timing voter models for the ClipFlow R2 bucket (#357).
#
# Finish Setup (src/main/setup-runtime.js) downloads these after the engine and
# unpacks each into the layout src/main/app-paths.js TIMING_MODELS describes:
#   hubert   -> <engineRoot>/torch_home/hub/checkpoints/   (torchaudio's TORCH_HOME cache)
#   vosk     -> <engineRoot>/models/vosk/                  (CORVA_VOSK_MODEL)
#   parakeet -> <engineRoot>/models/parakeet/              (CORVA_PARAKEET_MODEL)
# so every zip holds the model's files at its top level (no wrapper folder).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\build-models.ps1
# A missing source is skipped with a warning (e.g. Parakeet not downloaded yet);
# re-run once it exists -- zips already in vendor\runtime-dist are rebuilt.
#
# Output: vendor\runtime-dist\<model>.zip + manifest-models.json, which
# publish-runtime.ps1 uploads to r2:clipflow-engine/models/ and folds into
# engine/manifest.json as the "models" list.
#
# NOTE: ASCII only in this file -- PowerShell 5.1 parses .ps1 as ANSI.

param(
    [string]$Hubert   = (Join-Path $env:USERPROFILE ".cache\torch\hub\checkpoints\hubert_fairseq_large_ll60k_asr_ls960.pth"),
    [string]$Vosk     = "D:\whisper\vosk-models\vosk-model-en-us-0.22-lgraph",
    [string]$Parakeet = "D:\whisper\sherpa-models\sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
    [string]$DistDir  = (Join-Path (Split-Path $PSScriptRoot -Parent) "vendor\runtime-dist")
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
$tar = Join-Path $env:SystemRoot "System32\tar.exe"   # bsdtar; Git's GNU tar misparses C:\ paths

# id, source path, zip name, tar arguments (relative to -C dir). Model weights
# do not compress, so the zips are stored, not deflated: faster to build and
# faster for the customer to unpack.
$specs = @(
    @{ id = "hubert";   src = $Hubert;   dir = (Split-Path $Hubert -Parent); items = @((Split-Path $Hubert -Leaf)) },
    @{ id = "vosk";     src = $Vosk;     dir = $Vosk;     items = @("am", "conf", "graph", "ivector", "README") },
    @{ id = "parakeet"; src = $Parakeet; dir = $Parakeet; items = @("encoder*.onnx", "decoder*.onnx", "joiner*.onnx", "tokens.txt") }
)

$manifest = @()
foreach ($m in $specs) {
    if (-not (Test-Path $m.src)) { Write-Warning "$($m.id): source missing, skipped ($($m.src))"; continue }
    $leaf = Split-Path $m.src -Leaf
    $zipName = ($leaf -replace "[.]pth$", "") + ".zip"   # keep dots in folder names (0.22-lgraph)
    $zipPath = Join-Path $DistDir $zipName
    if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

    # expand the globs ourselves (bsdtar takes literal names) and size the payload
    $files = @()
    foreach ($pat in $m.items) { $files += Get-Item -Path (Join-Path $m.dir $pat) -Force | ForEach-Object { $_.Name } }  # Get-Item: a folder is itself, not its children
    if ($files.Count -eq 0) { throw "$($m.id): nothing matched under $($m.dir)" }
    $unpacked = (Get-ChildItem -Path ($files | ForEach-Object { Join-Path $m.dir $_ }) -Recurse -File -Force | Measure-Object -Property Length -Sum).Sum

    Write-Host "Zipping $($m.id) -> $zipName ($([math]::Round($unpacked / 1MB)) MB)..."
    & $tar --options "zip:compression=store" -a -c -f $zipPath -C $m.dir @files
    if ($LASTEXITCODE -ne 0) { throw "$($m.id): zip failed" }

    $hash = (Get-FileHash -Algorithm SHA256 -Path $zipPath).Hash.ToLower()
    $size = (Get-Item $zipPath).Length
    $manifest += [ordered]@{
        id            = $m.id
        file          = $zipName
        sha256        = $hash
        sizeBytes     = $size
        unpackedBytes = [int64]$unpacked
        source        = $m.src
        builtAt       = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssK")
    }
    Write-Host "  sha256: $hash  size: $([math]::Round($size / 1MB)) MB"
}

$out = Join-Path $DistDir "manifest-models.json"
# ConvertTo-Json unwraps a single-element array; -InputObject keeps it a list
ConvertTo-Json -InputObject $manifest -Depth 5 | Set-Content -Path $out -Encoding ascii
Write-Host ""
Write-Host "DONE: $out ($($manifest.Count) model(s))"
