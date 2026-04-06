# ClipFlow — Session Handoff
_Last updated: 2026-04-06 — "Fix AI title generation to use trimmed transcript"_

## Current State
App is stable. AI title/caption generation now uses the edited timeline transcript instead of the original full-clip transcript.

## What Was Just Built

### AI Transcript Source Fix
- **Bug**: When generating titles/captions, the AI received the full original clip transcript based on `clip.startTime`/`clip.endTime`, ignoring any timeline trims, segment deletions, or text edits
- **Fix**: Changed `useAIStore.generate()` to read `editSegments` from `useSubtitleStore` — these reflect the actual subtitle segments on the timeline after all user edits
- **Bonus**: AI now also sees user-corrected subtitle text (e.g., fixed transcription errors), not just the raw Whisper output

## Key Decisions
- **editSegments over audioSegments**: `audioSegments` only has time ranges, no text. `editSegments` from `useSubtitleStore` has both timing and text, already trimmed/filtered by all user actions — most accurate representation of what the final video will contain
- **No fallback to raw transcription**: If subtitles are empty (all deleted), the AI gets an empty transcript and `(no transcript available)` in the prompt — this is correct behavior since there's nothing to title

## Next Steps
1. **Visual polish on dashboard table** — user said "fine, not perfect" in prior session
2. **Phase 2 spec: Per-platform control** — platform toggles per clip, caption previews, character counts
3. **Legacy feature removal** — OBS log parser + hype/chill voice mode
4. **Instagram/Facebook split** — separate login flows

## Watch Out For
- `data/clipflow.db` has changes — don't commit database files
- `reference/TECHNICAL_SUMMARY.md` was deleted (shows in git status) — was intentional from prior session
- `useAIStore` now imports `useSubtitleStore` — new cross-store dependency. Uses `getState()` which is fine since it's in an async action, not a render path
- If `editSegments` is ever renamed or restructured in `useSubtitleStore`, the AI generation will break silently (empty transcript)

## Logs/Debugging
- No build errors, no console errors on launch
- Change is in `src/renderer/editor/stores/useAIStore.js` lines 3, 31-37
