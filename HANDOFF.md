# ClipFlow — Session Handoff

_Last updated: 2026-07-30 — Session 139 — **The three alpha.31 bugs Fega reported are fixed and shipped as `0.3.0-alpha.32`; the Rename-button halo he raised afterwards shipped as `0.3.0-alpha.33`. He installed 32, NOT 33. Nothing from either build has been confirmed by him yet.**_

---

## One-line TL;DR

Fega named the three alpha.31 problems ("Asset not found" on every saved volume,
missing row buttons, waveforms zooming on hover); all three were diagnosed by
measurement against his real data, fixed, verified in the running app, and cut as
alpha.32 — then the Rename button's "halo" turned out to be the batch bar's glass
shell wrapping a single button, fixed and cut as alpha.33.

## Current State

**`0.3.0-alpha.33` is built (`dist\ClipFlow Setup 0.3.0-alpha.33.exe`, 124 MB,
commit 9a45837). Fega has installed alpha.32 but not 33.**

- 🟡 **Nothing this session has his confirmation.** #214 and #215 are OPEN
  deliberately — do not close them until he says the buttons are visible, the
  waveforms hold still, and "Remember X%" saves. #216 (the root cause) is open and
  unstarted.
- **Two installers went out in one session**, which normally violates the
  batch-versions rule. Reason: he'd already installed 32 when he reported the
  halo, and the in-app notifier only offers a build whose filename version differs
  from the running one — 33 was the only way to reach him. Default back to
  batching next session.
- **Still unverified from earlier sessions:** #209–#212 (they're closed and
  labelled `status: untested`, and the three bugs fixed here all came out of that
  family), the two alpha.30 loudness changes, plus **#188**, **#204**, **#205**,
  **#207**.
- **#206** (library hygiene — 23 orphan renders, ~1.37 GB) still awaiting his call.
- **#213** — bulk tagging still has no row multi-select; 487 tracks untagged.

## What Was Built (session 139 — commits aa088af, 0f88e67, 52f56d5, 9a45837)

- **#214 — "Remember X% for this sound" answered "Asset not found" every time.**
  Not #210's code. `setAssetDefaultVolume` resolved by id only, and asset ids are
  minted at scan time, so the index rebuild that happened on 2026-07-29 at
  17:57:57 re-minted all 761 while every placement saved on a clip kept the old
  one. Measured before touching anything: **27 of 27 placements dangling by id,
  27 of 27 resolvable by path, `defaultVolume` set on 0 of 761 entries** — the
  feature had never once worked since that rebuild. Fix is one shared
  `findAssetRef(assets, assetId, filePath)` in `assets.js`, path first, used by
  `setAssetDefaultVolume` and `markAssetUsed` (the latter had been failing
  silently, which is why Recent stopped stamping). The popover passes `p.path`
  and its gate widened to `p.assetId || p.path`, so legacy placements work too.
- **#215 — the row action buttons were invisible and hovering stretched the
  waveforms.** One cause. The row canvas sat in flow with a JS-set pixel width,
  and Radix's viewport wraps children in `min-width:100%; display:table` — a box
  sized by its CONTENT — so the painted width became a floor on the row width.
  The ~130px of buttons only the hovered row renders widened the shared box, every
  other row measured wider, repainted wider, widened it again. Measured in a
  3-row repro of the real markup: **~138px per hover pass, unbounded, the `+`
  ending 1230px off the right edge after eight passes.** Fixed by putting the
  canvas at `absolute inset-0` (what `Scrubber` in the same file already did) and
  flipping that one viewport wrapper to `block`.
- **The Rename button's "halo"** was `BAR_SHELL` — the floating batch bar's glass
  fill + 12%-white border — shrink-wrapping a single button. It arrived on
  2026-07-21 with #172 (f5a1ec6); before that the button was a plain full-width
  `PrimaryButton` in the page flow. Split into `BAR_SHELL` (placement + animation,
  both states) and `BAR_GLASS` (chrome, spread in only when rows are selected).
