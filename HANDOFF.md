# ClipFlow — Session Handoff
_Last updated: 2026-06-02 — Session 50 — #104 dead audio-resize subsystem removed + dead-code inventory on #40_

---

## One-line TL;DR

Deleted the entire dead single-block audio-resize/extend/recut subsystem (#104 — ~759 lines, 15 symbols across 3 files, all caller-verified to zero live refs first), proved `clipflow-trace-verify` works on its first real test (it caught two HANDOFF inaccuracies), and produced a tiered dead-code inventory for the rest of the codebase (posted to #40). Renderer builds clean; user smoke-tested (app loads, no deleted-symbol errors).

## Current State

App builds clean (`npm run build:renderer` → 2734 modules, only the pre-existing #73 chunk-size warning). `main.js`/`preload.js` syntax-checked with `node --check`. Working tree clean, everything pushed to master. Latest commit `3d6be91`. v0.1.5-alpha, prod profile.

## What Was Built / Done

- **#104 CLOSED — removed the dead single-block audio-resize subsystem.** The legacy `audioSegments`-based "drag edge → commit on mouse-up → re-encode" flow, fully superseded by the live per-segment NLE trim (`TimelinePanelNew` → one `WaveformTrack` per `nleSegment` → `segmentOps.js trimNleSegmentLeft/Right`). Removed across 3 files:
  - `useEditorStore.js`: `deleteAudioSegment`, `resizeAudioSegment`, `commitAudioResize`, `commitLeftExtend`, `_shiftAndPrependSubtitles`, `_shiftCaptionLeft`, `_extendSubtitles`, `_extendCaptionToAudioEnd`, `_recutAfterDelete`, `revertClipBoundaries`
  - `preload.js`: `extendClip`, `extendClipLeft`, `recutClip`
  - `main.js`: `ensureNleSegments` + `clip:extend`, `clip:extendLeft`, `clip:recut` handlers
  - **Live path preserved:** `rippleDeleteAudioSegment`, `_concatRecutAfterDelete`, `_trimToAudioBounds`, `concatRecutClip` / `clip:concatRecut`. Also fixed one stale comment that referenced the deleted `deleteAudioSegment`.
- **Dead-code inventory → #40** (comment). Tiered map of remaining dead code with a method note. See Next Steps.
- **Issue bookkeeping:** #104 closed (label `status: untested`); #64 updated with a concrete root cause; #106 filed (passive-listener console error).

## Key Decisions

| Decision | Why |
|---|---|
| Delete the FULL verified island (15 symbols), not the 6 HANDOFF listed | Leaving half a dead subsystem re-creates the exact "is this live?" confusion. All 15 caller-verified dead. |
| Detection ≠ deletion | Produced an inventory (#40) but deleted nothing beyond #104 — deletion stays incremental + per-symbol verified. |
| knip is NOT the right detector for ClipFlow | Dead code here is object-literal Zustand actions + IPC channels — neither is an ES export, so knip is blind/noisy. Per-symbol reference counting + handled-vs-invoked IPC diffing is the real detector. |

## Next Steps (prioritized)

1. **Tier 1 cleanup (#40):** 23 dead Zustand actions, same #104 discipline (grep callers + confirm no live twin, delete in verified batches). Notables: `extendNleSegmentLeft/Right` (likely superseded by `segmentOps` trim), `audioSegments` remnants (`setAudioSegments`/`initAudioSegments`/`splitAudioSegment`), unwired subtitle UI (`canUndo`/`canRedo`/`toggleShowSubs`/`setEmojiOn`). Full list in the #40 comment.
2. **Tier 2 (#40):** 3 unused files (`waveformUtils.js`, `editorPrimitives.js`, `main/publish.js`) + 9 unused npm deps (7 radix + 2 csv + `@electron/rebuild`) — verify, then remove.
3. **#64 waveform MAXBUFFER** — root cause now known (large-source PCM > 50MB buffer); fix = downsample in ffmpeg or stream via spawn, don't just raise the cap.
4. **Real user bugs when ready:** #78 / #84 (user subtitle edits silently lost on reopen) — the trust-killing class.

## Watch Out For

- **#104 is `status: untested`** — user confirmed "cuts look fine" + clean console, but interactive trim/delete wasn't explicitly walked. Remove the label once trim-inward + ripple-delete are confirmed working.
- **Extend-outward may do nothing — PRE-EXISTING, not a #104 regression.** The live extend setters `extendNleSegmentLeft/Right` were already dead before this session (they're in the Tier 1 list). #104 didn't touch extend behavior.
- **Tier 1 needs per-symbol verification before deletion** — the inventory is a candidate map, not a delete list. Some "unwired subtitle UI" may be intentionally-staged features, not rot.
- **HANDOFF self-correction precedent:** the session-49 HANDOFF mis-credited the live concat keeper and undercounted the dead set. Trust grep over prior handoff prose.

## Logs / Debugging

- **Build:** `npm run build:renderer` clean (2734 modules, 12.13s). `node --check` passed on main.js + preload.js. No `npm run build` installer this session.
- **DevTools during smoke test surfaced two pre-existing errors (NOT from #104):**
  - `Waveform extraction failed (track 0): ERR_CHILD_PROCESS_STDIO_MAXBUFFER` → root cause for #64 (PCM overflow past the 50MB `execFile` buffer in `ffmpeg.js:332`). Recorded on #64.
  - `Unable to preventDefault inside passive event listener` (react-dom) → filed as #106.
  - Confirmed ABSENT: any error referencing `commitAudioResize` / `recutClip` / `extendClip` / `resizeAudioSegment` — proves the cuts are clean.
- **Dead-code audit method (reusable):** per-symbol reference count across `src/` (action name appearing once = dead) + IPC handled-vs-invoked diff. knip only useful for unused files/deps; its "unused exports" are CJS dynamic-require noise.
- **Commits this session:** `3d6be91` (#104 removal + CHANGELOG session-50 entry) + this HANDOFF commit.
