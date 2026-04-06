# ClipFlow — Session Handoff
_Last updated: 2026-04-06 — "Audio Track Fix + No-Emoji Captions + Sentry CLIPFLOW-3 Fix"_

## Current State
App is stable. Transcription now correctly reads mic audio (Track 1) instead of game audio (Track 2). AI-generated text no longer includes emojis. PostHog shutdown crash fixed.

## What Was Just Built

### Audio Track Fix + Setting
- **Bug**: Transcription was extracting Audio Track 2 (game sounds) instead of Track 1 (mic). All subtitles and transcriptions were based on game audio, not voice.
- **Fix**: Changed default `transcriptionAudioTrack` from `1` to `0` in store schema, migration, and all 4 extraction points (pipeline, ffmpeg IPC, retranscribe handler, ai-pipeline).
- **One-time migration**: Existing installs with value `1` auto-corrected to `0` (guarded by `_migrated_audioTrack_v2` flag so users who later choose Track 2 won't be overridden).
- **New UI setting**: "Audio Track to Transcribe" button group (Track 1-4) in Settings → BetterWhisperX Configuration. Immediate save on click.

### No-Emoji AI Generation
- Added "NEVER use emojis" rules to title rules (rule 8), caption rules (rule 7), and DO NOT section (with emoji examples) in the title/caption prompt (`main.js`).
- Added "no emojis" to clip detection prompt DO NOT section (`ai-prompt.js`).

### Sentry CLIPFLOW-3 Fix
- **Bug**: `posthog.shutdown()` called on `beforeunload` but PostHog JS SDK v1.364.5 has no `shutdown()` method → TypeError on every app close (68 occurrences in Sentry).
- **Fix**: Removed the broken `beforeunload` listener from `src/index.js`. PostHog handles flush-on-unload automatically.

## Key Decisions
- **Audio track default = 0 (Track 1)**: Standard OBS multi-track layout has mic on Track 1, game on Track 2. This matches most setups.
- **Migration is one-time**: Won't override if user deliberately picks a different track later via the new UI setting.
- **No PostHog replacement handler needed**: PostHog SDK internally handles `beforeunload` via its own queue flush mechanism.

## Next Steps
1. **Sentry CLIPFLOW-7/4**: `blink::DOMDataStore::GetWrapper` crash — Chromium/Electron 28 bug with `<video>` elements, not fixable from JS. Mitigated by `<video>` unmount cleanup.
2. **Visual polish on dashboard table** — user said "fine, not perfect" in prior session
3. **Phase 2 spec: Per-platform control** — platform toggles per clip, caption previews, character counts
4. **Legacy feature removal** — OBS log parser + hype/chill voice mode

## Watch Out For
- `data/clipflow.db` has changes — don't commit database files
- `reference/TECHNICAL_SUMMARY.md` was deleted — intentional from prior session
- YouTube publish handler in `main.js` now accepts `youtubeTitle` and `privacyStatus` params (uncommitted prior work, included in this commit)
- `useAIStore` imports `useSubtitleStore` — cross-store dependency from prior session
- Sentry still has CLIPFLOW-4/7 (native Chromium crashes) — these are not fixable from app code

## Logs/Debugging
- No build errors, no console errors on launch
- Audio track setting visible in Settings → BetterWhisperX, Track 1 (Mic) selected by default
- Sentry CLIPFLOW-3 should stop recurring after this deploy (verify over 24h)