- **#216 filed** — make folder asset ids deterministic from the file path.

## Key Decisions

- **Path is the identity for anything stored on a clip; the id is a hint.** Fixing
  #214 by re-keying the index or rewriting the 27 placements was the alternative —
  rejected because path-first costs one resolver, needs no migration, and heals
  placements that predate `assetId` entirely. The id-stability work is #216 and
  deliberately separate.
- **The ScrollArea fix is scoped to the Audio panel's instance**
  (`[&_[data-radix-scroll-area-viewport]>div]:!block`), not `ui/scroll-area.tsx`,
  which every panel in the app shares. Verified the transcript viewport still
  computes `display: table`.
- **The glass shell earns its chrome only when it holds the cluster.** With five
  controls it needs to read as one object over a scrolling list; with one button
  it's just an outline. Not deleted, made conditional.
- **Flat purple over gradient on the Rename button — Fega's pick** from two
  offered options. Note the original `PrimaryButton` treatment WAS a
  `linear-gradient(135deg, T.accent, T.accentLight)`, and I told him otherwise
  while asking; if he ever says "it used to have a gradient", he's right.
- **The 18% saved on "Alert sound effect" during verification was left in place** —
  he clicked that button because he wanted it. Everything else written during
  testing was cleared.

## Next Steps

1. **Get his verdict on alpha.33** — the buttons visible on hover, waveforms
   holding still, "Remember X%" saving, and the Rename button with no halo. Close
   #214/#215 only on his word.
2. **#216 — deterministic folder asset ids.** The path-first resolver absorbs the
   symptom; this removes the cause. Needs a re-key pass over the existing index and
   a decision on whether to rewrite `assetId` on stored placements or leave them to
   the resolver. Worth doing before the library grows further.
3. **#213 — row multi-select for bulk tagging.** 487 tracks untagged; the
   main-process half (`addAssetTagToMany`, `assets:addTagToMany`, `TagPicker`'s
   `bulkCount`) is built and unused.
4. Chase the older unverified backlog (#188, #204, #205, #207, the alpha.30
   loudness pair) once the Audio-panel family is settled.

**Back to batching installers** — two in one session was forced by the notifier's
version check, not a change of policy ([[feedback_batch_versions]]).

## Watch Out For

- **Any id minted at scan time is not an identity.** `generateAssetId()` runs when
  a file is absorbed, so a lost/rebuilt `assets.json` re-mints all of them. Grep
  `.find(a => a.id === …)` before assuming a lookup is safe — `favorite`,
  `setType`, `setTags` and `delete` are all id-only, and they're fine ONLY because
  the panel feeds them a fresh id from the live list. Anything reading a reference
  back off a clip must go through `findAssetRef`.
- **What re-minted the ids on 2026-07-29 is unproven.** The most likely cause is a
  headless harness run with a stub store whose `audioFolders` was empty: that path
  prunes every folder entry (`assets.js:176`) and the next real launch re-absorbs
  them all. If a future harness stubs the store, give it the real `audioFolders`
  or point `libraryRoot()` at a copy — the index lives under `projectsRoot`, which
  the dev profile shares with his live library.
