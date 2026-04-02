# ClipFlow — Session Handoff
_Last updated: 2026-04-02 (delete+regen fix, Projects preview fixes, Whisper hallucination fix, per-clip retranscription)_

## Current State
App builds and launches. All code changes complete but the per-clip retranscription pipeline has **NOT been user-tested yet** — app crashed on first attempt (duplicate `audioTrack` variable, now fixed) and session ended before retry.

## What Was Built

### Delete + Regenerate Fix
- Project deletion now resets file status across all 3 tracking systems: SQLite `file_metadata`, electron-store `doneRecordings`, and in-memory state
- 3 lookup paths in `project:delete` handler: fileMetadataId → projectName+extension fallback → doneRecordings key scan
- Orphan reconciliation in `project:list` resets stale "done" files with no matching project
- User-facing × button on DONE badges in Upload view for manual unmark

### Projects Preview Fixes
- Subtitle/caption Y positions now read from `useLayoutStore` (actual rendered positions) instead of `useSubtitleStore`
- Pop animation restored — template values preferred over per-clip saved values
- `requestAnimationFrame` loop (~60Hz) replaces `timeupdate` (~4Hz) for smooth subtitle sync
- `syncOffset` applied to adjusted time in preview

### Whisper Hallucination Fix
- Root cause: `condition_on_previous_text=True` in Whisper caused feedback loops — one hallucinated "Let's go" cascaded across entire recording
- Fix: `condition_on_previous_text=False` in `tools/transcribe.py`
- Stage 7b added to `ai-pipeline.js`: per-clip retranscription after clip cutting (runs Whisper fresh on each short clip audio)
- Failed retranscriptions flagged with `transcriptionFailed: true` + visible "⚠ Subs failed" badge in Projects view

### Shared Subtitle Engine
- New `subtitleStyleEngine.js` — pure rendering functions shared between editor and Projects preview

## Key Decisions
- `condition_on_previous_text=False` permanently — gaming audio has too many silence/music segments that trigger Whisper hallucination cascades
- No compression_ratio_threshold, log_prob_threshold, or no_speech_threshold flags — gaming audio has legitimate long silences (boss fights) followed by reactions
- No repetition detector — user legitimately repeats phrases ("let's go", "I'm that guy") when hyped; would cause false positives
- Per-clip retranscription (Option A) chosen over dual-source comparison
- Quality learning loop deferred per LLM Council consensus — fix integrity first, instrument data, optimize later

## Next Steps
1. **Test the generation pipeline** — generate a new project and verify per-clip retranscription produces accurate subtitles
2. **Quality learning loop** — start logging structured feedback data (reason codes beyond binary approve/reject)
3. **Sentry backlog** — 7 deferred items, GDPR opt-in (#1) and source maps (#7) are hard blockers before launch
4. **Security hardening** — safeStorage encryption for all credentials in electron-store

## Watch Out For
- `ai-pipeline.js` had a duplicate `const audioTrack` at line ~620 that was removed — if merge conflicts touch that area, verify no duplicate declarations
- Per-clip retranscription adds Whisper processing time per clip — monitor total pipeline duration on longer recordings
- `subtitleStyleEngine.js` is imported by both `PreviewPanelNew.js` and `ProjectsView.js` — changes affect both views
- LLM Council transcript saved at skills session directory for reference

## Logs / Debugging
- electron-log writes to `%APPDATA%/ClipFlow/logs/app.log`
- Pipeline progress logged step-by-step including retranscription count
- `tasks/lessons.md` updated: never penalize silence in Whisper flags for gaming audio
