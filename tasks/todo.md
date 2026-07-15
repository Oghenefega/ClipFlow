# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## DONE (awaiting Fega verification) — Auto-Reframe Phase A (epic #164, session 103)

Built + machine-verified end to end in session 103; details in HANDOFF.md and
the #164 issue comments. Substrate in `11a119a`, calibration UI in the
session-wrap commit. NOT in an installer yet (batch rule). Fega still needs a
hands-on pass on a real recording (blur/proportion quality judgment).
Deferred to a next slice: first-recording auto-offer flow; Projects-tab
preview still letterboxes horizontal sources (cosmetic); Phase B detection.

---

## APPROVED — Auto-Reframe Phase A: build next session (epic #164)

**Fega approved Phase A 2026-07-15, and LOCKED the architecture: Option 2 —
non-destructive live layout in the editor** (NOT whole-source reformat at
ingest). Rationale: Fable is available only a couple more days, so the harder,
long-term-correct build happens now. Layout (webcam/game crop rects) is stored
data; the editor previews the vertical composition live; render bakes it at
export. No intermediate vertical file.

Build order suggestion for next session: (1) HTML mock of the calibration UI
(house rule for aesthetic-sensitive UI), (2) layout data model + electron-store
schema migration, (3) editor preview compositing spike — two crops of one
source in the preview panel (watch the <video> cleanup rule, blink crash), (4)
render.js baking. Scope lines below still apply — no tracking, no auto-zooms.

Approved for planning 2026-07-15. Research done (2 agents: competitor landscape +
local tech feasibility) — full findings in the GitHub epic. Goal: record ONE
normal 1920x1080 canvas in OBS; ClipFlow reformats it into the vertical layout
the second OBS canvas produces today (webcam top ~1/3, game middle, blurred game
fill bottom). Kills the dual-canvas recording load and is table stakes vs
Opus Clip / StreamLadder / Eklipse for the commercial product.

### Hard scope lines (Fega, 2026-07-15)
- **NO face tracking. NO auto-zooms.** Static rectangular crops only — the
  webcam area cropped correctly, game area under it. Research independently
  confirmed continuous tracking is the most-hated failure mode in this niche
  (jitter/drift); static crops are a feature, not a shortcut.
- Detection (Phase B) proposes boxes ONCE per layout; it never moves mid-clip.

### Phase A — calibrated reframe (the foundation)
1. **Layout calibration UI**: two draggable/resizable boxes over a sample frame
   of a recording — "webcam area" + "game area". Saved per OBS layout and
   reused automatically for every future recording (electron-store — schema
   migration required per pipeline rules).
2. **FFmpeg vertical composition** (main process): crop webcam → top, crop game
   → middle, downscale+blur+upscale copy → background fill, single encode pass,
   NVENC when available, `-r` matching source fps (60fps bug lesson), guard
   `format=yuv420p` for HDR/10-bit HEVC sources.
3. **Pipeline integration** — ARCHITECTURE DECISION, pick before building:
   - **Option 1 (recommended): whole-source reformat at ingest.** New recording
     lands → reformat once to a vertical "working source" → that file becomes
     project.sourceFile. Everything downstream (Whisper, clip detection, editor,
     render, publish) is untouched — it already expects a vertical source.
     Cost: one GPU encode per recording (~6-10 min for a 30-min source w/ NVENC)
     + disk for the vertical copy. Re-calibration = re-render that source.
   - **Option 2: non-destructive layout.** Store crop rects, editor previews the
     composition live, render bakes it at export. No intermediate file, instant
     re-calibration — but the editor preview must learn to composite two crops
     of one video, a large editor arc. The "pro NLE" end-state; not the first step.
4. Setting to keep/delete the original horizontal file after reformat.

### Phase B — auto-detect proposes the boxes (after A ships)
- MediaPipe face detection (Apache 2.0, ~230KB model, runs in the renderer —
  no native modules): sample ~8 frames, find the face cluster that doesn't move,
  snap rectangle to the webcam border via persistent-edge check, pre-fill the
  Phase A calibration UI. User confirms once. Detection quality only affects
  the default, never correctness.
- Prototype gate: verify small-face recall on real recordings first
  (facecam ≈ 100-200px in a 1080p frame); fallback model YuNet (MIT) if weak.

### Verification criteria
- A: Fega records main canvas only; a new recording auto-produces a vertical
  working source whose layout matches the current vertical canvas; clips cut,
  subtitle, render, and publish exactly as today. Waveform/subtitle alignment
  holds (session 102 fix). PC load while recording measurably down.
- B: fresh recording from an unseen layout → proposed boxes land on the webcam
  within a small nudge; VTuber/borderless cases fall back to manual cleanly.

GitHub epic: #164 (full research summary lives there).

---

## DONE — Session 101b: Projects tab hue + sorting + TEST cleanup, Weekly Rundown (VERIFIED in-app)

Approved 2026-07-15: Variant B hue; recap renamed "Weekly Rundown" (modal titled
ClipFlow Rundown), preview-first popup, download only on click. Verified live:
hue cards per game, Game/Date/Status sort works, TEST chip only on the test
project, header button opens modal, real PNG save completed. PNG filename now
clipflow-rundown-<week>.png. Mockup: tasks/mocks/projects-hue-and-recap.html.

### 1. Game hue on project cards — src/renderer/views/ProjectsView.js
Card row (~:1214-1300): background becomes a game-color gradient wash (Variant
A or B per Fega), icon block already tinted; done/error states keep their
green/red treatment layered on top. Color from existing getGameColor (:48-52).

### 2. Sort control — src/renderer/views/ProjectsView.js
New segmented "Sort: Status | Date | Game" above the list (toolbar row ~:1180).
Status = current order (processing → review → done → error, newest inside).
Date = created desc. Game = grouped alphabetically by game, newest inside.
Persist to electron-store key `projectSortMode` (mirror folderSortMode :825-833).

### 3. TEST chip only on test projects — src/renderer/views/ProjectsView.js
TestChip render (:1264-1269) becomes conditional: only when testMode/legacy
"test" tag is true. Still clickable there to un-test. Normal projects show no
TEST toggle — test-ness now comes from the test watch folder at creation.