- **The asset index is SHARED between dev and prod.** `.clipflow/assets/assets.json`
  under `projectsRoot`; the dev profile points at Fega's real `W:` drive. Tag and
  volume writes from a dev test land in his real library — clean up after tests, and
  never restore an old backup over it (session 137's lesson).
- **A canvas whose width is written from a measurement must be out of flow.**
  `absolute inset-0` inside a `relative` parent. In flow, inside any content-sized
  container, it feeds its own next measurement.
- **Radix ScrollArea renders no horizontal scrollbar here** (`ui/scroll-area.tsx`
  only mounts the vertical one), so content wider than the viewport is invisible
  rather than reachable. If a control "disappears", measure
  `getBoundingClientRect().right` against the viewport's before assuming it didn't
  render.
- **`IntersectionObserver` intersection is clipped by ancestors.** Lazy loading
  inside a ScrollArea MUST pass the viewport as `root`; the default root silently
  never fires for scrolled-out rows, and `rootMargin` expands the window rect so it
  cannot compensate.
- **`projects.listProjects()` returns `{ projects: [...] }`, not an array.** It does
  include `clips` (minus `subtitles`/`transcription`), so `sfx` is readable.
- **Never hand-escape Windows backslashes through a bash → JS boundary.** Write the
  expression to a file and pass the file's contents, or use forward slashes. It ate
  path separators twice in session 137, once silently emptying the dev library.
- **A "drawn" canvas is not a painted one.** `canvas.width > 0` only proves it was
  sized; `drawPeaks` sizes then returns early with no peaks. Check alpha pixels via
  `getImageData`.
- **The one-time seeding flags live in the profile store under `assetCatchUp`**
  (`{ tagsSeeded, lastUsedSeeded }`) — clear them to re-run a pass.
- **There are 2+ Radix scroll viewports in the editor.**
  `document.querySelector('[data-radix-scroll-area-viewport]')` grabs the transcript
  panel, not the Audio panel; pick by content or via a row's `.closest()`.
- **NEVER run `asar extract-file` with the repo as CWD.** It overwrites
  `package.json` with the stripped packaged copy. Use `npx asar list` or grep the
  archive (`grep -ac 'findAssetRef' dist/win-unpacked/resources/app.asar` worked
  fine this session). Recovery: `git checkout -- package.json`, re-apply the bump.
- **An unprobed track shows in NEITHER tab** — deliberate, but a half-empty panel
  during the first 80 seconds of a cold scan looks like a bug if you forget.
- **`listAssets` runs on every panel mount**, from both AudioPanel and UploadPanel.
  `backfillDurations` is guarded by a module-level `scanRunning` flag; don't remove
  it or two scans interleave writes.
- **The dev profile shares the REAL `projectsRoot` (`W:\`).** Any test render,
  retitle or asset write touches Fega's live library.

## Measured facts worth not re-deriving

- Every id in `assets.json` was minted in **one second: 2026-07-29 17:57:57 EST**.
  Placement ids on his clips are from earlier the same day (`…5346127…`,
  `…5347121…`, `…5351758…`) — that's the fingerprint of a full rebuild, and the
  cheapest check if this class of bug reappears.
- `V:\AutoSync\Audio` = **760 audio files, 12.59 GB, 38 folders, 5 levels deep**;
  scan sorts it **513 music / 249 sfx**; probe cost **99ms/file** (cold pass 77s,
  warm list ~50ms). Duration rule: 103 of 105 sampled files correct.
- Audio panel at a 339px drawer: 131 rows in the first folder, waveforms 271px,
  hover buttons end at −12px inside the right edge.
- Epidemic wavs carry **no embedded metadata** (no ID3, no RIFF INFO, no genre) —
  verified by `ffprobe` + a raw `strings` pass. Don't re-investigate.

## Logs & Debugging

- **CDP harness** (`--remote-debugging-port=9222`): scratchpad `cdp.js` (evaluate an
  expression in the renderer, `awaitPromise: true`, prints JSON) and `shot.js`
  (`Page.captureScreenshot` with a `clip` rect at `scale: 2`). **Node 22+ has a
  global `WebSocket` — use it.** This session's `cdp.js` used `require("ws")` out of
  habit and needed `npm install ws --no-save`; unnecessary, and `--no-save` is the
  only acceptable form if it happens again (it leaves `package.json` and the
  lockfile untouched — confirm with `git status --short package.json`).
- **Launch for verification:** `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`.
  The installed daily driver holds a single-instance lock, so `npm start` exits 0
  and looks like a crash; the dev profile has its own lock and can run alongside it.
  Kill strays with `Get-Process electron | Stop-Process -Force` — that name matches
  only the dev app, never his installed `ClipFlow` processes.
- **Driving the app over CDP:** the nav tabs are `button > span` with the label
  text; dispatch `MouseEvent('click', {bubbles, cancelable, clientX, clientY})` —
  a bare `.click()` did not switch views. Views stay mounted when hidden, so filter
  by `offsetParent` or every screen's buttons come back. The editor's clip switcher
  is the **chevron next to the title**, not the title (clicking the title opens the
  rename input — Escape + `blur()` to get out). Project list → `Open` → clip card →
  `Open in Editor` also works but always loads the first clip.
- **React `onMouseEnter` needs `relatedTarget`.** A bare
  `new MouseEvent('mouseover', {bubbles:true})` does NOT trigger it; add
  `relatedTarget: document.body`.
- **Row checkboxes in Rename are `span.cfr-check`** wrapping a `LedgerCheck`; click
  the inner element. The Checkbox component is visual-only — the parent handles the
  click.
- **Layout bugs are reproducible OUTSIDE the app.** A standalone HTML file
  replicating the row markup + Radix's `min-width:100%; display:table` wrapper,
  loaded in a real Electron window, is what pinned #215 — including proof the fix
  worked, before any app code changed. Hidden windows (`show: false`) stop firing
  `requestAnimationFrame` and ResizeObserver, so the harness window must be visible;
  reuse across `loadURL` calls was flaky (`ERR_FAILED`), so run one case per process
  and pass the parameter via `argv`.
- **Electron on Windows loses piped stdout** in some harnesses — write results to a
  file and read it back.
- **`[role=slider]` is ambiguous in the editor** — the timeline zoom slider is first
  in the DOM. Scope to `[role=dialog] [role=slider]`. Radix popover triggers are
  findable by `button[aria-haspopup=dialog]`.
- **Proving audio volume without making noise:** patch
  `HTMLMediaElement.prototype.play` to record `this.volume` and return
  `Promise.resolve()`, click play, read the value, restore the original.
- **Headless scans of `assets.js` must run under electron** (`app.whenReady()`),
  because `ffmpeg.js` → `logger.js` reads `app.isPackaged`. Add
  `app.on("window-all-closed", () => app.exit(0))` or the process lingers.
- **5 pre-existing test files** (`segmentWords`, `trackerCalendarModel`, `signals`,
  `game-profiles`, `ai-prompt`) are scripts with no `test()` blocks that call
  `process.exit`, so jest reports "suite failed to run" and `segmentWords` kills the
  run before the summary prints. `npx jest --testPathIgnorePatterns "segmentWords"`
  gives a readable total (**127 passed** as of this session).
- **The catch-up pass logs** `Seeded mood tags from folder names: N of M tracks` and
  `Seeded Recent from existing clips: N tracks matched`; failures are
  `Asset catch-up failed: <reason>`. Read that line before concluding a seeding pass
  found nothing.
- **Proving a waveform rendered:** scan alpha bytes —
  `getImageData(0,0,w,h).data` and look for any `data[i+3] > 0`.
- **Distinguishing "no data" from "never asked":** monkey-patch
  `window.clipflow.assetsPeaks` to log calls, then force new rows to mount. Zero
  calls means the trigger is broken, not the data.
- Session-139 scratchpad (`d66c5f40…`): `cdp.js`, `shot.js`, `row-repro.html` /
  `row-repro2.html` + `repro-main.js` (the standalone layout harness, `fix=0..3`),
  `scan-placements.js` (walks `.clipflow/projects/*/project.json` and reports every
  placement whose `assetId` is missing from the index), `measure-panel.js`,
  `measure-volume.js`, `measure-popover.js`, `measure-badge.js`, `measure-bar.js`.
