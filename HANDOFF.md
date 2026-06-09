# ClipFlow — Session Handoff
_Last updated: 2026-06-08 — Session 71 — Started #57 (30-min editor lag). Shipped **Phase D1**: extracted the per-frame timeline playhead/clock into small child components so the ~1500-line `TimelinePanelNew` no longer re-renders 60×/sec during playback. Committed, pushed, reviewed (4-lens, clean), Fega-confirmed smoother. Paused before the riskier Phase D2 on a clean checkpoint._

---

## One-line TL;DR

**#57 Phase D1 is done and pushed (`c74c30e`).** The timeline half of the 30-min-source lag is fixed: the moving playhead, auto-scroll, and toolbar clock now live in `TimelinePlayhead.js` (a new ~96-line file with `<TimelinePlayhead>` + `<TimelineTimecode>`), each subscribing to playback time itself — so `TimelinePanelNew` dropped its `currentTime` subscription and only re-renders on zoom/segment/selection/tab changes, not every frame. Highlighting code (`LeftPanelNew.js`) was **not touched** — that's **Phase D2** (next, riskier — it's the Phase B/C revert class). Scrub-frame-skip on long sources split out to **#128** (pre-existing, not a D1 regression).

## Current State

Healthy on `0.1.6-alpha`, schema v4. One commit pushed this session (`c74c30e`). The session-end commit (HANDOFF + CHANGELOG + lessons marker) is on top of it. App was left **running from source** (`npm start`, background) on the latest build for Fega to keep testing D1. Working tree also has the usual `data/clipflow.db` + `data/game_profiles.json` runtime churn — **DO NOT commit those**.

## What Was Just Built

1. **#57 Phase D1 — TimelinePlayhead extraction (`c74c30e`).**
   - **New file `src/renderer/editor/components/timeline/TimelinePlayhead.js`** exports:
     - `<TimelinePlayhead effectiveDuration clipContentWidth scrollRef>` — owns `smoothTime` useState + the 60fps rAF loop (keyed `[playing]`, reads `video.currentTime` via `getState().getVideoRef()`/`mapSourceTime`) + the paused-sync effect + the auto-scroll-during-playback effect + the playhead `<div>` (triangle + 2px bar). Subscribes to `playing` + `currentTime` itself.
     - `<TimelineTimecode>` — subscribes to `currentTime`, renders the toolbar clock `fmtTime(currentTime)`.
   - **Edits to `TimelinePanelNew.js`:** removed its `currentTime` selector (:36); removed local `smoothTime` + `playheadRafRef`; removed the rAF loop + paused-sync effects; removed `playheadTime`/`playheadPx` derivation; zoom-anchor effect now reads `usePlaybackStore.getState().currentTime` and dropped `currentTime` from its deps; removed the auto-scroll effect; toolbar timecode span → `<TimelineTimecode/>`; playhead JSX block → `<TimelinePlayhead .../>`; dropped the **dead** `currentTime={currentTime}` prop on `<WaveformTrack>` (destructured but never used inside it); removed now-orphaned `PLAYHEAD_COLOR` + `RULER_H` imports.
   - Net: parent re-renders only on zoom/segment/selection/tab/resize/scrub — never per frame. `PreviewPanelNew` remains the SOLE writer of store `currentTime` during playback.
2. **#128 filed** — timeline scrub on long sources skips frames in the preview (HTML5 long-GOP seek limitation). Pre-existing; surfaced during D1 testing; NOT a D1 regression.
3. **#57 progress comment** posted documenting D1 + the D2 plan. Issue kept OPEN (multi-phase).

## Key Decisions

