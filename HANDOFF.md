# ClipFlow — Session Handoff
_Last updated: 2026-06-06 — Session 61 — Shipped & Fega-verified #115 (editor-saved subs skip whisperx cleanup) and #116 (manual subtitles get a synthesized word-list). Closed #98 (untested). Filed #117 (resize eats a word — same words[]/text family, deferred). Distilled the words[]/text invariant into clipflow-editor-patterns._

---

## One-line TL;DR

Two editor-subtitle bugs shipped and confirmed hands-on: **#115** — the shared resolver was running whisperx-artifact cleanup on the user's own editor-saved subtitles and deleting hand-split short / blank ones; now gated to raw transcription only. **#116** — manually-created subtitles carried `text` but an empty `words[]`, so they had no karaoke highlight standalone and got dropped from the viewer/export when merged; now they get an even-split synthesized `words[]` at text-entry. Both root-caused, proven with synthetic harnesses, and Fega-verified. **#117** (the same `words[]`/`text` desync via edge-trim) is filed and deferred.

## Current State

Renderer builds clean (`npm run build:renderer`, ~9.5s, only the pre-existing #73 chunk-size warning). Two CODE commits this session: `e33dccf` (#115) and `1d4be2a` (#116), both pushed to master. **No installer built** — daily app still `0.1.6-alpha`. An `npm start` (prod profile, shell id `bvztvqmwe`) is **running** on the fresh build for Fega's testing. A wrap commit (HANDOFF + CHANGELOG + lessons + skill distillation) follows. Working tree otherwise only the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json` — NOT committed).

## What Was Just Built (session 61)

- **#115 — CLOSED, Fega-verified (`e33dccf`).** In `resolveSubtitles.js`, gated the three destructive segment-level cleanups on `hasEditorSavedSubs`: mega-segment filter (now `!hasEditorSavedSubs && unionRaw.length > 1`), segment dedup (skipped — `deduped = filteredSegments` when editor-saved), and the empty-segment drop (`hasEditorSavedSubs || ...`). Word repair (idempotent) still runs for all. Raw transcription (no `_format`) still gets full cleanup on first load. Proven: synthetic harness (esbuild-bundled the pure resolver) — "guy" survives, blank persists, fresh dedup still fires.
- **#116 — CLOSED, Fega-verified (`1d4be2a`).** Added `_wordsFromText(startSec, endSec, text)` helper (even-split words across the segment's range) in `useSubtitleStore.js`, wired into: `addSegmentAt` (was `words:[]`), `updateSegmentText` (synth only when `words` is empty — real segments untouched), and a defensive net `_w()` in `mergeSegment` (synth wordless-but-texted operands before concatenating). Fixes both the no-highlight (standalone) and the dropped-on-merge symptoms, in the editor viewer + Projects preview + burned-in export (all share `PreviewOverlays`/`overlay-renderer`). Proven: harness driving the REAL store actions (12/12).
- **#98 — CLOSED with `status: untested`.** The session-60 `_newSegId` collision fix is correct + synthetic-verified but impractical to hand-repro. Not the vanishing cause (#115/#116 were).
- **#117 — FILED, deferred.** Trimming a subtitle block's right edge deletes the outermost word: `updateSegmentTimes` (`useSubtitleStore.js:527`, durChanged branch) filters words outside the new bounds but leaves `text` → desync + irreversible. Same family as #116. Proposed direction on the issue.
- **Distillation:** added the `words[]`-must-cover-`text` invariant to `clipflow-editor-patterns` (Karaoke section); logged the family in `tasks/lessons.md` and advanced the DISTILLED-THROUGH marker to 2026-06-06.

## Key Decisions

- **Gate #115 strictly on `hasEditorSavedSubs`** — fresh/never-edited clips still NEED whisperx segment-dedup on first load; skipping it globally would regress raw transcription quality.
- **#116 fix at the source (text-entry), not just at merge.** Problem 1 (merge-drop) and Problem 2 (no standalone highlight) are the same root cause — a manual segment with empty `words[]`. Synthesizing words the moment text is entered fixes both, plus export + preview, at the data layer (one fix, all renderers correct). `mergeSegment` keeps a defensive synth for already-saved wordless segments.
- **Closed #98 rather than leaving it open** — a same-millisecond race is effectively unverifiable by hand; the fix is correct and synthetic-verified, so `status: untested` + closed beats open-forever.
- **#117 deferred by Fega's call.** Recommended fix = re-distribute a segment's words proportionally across the new range on resize (content-locked: trim → faster highlight, never delete a word, reversible, keeps `text`==`words`). Caveat to validate: speech-synced transcribed segments would drift off audio — may gate to manual segments / clamp instead of delete for transcribed.

## Next Steps (prioritized)

1. **#117 — implement the resize fix (NEXT).** Re-distribute words proportionally in `updateSegmentTimes` instead of filtering them out; never leave a `text`/`words` desync, never delete a word irreversibly. Decide transcribed-vs-manual handling. Verify with a resize harness (trim past last word → word retained & re-timed) + Fega hands-on (trim → highlight speeds up, all words stay; extend → restores).
2. Backlog (unchanged): #64 (waveform maxBuffer, root-caused), #112/#62 (child-process stdio/EPIPE), #107/#95/#87 (more subtitle split/segment edge cases — likely same desync family), #57 (lag), #108, #40.

## Watch Out For

- **The `words[]`/`text` invariant is now load-bearing.** Viewer + Projects preview + burned-in exporter all render word-by-word from `words[]`; `text` is only the fallback when `words` is empty. Any new op that sets text or changes a segment's time range MUST keep them in sync — a *partial* `words[]` silently drops words from the render while the panel/timeline still show them. (#116 fixed create/merge; #117 is the resize variant.)
- **Already-damaged data does NOT self-heal.** Clips edited before these fixes (Fega's "This guy" clip for #115; the clip-12 "wow let's go" merged segment for #117) already lost word data on disk — the fixes prevent recurrence, they can't resurrect dropped words. Test on FRESH subtitles; re-create damaged ones.
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** (runtime churn). Stage source explicitly.
- **Kill the `npm start` (bvztvqmwe) ClipFlow electron before `npm run build`** (full installer packaging locks the binary). `npm run build:renderer` is safe with it running (renderer-only, loaded into memory). Path-filtered kill only — don't kill unrelated electrons (VS Code, etc.). Use a `.ps1` for the CIM filter; passing PowerShell `$_` through the bash tool mangles it.

## Logs / Debugging

- **Build:** `npm run build:renderer` (~9.5s, renderer only); `npm run build` for the full installer. `npm start` runs prod profile from `build/`. App boot is clean: "App started … 0.1.6-alpha", "Database initialized … (schema v4)", then preview-frame generation for Recordings thumbnails.
- **Synthetic harness pattern (used for #115 and #116):** write a `tmp-test-*.mjs`, bundle with `node_modules/.bin/esbuild tmp.mjs --bundle --platform=node --format=cjs --outfile=tmp.cjs --log-level=warning`, run with `node tmp.cjs`, then delete both. `resolveSubtitles.js` + its two deps (`wordRepair`, `cleanWordTimestamps`) are pure and bundle cleanly. The **store** (`useSubtitleStore.js`, default export) also loads headless — its actions (`updateSegmentText`, `mergeSegment`, `addSegmentAt`, `_pushUndo`) touch no `window`/cross-store at call time; stub `globalThis.window = { clipflow: {} }` defensively. Drive via `store.setState({editSegments,...})` → `store.getState().action(...)` → assert `store.getState().editSegments`.
- **#115 code map (`resolveSubtitles.js`):** `hasEditorSavedSubs` line 72; gated cleanups — mega-filter ~190, segment dedup ~205-220 (the "guy" killer), empty-drop ~280; returns `isPreChunked = hasEditorSavedSubs`. Two callers: editor `initSegments` (`useSubtitleStore.js:322`) and preview `resolvePreviewSegments` (`buildPreviewSubtitles.js:90`).
- **#116 code map (`useSubtitleStore.js`):** `_wordsFromText` helper ~line 27 (after `_displayFmt`); call sites — `updateSegmentText` (~437), `addSegmentAt` (~573), `mergeSegment` (~660, the `_w()` net). Render branch that consumes `words[]`: `PreviewOverlays.js:150` (word branch) vs `:241` (text fallback); shared by `PreviewPanelNew.js:7`, `ProjectsView.js:8`, and `public/subtitle-overlay/overlay-renderer.js`.
- **#117 code map:** `updateSegmentTimes` (`useSubtitleStore.js:527`), durChanged/trim branch filters `w.end > startSec && w.start < endSec` and never updates `text`. Timeline resize callers: `TimelinePanelNew.js:396/415/499/508`.
- **Inspect on-disk clip data:** `W:\...\.clipflow\projects\<projectId>\project.json` → `clips[]`, each with `subtitles.sub1` (+ `_format:"source-absolute"` if editor-saved), `transcription`, `nleSegments`, `captionSegments`, styles. Editor-saved sub1 objects carry numeric `startSec`/`endSec` + display-string `start`/`end` + `words[]`.
