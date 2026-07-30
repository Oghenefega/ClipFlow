# ClipFlow — Session Handoff

_Last updated: 2026-07-29 — Session 138 — **All eight of Fega's Audio-panel requests are built and verified on the dev build (#209–#212). None of it has reached his installed daily driver — no installer was cut. That's the first thing to decide next session.**_

---

## One-line TL;DR

The Audio panel got a refresh button, a search clear, fades on sound effects,
per-sound saved volumes, a waveform on every row, a scrubbable mini player,
Epidemic's 34 mood tags (274 tracks pre-tagged from folder names) and a Recently
used list backfilled from real clips — then the panel moved into its own folder
because it had outgrown `RightPanelNew.js`.

## Current State

Version is still **0.3.0-alpha.30** — **no installer was cut this session.**
Everything below is on `master` and verified only on the dev profile.

- **Fega has confirmed nothing from this session.** He picked the row layout from a
  mock and supplied the tag vocabulary; he has not seen any of it running.
- **Still unverified by him from earlier sessions:** the two alpha.30 loudness
  changes, plus **#188**, **#204**, **#205**, **#207**.
- **#206** (library hygiene — 23 orphan renders, ~1.37 GB) still awaiting his call.
- **#213** filed: bulk tagging has no row multi-select yet.

## What Was Built (session 138 — commits 050b75f, a325623, f1366f4, 1a0433a)

1. **#209 — refresh, search clear, SFX fades.** The library already re-walked every
   watched folder on each `assets:list`; it just had no visible trigger and no
   feedback, which is indistinguishable from being blind. Fades were never
   music-specific — four `kind === "music"` gates removed. Fade sliders now cap at
   the block's own length (fixed 0–3s before, and fade-*in* had no length guard
   anywhere, so an over-long fade ramped through a whole one-shot without reaching
   full level).
2. **#210 — per-sound default volume.** `defaultVolume` on the index entry, set
   from the timeline right-click popover, shown as a badge on the library row,
   cleared by clicking it. Motivated by his own clips: `Cinematic Boom Soft` was
   hand-set to 0.29/0.32/0.32/0.32 across four clips, `OOF Sound Effect` to 0.53
   twice.
3. **#211 — waveform rows + scrubber.** Row layout A, his pick from three mocked
   options (`tasks/mocks/audio-row-redesign.html`). Waveforms load lazily as rows
   near the viewport, max 3 concurrent decodes — 761 files eagerly is ~5 min of
   FFmpeg. Playing a row expands it into a scrubbable waveform. `AudioPanel` moved
   to `components/audio/` with `TrackRow`, `TagPicker` and a shared `audioPeaks`
   module that `SoundBlock` now uses too.
4. **#212 — mood tags + Recent.** Epidemic Sound's own 34 moods (from his
   screenshot). 274 of 761 tracks seeded from folder names; Recent backfilled 13
   tracks from saved clips with accurate counts. Views: All / Favorites / Recent /
   Untagged, plus a mood filter strip listing only moods present in the lane.

## Key Decisions

- **Mood vocabulary is Epidemic's, not invented.** Most of the library IS Epidemic,
  so that's the wording already shown next to these tracks. 34 moods.
- **Tags always visible on the row**, not hover-only — Fega's call.
- **Seeding matches the IMMEDIATE parent folder only.** The mood folders sit under a
  parent named "Game Music - Jazz"; matching the full path would stamp Smooth onto
  ~150 unrelated tracks.
- **The scrubber's playhead is LOCAL to the playing row.** Lifting it into the panel
  would re-render 761 rows 60×/sec.
- **Epidemic wavs carry no embedded metadata** (no ID3, no RIFF INFO, no genre) —
  verified by `ffprobe` + a raw `strings` pass. Metadata-based tagging is impossible
  offline; the filename's numeric Epidemic id can't be resolved without their API.
  Don't re-investigate.
- **No installer cut**, per the batch-versions rule and because #213 leaves the
  tagging story incomplete.

## Next Steps

1. **Decide on an installer.** Fega tests on the installed exe, so none of this
   reaches him until one is cut (`/clipflow-update-launcher`, bump to **alpha.31** —
   tick the alpha counter, never the minor version).
2. **#213 — row multi-select for bulk tagging.** 487 tracks still untagged, and the
   Epidemic/generic-SFX folders carry no mood in their names. The main-process half
   (`addAssetTagToMany`, `assets:addTagToMany`, `TagPicker`'s `bulkCount`) is built
   and unused.
3. Chase confirmation on the unverified backlog (#188, #204, #205, #207, alpha.30
   loudness pair).

## Watch Out For

- **The asset index is SHARED between dev and prod.** `.clipflow/assets/assets.json`
  lives under `projectsRoot`, and the dev profile points at Fega's real `W:` drive.
  Tag/volume writes from a dev test land in his real library — clean up after tests,
  and never restore an old backup over it (session 137's lesson).
- **`IntersectionObserver` intersection is clipped by ancestors.** Lazy loading
  inside a ScrollArea MUST pass the viewport as `root`; the default root silently
  never fires for scrolled-out rows, and `rootMargin` expands the window rect so it
  cannot compensate. Cost a full diagnosis cycle this session.
- **`projects.listProjects()` returns `{ projects: [...] }`, not an array.** It does
  include `clips` (minus `subtitles`/`transcription`), so `sfx` is readable.
- **Never hand-escape Windows backslashes through a bash → JS boundary.** It ate
  path separators twice this session, once silently emptying the dev library
  (761 → 0). Use forward slashes or `String.fromCharCode(92)`, and echo the value
  back (ideally `charCodeAt`) before trusting any conclusion. See `tasks/lessons.md`.
- **A "drawn" canvas is not a painted one.** `canvas.width > 0` only proves it was
  sized; `drawPeaks` sizes then returns early with no peaks. Check alpha pixels via
  `getImageData` before concluding a waveform rendered.
- **The one-time seeding flags live in the profile store under `assetCatchUp`**
  (`{ tagsSeeded, lastUsedSeeded }`) — clear them to re-run a pass.
- **There are 2+ Radix scroll viewports in the editor.** `document.querySelector('[data-radix-scroll-area-viewport]')`
  grabs the transcript panel, not the Audio panel; scope via a row's `.closest()`.
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

## Watch Out For — carried over from earlier sessions

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
- **Session-138 additions.** The catch-up pass logs `Seeded mood tags from folder
  names: N of M tracks` and `Seeded Recent from existing clips: N tracks matched`;
  its failures are `Asset catch-up failed: <reason>` — that line is what caught the
  `listProjects` wrapper bug, so read it before concluding a seeding pass "found
  nothing".
- Session-138 scratchpad (`981e7826…`): `cdp.js` — a ~40-line CDP client over
  Node's built-in `WebSocket` (`node cdp.js "<expression>"`, evaluates in the
  renderer and prints JSON). Re-create it if the scratchpad is gone; it's the whole
  verification harness for this session.
- **Proving a waveform rendered:** `canvas.width > 0` is NOT proof — `drawPeaks`
  sizes the canvas then returns early when peaks are absent. Scan alpha bytes:
  `getImageData(0,0,w,h).data` and look for any `data[i+3] > 0`.
- **Distinguishing "no data" from "never asked":** monkey-patch
  `window.clipflow.assetsPeaks` to log calls, then force new rows to mount. Zero
  calls means the trigger is broken, not the data — that's what localised the
  IntersectionObserver bug in one step after two wrong theories.
