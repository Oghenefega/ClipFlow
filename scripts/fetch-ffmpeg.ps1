# Fetch the bundled FFmpeg binaries (#251).
#
# The exes (~130 MB each) are too large for GitHub, so they live in
# git-ignored vendor/ffmpeg/ and ship via electron-builder extraResources
# (resources/ffmpeg/ in the packaged app). Run this once per machine that
# builds installers; re-run with -Force to refresh.
#
# Build: BtbN win64 GPL, pinned to the n7.1 release line - includes NVENC
# (GPU render path), libx264, and every filter ClipFlow uses.
#
# NOTE: keep this file pure ASCII - Windows PowerShell 5.1 reads it as ANSI.

param([switch]$Force)

$ErrorActionPreference = "Stop"

$Url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n7.1-latest-win64-gpl-7.1.zip"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$DestDir = Join-Path $RepoRoot "vendor\ffmpeg"

$FfmpegExe = Join-Path $DestDir "ffmpeg.exe"
$FfprobeExe = Join-Path $DestDir "ffprobe.exe"

if ((Test-Path $FfmpegExe) -and (Test-Path $FfprobeExe) -and -not $Force) {
    Write-Host "vendor\ffmpeg already populated - use -Force to refresh." -ForegroundColor Green
    & $FfmpegExe -version | Select-Object -First 1
    exit 0
}

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

$TmpZip = Join-Path $env:TEMP "clipflow-ffmpeg-fetch.zip"
$TmpDir = Join-Path $env:TEMP "clipflow-ffmpeg-fetch"

Write-Host "Downloading $Url ..."
Invoke-WebRequest -Uri $Url -OutFile $TmpZip

Write-Host "Extracting ..."
if (Test-Path $TmpDir) { Remove-Item -Recurse -Force $TmpDir }
Expand-Archive -Path $TmpZip -DestinationPath $TmpDir

# Zip layout: ffmpeg-n7.1*-win64-gpl-7.1/bin/{ffmpeg,ffprobe,ffplay}.exe + LICENSE.txt
$ExtractedRoot = Get-ChildItem -Directory $TmpDir | Select-Object -First 1
Copy-Item (Join-Path $ExtractedRoot.FullName "bin\ffmpeg.exe") $FfmpegExe -Force
Copy-Item (Join-Path $ExtractedRoot.FullName "bin\ffprobe.exe") $FfprobeExe -Force
$License = Join-Path $ExtractedRoot.FullName "LICENSE.txt"
if (Test-Path $License) { Copy-Item $License (Join-Path $DestDir "LICENSE.txt") -Force }

Remove-Item -Force $TmpZip
Remove-Item -Recurse -Force $TmpDir

Write-Host "Done:" -ForegroundColor Green
& $FfmpegExe -version | Select-Object -First 1
& $FfprobeExe -version | Select-Object -First 1