### 4. Tracker recap → header button + modal — src/renderer/views/TrackerView.js
Remove the always-rendered recap card at the bottom (~:794-852). Add "Share
recap" button; opens a modal with the same recap layout + existing handleShare
(Copy PNG / Save states). recapCardImage.js PNG generation unchanged.

### Verification
build + npm start: cards tinted per game (EO yellow, RL teal, AR orange), sort
modes reorder correctly and persist across restart, TEST chip gone from normal
projects but present + toggleable on the test project, Tracker bottom recap
gone, header button opens modal, Copy PNG still lands the image on clipboard.

---

## DONE — Session 101: Tracker fixes (game tag casing/color) + 1440p scaling + app-wide DM Sans (VERIFIED in-app)

Approved 2026-07-15 ("build all three — but change ALL text to DM Sans. No more
JetBrains Mono"). Item 3 scope widened from Tracker-only to app-wide: T.mono token
now points at DM Sans, Tailwind font-mono overridden, hardcoded JetBrains refs
swapped (SettingsView debug pre, editorPrimitives timecode popover, EditorView
crash screen, recap card canvas headline), JetBrains dropped from the Google Fonts
import. Verified live in the source-run app: teal uppercase RL in weekly log,
calendar segments, and day drawer; maximized-window zoom scales the UI; clean
(undotted) zeros everywhere. Rides the next installer.

### 1. Bug: auto-posted clips show grey lowercase "rl" instead of teal "RL"
Root cause: auto-logged tracker entries store the game as the lowercased short tag
("rl"); both Tracker display lookups fail to match it (TrackerView matches hashtag
only, TrackerCalendar matches case-sensitively) and fall into grey "unknown" fallbacks.
- `src/renderer/views/TrackerView.js` :311-313 — `resolveGameDisplay`: case-insensitive
  match against hashtag, tag, AND name; uppercase the fallback tag text.
- `src/renderer/views/TrackerCalendar.js` :55-57 — `resolveGame`: lowercase both sides
  of the existing hashtag/name/tag comparison.
No data migration — stored "rl" entries resolve correctly once lookups are fixed.

### 2. UI too small / dead space on 1440p maximized window
Cause: every tab is a fixed-max-width centered column (860-1120px) with 12-13px text;
on a 2560px-wide window ~60% of the screen is empty margin.
Fix: window-width-driven zoom in the main process — on resize (debounced) set
`webContents.setZoomFactor(clamp(width / 1920, 1, 1.35))`. ≤1920px wide → exactly
today's look (factor 1.0); maximized on 1440p → ~1.33× (text ~33% bigger, content
column ~1280px effective). Applies uniformly to all tabs, editor, and popovers.
- `src/main/main.js` — resize listener + initial apply after load.

### 3. Tracker tab font — drop the mono (dotted-zero) numbers
Tracker uses JetBrains Mono (`T.mono`) for numbers/dates/stats; Recordings/Projects
use DM Sans (`T.font`). Fega dislikes the dotted zero. Swap all `T.mono` usages in
Tracker to `T.font`.
- `src/renderer/views/TrackerView.js` — 27 usages
- `src/renderer/views/TrackerCalendar.js` — 18 usages
Scope: Tracker tab UI only. Other tabs' mono (filenames, timestamps) untouched;
recap share-image canvas untouched unless Fega asks.

### Verification
`npm run build:renderer` + `npm start`: Tracker weekly log + calendar show teal
uppercase RL on today's 3 clips; resize window across 1920px and watch scale step;
Tracker numbers render in DM Sans (no dotted zeros); other tabs unchanged.

---

## DONE — Session 99: Recordings tab "Group by: Month / Game" toggle (VERIFIED in-app)

Built and verified live in the source-run app 2026-07-11: Game mode shows Test on top
then game-name folders alphabetically with correct counts, expand/collapse and
chronological order inside folders intact, Month mode unchanged, chosen mode persists
to electron-store (`recordingsGroupMode`). Rides the next installer for the daily driver.

Approved 2026-07-11 ("toggle only" — no game filter). Recordings tab currently groups
into collapsible month folders; add a segmented toggle so the same folders can be
keyed by game instead. Month stays the default.

### File impact
- `src/renderer/views/UploadView.js` — the only file touched. Grouping logic
  (~:533-554), folder label helper (`monthLabel` :16), header toggle row (~:1241-1281),
  settings-load effect (:158-170) for persistence.

### Steps
1. New state `groupMode` ("month" | "game"), default "month". Load persisted value
   from electron-store key `recordingsGroupMode` in the existing settings effect;
   persist via a `changeGroupMode` helper mirroring `changeTagMode` (:195-198).
2. Grouping: when `groupMode === "game"`, bucket key = `f.is_test === 1 ? "test" :
   (f.tag || "unknown")`. Folder sort: "test" first, "unknown" ("Other") last,
   games alphabetical by display name (from gamesDb, fallback tag).
3. Folder label: generalize `monthLabel` → label by mode; game mode shows game
   name from gamesDb (fallback raw tag). Header structure, collapse/expand,
   per-folder Select All, done/selected counts all reused unchanged (they're
   keyed generically off the bucket key — game tags can't collide with
   "YYYY-MM"/"test"/"unknown" keys).
4. Toggle UI: segmented "Group: Month | Game" control next to the existing
   Tags toggle in the header row, same button style.
5. Files inside a folder keep the existing #126 chronological sort.

### Verification
- `npm run build:renderer` clean, `npm start` launches, Recordings tab renders.
- Toggle to Game → folders become game names, alphabetical, Other last, Test top.
- Collapse a game folder + Select All in folder work; toggle back to Month →
  month folders unchanged; relaunch app → chosen mode persisted.

---

## DONE — Session 98: Split-at-playhead fixes + "Add word" + Queue title propagation (VERIFIED in-app except Queue UI)

