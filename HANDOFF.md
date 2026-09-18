# HANDOFF — Session 265 (2026-09-18)

## Current State

**0.5.0-alpha.8 is on the update feed** (`e53bbae`). It carries the three Layout panel changes (#442
This section by default, #443 Ctrl+Z for every layout change, #444 saved-layout marks) and last
session's double-post fix (#438). 543 tests. #442, #443 and #444 are **open**, waiting on Fega's test
of alpha.8. Master is clean at this wrap's commit.

## Key Decisions

- **Layout undo rides the existing editor undo stack**, not a separate one, so Ctrl+Z order stays
  one timeline across subtitles, sections and layouts. `_snapshotLayouts()` in `useEditorStore` is
  added to every snapshot in `useSubtitleStore` `_pushUndo`/`undo`/`redo`.
- **Clip and every-clip layouts restore through a new `project:restoreLayouts` IPC**, which writes
  only `reframe` keys and only for clips whose record differs. The open clip's section layouts stay
  on `nleSegments` and are saved by autosave.
- **The edit view has its own step history** (`_draftPast`/`_draftFuture`, 400 ms gap = one gesture).
  While a draft is open, Ctrl+Z and the toolbar arrows (`editorUndo`/`editorRedo` in
  `useEditorShortcuts.js`) never fall through to the main stack.
- **Marks match by `layoutId` (started from) and add "edited" via `sameReframeLook`.** This was
  Fega's pick; 95 of 118 real section layouts come out "edited".
- **Scope resets to "section"** on clip load, on every drawer open and on a timeline section click.
  The first-time setup banner forces "clip".

## Next Steps

1. **Ask Fega how alpha.8 went.** The checks: drawer opens on This section after clicking a section;
   Ctrl+Z after trying saved layouts (section and This clip); drag boxes in Edit layout, then Ctrl+Z.
   Close #442/#443/#444 on confirmation.
2. **#438 in alpha.8:** the first real end-to-end is the next scheduled post that fires while Corva
   is open. Its card should read Publishing..., show no Post button, then leave the Queue.
3. Carry-overs: alpha.7 items still `status: untested` (#433–#437); #439 (Post with no platforms is
   silent) is a good small pick; #440; ask about #425, #419, #418, #416, #265; the 2026-09-16
   duplicate posts are Fega's call.
4. The recording-levels "Apply to every clip" (#272) is also permanent. I offered to file it as an
   undo issue and Fega hasn't answered.

## Watch Out For

- **`_snapshotLayouts` runs on every undo push**, subtitle keystrokes included. It walks
  `project.clips` × sections. That's cheap at today's sizes but grows with project size.
- **A clip-level write pushes its undo step before the IPC await.** If the write fails, that entry
  restores identical state, so one Ctrl+Z appears to do nothing.
- **`_pushUndo`'s 300 ms debounce** merges a layout click made within 300 ms of another undoable
  edit into the same step.
- **Restoring other clips writes from the editor's in-memory project** (loaded at clip open), layout
  keys only. Safe while nothing else edits other clips' layouts during an editor session.
- **A project with no layout always loads as `reframe: null`** (`loadProject` normalizes it).
  "inherit" and null are the same at project level.
- **The Layout drawer's ScrollArea now has the #215 `!block` clamp.** Anything added there truncates
  instead of widening the drawer (see the editor-patterns line added this session).
- `main.js`, `PreviewPanelNew.js` and `clipReframe.test.js` are LF in the working copy. That's
  pre-existing and uniform, not mixed.
- The dev profile was restored byte-identical from `dev-settings.backup.json`, tokens are
  `{"accounts":{}}`, and `Corva.exe` was never touched. The fixture in the scratchpad is disposable.

## Logs / Debugging

- New user-facing error: `layoutNotice` "Couldn't restore the layout on disk: <err>" when
  `project:restoreLayouts` fails during undo or redo.
- **Checking an undo on disk:** the project file's clip `reframe` and each `nleSegments[].reframe`.
  The open clip's sections land about 800 ms after the keypress (autosave). Read too early and you
  see the pre-undo state.
- Scratchpad drivers (`…/3af53cfa…/scratchpad`):
  - `mkfixture.js`: rejected-only project copy with seeded section layouts; repoints the dev profile.
  - `restore.js`: puts the dev settings back.
  - `cdp.js`: `eval`/`shot`/`key`/`click`/`drag` via trusted input.
  - `lib.js`: installs `window.__t` (drawer state dump).
  - `open.js`: opens the editor via the fiber prop.
  - Actions: `scope.js`, `apply.js`, `replace.js`, `edit.js`, `steps.js`, `rects.js`.
  - Disk checks: `disk.js` (layout names), `diff.js` (field diff vs a snapshot).
