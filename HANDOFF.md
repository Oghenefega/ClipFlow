# ClipFlow — Session Handoff
_Last updated: 2026-03-31 (Subtitle segmentation overhaul + audio track fix + ghost subtitle fix)_

## Current State
App builds and launches cleanly. Subtitle chunking algorithm significantly improved with phrase-aware segmentation. Audio extraction now targets mic track (track 2). Ghost subtitle bug from mega-segments identified and filtered. User still needs to test all fixes across clips and re-transcribe to verify audio track change.

## What Was Just Built

### Audio Track Selection Fix
- `extractAudio()` in `ffmpeg.js` now accepts an `audioTrackIndex` parameter and uses `-map 0:a:N` instead of defaulting to the first stream
- New `transcriptionAudioTrack` setting in electron-store (default: 1 = track 2, user's mic)
- All 3 call sites updated: pipeline transcription, IPC handler, and re-transcribe
- Automatic fallback: if configured track doesn't exist (e.g., single-track clips), falls back to track 0
- Migration added for existing installs

### Subtitle Chunking Overhaul (`useSubtitleStore.js`)
- **Phase 1 Pre-scan:** Before chunking, scans entire word list for adjacent repeated phrases (length 2-3). Marks start indices so the main loop groups them correctly, overriding pauses and MAX_WORDS
- **Rule 0b — Known phrase recall:** Tracks all 2-3 word phrases as they're flushed. If upcoming words match a previously-seen phrase, flushes current chunk first (handles non-adjacent repeats like "there we go baby there we go")
- **Rule 0c — Known phrase protection:** If current chunk IS a known phrase, don't let an unrelated word extend it (prevents "let's go I" grouping)
- **Rule 5 — Never end on "I":** Flushes chunk before adding "I" so it always starts the next segment
- **MAX_CHARS (16) split:** 3-word segments exceeding 16 characters get split 2+1 for better display fit (e.g., "we're clutching this" → "we're clutching" + "this")

### Ghost Subtitle Fix
- `initSegments()` now filters "mega-segments" — transcription artifacts where stable-ts outputs one segment spanning the entire clip with all words compressed into wrong timestamps
- Detection: segment duration > 85% of clip duration AND > 20 words AND other segments exist
- Logged to console for debugging

## Key Decisions
- **Pre-scan over inline detection:** Inline repeat detection failed when pauses separated the first word of a repeating phrase (e.g., 1.2s gap before "we got this we got this"). Pre-scan identifies the pattern across the full word list first, so phrase boundaries always win over pauses.
- **Audio track fallback, not failure:** Clips extracted from multi-track originals typically have only 1 audio track. Instead of failing with "track 1 not found", it silently falls back to track 0.
- **Mega-segment filter, not transcription fix:** The ghost subtitle root cause is in stable-ts output (sometimes produces a full-text segment alongside sentence segments). Filtering at load time is safer than modifying the Python transcription script, which could break other edge cases.
- **MAX_CHARS=16 for display fit:** Based on vertical video subtitle width constraints. "we got this" (10 chars) stays together; "we're clutching this" (20 chars) splits 2+1.

## Next Steps
1. **User testing** — Re-transcribe clips to verify audio track fix (mic only, no game/teammate audio). Switch segment modes to verify chunking improvements across all games.
2. **Investigate stable-ts mega-segment source** — Why does it sometimes output a full-text segment? May need to check stable-ts version or refine() step in transcribe.py.
3. **Test game-switch scrubber end-to-end** — Still untested from two sessions ago.
4. **Investigate thumbnail generation hang** — "Preparing preview..." stuck, root cause unknown.
5. **Backfill file sizes for existing imports** — Already-imported files still show "0 B".
6. **Wire `splitSourceRetention: "delete"`** — Source files always kept after split.

## Watch Out For
- **Clips need re-transcription** to pick up the audio track fix — existing transcriptions used the wrong track. The chunking and mega-segment fixes apply immediately on segment mode switch.
- **Audio track fallback is silent** — If a clip has only 1 track, it falls back to track 0 without warning. This is correct behavior but means re-transcribing a clip uses track 0, not the mic, if the clip was extracted with a single stream.
- **Pre-scan only detects ADJACENT repeats** — Non-adjacent repeats (like "there we go baby there we go") are handled by the runtime knownPhrases recall, which depends on the first occurrence being flushed first.
- **MAX_CHARS=16 is hardcoded** — May need tuning based on font size and subtitle style settings.
- **Mega-segment filter thresholds** (85% duration, 20+ words) are heuristic — could theoretically filter a legitimate long monologue segment, but only when other segments also exist.

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow/clipflow-settings.json`
- Database file: `data/clipflow.db` (schema v3)
- Subtitle debug: thumbs up/down in editor toolbar → Settings > Diagnostics > Subtitle Debug Log
- Mega-segment filter: check DevTools console for `[initSegments] Filtering mega-segment:` messages
- Chunking debug: switch segment modes and check console for `[initSegments]` logs