Approved and built same-session. Split fix + disabled-menu-reasons + Add word verified live in
the source-run app (split with playhead on last word of "This guy's just" now cuts before "just";
1-word block shows disabled Split with "needs 2+ words"; Add word grew "know," → "know, IT" with
the inline editor auto-opening; all test edits undone, nothing saved). Queue pencil +
old-title→new-title propagation into custom captions is code-reviewed and build-verified but NOT
exercised against a live queued clip (source profile queue is empty — rides the next installer,
Fega verifies on his real queued clip). Found + filed #162 (undo doesn't restore mode label).

Fega reported (2026-07-10): (1) "Split at playhead" on a subtitle sometimes does nothing;
(2) on a 3-word block it split between word 1 and 2 instead of at the playhead;
(3) feature — right-click a subtitle block to add a word to it (a 1-word block can't grow today).

### Bug — Split at playhead (two dead-end paths in `splitSegment`)
Root causes, both in `src/renderer/editor/stores/useSubtitleStore.js` `splitSegment` +
the context-menu wiring in `TimelinePanelNew.js`:
1. **Silent no-op on 1-word blocks** (`useSubtitleStore.js:693` guard) — matches the "FLIP"
   screenshot. By design, but zero feedback.
2. **Wrong-boundary fallbacks**: playhead inside the LAST word → `findIndex` returns -1 →
   falls to `floor(len/2)` = between words 1–2 on a 3-word block (`:705-706`). Playhead in a
   gap / outside the clicked block → target falls back to `activeSegId` and splits it at its
   MIDDLE (`:723-730`). Either explains symptom 2.

Fix plan:
- `splitSegment`: `findIndex` -1 → last boundary; 0 → first boundary (split lands at the word
  boundary nearest the playhead, never the middle).
- Timeline context menu: compute `canSplit` when the menu opens (playhead inside THIS block
  AND block has ≥2 words); render "Split at playhead" disabled with a short reason
  ("needs 2+ words" / "playhead not over this subtitle") instead of silently no-opping.
  Files: `TimelinePanelNew.js`, `timeline/TrackContextMenu.js`.

### Feature — "Add word" on a subtitle block
Right-click a subtitle block on the timeline → new "Add word" item:
- Appends a placeholder word to THAT block's text + words[] (placeholder takes the tail slice
  of the block's time; existing word timings untouched). New store action in `useSubtitleStore.js`.
- Left panel switches to Edit subtitles, scrolls to that row, and opens the inline editor with
  the placeholder selected so typing replaces it immediately (wire via the store's currently
  unused `editingWordKey`). Files: `useSubtitleStore.js`, `LeftPanelNew.js`,
  `leftpanel/SegmentRow.js`, `TimelinePanelNew.js`, `timeline/TrackContextMenu.js`.
- Assumption confirmed with Fega's wording: this adds a word INSIDE the existing block (1-word
  block → 2 words), not a new separate block (drag-on-empty-lane + "+" button already cover that).

Verify: build + npm start; split a 3-word block with playhead over each word (boundary lands
adjacent to playhead), 1-word block shows disabled split with reason, Add word on a 1-word
block yields a 2-word block, editor opens pre-selected, undo restores, viewer/transcript stay
in sync (session 98 fix).

---

## SHIPPED — Now Playing Tracker rebuild, Phase 1 (VERIFIED by Fega in dev, 2026-07-09)

Built sessions 94–95 (`bc973cb` + `921f41f`, spec `tasks/specs/tracker-now-playing.md`).
**Session 96 (2026-07-09): Fega ran the verification script in the dev build — 6 of 7 checks
pass.** His 7 findings were all fixed same-session (`4eafac9` + `6f3b791`): switch-game popover
un-clipped from the banner (position:fixed + scroll), day columns rebuilt as a real time grid
with time labels on empty "+" slots, brand-color platform toggles, compact icon row in the
clip detail popover, portrait recap card + 1080×1920 story-format share PNG, "TODAY" label
removed, watermark Flowve→ClipFlow (spec override, memory `project_recap_watermark_clipflow`).
XP stays only-climbs (Fega re-confirmed the locked decision). **Still open: verification
check 3 — publish a REAL clip through the Queue** (ring +1, +10 XP, live post links from
`platformResults`) — waits until Fega next has a post ready; fold into that session.
Source-only, rides the next batched installer.

---

## NEXT — Now Playing Tracker, Phase 2: Calendar view (spec READY, design locked 2026-07-09)

**Gate: SATISFIED 2026-07-09** — Fega verified Phase 1 in the dev build (6/7 checks; only the
real-publish check remains, which doesn't block Phase 2 since the Calendar renders data Phase 1
already writes). Start this build next session on Fega's go.