- **Component extraction, NOT store-derivation.** The fix isolates the per-frame work into tiny children that re-render alone; the heavy parent stops subscribing to `currentTime`. This is the layer the owner converged on after Phase B/C (store-derivation) were reverted for breaking highlighting. D1 deliberately touches ZERO highlighting code.
- **D1 can't regress highlighting — by construction.** Highlighting lives in `LeftPanelNew.js` (`activeSegId` driven off store `currentTime`, written solely by `PreviewPanel`). D1 never edits that file and never writes `currentTime`/`seekTo`. The 4-lens review confirmed this structurally. So no highlighting test was needed for D1 (and the source-preview Fega used has no transcript anyway).
- **Auto-scroll effect dep `duration`→`effectiveDuration`** in the extracted child: the original listed `duration` in deps but used `effectiveDuration` in the body (a latent staleness bug). The child lists the value it actually reads. No observable change (effect early-returns unless `playing`; re-runs every frame on `smoothTime` during playback). Flagged by review as an improvement, not a regression.
- **Verification split (desktop app, can't profile/see UI):** me = builds clean + boots clean + 4-lens adversarial review clean; Fega = in-app feel (playhead smooth, clock ticks, scrub follows, smoother). Acceptance criteria for #57 are perceptual, so Fega's feel IS the metric.
- **Phased & isolated commits.** Phase B/C failed as a bundled, unreviewed change. D1 shipped alone, reviewed, verified. D2 will ship alone too.

## Next Steps (prioritized)

1. **#57 Phase D2 — the left-panel row storm (the other half).** `EditSubtitlesTab` (`LeftPanelNew.js`, sub at :642) and `TranscriptTab` (:390) still re-render all 100–200 rows every `currentTime` tick. Plan: extract a **`React.memo`'d `<SegmentRow>`** from the inline row map (`LeftPanelNew.js:889–1016`); the parent computes `isActive` + `activeWordInSeg` (number, or −1 for inactive rows) and passes them as props so the 199 inactive rows bail out of reconcile and only the playing row updates. **Must stabilize all row callbacks** (`getActiveWordInSeg` is currently `useCallback([adjustedTime])` → recreated every frame; the inline ALL-CAPS/delete `onClick`s are recreated each render). **This touches highlighting (Phase B/C revert class) — ship as its own commit and verify on a GENERATED clip with subtitles (Projects tab), not a source preview.** Detailed plan in `tasks/todo.md`.
2. **#57 Phase D3 (CONDITIONAL)** — same memo treatment for the Transcript tab word rows, only if still laggy after D2. No speculative work.
3. **#128** — scrub frame-skip (proxy / frame-accurate seek). Lower priority.
4. Backlog unchanged: subtitle family (#95/#107/#87/#101/#89/#84/#99/#114/#121), #112/#62 (EPIPE/silent audio), #90/#93/#105/#106/#32/#10 (editor/timeline bugs), #108/#40 (dead-code cleanup), #124 (logs→app.log), #127/#86 (icon polish), #64 (fixed last session, re-confirmable). Commercial-launch: #20–#23, #50–#56, #73/#74, #85.

## Watch Out For

- **Phase D2 is the fragile one.** It modifies the exact highlighting rows that got reverted twice. Don't move highlighting *logic* into the store (that's what failed); only extract+memoize the row component and pass `isActive`/`activeWordInSeg` down. Verify active-word highlight still tracks in BOTH tabs + all segment edit ops (split, delete, TimecodePopover, ALL CAPS, inline word edit) on a real generated clip BEFORE the 30-min feel test.
- **Source-preview (Play-in-editor) has NO transcript** — `transcription:null` by design — so it CANNOT be used to test subtitle highlighting. Use a generated clip from Projects for any highlighting verification.
- **If a NEW timeline subscriber to per-frame time is added,** put it in its own small component (like `TimelinePlayhead`) — do NOT re-add a `currentTime` selector to `TimelinePanelNew` or you reintroduce the storm.
- **Pre-existing dead code left untouched** (surgical rule): `WaveformTrack.js:4` still destructures an unused `currentTime` param (now always undefined since D1 stopped passing it — harmless); `RULER_BG` and `sourceStartTime` are unused in `TimelinePanelNew` but predate this change.
- **No single-instance lock in `main.js`** — kill any open ClipFlow Electron before `npm run build`/relaunch: `powershell.exe -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Where-Object Path -Like '*Desktop\ClipFlow*' | Stop-Process -Force"`.
- **`data/clipflow.db` / `data/game_profiles.json`** = runtime churn, never commit. Stage source/docs explicitly.

## Logs / Debugging

- **Build/run this session:** `npm run build:renderer` (Vite, ~10s, clean — the >500 kB chunk warning is pre-existing/expected, ignore). App launched via `npm start` (loads `build/`, background id at session time). Boot was clean: `App started … electron 40.9.1`, `Database initialized … (schema v4)`, `File migration already complete`, then Recordings preview-frame generation. Error scan of the launch output (`error|uncaught|cannot read|failed|exception`) returned nothing.
- **The Bash tool is POSIX, not PowerShell** — `Select-Object`/`$null` fail there; use `tail`/`head`/`grep`, or shell out via `powershell.exe -NoProfile -Command "…"` for Windows-specific ops (e.g. killing electron).
- **Adversarial review pattern used (worked well):** a 4-agent `Workflow` (lenses: behavior-preservation / dangling-references / React-internals / effectiveness-completeness), each reading the actual files + a precise change description, returning a structured findings schema. All clean, one nit. Re-usable for any fragile refactor.
- **30-min sources exist for testing:** the Recordings list has several ~1804s (≈30 min) sources (e.g. `2026-01-07 12-11-45.mp4`) — open via Play-in-editor to exercise the editor at scale.
- **Prod log:** `%APPDATA%\clipflow\logs\app.log` (electron-log; `[ts] [level] (scope) msg`). Raw `console.log` only reaches a terminal (that's #124).
- **Key files (D1/D2):** Timeline playhead = `src/renderer/editor/components/timeline/TimelinePlayhead.js` (new) + `TimelinePanelNew.js` (parent; scroll container ref at ~:846, playhead mount at ~:857, zoom-anchor effect ~:690, segment row track ~:884+). Left-panel rows (D2) = `src/renderer/editor/components/LeftPanelNew.js` (`EditSubtitlesTab` ~:620, row map :889–1016, `getActiveWordInSeg` ~:741, `renderWords` ~:759, `TimecodePopover` ~:219; `TranscriptTab` ~:381, `activeWordIdx` useMemo ~:463). The 60fps driver = `PreviewPanelNew.js` rAF loop ~:800–836 (`setCurrentTime`). Store = `usePlaybackStore.js` (`setCurrentTime` :46, `seekTo` :86, `mapSourceTime` :118; no active-segment state).
