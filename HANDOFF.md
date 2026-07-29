# ClipFlow — Session Handoff

_Last updated: 2026-07-29 — Session 136 — **Two Queue-row shortcuts, the "Clip N.mp4" filename bug fixed at its real cause, render thumbnails out of the user's output folder, Alt+scroll timeline zoom, and a full library cleanup. All in source, NOT yet on Fega's installed daily driver. Next: the audio-folder library (#208) — plan is already written in `tasks/todo.md`.**_

---

## One-line TL;DR

Five user-facing changes shipped to master and verified on the dev build, Fega's
renders folder went from 53 videos + 54 stray thumbnails to videos only, and the
next session's work (#208, watch real audio folders instead of copying them) is
planned in detail off measurements of his actual library.

## Current State

Version is still **0.3.0-alpha.28** — **no installer was cut this session, at
Fega's request.** Four user-facing changes are sitting in source unverified by
him: the two Queue-row buttons, the render-filename fix, the thumbnail move, and
Alt+scroll zoom. **Cutting an installer is the first thing to offer next
session** — he tests on the installed exe, so none of this has reached him.

Open issues touched: **#188** (filename bug — fixed, left open pending his
verification), **#204/#205/#207** (this session's work, open pending
verification), **#206** (library hygiene — orphan renders, awaiting his call),
**#208** (audio folders — next session's work).

## What Was Built (session 136 — commits dd69b89, 8ea4cfb, 845d1d8)