**Read the full spec first:** `tasks/specs/tracker-calendar.md` — locked decisions, verified code
anchors (checked against this repo 2026-07-09), behavior details, build order, and Fega's ~5-min
verification script. The visual target is the **P3 Hybrid** tab of the clickable mock at
`Desktop\ClipFlow stuff\Tracker Redesign\tracker-calendar-prototypes.html` (mock = look; spec =
behavior; the mock's data and pinned "today" are fiction).

**One-paragraph summary:** Enable the disabled Calendar pill (`TrackerView.js:438`) and ship the
read-only Calendar view: Mon-to-Sat month grid where each day shows its clip count + a per-clip
game-colored segment strip (NO full-cell tint), a week scoreboard rail (score, outcome tag, thin
pace/outcome bar, frozen game + streak), a slim month stats line, a day drawer (real clips, live
post links from `platformResults`), and a week drill-in (frozen target, outcome banner, read-only
week log, frozen recap). Future = faint preview with scheduled counts only; no scheduling, logging,
or editing anywhere (Tracker = motivation, Queue = operations). Zero new persisted state; also
reconcile the shipped `streakOverVariant` stakes copy with the locked streak-lost design.

---

## QUEUED — Commercial-readiness audit (security / publish integrity / reliability)

**Gate:** Fega's last Phase 1 check (real publish through the Queue) + Phase 2 Calendar build
shipped. Must run BEFORE a beta date is set — it's a commercial-launch gate, not a gate on
Fega's own posting.

**Read the full spec first:** `tasks/specs/commercial-readiness-audit.md` — priority order
(secrets/token storage → Electron security → publish idempotency → data integrity → light UX),
what prior audits already covered (don't re-report Bucket B / #145-147 / #68), report format,
and output locations. Findings report ONLY — zero code changes; fixes are a separate approved
session. Routed by Wick 2026-07-11.

---

## ACTIVE PLAN — Projects tab premium redesign (session 89 design → session 90 build)

**Status:** Design DONE + Fega-approved as a mockup. **CARD implemented in session 90** (`ProjectsView.js` `ClipRow` — flowing transcript, ✓/✗ under preview, calm metadata, premium card; builds clean, awaiting Fega's final in-app eyeball). **Still deferred:** the tab-level chrome — premium header + width-capped centered column (cards are currently full-bleed). Direction locked.

**Live-pass additions (session 92 UX walkthrough):** (a) **hover-to-play was never built** — shipped card is click-to-play; the locked mockup specified hover-to-play, add it in this pass. (b) The project-list **REVIEW pill looks like a button but isn't clickable** (row is the target) — make it clickable or restyle as a status chip.

**The mockup:** `tasks/mocks/projects-tab-redesign.html` (open via `Start-Process`). Built with the real `theme.js` tokens + DM Sans + realistic ARC Raiders clip data. It has two directions behind a toggle; **Fega chose "Review Rail."** Defaults to the rail on open.

**What Fega asked for:** (1) the in-card transcript must read like the **editor** — flowing prose, NO `[00:00]` stamps, no per-line breaks (today the card builds timestamped lines at [ProjectsView.js:767] via `fmtTimestamp`; the editor flows words in `LeftPanelNew.js` `TranscriptTab`). (2) Make the whole Projects tab feel premium ("like YouTube"; current UI "feels 2002").

**Locked "Review Rail" card (left → right):**
- **Left:** BIG watchable 9:16 preview (hover-to-play; ONLY a duration pill on the video — no score/status overlay). **Approve/reject (✓/✗) sit directly UNDER the preview.**
- **Right (content):** title + **score top-right** (`8.4/10`, colored: green ≥8, yellow 6–7.9, red <6); one calm metadata line (game · energy · confidence · time · **status chips** Approved/Rendered/Rejected); the **flowing transcript**; **Open in Editor** as the main button.
- Tab-level: width-capped column (not full-bleed), premium header (title + clip count + filter chips), soft shadows + hover-lift, no flat boxes.

**Rejected along the way — do NOT revive:** Shorts-style grid (he picked the rail); a far-right "verdict column" (bad mouse reach); a tiny preview; score/status overlaid on the video. (See `tasks/lessons.md` session-89 entry + [[feedback_ui_density_aesthetic]].)

**Build steps next session:**
1. Implement in [ProjectsView.js](src/renderer/views/ProjectsView.js) `ClipRow` using the existing **inline-`T`-theme** style (Projects is an "existing view," NOT the shadcn/Tailwind editor).
2. Transcript fix: replace the `transcriptSegs.map(... fmtTimestamp ...)` block with the segment **texts joined into flowing prose** (mirror the editor's `TranscriptTab` join). Drop the `fmtTimestamp` per-line rendering on the card.
3. Keep `ClipVideoPlayer`/`ClipPreviewBoundary` working with the bigger preview; ✓/✗ under it; score/status moved into content.
4. Build + `npm start`, verify in the running app (not just a build); get Fega's eyes before closing.

_Older plan (Packaged-app audit) below — Bucket A shipped; carry-over verifications still pending (see HANDOFF)._

---

## ACTIVE PLAN — Packaged-app audit remediation (session 85 → session 86)

**Session 87 update:** Fega installed alpha.9.1 and confirmed the editor shows subtitles correctly on fresh clips (**#144 CLOSED**) + the Recordings list order is correct. Then he hit a NEW bug — AI titles/captions for a clip referenced moments from *other* parts of the source recording. Root-caused + fixed (`_collectClipParams` joined raw source-wide `editSegments` → now uses clip-window `getTimelineMappedSegments()`), committed (`1b24714`), and cut **0.1.8-alpha.10** (`e6e01e8`) to promote it. Bucket A's EXPORT-with-subtitles check (open the rendered .mp4, confirm Latina Essential) is **still unverified by Fega** — folded into the alpha.10 pass below.

**Status:** ✅ BUCKET A SHIPPED in session 86 (`7b122e5`) on **0.1.8-alpha.9** — installer cut
(`dist/ClipFlow Setup 0.1.8-alpha.9.exe`, 121MB). All 4 Bucket A fixes done + verified against the
real artifact via `npx asar list` (editor/utils/* IN asar, resources/fonts/* outside it). Bucket B
filed as launch-ops: #145 (ffmpeg), #146 (python), #147 (hfHome); #68 commented + tagged launch-ops.
**Awaiting Fega's one reinstall + end-to-end test** (generate → open → EXPORT → confirm subtitles
present AND in Latina Essential). alpha.8 superseded — install alpha.9. Detail of what shipped:
- #1 build.files += `editor/utils/**` (excl *.test.js) — overlay preload cross-tree requires resolve.
- #2 fonts via extraResources + `process.resourcesPath` resolve; loud font-load failure.
- #8 render.js routes through shared `resolveClipSubtitles` (3 utils → CJS for main-process require).
- #9 main-window icon → `build/icon.png`.

_Original plan (for reference) below._

### Why this audit ran
Fega's worry: "app could generate clips before, then 8 things broke, now subtitles — how many more?"
Reframe (accurate): the installed app had NEVER run clip-gen until session 84 (all prior success was
source runs). We turned on a whole pathway (packaged generate→edit→export) that was only ever tested
from source, and are finding everything it touches. Finite + auditable, not random. Two buckets below.

### 🔴 BUCKET A — breaks Fega's INSTALLED app (fix this session, batch into alpha.9)
1. **[CRITICAL] Exported clips lose ALL subtitles & captions (blank).** `src/main/subtitle-overlay-preload.js:17-32`
   require()s `subtitleStyleEngine.js` + `findActiveWord.js` from `src/renderer/editor/utils/`, but
   `package.json` `build.files` ships only `editor/models/**`, NOT `editor/utils/**` → files absent from
   the asar → preload throws → `overlayAPI` undefined → overlay renders blank frames → export has no text.
   Confirmed via `npx asar list` on the real artifact. **Fix:** add `"src/renderer/editor/utils/**/*"`
   (+ test-file exclusions) to `package.json` `build.files`, mirroring the `editor/models/**` entry.
   Also update CLAUDE.md "Cross-tree requires" note (a SECOND cross-tree dep beyond render.js→models).
2. **[HIGH] Burned-in subtitle font wrong (fallback, not Latina Essential).** `src/main/subtitle-overlay-renderer.js:152`
   sets `fontsPath = path.join(__dirname,"../../src/fonts")`; `src/fonts` is not in `build.files`, and
   `file://` into the asar is unreliable anyway. **Fix:** ship `src/fonts` via electron-builder
   `extraResources` `{from:"src/fonts",to:"fonts"}` and resolve `fontsPath` via `process.resourcesPath`
   when `app.isPackaged`, else `__dirname/../../src/fonts` — the #143 pattern. Make the font-load failure
   loud (it's currently a swallowed `console.warn` at `public/subtitle-overlay/overlay-renderer.js:83-85`).
   (Only visible after #1 restores the text.)
8. **[MEDIUM] "Render All" on a never-opened fresh clip burns in Whisper artifacts** (split subword tokens,
   dupes, mega-segments) the previews already cleaned. `src/main/render.js:170-225` re-derives segments from
   raw `clip.subtitles.sub1` and skips the repair stack (`resolveSubtitles.js:248-290`) both previews run.
   Reproduces from SOURCE too (not packaged-only). **Fix:** have render.js call
   `resolveClipSubtitles(clipData, projectData, {includeExtras:false})` then map to timeline time via the
   existing `visibleSubtitleSegments` block (render.js:230-243). Needs `editor/utils/**` bundled (same as #1).
9. **[LOW] Main-window icon falls back to default Electron icon.** `src/main/main.js:355` points at
   `../../public/icon.png` (not packaged). **Fix:** point at `../../build/icon.png` (Vite already copies it
   into `build/`, which IS packed). One-line, zero-config.

### 🟡 BUCKET B — only breaks OTHER machines (Fega's PC is fine; FILE as `track: launch-ops`, do NOT fix now)
- **[crit-for-customers] FFmpeg/FFprobe not bundled** — bare `spawn("ffmpeg")`/`execFile("ffprobe")` PATH
  lookups across `src/main/ffmpeg.js` (lines 13,33,109,164,214,246,269,335,415,470,531), `render.js:15,347`,
  `subtitle-overlay-renderer.js:29,54`, `ai-pipeline.js:338`. No `ffmpeg-static` dep, no resolver. Bundle via
  extraResources + a `getFfmpegPath()/getFfprobePath()` resolver; gate Stage 0 on `checkFfmpeg()`.
- **[crit-for-customers] Python/Whisper venv not bundled** — `whisperPythonPath` defaults `""` (main.js:183);
  transcribe rejects "Python not found" (`stable-ts.js:83-86,189-192`). Needs a shipped/installed embeddable
  Python + stable_whisper + torch, or a setup/onboarding flow. Pre-launch architecture task.
- **#68 (already tracked) energy_scorer.py hardcoded `D:\whisper\energy_scorer.py`** (`ai-pipeline.js:172`) —
  script isn't even in the repo `tools/`. Fix under #68: move into `tools/`, resolve via resourcesPath (#143 shape).
- **[medium] hfHome hardcoded `D:\whisper\hf_cache`** — `stable-ts.js:116,219`, `ai-pipeline.js:480`,
  `main.js:1249`, `tools/transcribe.py:26-27`. No store default, no UI. Breaks transcription on C:-only machines.
  Fix: default to `path.join(app.getPath("userData"),"hf_cache")`, centralize, add migration.
- **[low] whisperPythonPath fallback hardcoded `D:\whisper\...venv\python.exe`** (`ai-pipeline.js:502`) —
  user-overridable in Settings; fold into the Python-bootstrap work.

### Remediation plan (next session)
1. Fix Bucket A (#1 build.files, #2 fonts extraResources, #8 render repair, #9 icon). Same proven #143 pattern.
2. Verify against the artifact: `npx asar list dist/win-unpacked/resources/app.asar` shows `editor/utils/*`,
   `resources/fonts/*` (or asar src/fonts), then build:renderer compile-check + clipflow-code-review self-check.
3. Bump to **0.1.8-alpha.9**, CHANGELOG entry, cut ONE installer (clipflow-update-launcher). alpha.8 superseded.
4. File Bucket B as `track: launch-ops` issues (read `.claude/docs/issue-filing.md` first); comment on #68.
5. Fega: one reinstall + ONE end-to-end test — generate a clip, open it (subtitles show, #144), EXPORT it,
   open the exported .mp4 and confirm subtitles are present AND in Latina Essential. Close #144 + new issues.

### Coverage gaps (audit did NOT check — next audit targets)
- Publish/OAuth flows (YouTube/TikTok/etc.) — likely the next works-on-dev-only source. Entirely unaudited.
- Packaged smoke-test of `tools/signals/*` (yamnet.tflite / class_map reads) — assumed shipped, not re-run packaged.
- electron-store schema migration on UPGRADE of a real installed profile (several Bucket B fixes need migrations).
- Other `__dirname`-relative reads in `src/main` beyond fonts/overlay/icon not exhaustively grepped.
- Fresh-clip divergence beyond subtitles (captions, AI titles, thumbnails on a never-opened clip).

### ⚠️ Environment gotcha hit this session
A tool on Fega's machine (JSON formatter-on-save?) SILENTLY stripped `scripts`, `build`, and
`devDependencies` from `package.json` mid-session (would break every build + `npm install`). Restored from
HEAD (`git checkout HEAD -- package.json`). If builds mysteriously break, check `package.json` line count
(should be 99) FIRST. See memory [[project_package_json_strip]].

---

## Fix Queue nav badge overcount (#139)

**Status:** ✅ SHIPPED in session 81 on **0.1.8-alpha.4** (`47a9d15`) — awaiting Fega's in-app verification (`status: untested`).
`totalApproved` (App.js:451) now applies the publish-tracker exclusion the Queue list already uses, so the badge matches the list.
Full root cause + patch in GitHub issue **#139** (`type: bug` / `area: queue`).

**Symptom:** Queue bottom-nav badge showed **"10"** while only **1** clip was really queued. The badge counts every
rendered `approved`/unscheduled clip, but publishing never flips a clip out of `"approved"` — so already-published
clips keep inflating the badge. The Queue *list* already hides them (via the tracker), the badge doesn't.

---

## NEXT — Cancel/Stop an in-progress clip render (#140)

**Status:** ✅ IMPLEMENTED in session 82 (source only — no installer cut, batching rule). Awaiting Fega's in-app verification once it rides the next batched installer. Issue #140 stays OPEN.
Build clean (`build:renderer` + `node --check` on all 4 main-process files) and the app boots without error. 5 files changed, no schema change — exactly as planned below.

**Request (Fega):** "There is no way for me to stop a queue once it's started. I need there to be a way to do that."
The screenshot was the editor topbar render button at **34%** (the gold spinner pill) — i.e. he wants to abort the
render that runs when he hits **Queue** (or **Render**).

**Key finding (traced — the render has TWO cancelable phases, not one):**
- The progress bar maps **0–40% → subtitle/caption OVERLAY-FRAME render** (offscreen `BrowserWindow`, `subtitle-overlay-renderer.js renderOverlayFrames`, frame loop at `:246`, `win` created `:170`, `win.destroy()` in finally `:281`). **34% is THIS phase — no FFmpeg process exists yet.**
- **40–99% → FFmpeg** encode (`render.js:314` `const proc = spawn("ffmpeg", args)`; close handler `:332`).
- Neither resource is reachable from outside: `win` and `proc` are local; there is NO `render:cancel` IPC. (Only existing kill pattern is `signals.js:252` for Python, also local.)
- Render start path: `EditorLayout.doRender` (`:264`) → `window.clipflow.renderClip` (preload `:113`, `ipcRenderer.invoke("render:clip")`) → `main.js` handler (`:2220`) → `render.renderClip`. Progress streams back on `"render:progress"`; UI state `rendering`/`renderPct` (`:227-228`), progress pill JSX at `EditorLayout.js:882-892`.

**Design:** one cancel that handles BOTH phases and reads as "Canceled," never a red "Failed."
- `render.js`: module-level `let canceled=false`, track the active overlay `win` + ffmpeg `proc`; export `cancelActiveRender()` that sets the flag, `win.destroy()` if in overlay phase, `proc.kill("SIGTERM")` if in FFmpeg phase. The FFmpeg `close` handler already fires on kill (code≠0) — branch on the `canceled` flag to resolve `{ canceled:true }` instead of rejecting with a "render failed" error. Same for the overlay loop (check flag at top of `:246`, bail with `{ canceled:true }`).
- `subtitle-overlay-renderer.js`: accept a cancel-check (or expose the active `win`); break the frame loop when canceled; existing `win.destroy()`/`cleanupOverlayFrames` handle teardown.
- Cleanup on cancel: `cleanupOverlayFrames(tempDir)` (already runs) **+ delete any partial output `.mp4`** so no half-written file is left; do NOT set `renderStatus` (clip stays unrendered/draft — no Queue entry, no red marker).
- `main.js`: `ipcMain.handle("render:cancel", () => render.cancelActiveRender())`; on a `{ canceled }` result, skip the renderStatus/thumbnail writes.
- `preload.js`: `cancelRender: () => ipcRenderer.invoke("render:cancel")`.
- `EditorLayout.js`: add a small **✕** inside the gold progress pill (`:882-892`, shown only while `rendering`) → `window.clipflow.cancelRender()`. Treat the `{ canceled }` result as a clean reset (`rendering=false`, `renderPct=0`, brief "Canceled" flash) — NOT the `renderStatus:"failed"` path.

**File impact (no schema change):** `src/main/render.js`, `src/main/subtitle-overlay-renderer.js`, `src/main/main.js`, `src/main/preload.js`, `src/renderer/editor/components/EditorLayout.js`.

**Steps:**
1. render.js cancel infra (flag + handles + `cancelActiveRender()` + canceled-vs-failed branching + partial-file delete).
2. subtitle-overlay-renderer.js: make the frame loop interruptible.
3. main.js `render:cancel` handler + skip-writes-on-cancel.
4. preload.js `cancelRender` bridge.
5. EditorLayout.js ✕ button + clean-reset handling.
6. `npm run build:renderer` compile check + `clipflow-code-review` self-check. (NO version bump / installer — batching per session-81 rule.)

**Verification (Fega, plain — ~2 min):** Open a clip, hit **Queue**, and while the gold **%** spinner is going, click the new **✕** on it. ✅ the render stops within a second, the buttons go back to **Render / Queue**, and nothing shows up half-done in the Queue tab (no red "Failed" card). Try canceling both early (while it says a low %, ~under 40) and later (higher %) — both should stop cleanly. ❌ it keeps going, throws a "failed" error, or leaves a broken clip.

**Watch out for:** cancel arriving right as a phase finishes (race) → guard `cancelActiveRender()` to no-op when no active win/proc. The offscreen overlay window MUST be destroyed or it leaks. Don't mark the clip failed on a user cancel (that's the #1-confusing outcome).

---

**Root cause (traced):**
- Badge = `totalApproved` at `src/renderer/App.js:451-453` — filters `status approved/ready && !scheduledAt`, NO tracker exclusion.
- List = `approved` at `src/renderer/views/QueueView.js:525-536` — same status check PLUS `!scheduledClipIds.has(c.id) && !scheduledTitles.has(c.title)` (the tracker-based "already published/scheduled" exclusion, built at `:505-506`).
- `logPost` (`QueueView.js:1149-1158`) only adds a tracker entry on full publish success; immediate publish leaves `status:"approved"`, `scheduledAt:null`.
- `trackerData` is already in App.js scope and passed to QueueView (`App.js:564`) — no plumbing needed.

**File impact:** `src/renderer/App.js` only (the `totalApproved` useMemo, ~line 451). No schema change.

**Steps:**
1. In `totalApproved`, build `trackedIds`/`trackedTitles` Sets from `trackerData` and add `&& !trackedIds.has(c.id) && !trackedTitles.has(c.title)` to the filter (exact snippet in #139). Add `trackerData` to the `useMemo` deps.
2. `npm run build:renderer` (compile check) → run `clipflow-code-review` self-check.
3. Cut installer `0.1.8-alpha.4` via `clipflow-update-launcher`; commit `App.js` (fix) + `package.json`/`CHANGELOG.md` (bump). Never stage `data/`.

**Verification (Fega, plain — ~1 min):** Open the Queue tab. The little number on the **Queue** button at the bottom should match how many clips are actually sitting in the list waiting to publish (right now that's **1** — "Water Treatment"). Publish or queue a clip and watch the number go down/up by one. ✅ matches the list / ❌ still inflated.

**Out of scope (noted in #139):** badge won't mirror the list's hashtag/gameTag drop unless `requireHashtagInTitle` filtering is duplicated — revisit only if a hashtag-less off-by-one ever shows up. Longer-term cleaner option: one shared "actionable queue count" instead of two parallel filters.

---

## ✅ RESOLVED — TikTok Content Posting audit / Direct Post APPROVED (2026-07-02)

**Outcome:** TikTok Direct Post **approved — clean pass** on the resubmission against **0.1.8-alpha.2**.
No reviewer conditions. This closes out the whole ROUND 2 resubmission arc: the code fixes shipped
in session 79 and the only remaining work (Fega's portal rename + re-recorded videos + resubmit) is
done. TikTok publishing is now live for real (production) accounts — no longer sandbox-forced-private.
Details of the shipped code fixes retained below for reference.

**Status:** ✅ SHIPPED in session 79 on **0.1.8-alpha.2**. Item 1 (A9 notice visible during the
publish window) + Item 2 (Music Usage above Commercial Disclosure) shipped in
`src/renderer/views/QueueView.js` (`815433a`). **Item 3 (A8 capacity message) needed NO code —
already implemented** in the main process via `translateTiktokPublishError` (`main.js:2510`),
which maps TikTok's over-limit/rate-limit family to "reached its posting limit — try again later"
and the publish results panel already surfaces it (the plan's "A8 unbuilt" assumption was stale).
A follow-up Queue-card quality pass (`29a83a1`) + publish-status "Processing…" fix (`762fc09`)
landed on top after Fega reviewed the live card. **Code side of the resubmission is DONE.**
Remaining = Fega's NON-CODE steps: portal Org rename to match App Name, re-shoot Video 2
(reordered panel) + Video 3 (must show the 5d notice during processing), resubmit — recorded
against 0.1.8-alpha.2. Original investigation kept below for reference.

**Why:** First TikTok Direct Post audit DENIED 2026-06-03. Cited **UX Guideline Point 5d**
(missing "may take a few minutes to process/appear" notice = our A9) + panel rendered out
of guideline order. Resubmission needs these fixed, then re-recorded videos.

**Spec:** `tasks/specs/tiktok-content-posting-audit.md` → read the **ROUND 2** section
(line ~292) AND the A8/A9 rows (~45-46). All three fixes are renderer-only, in
`src/renderer/views/QueueView.js`.

### Read first (anchors already traced — load these regions)
- `QueueView.js` `TiktokOptionsPanel` ~180-442 (the panel; A4 Music Usage block **411-439**, A5 Commercial Disclosure block **357-409**).
- `QueueView.js` `getTiktokBlockReason` **742-768** (the publish gate; mirror its style for A8 — but see A8 note).
- `QueueView.js` publish-results panel **1617-1651** (the A9 block lives at **1643-1648**, gated `tiktokDone` at **1618-1621**).
- `QueueView.js` `publishClip` ~994-1075 + `retryFailed` ~840-905 (success sets per-platform status `"done"` at **889**; TikTok error surfaces as `result.error` → shown as status string at **885**).
- `src/main/oauth/tiktok-publish.js` `publish()` 322-410 — emits `progress("processing", 85, "Processing on TikTok...")` then `await pollPublishStatus` (polls TikTok to completion) **then** flips to done. `queryCreatorInfo` (108-115) returns raw creator_info `data` (no capacity field).

### KEY FINDING (don't miss this)
A9 is **NOT** "never built" (spec wording is stale). The message *"Your TikTok post may take a
few minutes to appear on your profile"* already exists at **QueueView.js:1646** — but it only
renders when the TikTok row status === `"done"`, which happens **after** `pollPublishStatus`
finishes. During the long "Processing on TikTok…" poll window (what the screen recording
captures) the notice is absent. The "Processing…" Fega sees is the main-process progress
`detail`, surfaced at **1637** while status is `"publishing"`. So A9 is effectively dead during
the window that matters.

### Item 1 — A9 / Point 5d (BLOCKER)
- Broaden the trigger: render the notice when a TikTok platform status is `"publishing"` OR
  `"done"` (i.e. accepted/in-flight, not failed/pending) — not only `"done"`. Compute a
  `tiktokAccepted` flag to replace `tiktokDone` at **1618-1621 / 1644**.
- Make it clearly visible for the recording (current line **1645** is tiny tertiary italic).
  Render as a proper info line (small icon + readable secondary text; `InfoBanner` style as used
  at **1656** is consistent). Acceptance: the message is on screen during the processing window.

### Item 2 — Panel reorder (Point order 1→5)
- Move the **A4 Music Usage Confirmation** block (**411-439**) to render ABOVE the **A5 Commercial
  Disclosure** block (**357-409**) — i.e. immediately after the A7 duration banner (ends **355**).
  Pure JSX move. Resulting order: Posting-as → Privacy → Interaction toggles → (A7 banner) →
  **Music Usage** → **Commercial Disclosure** (with its Paid-partnership/Promotional labels).
- Nuance (decided: keep the simple move): the A4 block carries a conditional Branded-Content-Policy
  legal variant; after the move it renders above the Branded Content toggle. Stays compliant; test
  publish uses SELF_ONLY/non-branded so the reviewer won't hit it. Only split it out if Fega asks.

### Item 3 — A8 capacity check (DECIDED: publish-time, Option B)
- **creator_info has NO pre-flight capacity flag** (existing comment at **740-741** + TikTok docs
  agree; spec's `can_post` claim is wrong). DO NOT re-litigate; DO NOT add a pre-flight gate in
  `getTiktokBlockReason` for capacity (it'd be dead code).
- Instead: when a TikTok publish returns TikTok's over-limit/rate-limit error, translate it to a
  clear **"You've hit TikTok's posting limit — try again later."** message in the publish-results
  panel (the renderer already captures `result.error` at **885**; map the specific error there).
- **TODO when coding:** pin TikTok's actual over-limit error code/string. Check `tiktok-publish.js`
  error paths + TikTok Content Posting API docs (`spam_risk_too_many_posts` / rate-limit family).
  Match defensively so a wording shift doesn't break it.
- **No simulation toggle.** Not required by TikTok; not in the recording playbook; the denial
  didn't cite capacity. Can't force a real limit on camera anyway. (Decided with Fega.)

### NOT needed
- **No schema/store version bump.** None of the 3 items add a persisted clip field (A9 = render-gate
  change; reorder = JSX; A8 = publish-time error translation). A1–A7's `clip.tiktok*` fields + their
  bump already shipped in Session 39. The spec's migration requirement does not apply to Round 2.

### Build & verify (after coding)
1. `npm run build:renderer` + `npm start`; verify in-app (no live TikTok account needed for these):
   panel renders top-to-bottom Posting-as → Privacy → toggles → Music Usage → Commercial Disclosure;
   the A9 notice shows clearly during a publish (even mock) and stays visible.
2. Steps needing Fega's live audited TikTok account (real publish, real privacy badge, real limit
   error) are his to exercise during re-recording — flag which.
3. Cut a fresh **0.1.8-alpha** via the `clipflow-update-launcher` skill so Fega can re-record.

### Acceptance (from Fega)
- Publishing a TikTok clip shows "may take a few minutes to appear" in the success/processing state, on screen.
- TikTok panel order: account/@handle → privacy → interaction toggles → Music Usage Confirmation → Commercial Disclosure → compliance labels.
- Over-limit creator returns TikTok's error → publish shows the clear "try again later" message (publish-time).
- Keep the existing chunk-math fix (`Math.floor`, **QueueView.js:1355**) intact; don't regress publishing.

---

## SHIPPED — recent (closed)
- **Session 77 karaoke fragile-zone sweep** (all closed `status: untested`, one commit each):
  **#136** word-delete words/text desync (`5befa4c`); **#89** mode-switch edit loss (`0e55482`);
  **#131** srcWordIdx highlight/seek desync (`af2f15d`); **#132** mid-playback click freeze
  (`861d9fe`); **#95** split word dup/drop (`afb70f5`); **#87** tight-gap overlap (`16f8ae5`);
  **#90** stale clip-load playhead (`6c3eb84`); **#88** initVideoRef set() (`af0939f`); **#107**
  resolved-by #131/#95. Filed **#137** (timeline split time-space) + **#138** (AA toggle vs words[]).
- **Session 74 fix-first batch** (all closed `status: untested`): **#124** waveform/ffmpeg logs → `app.log` (`759e7a2`); **#92** "Applied" badge gated on confirmed save (`1fc5964`); **#101** punctuationRemove restored on reopen, **#32** caption-width restored on reopen, **#106** passive-wheel console warning killed across 3 handlers (`a197bc3`). Parked #68/#62; recorded the `tools/`-bundling scope correction on #68.
- **#57** Editor 30-min lag (60fps re-render storm) — **CLOSED** (D1 `c74c30e` timeline + D2 `985fa12` subtitle list). Both per-frame storms isolated into tiny memoized children (`TimelinePlayhead`, `SegmentRow`); Fega-confirmed smooth. Phase D3 (row self-subscribes to `currentTime` so the parent can drop its sub) was the conditional fallback — not needed.
- **#129** ALL-CAPS (AA) no-op on uncased text — fixed (`507347a`, session 72). Surfaced by the D2 fresh-eyes review.
- **#130** Stale "Long segment" warning after timecode/split/merge — fixed (`507347a`, session 72). Surfaced by the D2 fresh-eyes review.
- **#125** Recordings (i) info popover + Play-recording-in-editor — closed (`1d33a9d`, session 70).
- **#126** Recordings sort by part number, not rename-click time — shipped (`f2240e2`, session 70).
- **#123** Recordings floating action cluster + sequential batch generate — closed (`e9a039d`, session 68).

---

## Deferred plans

### #85 Chunk B/D — title/caption clip-signal forwarding (was active session 45)
Plan to forward `energyLevel` + `confidence` into the title/caption prompt
(`useAIStore._collectClipParams` → `title-caption-prompt.js buildUserContent` →
`main.js anthropic:generate`). Chunk D (wire full `creatorProfile`) is
**deliberately deferred** — profile is detection-only by design; feeding
`archetype` into wording re-introduces the generic template-y copy session 42
removed. Full body recoverable from `git log -p tasks/todo.md`. Re-introduce when
returning to #85.

### Interactive architecture/flows visualizer
A previous session drafted a single-page HTML architecture visualizer for the
Obsidian vault (`context/architecture/`) using vis-network 9.x. Never approved or
started. Body recoverable from git history. Re-introduce when there's appetite for
a docs-quality artifact.
