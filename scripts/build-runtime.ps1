# Build the ClipFlow AI engine runtime package (#146).
#
# Produces a relocatable, self-contained Python runtime (embeddable CPython
# 3.12.3 + pinned site-packages) that runs all four pipeline scripts, zipped
# for upload to the ClipFlow R2 bucket. The app downloads + unpacks it during
# first-run Finish Setup and points whisperPythonPath at its python.exe.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\build-runtime.ps1 -Variant cuda
#   powershell -ExecutionPolicy Bypass -File scripts\build-runtime.ps1 -Variant cpu
#
# Output: vendor\runtime-dist\clipflow-runtime-<variant>-v<ver>.zip + manifest JSON.
# Build tree: vendor\runtime-build\<variant>\ (git-ignored, safe to delete).

param(
  [ValidateSet("cuda", "cpu")] [string]$Variant = "cuda",
  [string]$RuntimeVersion = "1.0.0",
  # Full Python used to download/pre-build wheels (the embeddable Python cannot
  # build source-only packages -- its ._pth breaks pip's build isolation).
  # Any full Python 3.12 install works; defaults to the known-good venv.
  [string]$BuilderPython = "D:\whisper\betterwhisperx-venv\Scripts\python.exe"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Invoke-WebRequest is ~10x faster without the progress bar

$repo      = Split-Path -Parent $PSScriptRoot
$PyVersion = "3.12.3"                      # must match the venv the constraints were frozen from
$EmbedUrl  = "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip"
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$TorchIdx  = "https://download.pytorch.org/whl/cu126"

$downloads = Join-Path $repo "vendor\runtime-build\downloads"
$buildDir  = Join-Path $repo "vendor\runtime-build\$Variant"
$distDir   = Join-Path $repo "vendor\runtime-dist"
$reqFile   = Join-Path $repo "tools\runtime\requirements.txt"
$conFile   = Join-Path $repo "tools\runtime\constraints-$Variant.txt"

New-Item -ItemType Directory -Force -Path $downloads, $distDir | Out-Null

# -- 1) Fetch embeddable Python (cached across builds) -----------------------
$embedZip = Join-Path $downloads "python-$PyVersion-embed-amd64.zip"
if (-not (Test-Path $embedZip)) {
  Write-Host "Downloading embeddable Python $PyVersion..."
  Invoke-WebRequest -Uri $EmbedUrl -OutFile $embedZip
}

# -- 2) Fresh build dir ------------------------------------------------------
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
Expand-Archive -Path $embedZip -DestinationPath $buildDir

# -- 3) Make the embeddable distro see site-packages -------------------------
# The stock ._pth locks sys.path to the stdlib only. Rewrite it so pip-installed
# packages under Lib\site-packages resolve, and site initialization runs.
$pthFile = Join-Path $buildDir "python312._pth"
@"
python312.zip
.
Lib\site-packages
import site
"@ | Set-Content -Path $pthFile -Encoding ascii

$py = Join-Path $buildDir "python.exe"

# -- 4) Bootstrap pip --------------------------------------------------------
$getPip = Join-Path $downloads "get-pip.py"
if (-not (Test-Path $getPip)) {
  Write-Host "Downloading get-pip.py..."
  Invoke-WebRequest -Uri $GetPipUrl -OutFile $getPip
}
& $py $getPip --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "get-pip failed" }

# -- 5) Collect wheels with a full Python, then install offline --------------
# Some pinned packages (e.g. openai-whisper) publish source-only distributions.
# The embeddable Python cannot build those: its ._pth pins sys.path, which
# breaks pip's build isolation ("Cannot import 'setuptools.build_meta'"). So a
# full Python downloads/pre-builds every wheel into a wheelhouse first, and the
# bundle installs from it with no builds and no network access.
if (-not (Test-Path $BuilderPython)) { throw "BuilderPython not found: $BuilderPython" }
$wheelhouse = Join-Path $repo "vendor\runtime-build\wheelhouse-$Variant"
if (Test-Path $wheelhouse) { Remove-Item -Recurse -Force $wheelhouse }
$wheelArgs = @("-m", "pip", "wheel", "-r", $reqFile, "-c", $conFile,
               "-w", $wheelhouse, "--no-cache-dir")
if ($Variant -eq "cuda") { $wheelArgs += @("--extra-index-url", $TorchIdx) }
Write-Host "Collecting wheels ($Variant)... this downloads several GB, be patient."
& $BuilderPython @wheelArgs
if ($LASTEXITCODE -ne 0) { throw "wheel collection failed" }

& $py -m pip install --no-index --find-links $wheelhouse -r $reqFile -c $conFile --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
Remove-Item -Recurse -Force $wheelhouse  # ~3 GB; reclaim before zipping

# -- 6) Prune bytecode caches (regenerate on the user's machine as needed) ---
Get-ChildItem -Path $buildDir -Recurse -Directory -Filter "__pycache__" |
  Remove-Item -Recurse -Force

# -- 7) Smoke test: every import the four scripts need, from the built bytes -
$smoke = @"
import stable_whisper, torch, faster_whisper, librosa, soundfile
from ai_edge_litert.interpreter import Interpreter
print('stable_ts=' + stable_whisper.__version__)
print('torch=' + torch.__version__)
print('cuda=' + str(torch.cuda.is_available()))
"@
$smokeOut = & $py -c $smoke
if ($LASTEXITCODE -ne 0) { throw "Smoke imports failed - the bundle is broken" }
Write-Host ($smokeOut -join "`n")
if ($Variant -eq "cuda" -and ($smokeOut -join "`n") -notmatch "cuda=True") {
  throw "CUDA variant built but torch.cuda.is_available() is False on this machine"
}

# -- 8) Zip + checksum + manifest --------------------------------------------
$zipName = "clipflow-runtime-$Variant-v$RuntimeVersion.zip"
$zipPath = Join-Path $distDir $zipName
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Write-Host "Zipping to $zipName (several GB - this takes a few minutes)..."
# bsdtar (ships with Windows 10+) handles multi-GB zips; Compress-Archive doesn't.
# Full path: a bare "tar" can resolve to Git's GNU tar, which misparses C:\ paths.
& "$env:SystemRoot\System32\tar.exe" -a -c -f $zipPath -C $buildDir .
if ($LASTEXITCODE -ne 0) { throw "zip failed" }

$hash = (Get-FileHash -Algorithm SHA256 -Path $zipPath).Hash.ToLower()
$size = (Get-Item $zipPath).Length
[ordered]@{
  name      = "clipflow-runtime"
  variant   = $Variant
  version   = $RuntimeVersion
  python    = $PyVersion
  file      = $zipName
  sha256    = $hash
  sizeBytes = $size
  builtAt   = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssK")
} | ConvertTo-Json | Set-Content -Path (Join-Path $distDir "manifest-$Variant.json") -Encoding ascii

Write-Host ""
Write-Host "DONE: $zipPath"
Write-Host "  sha256: $hash"
Write-Host "  size:   $([math]::Round($size / 1GB, 2)) GB"