1. **Queue rows gained two hover buttons (#204).** Show in folder reveals the
   clip's MP4 in Explorer; Open in editor loads that clip directly. Both tables
   (Unscheduled and Scheduled). `editorContext` gained a `from` field so Back
   returns to the Queue instead of a project clip list.
2. **#188 fixed at its real cause.** The originally-filed cause ("the filename is
   read too early") was a symptom. The editor keeps a **whole-record snapshot of
   the open clip taken at load time** (`useEditorStore.js:212`), and
   `buildRenderPayload` spreads it. Retitling only moves `clipTitle`; saving
   persisted the title but never refreshed the snapshot — so Queue stamped the
   file with the title the clip had when it was OPENED. Saving now writes the
   returned record back, gated on `title`/`renderPath`/`thumbnailPath`.
3. **Render thumbnails moved out of the output folder (#205)** into the
   project's own `clips/` folder as `<clipId>_renderthumb.jpg`, where the
   detection and repair thumbnails already live.
4. **Alt + scroll wheel zooms the timeline (#207)**, anchored on the playhead. A
   new branch on the existing non-passive wheel handler; no new listener.
5. **Library cleanup** (one-off scripts against real data, not shipped code):
   29 thumbnails relocated, 25 unreferenced ones deleted, 8 `Clip N.mp4` files
   renamed to their real titles, one orphaned duplicate video deleted, two
   dangling clip pointers cleared.
6. **#208 planned** off measurements of Fega's real audio library — see
   `tasks/todo.md`, section "NEXT SESSION — Audio library".

## Key Decisions

- **The snapshot refresh is gated on three fields**, not applied wholesale.
  `title`, `renderPath` and `thumbnailPath` are the only fields the main process
  rewrites behind the renderer's back, so an ordinary autosave swaps nothing and
  costs no re-render. Nothing in the editor keys an effect on the `clip` object
  (checked: 4 subscribers, all field reads, no `[clip]` deps).
- **A title-only patch was rejected** — it would have made re-renders WORSE.
  `renderPath` goes stale by the same mechanism, and `uniquePath`'s "a clip may
  overwrite its own file" exemption (`projects.js:38`) needs the current path;
  without it a retitled re-render produces `Title (2).mp4` beside an orphaned
  `Title.mp4`.
- **Render thumbnails are keyed by clip id, not render filename** — no collision
  between same-titled clips, and no rename when a title changes. Hence the
  leave-alone entry for `_renderthumb` in `renameThumbnailTo`.
- **Hover reveal mutates style directly** in the row's existing
  mouseenter/mouseleave handlers rather than using a hover state, matching how
  the row wash already works — mousing down a long queue never re-renders it.
- **One rename was deliberately blocked rather than suffixed `(2)`.** The good
  name was held by an unreferenced byte-identical twin; suffixing would have left
  the orphan owning the correct filename. Fega then approved deleting it.
- **Alt, never Ctrl,** for wheel zoom — Ctrl+wheel is browser zoom.
- **#208 direction: link, don't copy.** `V:\AutoSync\` syncs itself, so a copy
  forks the library and the app ends up using the stale side. Copying stays the
  default for other users.
- **#208 classification: duration, not folder names.** Fega's root folder is
  literally named `Sound FX` and holds all ~350 of his music files — any
  name-based rule mislabels every song. Measured: SFX medians 0.6–4.6s vs music
  130–280s; a 60s cut is ~97% correct (73/75 sampled).

## Next Steps

1. **Offer to cut an installer first.** Four changes are waiting and Fega has
   verified none of them. Then close #188/#204/#205/#207 on his confirmation.
2. **#208 — audio-folder library.** Full plan with the measured tree, the
   classification rule and verification steps is in `tasks/todo.md`. Note it
   changes a stored setting shape (`sfxFolder` string → list), so a migration is
   mandatory per `.claude/rules/pipeline.md`.
3. **#206 — library hygiene.** 23 orphan MP4s (~1.37 GB) listed for Fega; he has
   seen the list and not yet said which to delete.
4. **#203 — pictures on clips**, the last phase of the #201 epic, still not
   started.
5. A background task chip is pending to remove the dead `mouseXRef` from
   `TimelinePanelNew.js` (written every mousemove, never read).

## Watch Out For

- **`useEditorStore.clip` is a load-time snapshot, and `clipTitle` is separate
  live state.** They only reconcile via the save path now. Anything new that
  reads `clip.<field>` for an outbound payload must ask whether that field can
  drift mid-session — this is exactly what #188 was.
- **`renameThumbnailTo` decides by filename suffix** and there are now four
  conventions (`_renderthumb`, `_thumb`, `_repairthumb`, `_thumbnail`), two of
  which are id-keyed and must never be renamed. Adding a fifth means updating
  that list or a thumbnail silently detaches.
- **`resolveTestAwareOutputFolder` is per-profile.** The **dev profile's
  `outputFolder` points at `…\Temp\claude\clipflow-thumb-test`** (left by an
  earlier session). Dev renders land there, not in `ClipFlow Renders`. Harmless
  now, but it previously wrote temp paths into REAL clip records — that leak is
  what produced the two dangling pointers cleaned up this session.
- **The dev profile shares the REAL `projectsRoot` (`W:\`).** Any test render,
  retitle or asset write touches Fega's live library. Snapshot `project.json`
  before and restore after — this session did exactly that and verified the
  restore byte-for-byte.
- **`listAssets` PRUNES linked assets whose file vanished** (`assets.js:85-89`).
  Unplugging `V:` today would silently empty the Audio panel. Fixing this is part
  of #208 — do not ship multi-folder watching without it.
- **Don't infer Fega's paths from ambient signals.** I read a folder out of his
  open Explorer windows and built a measured recommendation on a dead legacy
  duplicate. Paths come from a setting, a config file, or from him.

## Logs & Debugging

- **Render filename** derives from `clipData.title` in `resolveRenderOutputPath`
  (`main.js:3111`). To check what the main process actually received, the render
  progress events carry `clipTitle` — the editor topbar pill and App.js's
  floating pill both show it.
- **Reading editor store state from outside** (no `window` handle exists): walk
  the React fiber tree from `#root`'s `__reactContainer$…` key over
  `child`/`sibling`, scanning each fiber's `memoizedState` hook chain for an
  object with a `clip_`-prefixed `id` and a `renderStatus` key. That is
  `useEditorStore.clip` — exactly what the render payload spreads. Lets a
  payload bug be proven without writing a file into the real library. Pass the
  probe to CDP as ONE line; `tr '\n' ' '` over a file with `//` comments
  comments out the rest.
- **`getComputedStyle` lies while the Electron window is backgrounded** —
  Chromium suspends transition ticking, so an element read `opacity: 0` for
  seconds after its inline style was correctly `1`. Fire
  `Page.captureScreenshot` to force a paint, then re-probe. Cost ~5 rounds this
  session before it was recognised.
- **CDP `Input.dispatchMouseEvent` with `type: "mouseWheel"` never acks in this
  Electron build** — the call hangs and no wheel event reaches the page. Use a
  synthetic `new WheelEvent("wheel", {deltaY, altKey, bubbles:true,
  cancelable:true})` dispatched on `document.elementFromPoint(x,y)`; the handler
  is a plain `addEventListener`, so it fires correctly. Validate the plumbing
  first with Shift+scroll, which should move `scrollLeft`.
- **Zoom readback:** the timeline zoom slider's `aria-valuenow` maps as
  `v = log(tlZoom/0.2)/log(100)*100`, so one 1.25× step is +4.85 ≈ +5 points.
  Cross-check against the scroll container's `scrollWidth`.
- Session-136 scratchpad (`a8ea577c…`): `cdp.js` (one-shot evaluator, needs
  `npm i ws --no-save`), `cdp-input.js` (move/click/shot), `cdp-wheel.js` (the
  one that hangs — kept as the record), `cleanup.js` + `cleanup2.js` (the library
  cleanups, `--dry`/`--apply`), `probe-durations.js` (the ffprobe sampling behind
  the #208 classification rule).
- **5 pre-existing test files (`segmentWords`, `trackerCalendarModel`, `signals`,
  `game-profiles`, `ai-prompt`) call `process.exit` and crash jest workers.** Run
  `npx jest src/main/__tests__ src/renderer/editor/models/__tests__` for a clean
  signal (125 tests, all green as of this session).
