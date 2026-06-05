# ClipFlow — Session Handoff
_Last updated: 2026-06-04 — Session 54 — "Delete subtitle + clip" now cuts only the span (no more timeline wipe); duplicated logic extracted to one shared store action (#109). Committed + pushed (`26d5c8a`)._

---

## One-line TL;DR

"Delete subtitle + clip" was wiping the entire timeline because both copies of the handler deleted the *whole* overlapping NLE segment (and a clip is usually one full-length segment). Rewrote it to isolate and cut only the subtitle's/caption's span, then extracted the duplicated logic into a single `useEditorStore.deleteSpanWithClip` action. Fega verified the fix on a fresh clip. All committed + pushed.

## Current State

Renderer builds clean (`npm run build:renderer`, ~10s, only the pre-existing #73 chunk-size warning). v0.1.5-alpha, prod profile. Working tree clean except the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json` — intentionally NOT committed). HEAD = `26d5c8a`.

## What Was Built (session 54)

- **Fixed "Delete subtitle + clip" wiping the timeline (verified).** Both entry points deleted the whole overlapping NLE segment; since a clip is typically a single NLE segment spanning its full length, that zeroed the timeline. Now: map the span → timeline coords, `splitAtTimeline` at both ends, `deleteNleSegment` only the isolated middle slice (gap ripple-closes — timeline position is derived from segment order).
- **Subtitle-to-footage desync avoided.** Switched from `rippleDeleteSegment` to plain `deleteSegment` for the sub/cap. Ripple shifts later subtitles' *source* values left → desync once the NLE span is re-mapped. Plain delete + the `nleSegments` mapping keeps survivors glued to their audio. (The old timeline delete path still ripples — latent desync bug, likely part of #93.)
- **#109 — one shared action.** Extracted `useEditorStore.deleteSpanWithClip(track, segId)`. Both the timeline right-click menu (`TimelinePanelNew` `onDeleteWithAudio`) and the Edit-subtitles row trash menu (`LeftPanelNew`) now delegate. Handles Subtitle (source-absolute → mapped) and Caption (already timeline time) tracks. Closed #109 (`status: untested` — post-refactor build not re-clicked by Fega).
- **Two earlier-session entry points were duplicates.** That's why the first fix attempt (LeftPanel row menu) didn't change what Fega saw (he was using the timeline right-click). Both fixed; now unified.

## Key Decisions

- **"Delete subtitle/caption + clip" = cut only that span** (Fega-confirmed via AskUserQuestion: cut only this span, remove video + subtitle). NOT delete the whole containing segment.
- **Built on the live `nleSegments` timeline, abandoned the legacy `audioSegments` path.** The old handler was the only caller of `rippleDeleteAudioSegment` and mixed coordinate spaces (clip-relative audio vs source-absolute subs).
- **Plain delete, never ripple, for the sub/cap in this action** — the mapping repositions survivors; rippling would desync them.

## Next Steps (prioritized)

1. **#108 — remove dead legacy `audioSegments` subsystem.** `rippleDeleteAudioSegment` now has 0 callers; the broader subsystem (`initAudioSegments`, `splitAudioSegment`, `_trimToAudioBounds`, `_concatRecutAfterDelete`, ~25 refs in useEditorStore) is legacy. **CAUTION: `audioSegments` is still persisted on save** (`useEditorStore.js:653`), so this is a back-compat audit, not a blind delete. Do the audit (no live readers across renderer + main + `render.js`), write a short plan, then remove/quarantine. Fold into #40 if preferred.
2. **#78/#84 string-timestamp fix** (still owed): editor-saved clips render an EMPTY panel because `initSegments` reads display-string `s.start`/`s.end` into numeric `startSec` → NaN. Implemented last session but UNVERIFIED. Test editor-saved-clip persistence.
3. Backlog: #107 (split-at-word on internal-deletion clips), #95/#98/#87 (subtitle word/id edge cases), #64 (waveform MAXBUFFER), #105 (over-trim sliver), #40 (dead-code hygiene), #93 (audioSegments/nleSegments sync — note the ripple-desync in the *old* timeline delete path).

## Watch Out For

- **Editor-saved clips still render an EMPTY panel** — that's the #78/#84 string-`startSec` bug (NaN → segments dropped), NOT a regression. Test editor work on freshly-cut / retranscribed clips until #78/#84 is fixed.
- **Source vs timeline coordinate domains are THE recurring editor footgun.** Playback `currentTime`/`duration` = TIMELINE; raw subtitle store `editSegments` `startSec`/`endSec`/`words[].start` = SOURCE-absolute; **caption store `captionSegments` = TIMELINE time** (not mapped, unlike subtitles); the panel maps source→timeline via `getTimelineMapped*` before render. `seekTo`/`updateSegmentTimes`: `seekTo` expects TIMELINE, `createSegmentAtTime`/`updateSegmentTimes` expect SOURCE. Declare which space any new math is in.
- **Two "Delete subtitle + clip" buttons exist** (timeline right-click + Edit-subtitles row trash, the latter hidden until row hover). They now share `deleteSpanWithClip` — change the action, not the call sites.
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** — they mutate every `npm start`.

## Logs / Debugging

- **Build:** `npm run build:renderer` clean (~10s, only the #73 chunk-size warning). Renderer loads from `build/` (`isDev=false`). **`npm start` does NOT auto-rebuild** — always `build:renderer` first or you'll test stale code.
- **Relaunch loop:** `taskkill //F //IM electron.exe //T` before a fresh `npm start` (clears single-instance lock / stale in-memory bundle).
- **DevTools in prod:** `CLIPFLOW_DEVTOOLS=1 npm start`.
- **Boot signal:** look for `(system) > App started {...}` + `(database) > Database initialized ... (schema v4)` in the npm start output. GPU/`disk_cache`/`service_worker_storage` ERROR lines on launch are benign Chromium noise on Windows, not crashes.
- **The shared cut action:** `useEditorStore.deleteSpanWithClip(track, segId)` — `track` is `"sub"` or `"cap"`; subtitle span comes from raw source-absolute `editSegments` (mapped via `sourceToTimeline`), caption span is read straight off `captionSegments`.
