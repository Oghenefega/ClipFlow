# ClipFlow — Session Handoff

_Last updated: 2026-07-29 — Session 137 — **The audio library landed: ClipFlow now watches Fega's real folders instead of copying them (#208). 760 tracks, 12.6 GB, nothing duplicated. Shipped as alpha.29, then alpha.30 for two loudness fixes. Fega confirmed the library works ("Phenomenal"); he was testing the volume changes when the session wrapped.**_

---

## One-line TL;DR

`sfxFolder` (one folder, top level only, everything labelled "sfx") became
`audioFolders` (a list, recursive, music/SFX by duration, offline-safe), Fega
pointed it at `V:\AutoSync\Audio` on the real installed app, and two follow-up
installers fixed auditioning at full blast and effects landing at full level.

## Current State

Version **0.3.0-alpha.30**, installed and running on Fega's daily driver.

- **#208 is confirmed working by Fega** on alpha.29 — he added the folder, it
  scanned, he said "Phenomenal". Issue closed with `status: untested` because the
  two loudness changes that followed are still unverified by him.
- **Unverified by Fega and still open:** the two alpha.30 loudness changes
  (preview at 35%, placed SFX at 60%), plus session 136's four — **#188**
  (filename bug), **#204** (Queue row buttons), **#205** (thumbnail placement),
  **#207** (Alt+scroll zoom). All four reached him in alpha.29; none confirmed.
- **#206** (library hygiene — 23 orphan renders, ~1.37 GB) still awaiting his call.

## What Was Built (session 137 — commits bfd4754, cd240d2, 5a8ba01, 69eb1da, 6417417, a4e51d6)

