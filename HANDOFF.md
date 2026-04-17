# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 5) — "B1 refactor + editor autosave"_

---

## TL;DR

Session 5 tied off two pieces of outstanding work from the session-4 board:

1. **B1 (#34) — Subtitle extends now populate from source-wide transcription.** Take-1 + take-2 fixes worked; refactored to unify primary + source-wide extras through a single cleanup pipeline so the extras don't bypass dedup/validation/timestamp-cleanup. Closed #34.
2. **B2a (#36) — Editor autosave shipped.** Debounced 800ms saves on every edit, plus window-blur + editor-unmount flushes. Verified by force-killing the renderer via Task Manager — edits survived. Closed #36.

**#35 renderer crash is still unresolved.** Autosave mitigates it (crashes are no longer destructive), but the `blink::DOMDataStore` 0xC0000005 fault itself is unchanged. Sentry now shows 57 events and the crash fires in the projects tab too, not just editor.

---

## 🚨 Start Here — Read First

### 1. #35 is still the most important bug.

The renderer keeps crashing natively in Chromium's `blink::DOMDataStore::GetWrapper` with exit code `-1073741819` (ACCESS_VIOLATION). Sentry breadcrumb pattern from the latest event (CLIPFLOW-4, issue id `7381799876`):

- Rapid seek + play/pause
- Shadcn Slider thumb dragged during scrubbing
- Timeline track clicks
- Crash ~80s into editor use

Happens in both the editor AND the projects tab. Both mount `<video>` elements. Both have unmount cleanup. Phase 4 hardening (preload=metadata, imperative src teardown) did not prevent it. Autosave now makes this non-destructive, buying time to investigate properly.

**Next session B3 — get real data:** install Electron `crashReporter` to capture minidumps, try disabling the thumb-drag on Slider to see if it's the trigger, or fall back to a native HTML5 range input for the timeline slider.

### 2. Autosave is live — don't accidentally break it.

Contract:
- **Persistence path** is the existing `project:updateClip` IPC (`main.js:1463`) — no new IPCs, no schema changes.
- **Shared save logic** lives in `useEditorStore._doSilentSave` (extracted from old `handleSave` body). `handleSave` is now a thin wrapper. Autosave timer + flush both call `_doSilentSave`. All three paths MUST stay in sync.
- **Concurrency**: `_savesInFlight` is a COUNTER, not a boolean. Explicit Save during autosave IPC: both run, main process serializes via electron-store, last write wins with freshest data.
- **Loop prevention**: `_doSilentSave` calls `set({ dirty: false })`, which fires useEditorStore subscribe, which calls `scheduleAutosave`. The `_savesInFlight > 0` guard stops this from looping. If you refactor, keep the guard.
- **State storage**: `_autosaveTimer` and `_savesInFlight` live in module-closure vars, NOT in Zustand state. Putting them in state would re-trigger subscribe listeners on timer set and infinite-loop.
- **Subscriptions**: set up in `EditorLayout.js` at editor mount (second useEffect after the undo/redo one). 4 `store.subscribe(listener)` calls, all calling `scheduleAutosave`. `window.blur` listener calls `flushAutosave`. Cleanup unsubs + flushes.

---

## 📋 Remaining Board (from session 4 + new)

From the original 10-item bug/cleanup list in session-4 HANDOFF:

| Tag | Issue | Status |
|-----|-------|--------|
| B1 | #34 subtitle extends | ✅ fixed + refactored, closed |
| B2 | #35 renderer crash | ⚠️ mitigated by autosave, root cause unresolved |
| B2a | #36 autosave | ✅ shipped, closed |
| B3 | #37 subtitle mismatch regression | 🔲 blocked on repro |
| B4 | #38 60fps → 25fps drop in cutClip | 🔲 deferred (FFmpeg missing `-r 60`) |
| V1 | #39 Phase 4 13-step verification walk | 🔲 pending |
| C1-C3 | #40-42 hygiene cleanups | 🔲 low priority |
| P1 | #43 Sentry launch backlog | 🔲 pre-launch |
| — | #44 double setSegmentMode on init | 🔲 new, chore |

---

## What Was Built This Session

### B1 refactor (commit `ace4a76`)
`useSubtitleStore.initSegments` now builds a union of primary + source-wide extras (sorted by start time) and runs the entire cleanup pipeline once over the union — mega-segment filter, duplicate-segment dedup, consecutive-word dedup, `mergeWordTokens`, `validateWords`, `cleanWordTimestamps`. Previously the take-2 fix had extras bypassing those steps.

Also tightened the `source=` log line to report `effectiveSource` (accounts for `transcriptionIsStale` and legacy-flat-array case).

### Autosave (this commit)
**`src/renderer/editor/stores/useEditorStore.js`:**
- Module-closure: `_autosaveTimer`, `_savesInFlight`, `AUTOSAVE_DEBOUNCE_MS = 800`
- New action `_doSilentSave` — extracted body of old `handleSave`, no UI side effects
- `handleSave` now wraps `_doSilentSave` with counter guard + timer cancel
- New action `scheduleAutosave` — 800ms debounce, guards on `_savesInFlight > 0`, clip/project presence, `extending` flag
- New action `flushAutosave` — cancels timer, runs immediate save unless already in flight

**`src/renderer/editor/components/EditorLayout.js`:**
- Added second top-level `useEffect`: subscribes to 4 stores (subtitle, caption, layout, editor) — any state change calls `scheduleAutosave`. Also wires `window.addEventListener('blur', flushAutosave)`. Cleanup unsubs + flushes.

---

## Key Decisions

1. **No `dirty` gate on autosave.** Verified that style setters in `RightPanelNew.js:1229` pass raw setters (`setFontFamily={setSubFontFamily}`) without `markDirty` wraps, and `LeftPanelNew.js:343` `setSegmentMode` doesn't either. Gating on dirty would miss font/segment-mode changes. 800ms debounce absorbs the noise from saving on non-persistable state changes (e.g., `activeSegId`, playback position is in a different store so doesn't trigger).

2. **No `beforeunload` flush.** Electron can't synchronously IPC from beforeunload, and renderer crashes bypass it anyway. The 800ms debounce + blur flush are the real protection.

3. **Counter, not boolean, for `_savesInFlight`.** Concurrent explicit Save + autosave can BOTH run; main process serializes. Boolean would have bailed the second save and lost edits made during the first IPC.

4. **No restore UI.** `initFromContext` at `useEditorStore.js:145-162` already reads `clip.subtitles.sub1`, `clip.subtitleStyle`, `clip.captionStyle` on every open. Autosave writes exactly those fields. Transparent round-trip.

---

## Next Steps (recommended next-session focus, ranked)

1. **#35 renderer crash** — real investigation now that autosave makes failures non-destructive. Options: Electron `crashReporter.start()` for proper minidumps, swap shadcn Slider thumb for native input, or audit every remaining `<video>` element for cleanup gaps. Breadcrumb pattern in Sentry issue `7381799876` is the starting point.
2. **B4 #38 60fps drop** — quick win. `cutClip` in `src/main/ffmpeg.js:109-134` is missing `-r 60` (or `-r` matching probed source fps). Fix is one line; verify with `ffprobe` on output.
3. **V1 #39 Phase 4 verification** — walk the 13-step checklist to confirm no regressions from the session-3 Phase 4 ship.
4. **C1-C3 hygiene** — delete dead DBG logs and removed IPCs once the board is quieter.

---

## Watch Out For

- **Don't move `_autosaveTimer` or `_savesInFlight` into Zustand state** — infinite subscribe loop guaranteed.
- **Don't convert `_savesInFlight` back to a boolean** — lost-edit race on clip-switch.
- **Don't remove the `_savesInFlight > 0` guard in `scheduleAutosave`** — the `dirty: false` echo from `_doSilentSave` will loop forever.
- **Don't autosave during `extending: true`** — FFmpeg extend/revert handlers are actively writing `{sourceStartTime, duration, ...}` via the same `project:updateClip` IPC. Racing could clobber. Current guard handles this.
- **The 800ms autosave runs during clip open too** — initFromContext does many store writes during template application + initSegments. This triggers one (harmless, idempotent) autosave right after load. If it becomes noisy in logs, add a `_suppressAutosaveUntil = Date.now() + 2000` on initFromContext entry.

---

## Logs / Debugging

- **Autosave success**: grep `[autosave] saved clipId=` in `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\trim-debug.log`
- **Renderer crash**: grep `RENDER-GONE` in `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\logs\app.log`. Exit code `-1073741819` = `0xC0000005` = ACCESS_VIOLATION, confirms native crash (not JS).
- **Sentry**: `https://sentry.io/api/0/projects/flowve/clipflow/issues/?query=is:unresolved&sort=date&limit=15`. Token in `C:\Users\IAmAbsolute\.claude\sentry_token.txt`. Main active issue is CLIPFLOW-4 (`7381799876`).
- **Clip data on disk**: `{watchFolder}/{projectId}/project.json` → `clips[].subtitles`, `clips[].subtitleStyle`, etc. Direct inspection confirms autosave writes landed.

---

## Verification Completed This Session

- [x] `npx react-scripts build` clean, +400 bytes gzipped, no warnings
- [x] App launched, editor opened clip, edits made
- [x] Force-killed renderer via Task Manager mid-edit
- [x] Reopened clip → edits survived (user-confirmed)
- [x] Build SHA: `main.7e7ed0a0.js`
