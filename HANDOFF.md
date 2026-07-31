# ClipFlow — Session Handoff

_Last updated: 2026-07-30 — Session 141 — **A crash fix and an editor keyboard layer, both verified in the running app and shipped as `0.3.0-alpha.35`. Fega is installing it now; nothing is confirmed.**_

---

## One-line TL;DR

Fega hit a crash adding a game from the Rename tab (Sentry had it), then asked for
a responsive spacebar plus five new edit keys and a shortcuts popup; all of it is
built, verified over CDP down to a rendered MP4, and cut as alpha.35 — plus a
pre-existing bug found on the way: timeline edits were never actually undoable.

## Current State

Healthy. Master clean at `562b722`. Two issues — [#219](https://github.com/Oghenefega/ClipFlow/issues/219)
and [#220](https://github.com/Oghenefega/ClipFlow/issues/220) — deliberately left **open**
pending Fega's test on the daily driver.

---

## What Was Just Built

### 1. Add Game crash from the Rename tab (#219, `fb7e264`)

`RenameView.js:1682` passed `onAddGame` **directly** as the click handler, so React called it with
the `SyntheticMouseEvent`. That object became `showAddGame`, flowed through `AddGameModal` as
`entryType`, landed in `gamesDb`, and threw `An object could not be cloned` at
`persist("gamesDb")` → `storeSet` — killing the app to the error boundary with the new game unsaved.
Settings' button was always correct (`onAddGame("game")`).

No visible symptom until the end: `isContent = entryType === "content"` is false for an event, so the
modal rendered normally and the crash only landed on **Done**.

Fixed at the button, plus both `onAddGame` props in `App.js` now reject any non-string argument.
Sentry issue `7643312624`; the minified crash frame decoded to the `persist` helper and column
`766:8392` landed exactly on `Xr("gamesDb", y)`.

### 2. Editor keyboard layer (#220, `e5e400d`)

**Spacebar reliability.** `playing` was write-only toward the `<video>`: `PreviewPanelNew` pushed the
flag at the element and swallowed the result with `play().catch(() => {})`, and nothing read the
element's real state back (the `<video>` carried only `onEnded`). A failed start left the flag lying,
so the next Space "paused" an already-paused video and looked dead. Now the element reports itself
via `onPlay`/`onPause`, and a rejected `play()` drops the flag and `console.warn`s the reason.
**The trigger for the failed start was never reproduced** — this fixes the class, not a guess.

**One always-mounted key layer.** Every shortcut previously lived in an effect inside
`TimelinePanelNew.js:790-820`, which unmounts when the timeline is collapsed — so Space, Split and
Delete simply ceased to exist there. All keys now live in `shortcuts/useEditorShortcuts.js`, mounted
by `EditorLayout`. Undo/redo moved in too, so one registry drives both the keys and the cheat sheet.

**New keys:** `U` split (moved off `S`), `M`/`S` start/end-to-playhead, `R` forward shuttle
(1.5×/2×/4×/normal), `E` rewind at the same rungs.

**Rebindable overlay:** `ShortcutsDialog.js`, opened by `?` or the toolbar key icon, rendered off
`shortcuts/registry.js`. Rebinds persist to `editorShortcuts` in electron-store; conflicts name the
holding action instead of silently applying.

### 3. Timeline undo repair (inside `e5e400d`) — scope beyond the approved plan

`useEditorStore._pushNleUndo()` delegates to `useSubtitleStore._pushUndo()`, whose snapshot only ever
held `editSegments` + `styling` — **never `nleSegments`**. So split / delete-section / trim / reorder
have **never** been restorable with Ctrl+Z, despite all of them recording an undo step. Fixed by
adding `nleSegments` to the snapshot (`_snapshotNle` / `_restoreNle`).

Done deliberately and flagged to Fega, not buried: M and S destroy footage, and the approved plan
promised they'd be undoable. This fixes undo for every timeline operation, not just the new keys.

---

## Key Decisions

- **Fixed the class, not the trigger, for the Space bug.** A plausible root-cause story was available
  but unreproduced. Making the element the source of truth removes the failure mode regardless of
  cause, and the warn log means a recurrence names its own trigger.
- **Split/Delete stay owned by the timeline panel.** They read its local `selectedTrack` /
  `selectedSegIds`. Hoisting that into a store is the "right" architecture but far wider than this
  request; instead the panel publishes those two handlers via `shortcuts/timelineHandlers.js` while
  mounted. Consequence by design: **U and Delete no-op while the timeline is collapsed.**
- **`playbackRate` moved from `TimelinePanelNew` to `PreviewPanelNew`** — the timeline unmounts when
  collapsed, which would have left `R` unable to change speed there.
- **M/S act on the section under the playhead, selection ignored** (Fega's choice). Sitting exactly on
  a join resolves to the *later* section, or M would shave the previous one to the 50ms minimum
  instead of dropping it.
- **`E` is silent by design** — `<video>` has no reverse gear, so rewind is a rAF walking the playhead
  back through `seekTo` with the element paused. Agreed with Fega before building.
- **Shift folds into printable characters but is recorded alongside Ctrl/Alt** — so `?` stores as `"?"`
  (not `shift+?`) while `Ctrl+Shift+Z` stays distinct from `Ctrl+Z`. `altKeys` in the registry
  preserves the historic `Backspace` (delete) and `Ctrl+Shift+Z` (redo) bindings.
- **Version ticked alpha.34 → alpha.35.** Never move the minor number without Fega saying so.

---

## Next Steps

1. **Wait for Fega's verdict on alpha.35.** Close #219 and #220 on confirmation; both are open
   precisely because he hasn't tested yet.
2. **Manually poke the typing guard in the clip-title field.** Verified on the AI-context textarea;
   the title input is the same `INPUT`/`TEXTAREA`/`contentEditable` branch but was never directly
   observed (a synthetic click wouldn't swap that node to an input).
3. **Watch how `E` feels at 4× on real footage.** Measured accurate; never judged for feel. If it
   stutters, the first lever is throttling the element seek — the store's `currentTime` should stay
   at 60fps regardless.
4. Backlog: `gh issue list --repo Oghenefega/ClipFlow --search 'is:open -label:"track: launch-ops"'`.

---

## Watch Out For

- **`CLIPFLOW_PROFILE=dev` does NOT sandbox project data.** Dev and prod share `projectsRoot`
  (`W:\…\Vertical Recordings Onwards`); only `userData` and `outputFolder` differ. A destructive
  verification this session trimmed a **real** clip (`2026-07-21 EO Day4 Pt1` →
  "This shortcut is INSANE #eggingon") from 27.3s to 5s, and autosave persisted it in under a second.
  Restored via in-app undo + Save and confirmed on disk at `sourceEnd: 749.8674`. **Check
  `projectsRoot` on both profiles and record pre-state before any destructive test.**
- **Undo snapshots are shared across subtitles and the timeline**, with a 300ms debounce and a
  `_dragging` no-op. Rapid successive edits merge into one undo entry — expected, but surprising.
- **U and Delete are inert with the timeline collapsed** (see Key Decisions). Not a bug.
- **`_pushNleUndo` is a misleading name** — it pushes a *subtitle-store* snapshot that now also
  carries `nleSegments`. There is one stack, not two.
- The clip-title input didn't respond to a synthetic `.click()` during verification — if you need to
  drive it, use trusted `Input.dispatchMouseEvent`.

---

## Logs / Debugging

- **Sentry** — token at `C:\Users\IAmAbsolute\.claude\sentry_token.txt`, org `flowve`, project
  `clipflow`:
  `curl -H "Authorization: Bearer <token>" "https://sentry.io/api/0/projects/flowve/clipflow/issues/?query=is:unresolved&sort=date&limit=10"`.
  WebFetch can't pass auth headers — use curl. Latest event:
  `https://sentry.io/api/0/issues/<id>/events/latest/`. This session's crash decoded cleanly by
  reading `build/assets/index-*.js` at the reported line/column, because that exact bundle was still
  in `build/`. Breadcrumbs also identify the view — the `.cfr-*` class names in the click trail are
  Rename-view only, which is how the wrong button was identified.
- **New:** `console.warn("[ClipFlow] video.play() rejected:", name, message)` fires if playback ever
  fails to start. If Fega reports a dead spacebar again, that line names the real trigger — it is the
  whole reason it exists. Remove once we've seen it, or after a few quiet sessions.
- **`requestAnimationFrame` fires ZERO times in an occluded Electron window.** Cost three probe
  rounds this session: the rewind loop looked totally broken while `document.visibilityState` was
  `"hidden"`. Video playback, seeks, store writes and DOM updates all keep working, so only the
  rAF-driven feature appears dead — which reads as "I wrote a bug". Fix: `Page.enable` →
  `Page.bringToFront` before evaluating. After fronting: 121 frames/500ms.
- **CDP toolkit** in the session scratchpad
  (`…\claude\C--Users-IAmAbsolute-Desktop-ClipFlow\69384ec0…\scratchpad`): `cdp.js` (plain evaluator),
  `cdp2.js` (fronts the window first — **use this one**), `lib.js` (shared helpers: `times()`,
  `durationSec()`, `speedLabel()`, `press()`), plus the `test_*.js` suite.
- Launch for verification: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`.
  Kill with `taskkill //F //IM electron.exe` — never TaskStop (orphans hold port 9222 and the next
  CDP session silently attaches to the stale bundle).
- Useful editor DOM handles: `.segment-block` (timeline subtitle/caption blocks — a real segment
  count), `.pl-row` (left-panel rows). Timecode readouts matching `/^\d{2}:\d{2}\.\d$/` are
  `[currentTime, duration]` — **not** subtitle rows; mistaking them produced a false negative here.
- Verify what actually shipped by grepping the asar directly
  (`grep -c "<string>" dist/win-unpacked/resources/app.asar`) — never `asar extract-file` from the
  repo root, it overwrites `package.json` with the stripped packaged copy.
