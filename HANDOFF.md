# ClipFlow — Session Handoff
_Last updated: 2026-04-07 — "WIP: Subtitle/Waveform Alignment After Trim & Mid-Clip Delete"_

## Current State

**BROKEN.** Multiple editor bugs around subtitle/waveform alignment after trim and mid-clip delete. Session attempted to fix a chain of related issues but introduced instability. The core architecture problem was identified and a concat recut solution started but not validated.

## What Was Built

All changes in WIP commit `7dd6dcb`:

1. **Save format fix** — editSegments saved as `{ sub1: [...] }` to match initSegments loader
2. **Stale transcription detection** — Skips clip.transcription when it spans >1.5x clip duration
3. **Clear transcription on recut** — Sets `transcription: null` in clip:recut handler
4. **Whisperx dedup** — Segment + word level dedup with punctuation stripping
5. **Waveform invalidation** — `waveformPeaks: null` after any recut
6. **Waveform audio track fix** — Uses `transcriptionAudioTrack` for peak extraction
7. **sourceOffset tracking** — On audio segments for waveform peak slicing
8. **Concat recut** — New `concatCutClip` using FFmpeg concat filter to splice kept segments
9. **EPIPE crash fix** — Suppresses broken pipe from Sentry/electron-log on quit

## Key Decisions

- **Concat recut is the right approach** — the fundamental issue: `clip:recut` only cuts outer bounds. Mid-section deletes don't remove the deleted audio from the file. The file and editor timeline diverge.
- **FFmpeg concat filter** (`trim+setpts+concat`) is the correct technique but integration with editor timeline model needs work.

## Next Steps (Priority Order)

1. **Debug concat recut end-to-end** — Verify segment coordinates are correct (clip-relative → source-absolute). Add console logs and test.
2. **Fix double-shifting** — `_trimToAudioBounds` shifts subtitles left, AND the concat file is shorter. Subtitles may shift twice.
3. **Test full flow**: open clip → split audio → delete middle → verify file is shorter, waveform matches, subtitles align, re-transcribe works.
4. **Consider reverting** if concat approach needs redesign. The WIP commit documents everything.

## Watch Out For

- **Double-shifting**: `_trimToAudioBounds` + concat recut may both remove the gap, shifting subtitles twice
- **sourceOffset is set to 0** in ripple delete (concat rebuilds file). If concat fails, no fallback.
- **EPIPE handler** re-throws non-EPIPE errors — could mask issues
- **initSegments priority**: transcription > subtitles.sub1 > flat array > project transcription. Stale detection at 1.5x may need tuning.
- **Clip files have ONE audio track** (cutClip doesn't use -map), so waveform track selection only matters for source files

## Files Changed

- `src/main/ffmpeg.js` — `extractWaveformPeaks` (audio track param), `concatCutClip` (new)
- `src/main/main.js` — EPIPE handler, `clip:concatRecut` handler, transcription clearing on recut
- `src/main/preload.js` — `concatRecutClip` bridge
- `src/renderer/editor/stores/useEditorStore.js` — `_concatRecutAfterDelete`, sourceOffset, waveform invalidation, save format
- `src/renderer/editor/stores/useSubtitleStore.js` — stale detection, dedup, clipEnd fix, legacy flat array
- `src/renderer/editor/components/TimelinePanelNew.js` — sourceOffset prop pass-through
- `src/renderer/editor/components/timeline/WaveformTrack.js` — sourceOffset peak slicing

## Logs/Debugging

- `[ConcatRecut]` — concat operations
- `[initSegments] Stale transcription detected` — stale skip
- `[initSegments] Removed N duplicate` / `[setSegmentMode] Deduped N` — dedup counts
