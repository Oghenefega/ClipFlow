# ClipFlow — Session Handoff
_Last updated: 2026-06-07 — Session 63 — Shipped & Fega-verified #118 (resize dead zone) + #119 (per-word "teeth" + per-word placement). Filed + fixed #120 (inter-word spaces dropped in viewer + export). All committed & pushed; #118/#119 closed verified, #120 closed `status: untested` (visual masked by the pop animation)._

---

## One-line TL;DR

Three subtitle word-timing items done this session: **#118** — extending a block's left edge no longer leaves the first word un-highlighted (pin outer words to block edges); **#119** — draggable per-word "teeth" on the selected timeline block to set when each word's highlight fires, plus per-word text placement in the block; **#120** (surfaced while testing #119) — words rendered with no space between them in the viewer AND the burned-in export (trailing space collapsed inside an inline-block) — fixed in both renderers. The "andreconnecting" *visual* turned out to be mostly the word-pop scale animation growing over the gap, not the markup — the markup fix is still a correct baseline (matters pop-off + in exports) and Fega chose to keep it.

## Current State

Renderer builds clean (`npm run build:renderer`, ~9s, only the pre-existing #73 chunk-size warning). Four CODE commits this session, all pushed to master: `e2bded4` (#118), `5a8b0a6` (#119 teeth), `51ad509` (#120 spaces), `12ea756` (#119 per-word placement + tooth alignment). Daily app still `0.1.6-alpha` — no installer built. An `npm start` (prod profile, shell `bw52fptgh`) is likely still running from the #120 test — close the window when done. Wrap commit (HANDOFF + CHANGELOG + todo + lessons distillation + ui-debug skill) follows. Working tree otherwise only runtime churn (`data/clipflow.db`, `data/game_profiles.json` — NOT committed).

## What Was Just Built (session 63)

- **#118 — CLOSED, Fega-verified (`e2bded4`).** `updateSegmentTimes` (`useSubtitleStore.js`, `durChanged` branch) now pins the outer words to the block edges AFTER the #117 clamp/re-space: `updatedWords[0].start = startSec`, `updatedWords[last].end = endSec`. No more inert "dead zone" at either end on extend/trim; interior words keep real timing; move path untouched. 36/36 harness.
- **#119 — CLOSED, Fega-verified (`5a8b0a6` + `12ea756`).** New `setWordBoundary(segId, boundaryIdx, sourceTimeSec)` store action (clamp between neighbors ±MIN; sets `words[i].end = words[i+1].start`; `_pushUndo`; text/edges untouched). Draggable teeth rendered per internal word boundary on the **selected** block in `SegmentBlock.js` (mirrors `onHandleDown`), wired via `handleWordBoundaryDrag`/`End` in `TimelinePanelNew.js` (timeline→source via `toSource`). Follow-up commit added **per-word text placement** in the selected block (each word in its own time-section) and moved each tooth to **word[i+1].start** (where the next word fires, flush with sections). Straddle guard: teeth/placement hide when an audio cut dropped a word (mapped count ≠ `sourceWordCount`). 31/31 harness.
- **#120 — CLOSED `status: untested` (`51ad509`).** Inter-word space was a trailing char inside each `display:inline-block` word span (collapsed by browsers → "andreconnecting"). Fixed in `PreviewOverlays.js` (React.Fragment, space as sibling node) AND `public/subtitle-overlay/overlay-renderer.js` (export DOM, `createTextNode` after the word element, both progressive + instant paths).

## Key Decisions

- **#118 pins BOTH edges, not just the left.** The visible dead zone is only the left (before the first word fires nothing is highlighted; karaoke keeps the last word active at the tail so the right gap isn't visibly inert). But pinning both is a clean invariant (outer words flush to edges), harmless, and fixes the data for the exporter. Scoped to `durChanged` only — move preserves transcribed lead-in/out.
- **#119 uses positional boundary indices with a straddle guard.** Mapped words can be dropped by `visibleWords` when an audio cut bisects a block, so a positional index could target the wrong source word. Rather than corrupt silently, teeth (and per-word placement) **hide** when mapped count ≠ source count. The common (no-cut) case is 1:1.
- **#119 coordinate trick:** `_mapSegmentsToTimeline` OVERWRITES each mapped word's `start`/`end` with the TIMELINE values (lines 64-68), so `SegmentBlock`'s `seg.words[i].end` is already in the same space as `seg.startSec` — no extra mapping in the component; `toSource()` converts only on drag-commit (identity when no NLE cuts). Tooth at `word[i+1].start`.
- **#120: space as a sibling text node, not a trailing char.** Correct in both renderers regardless of animation. Fega confirmed KEEP even though the pop animation masks it (it's a real baseline fix for pop-off + exports).
- **Left the viewer's CHAR_LIMIT=16 line-chunking AS-IS (Fega's call).** A long 3-word sub still reveals its last word on a 2nd timed "line" — intended progressive-caption look, not a bug.
- **Per-word placement only on the SELECTED block** (Fega's call) — keeps the timeline uncluttered.

## Next Steps (prioritized)

1. **#120 visual confirm** — render a clip (or toggle the word-pop animation off) and check the burned-in subtitles actually have spaces; remove `status: untested` on confirmation.
2. **Same `words[]`/`text` family (next natural work):** #95 (split duplicates/drops a word straddling the split point), #107 (split-at-word targets the wrong word when a segment straddles an internal audio deletion), #87 (createSegmentAtTime min-dur clamp overlaps next), #101 (restoreSavedStyle never restores punctuationRemove), #89 (setSegmentMode discards text edits), #84 (sub1 polluted with whole-recording transcript).
3. Backlog (unchanged): #64 (waveform empty, root-caused), #112/#62 (child-process stdio/EPIPE / silent audio), #57 (editor lag), #114, #108, #40. Commercial-launch: #20-#23, #50-#56, #73/#74, #85.

## Watch Out For

- **#120 is closed `status: untested`** — its fix is invisible while the word-pop animation is on (the scaled highlighted word grows over the gap). Confirm via a render or pop-off, then drop the label.
- **The `words[]`/`text` invariant is still load-bearing** (the recurring #95/#107/#87/#116/#117/#118 family). Viewer + Projects preview + burned-in exporter render word-by-word from `words[]`; `text` is the fallback only when `words` is empty. Any op touching a segment's words/time range must keep them in sync.
- **Visual-symptom debugging lesson (now in `clipflow-ui-debug`):** a subtitle VISUAL bug can come from the animation/transform layer (a `transform: scale()` pop) independent of markup — check it, reproduce with the animation off, before blaming CSS/data. (#120 had both: a real markup bug AND the pop masking it.)
- **`SegmentBlock` React.memo comparator now also compares `seg.words` / `sourceWordCount` / `onWordBoundaryDrag`** — needed so teeth/word-placement re-render on edit. Don't drop these.
- **Mapped word coords:** `seg.words[i].start/end` in `SegmentBlock` are TIMELINE coords (overwritten in `_mapSegmentsToTimeline`), not source. Use them directly for positioning; convert to source via `toSource` only when committing a drag.
- **Already-damaged data does NOT self-heal.** Test on FRESH subtitles. (Clip 17's seg 199 was clean — 3 words — so #120 was a render bug, not data damage.)
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** (runtime churn). Stage source/docs explicitly.
- **Kill the `npm start` (`bw52fptgh`) before `npm run build`** (installer packaging locks the binary). `npm run build:renderer` is safe with it running.

## Logs / Debugging

- **Build/run:** `npm run build:renderer` (~9s, renderer only, copies `public/` → `build/` incl. the export overlay); `npm start` runs prod profile from `build/`. Clean boot this session: `App started … 0.1.6-alpha` (electron 40.9.1), `Database initialized … (schema v4)`.
- **Synthetic harness (reused for #118 36/36, #119 31/31):** `tmp-test-*.mjs` with a STATIC default import of the store; bundle `node_modules/.bin/esbuild tmp.mjs --bundle --platform=node --format=cjs --outfile=tmp.cjs --banner:js='globalThis.window={clipflow:{}};globalThis.document={};' --log-level=warning`; `node tmp.cjs`; delete both. Drive via `store.setState({editSegments,_sourceOrigin:0,_undoStack:[],_redoStack:[],_lastUndoPushTime:0,_dragging:false})` → `store.getState().<action>(...)` → assert `store.getState().editSegments`. `_pushUndo`/`undo` are headless-safe (all cross-store access in try/catch).
- **#118/#119 code map (`useSubtitleStore.js`):** `updateSegmentTimes` ~527 (durChanged pin at end of the if/else); `setWordBoundary` ~591 (right after `updateSegmentTimes`); `_mapSegmentsToTimeline` ~49 (overwrites word start/end with timeline values, lines 64-68); `getTimelineMappedSegments` ~311.
- **#119 UI code map:** `SegmentBlock.js` — `onToothDown` (t0 = `words[i+1].start`), `showTeeth`/`teethWords` (after `showHandles`), per-word placement + teeth render in the return, `React.memo` comparator at file bottom. `TimelinePanelNew.js` — `sourceWordCounts` memo (~107), `handleWordBoundaryDrag`/`End` (~523), props on the subtitle `SegmentBlock` (~985). Constant `WORD_TOOTH_HIT_W` in `timeline/timelineConstants.js`.
- **#120 code map:** `PreviewOverlays.js` word map ~212 (React.Fragment, `{suffix}` sibling); `public/subtitle-overlay/overlay-renderer.js` progressive ~225/236 + instant ~264 (`createTextNode(suffix)`). Char-chunking `CHAR_LIMIT = 16` at `PreviewOverlays.js:26` + `overlay-renderer.js:50` — LEFT AS-IS.
- **Clip 17 on-disk subtitle data:** `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\proj_1780522166723_dichz1\project.json` → `clips[].subtitles.sub1.segments[]`; seg id 199 ("and reconnecting man") = 3 clean words, edges pinned (#118 visible in saved data).
