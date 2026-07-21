# ClipFlow — Session Handoff

_Last updated: 2026-07-21 — Session 119 — **Silent-editor mystery solved: OBS was recording ALAC audio, which Chromium can't decode. OBS flipped to FLAC, all 14 recordings converted in place, sound confirmed back. Zero app code changed.**_

---

## One-line TL;DR

Fega reported the editor lost ALL sound (mic + game) on new recordings while subtitles stayed perfect. Root cause: his new OBS profile (Hybrid MP4 / NVENC HEVC / 6 audio tracks) had **Audio Encoder = FFmpeg ALAC (24-bit)** — the editor plays the raw source file in Chromium ([PreviewPanelNew.js:922](src/renderer/editor/components/PreviewPanelNew.js) `videoSrc = file://project.sourceFile`), and Chromium has no ALAC decoder (video plays, audio silently absent), while every FFmpeg path (whisper extract on the calibrated track, waveforms, renders) decodes ALAC fine — hence the exact symptom split. Fix: OBS audio encoder → **FLAC (16-bit)** (Chromium decodes FLAC-in-MP4; verified by ear in the editor), and all 14 ALAC recordings (Day8 ×8, Day9 ×6, ~17-20 GB each) converted in place — video stream copied untouched, audio ALAC→FLAC — each passing duration + stream-layout + loudness-fingerprint verification before replacement. 13/13 batch conversions passed; originals deleted at Fega's explicit choice (W: too full for 220 GB of backups).

## Current State

- **App unchanged:** still 0.3.0-alpha.3 installed; no code, no build, no installer this session.
- **Recordings library healthy:** all 14 files in `Recordings\2026-07` are HEVC + FLAC; editor sound confirmed by Fega on Day9 Pt3 ("I can hear both mic and game sound"). W: has 232 GB free.
- **OBS going forward:** Hybrid MP4, NVENC HEVC, **FLAC (16-bit)**, 6 tracks, 30-min auto-split — Fega confirmed the setting is updated. Tonight's recordings need no conversion.
- **[#178](https://github.com/Oghenefega/ClipFlow/issues/178) filed (open):** product-level guard — ClipFlow should detect Chromium-unplayable codecs at ingest/project-open and warn (or offer auto-remux) instead of a silently mute preview. Same class: HEVC video on machines without hardware HEVC decode.

## What Was Done (no commits — file surgery + issue only)

1. **Diagnosis** (trace-verify style): editor plays raw source → probed real files with ffprobe → all-ALAC audio; extraction/waveform/render paths all map tracks through FFmpeg → unaffected. Track layout verified live: T1=mix, T2=voice (matches `transcriptionAudioTrack=1`), T3=game, T4-6 silent. July 20+ recordings carry **6** tracks vs the 4-track layout the #169 wizard calibrated.
2. **Proof conversion:** Day9 Pt3 ALAC→FLAC (video copied, `-c:a flac -strict -2` for FLAC-in-MP4), swapped in under same filename; Fega listened — both mic and game audio present.
3. **Batch:** remaining 13 files via scripted loop — per-file gates (ffmpeg exit 0, duration Δ<0.1s, hevc+N×flac stream check, a:0 mean-volume Δ<0.3 dB) before `mv -f` replacement; any failure keeps the original. Result: 13 converted, 0 failed; every loudness fingerprint matched exactly.
4. **Routed the lesson:** clipflow-ffmpeg-media skill (Distilled Lessons) + memory `project_obs_recording_layout` (recording-format note) + lessons.md marker advanced.

## Key Decisions / Findings

- **FLAC over AAC (Fega's pick):** lossless master + Chromium-decodable. The "FLAC doesn't work in MP4" advice he'd read elsewhere doesn't apply to OBS **Hybrid MP4**, which exists to hold lossless audio (OBS only lists encoders valid for the selected container).
- **No backups (Fega's explicit pick from a 4-option ask):** W: had 213 GB free vs ~220 GB of originals; he chose verify-then-delete over parking backups on S:/F:/V:.
- **Renders were never at risk:** render.js maps `[0:a]` (first stream = mix) → AAC; FFmpeg reads ALAC/FLAC equally.
- Filenames/paths unchanged throughout → projects, waveform cache, subtitles, DB rows all untouched.

## Next Steps (priority order)

1. **Fega's forward undo test at next recording session** (#175 — carried from session 118): rename → UNDO → file reverts + returns to Pending. Tonight's session is the natural moment.
2. **Re-run the #169 calibration wizard** — OBS now emits 6 tracks, `audioSetup` was calibrated on 4. Transcription track still correct (voice=index 1), but labels/count are stale.
3. **#173 second half, #174, #176** — small rename-area batch.
4. **#178** — unplayable-codec ingest guard (new this session; cheap warning version first).
5. **#167/#153** neutral STORE_DEFAULTS + wizard-owned folder setup.

## Watch Out For

- **Do NOT re-convert or re-download anything into `Recordings\2026-07` from old copies** — the 14 files there are the canonical (FLAC) versions now; ALAC originals no longer exist.
- If Recordings/waveforms ever look odd for the July files (the app was open during in-place swaps), a ClipFlow restart + lazy waveform regen resolves it — audio content is bit-identical, so no visible change is expected.
- The session-117 blank-page event remains unreproduced (repro scripts in session-117 scratchpad).
- `tasks/mocks/*` + `.agents/` `.codex/` `AGENTS.md` untracked strays stay untracked; never `git add -A`.

## Logs / Debugging

- **Key diagnostic commands** (reusable for any future "no sound/video in editor"): `ffprobe -show_entries stream=codec_type,codec_name <source.mp4>` (codec check — Chromium plays AAC/MP3/Opus/Vorbis/FLAC/PCM only); `ffmpeg -ss N -t 30 -i <src> -map 0:a:i -af volumedetect -f null -` (per-track loudness; −91 dB = digital silence). Fega's tracks: a:0 mix, a:1 voice, a:2 game.
- **Batch script** preserved at session-119 scratchpad `convert-flac.sh` (`C:\Users\IAMABS~1\AppData\Local\Temp\claude\C--Users-IAmAbsolute-Desktop-ClipFlow\a5853890-7380-4485-b740-741746b42121\scratchpad\`) with full per-file log in `tasks\b5vjxob22.output` (same temp root) — pattern is reusable for any future in-place media migration (convert→verify→atomic replace).
- Conversion throughput on W: ≈ 17 GB / 18 min (disk-bound, video stream copy dominates).
