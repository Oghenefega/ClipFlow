# ClipFlow — Session Handoff
_Last updated: 2026-03-24 (OAuth Flows + Subtitle Timeline Fixes)_

## Current State
All three OAuth platforms connected and working. Subtitle timeline sync bugs fixed. Ready to test live uploads.

## What Was Built
1. **Meta OAuth fix** — Switched from deprecated `facebook.com/connect/login_success.html` redirect to localhost:8083 callback server (same pattern as YouTube/TikTok)
2. **Subtitle timing desync fix (3-layer):**
   - Store: `updateSegmentTimes` now syncs `seg.words[]` timestamps on trim (clamp/filter) and move (shift delta)
   - Preview: word-driven lookup now gates on `seg.startSec/endSec` before showing subtitle
   - Edit Subtitles panel: `getActiveWordInSeg` returns -1 if playhead outside segment boundaries
3. **Play from beginning** — `togglePlay` detects end-of-video and seeks to 0 before playing
4. **Subtitle drag overlap** — Drag temporarily shrinks neighbors (reversible), splits on drop in middle. Not perfect — logged for full fix later.
5. **Timeline horizontal scroll handler** — Added explicit `onWheel` with `deltaX` support. Still not working for MX Master — logged for later.

## Key Decisions
- Meta OAuth uses localhost:8083 (dev mode auto-allows localhost redirects)
- YouTube default privacy is `public` — user chose to keep it for live testing
- TikTok is `SELF_ONLY` (sandbox forces private)
- Instagram/Facebook have no privacy API — always public

## Connected Platforms (Fega's test accounts)
- YouTube: Fega
- Meta (Instagram + Facebook): Fega Ofovwe / FegaGaming
- TikTok: Fega

## Next Steps
- **Test live uploads** to all three platforms (YouTube, Instagram, Facebook, TikTok)
- Check publish logs at `%APPDATA%/clipflow/logs/` if anything breaks
- Fix subtitle drag overlap behavior (make it fully non-destructive)
- Fix MX Master horizontal scroll on timeline
- Style OAuth callback pages to match ClipFlow theme (logged for later)

## Watch Out For
- Meta app is in dev mode — localhost redirects work but won't in production without proper domain
- YouTube uploads will be PUBLIC — be intentional about what you upload
- Subtitle drag split creates segments with empty `words[]` — word-level highlighting won't work on split pieces until re-transcribed
- The `addSegmentAt` store action doesn't split word-level data — it creates bare segments

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/clipflow-2026-03-24.log`
- Publish log: `%APPDATA%/clipflow/clipflow-publish-log.json`
- All OAuth flows log to console with `[Meta OAuth]`, `[YouTube OAuth]`, `[TikTok OAuth]` prefixes
