# Verify a built AI engine runtime end-to-end (#146).
#
# Runs all four pipeline scripts through the bundle's python.exe against a
# short excerpt of a real recording - proves the relocatable runtime actually
# transcribes and scores, not just that imports resolve.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\verify-runtime.ps1 `
#     -SampleVideo "path\to\recording.mp4" [-RuntimeDir ...] [-AudioTrack 0]
#
# Outputs land in vendor\runtime-build\verify\ (git-ignored). The original
# video is never written next to - a 2-minute excerpt is cut into the work dir.

param(
  [Parameter(Mandatory = $true)] [string]$SampleVideo,
  [string]$RuntimeDir = "",
  [int]$AudioTrack = 0,
  [string]$Model = "large-v3-turbo",
  [string]$HfHome = "D:\whisper\hf_cache",
  [int]$ExcerptSec = 120
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if (-not $RuntimeDir) { $RuntimeDir = Join-Path $repo "vendor\runtime-build\cuda" }
$py = Join-Path $RuntimeDir "python.exe"
if (-not (Test-Path $py)) { throw "No python.exe in $RuntimeDir - run build-runtime.ps1 first" }
if (-not (Test-Path $SampleVideo)) { throw "Sample video not found: $SampleVideo" }

# Mirror the app: bundled FFmpeg dir goes on PATH (energy_scorer calls bare ffprobe).
$ffmpegDir = Join-Path $repo "vendor\ffmpeg"
if (Test-Path (Join-Path $ffmpegDir "ffmpeg.exe")) { $env:PATH = "$ffmpegDir;$env:PATH" }
$env:PYTHONUTF8 = "1"
if (Test-Path $HfHome) { $env:HF_HOME = $HfHome }

$work = Join-Path $repo "vendor\runtime-build\verify"
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Force -Path $work | Out-Null

$results = [ordered]@{}
function Step($name, [scriptblock]$body) {
  Write-Host "-- $name --"
  try { & $body; $script:results[$name] = "PASS"; Write-Host "$name PASS" }
  catch { $script:results[$name] = "FAIL: $_"; Write-Host "$name FAIL: $_" }
}
function AssertJson($path) {
  if (-not (Test-Path $path)) { throw "missing output $path" }
  Get-Content $path -Raw | ConvertFrom-Json | Out-Null
}

# -- 0) Cut a short excerpt (stream copy, all tracks) + extract 16k mono wav -
# -map 0 keeps every track (default mapping drops all but one audio stream);
# MKV container muxes OBS's HEVC+FLAC combo without strict flags.
$sample = Join-Path $work "sample.mkv"
$wav    = Join-Path $work "sample.wav"
ffmpeg -y -v error -ss 0 -t $ExcerptSec -i $SampleVideo -map 0 -c copy $sample
if ($LASTEXITCODE -ne 0) { throw "excerpt cut failed" }
ffmpeg -y -v error -i $sample -map "0:a:$AudioTrack" -ac 1 -ar 16000 $wav
if ($LASTEXITCODE -ne 0) { throw "wav extract failed" }

$tools = Join-Path $repo "tools"

Step "yamnet" {
  & $py (Join-Path $tools "signals\yamnet_events.py") --audio $wav --output (Join-Path $work "yamnet.json")
  if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
  AssertJson (Join-Path $work "yamnet.json")
}

Step "pitch_spike" {
  & $py (Join-Path $tools "signals\pitch_spike.py") --audio $wav --output (Join-Path $work "pitch.json")
  if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
  AssertJson (Join-Path $work "pitch.json")
}

$whisperJson = Join-Path $work "whisper.json"
Step "transcribe" {
  & $py -X utf8 (Join-Path $tools "transcribe.py") --audio $wav --output $whisperJson --model $Model
  if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
  AssertJson $whisperJson
}

Step "energy_scorer" {
  # Build a real SRT from the transcription output, same as the pipeline does.
  $srt = Join-Path $work "sample.srt"
  # Written to a file, not passed via -c: inline quotes don't survive
  # PowerShell 5.1's native argument quoting.
  $srtScript = @'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
def ts(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f'{h:02d}:{m:02d}:{s:06.3f}'.replace('.', ',')
lines = []
for i, seg in enumerate(d['segments'], 1):
    lines.append(f"{i}\n{ts(seg['start'])} --> {ts(seg['end'])}\n{seg['text'].strip()}\n")
open(sys.argv[2], 'w', encoding='utf-8').write('\n'.join(lines))
'@
  $srtBuilder = Join-Path $work "make_srt.py"
  Set-Content -Path $srtBuilder -Value $srtScript -Encoding ascii
  & $py -X utf8 $srtBuilder $whisperJson $srt
  if ($LASTEXITCODE -ne 0) { throw "srt build exit $LASTEXITCODE" }
  & $py -X utf8 (Join-Path $tools "energy_scorer.py") $sample $srt --track $AudioTrack
  if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
  AssertJson (Join-Path $work "sample.energy.json")
}

Write-Host ""
Write-Host "==== Verification summary ===="
$fail = $false
foreach ($k in $results.Keys) {
  Write-Host ("  {0,-14} {1}" -f $k, $results[$k])
  if ($results[$k] -ne "PASS") { $fail = $true }
}
if ($fail) { exit 1 } else { Write-Host "ALL PASS"; exit 0 }
