# ClipFlow — Session Handoff
_Last updated: 2026-06-07 — Session 62 — Shipped & Fega-verified #117 (subtitle resize keeps all words). Filed #118 (extend dead-zone, bug) + #119 (per-word "teeth", feature) while testing; combined plan in `tasks/todo.md`, **AWAITING Fega's approval before any code**._

---

## One-line TL;DR

**#117 done & confirmed:** trimming a subtitle block's edge no longer deletes the outer word — `updateSegmentTimes` re-spaces words to fit instead of dropping them (clamp when nothing's cut off; proportional re-space only when a trim would otherwise lose a word). Committed `acab20c`, Fega-verified hands-on, auto-closed on push. Two related per-word-timing items surfaced while testing and are filed with a full plan but **NOT started**: **#118** (extending a sub's left edge leaves the first word un-highlighted = a "dead zone") and **#119** (draggable per-word "teeth" on timeline subtitle blocks). Both await Fega's go.

## Current State

Renderer builds clean (`npm run build:renderer`, ~9s, only the pre-existing #73 chunk-size warning). One CODE commit this session: `acab20c` (#117), pushed to master. Daily app still `0.1.6-alpha` — no installer built. An `npm start` (prod profile, shell `b4qky2p1n`) was launched for the #117 test and may still be running (close the window when done). A wrap commit (HANDOFF + CHANGELOG + todo.md + lessons marker) follows. Working tree otherwise only runtime churn (`data/clipflow.db`, `data/game_profiles.json` — NOT committed).

## What Was Just Built (session 62)

- **#117 — CLOSED, Fega-verified (`acab20c`).** `updateSegmentTimes` (`useSubtitleStore.js`, `durChanged`/trim branch) no longer drops words. New logic: `wouldDrop = words.some(w => fully outside new bounds)`. If **false** → clamp each word (`Math.max(start)`/`Math.min(end)`) — preserves transcribed audio-sync timing for normal trims. If **true** → re-space ALL words proportionally into the new range (`start = startSec + (w.start − oldStart) * (newDur/oldDur)`, clamped to bounds) — keeps the word that would've been cut; lossless, reversible, never inverts. Move (`startChanged`) and extend (hits clamp) paths unchanged. Proven: 40/40 synthetic harness driving the REAL store action. Auto-closed on push via the commit keyword; resolution note added via `gh issue comment`.

## Key Decisions

- **#117 fix = Option B (hybrid clamp / re-space), chosen over always-re-space (Option A).** Option A is simpler (~4 lines) but drifts transcribed karaoke off the audio on every resize. Option B only re-spaces when forced to save a word, so small trims keep real audio timing. Verified it composes correctly across a continuous drag (the per-pointermove affine maps chain to the exact net transform; mid-drag clamp↔re-space flips never lose a word).
- **Closed #117 via the commit keyword, commented separately.** `Fix #117` in the message auto-closed it on push *before* my `gh issue close` ran (which then no-op'd and dropped its comment). Captured as memory `feedback_fix_keyword_autocloses` — going forward, add notes via `gh issue comment`, and if gating close on verification use a bare `#N` reference instead of `Fix #N`.
- **#118 + #119 filed but NOT started — awaiting approval.** Per plan-before-code: the bug (#118) root cause + the feature (#119) full plan (file impact, steps, verify) live in `tasks/todo.md`; nothing touched.

## Next Steps (prioritized)

1. **#118 — extend dead-zone (NEXT, small, ~1 file).** After the `durChanged` re-time/clamp in `updateSegmentTimes`, pin the outer words to the block edges: `updatedWords[0].start = startSec` and `updatedWords[last].end = endSec` (both edges, both trim+extend). Interior words keep real timing. Harness: extend left → `words[0].start === startSec`; extend right → `words[last].end === endSec`; interior unchanged; no word dropped. Fega: extend a sub's left edge earlier → first word highlights from the new start (no inert gap).
2. **#119 — per-word "teeth" (feature, its own pass).** New store action `setWordBoundary(segId, boundaryIdx, sourceTimeSec)` (`_pushUndo`; set `words[i].end = words[i+1].start = clamp(t, neighbor±MIN)`); render draggable ticks per internal word boundary in `SegmentBlock.js` (selected-only, mirror `onHandleDown`); `onWordBoundaryDrag` handler in `TimelinePanelNew.js`. Coordinate-map words source→timeline for tick x, drag delta timeline→source. **Add `seg.words` to SegmentBlock's `React.memo` comparator** (currently omitted). Full steps in `tasks/todo.md`.
3. Backlog (unchanged) — same `words[]`/`text` family: #95, #107, #87, #84, #101, #89. Plus #64 (waveform, root-caused), #112/#62 (child-process stdio/EPIPE), #57 (lag), #114, #108, #40.

## Watch Out For

- **#118 + #119 are PLANNED ONLY — get Fega's "go" before coding** (plan in `tasks/todo.md`).
- **The `words[]`/`text` invariant is load-bearing.** Viewer + Projects preview + burned-in exporter all render word-by-word from `words[]`; `text` is the fallback only when `words` is empty. Any op that sets text or changes a segment's time range MUST keep them in sync — a *partial* `words[]` silently drops words from the render while the panel/timeline still show them. (#116 fixed create/merge; #117 fixed resize/trim; #118 is the extend-edge refinement; #95/#107/#87 are remaining variants.)
- **#119 coordinate trap:** `words[]` are source-absolute, but `SegmentBlock` receives timeline-mapped segments (`getTimelineMappedSegments`). Do NOT position teeth from raw `words[i].end` — map source→timeline first (reuse `timeMapping`).
- **Already-damaged data does NOT self-heal.** Test fixes on FRESH subtitles; clips edited before a fix already lost word data on disk.
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** (runtime churn). Stage source/docs explicitly.
- **Kill the `npm start` (e.g. `b4qky2p1n`) before `npm run build`** (installer packaging locks the binary). `npm run build:renderer` is safe with it running.

## Logs / Debugging

- **Build/run:** `npm run build:renderer` (~9s, renderer only); `npm run build` for the full installer; `npm start` runs prod profile from `build/`. Clean boot this session: `App started … 0.1.6-alpha` (electron 40.9.1), `Database initialized … (schema v4)`.
- **Synthetic harness pattern (used for #117, reuse for #118/#119):** write `tmp-test-*.mjs` with a STATIC default import of the store; bundle with `node_modules/.bin/esbuild tmp.mjs --bundle --platform=node --format=cjs --outfile=tmp.cjs --banner:js='globalThis.window={clipflow:{}};globalThis.document={};' --log-level=warning`; run `node tmp.cjs`; delete both. The `--banner` stubs `window`/`document` BEFORE module load (avoids top-level-await under CJS + missing-global crashes). Drive via `store.setState({editSegments,_sourceOrigin:0,_undoStack:[],_redoStack:[]})` → `store.getState().<action>(...)` → assert `store.getState().editSegments`. The store loads headless (cross-store imports are body-only; `_pushUndo` uses `Date.now()` + the initialized `_undoStack`).
- **#117 code map (`useSubtitleStore.js`):** `updateSegmentTimes` ~line 527; `durChanged` branch ~544 (now `wouldDrop` → re-space vs clamp); `startChanged` move branch right after; `_wordsFromText` helper ~32. Renderer word-vs-text branch: `PreviewOverlays.js:150` (words) vs the text fallback below it — shared by `PreviewPanelNew.js`, `ProjectsView.js`, and `public/subtitle-overlay/overlay-renderer.js`.
- **#118 code map:** same `updateSegmentTimes` `durChanged` branch — add the edge-pin AFTER the re-time/clamp, before the return that spreads `...seg`.
- **#119 code map:** `SegmentBlock.js` (`components/timeline/`) — trim handles via `onHandleDown` (mirror this for teeth, distinct top strip), `React.memo` comparator at file bottom (omits `words`). Resize wiring in `TimelinePanelNew.js` `handleSubtitleResize` ~454 / calls `updateSegmentTimes` ~508. Mapping helpers in `editor/models/timeMapping` (`sourceToTimeline`/`timelineToSource`).
- **Inspect on-disk clip data:** `W:\…\.clipflow\projects\<projectId>\project.json` → `clips[]`, each `subtitles.sub1` (+`_format:"source-absolute"` if editor-saved) with numeric `startSec`/`endSec`, display `start`/`end`, and `words[]`.