1. **Watched audio folders replace the single Sound Effects Folder (#208).**
   Settings takes a list, each `{ path, enabled }`, scanned recursively and
   linked in place. `sfxFolder` → `audioFolders` ships with a migration (old path
   becomes entry one, old key blanked so it can't resurrect). Toggling a folder
   Off hides its tracks but keeps their favorites and lane choices; only Remove
   forgets them.
2. **Music/SFX split on duration, not folder names.** `MUSIC_MIN_SECONDS = 60`
   already existed and was already applied on the copy path — the folder path
   hardcoded `type: "sfx"`, which is why a 3-minute song scanned from a folder
   showed up as a sound effect. A per-track override (`typeLocked`) pins the
   exceptions and survives every rescan and re-probe.
3. **Linked tracks are flagged, not pruned.** A folder that won't read = the
   whole folder offline (greys out, returns by itself); a file gone from a
   readable folder = missing. Previously both were deleted from the index, so
   unplugging `V:` silently emptied the panel and broke clips already using a
   track.
4. **Durations read in the background**, cached on the index entry and
   invalidated only by size/mtime. 77s for 760 files cold, ~50ms warm.
5. **Panel groups by folder**, collapsed with counts, search cuts through closed
   groups. Sort by **Folder / Name / Length**; Length drops grouping and orders
   each lane so its questionable end comes first.
6. **Group headings stopped contradicting themselves.** A folder named with a
   bare lane word borrows its parent — "Epidemic Sound › SFX", "Sound FX ›
   Effects". Only 3 of Fega's 28 qualify. Headings now carry the real path on
   hover.
7. **Two loudness fixes (alpha.30).** Preview auditioned at 1.0 because
   `togglePlay` never set `volume` at all; now a persisted setting
   (`audioPreviewVolume`, default 0.35) with a speaker button beside Upload.
   Placed SFX default dropped 1.0 → 0.6.

## Key Decisions

- **Link, never copy, for watched folders.** `V:\AutoSync\` syncs itself; a copy
  forks and the stale side is the one the app uses. Copying stays the default for
  the Upload drawer — a file dragged off a Desktop must survive a Downloads clear.
- **The per-folder role dropdown from the session-136 draft was cut.** At 98%
  measured accuracy it earns nothing: every folder it would let Fega label is
  already labelled correctly by duration. Add it only if duration disappoints.
- **The index entry IS the duration cache** — no separate cache file. Same
  `path + mtime + size` invalidation rule `getPeaks` uses.
- **A failed probe records `0`, not `null`,** so a broken file lands in SFX
  instead of being retried forever — but a probe is SKIPPED entirely when the
  file isn't readable, or a drive that dropped mid-scan would pin a whole library
  into SFX permanently.
- **Retention is checked against ALL configured folders, listing against enabled
  ones only.** That's what makes Off ≠ Remove.
- **Group labels: leaf name, parent only when the leaf is a lane word.** Two-
  segment labels were generated and rejected — 11 of 28 groups would have gained
  the same `Game Music - Jazz ›` prefix and truncated away the mood name, which
  is the useful part. Fixes 4 labels, damages 11.
- **Length sort orders per tab** (shortest first in Music, longest first in SFX)
  rather than offering a direction toggle. One rule, and it always puts the
  suspicious end on top.
- **Placed SFX 0.6, not 0.4.** Effects should sit above the 0.4 music bed, just
  not peak the mix. Only the default changed; the `?? 1` fallbacks in preview,
  timeline and render are deliberately untouched so placements saved before
  sounds had a volume field sound exactly as they did.

## Measured facts worth not re-deriving

- `V:\AutoSync\Audio` = **760 audio files, 12.59 GB, 38 folders (10 hold no
  audio), 5 levels deep**. Session 136's "~550 files / ~11 GB" was low — it
  missed `Epidemic Sound\SFX` (60 files).
- Live scan sorted it **513 music / 249 sfx** (incl. 2 prior uploads).
- Duration rule accuracy: **103 of 105 sampled files**. The ~12 real misses are
  NOT at the 60s line (only 8 files sit in 55–65s) — they're long SFX (Epidemic
  60–90s typing loops, `Camera Shutters`) and short game OSTs (40–60s Bayonetta,
  Marvel Vs Capcom, Sam & Max). Sort-by-Length surfaces all of them in the first
  ten rows of each tab.
- Probe cost **99ms/file**; cold pass 77s, warm list ~50ms.

## Next Steps

1. **Ask Fega how the volumes feel.** 35% preview and 60% placed SFX are both
   single numbers, trivially changed. He was mid-test at wrap.
2. **Close #188 / #204 / #205 / #207** once he confirms them — all four have been
   on his machine since alpha.29 and none are verified.
3. **#206 — library hygiene.** 23 orphan MP4s (~1.37 GB) listed; his call.
4. **#203 — pictures on clips**, the last phase of the #201 epic, not started.
5. Optional, only if the duration rule annoys him in practice: the filename
   tiebreak (`OST`/`Soundtrack` → music, `sound effect`/`SFX` + immediate folder
   → effect) applied ONLY inside a 40–90s band. Checked against the 26 band
   files, it'd get ~20 right. Deliberately not built — a keyword engine to save a
   dozen one-time clicks, and keyword rules rot.

## Watch Out For

- **The asset index is SHARED between profiles.** It lives at
  `<projectsRoot>\.clipflow\assets\assets.json`, not under `userData` — so the
  dev app and Fega's installed app write the same file. **I clobbered his live
  scan this session** by restoring a backup taken before he added his folder.
  Before restoring any backup of that file, re-read it and confirm it still
  matches what the backup was taken against.
- **NEVER run `asar extract-file` with the repo as CWD.** It overwrites
  `package.json` with the stripped packaged copy — scripts, devDependencies and
  the whole `build` block gone. Did it again this session (memory
  `project_package_json_strip` already warned). Use `npx asar list` or grep the
  archive. Recovery: `git checkout -- package.json`, re-apply the version bump.
- **An unprobed track shows in NEITHER tab.** That's deliberate — it has no
  honest lane until its duration is known — but a half-empty panel during the
  first 80 seconds looks like a bug if you forget.
- **`listAssets` runs on every panel mount**, and both AudioPanel and UploadPanel
  call it. `backfillDurations` is guarded by a module-level `scanRunning` flag;
  don't remove it or two scans will interleave writes.
- **`groupLabel` keys the renderer's grouping.** Two different folders that
  produce the same label merge into one group. Harmless today (no duplicate leaf
  names in Fega's tree, checked) but it's a real collision path.
- **The dev profile shares the REAL `projectsRoot` (`W:\`).** Any test render,
  retitle or asset write touches Fega's live library.

## Logs & Debugging

- **CDP harness** (`--remote-debugging-port=9222`): Node 22+ has a global
  `WebSocket`, so the one-shot evaluator needs **no `npm i ws`** — that's a change
  from earlier sessions' notes. Scratchpad `cdp.js` (evaluate), `shot.js`
  (`Page.captureScreenshot` → png).
- **Electron on Windows loses piped stdout.** A headless harness run via
  `npx electron run-x.js` prints nothing to the pipe — write results to a file and
  `cat` it. Cost one wasted 10-minute run before it was recognised.
- **`[role=slider]` is ambiguous in the editor** — the timeline zoom slider is
  first in the DOM, so `document.querySelector('[role=slider]')` grabs it, not the
  one in your popover. Scope to `[role=dialog] [role=slider]`. Same trap for
  `.h-8.w-8` buttons (7 matched). Radix popover triggers are findable by
  `button[aria-haspopup=dialog]`.
- **React `onMouseEnter` needs `relatedTarget`.** A bare
  `new MouseEvent('mouseover', {bubbles:true})` does NOT trigger it; add
  `relatedTarget: document.body` and hover-revealed buttons appear.
- **Proving audio volume without making noise:** patch
  `HTMLMediaElement.prototype.play` to record `this.volume` and return
  `Promise.resolve()`, click play, read the recorded value, then restore from the
  saved original. Confirmed 0.35 then 0.3 this session.
- **Headless scans of `assets.js` must run under electron** (`app.whenReady()`),
  because `ffmpeg.js` → `logger.js` reads `app.isPackaged`. Add
  `app.on("window-all-closed", () => {})` or it exits early.
- **5 pre-existing test files (`segmentWords`, `trackerCalendarModel`, `signals`,
  `game-profiles`, `ai-prompt`) call `process.exit` and crash jest workers.** Run
  `npx jest src/main/__tests__ src/renderer/editor/models/__tests__` for a clean
  signal (125 tests, all green as of this session).
- Session-137 scratchpad (`3373ca4d…`): `measure-audio.js` (tree walk),
  `probe-new.js` / `test-band.js` (duration sampling + the 40–80s band report),
  `test-scan.js` (full listAssets/backfill drive), `test-offline.js` (drive
  offline / Off toggle / delete / swap on a small copied tree), `cdp.js`,
  `shot.js`, `labels.js` (leaf vs two-segment group labels).
