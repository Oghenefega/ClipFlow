# ClipFlow — Session Handoff
_Last updated: 2026-06-05 — Session 60 — Closed #110 (Fega-verified); shipped #98 ID-collision fix (aab69c4); hands-on testing exposed the REAL "subtitle vanishes" cause → diagnosed + filed as #115. Next session: implement #115._

---

## One-line TL;DR

The "split a subtitle and its second half vanishes on reopen" bug was **misattributed to #98** (segment-ID collisions). The ID fix shipped (`aab69c4`) and is correct, but it is NOT the cause. Re-diagnosed from scratch and **proved against on-disk data** the real cause: the subtitle resolver's whisperx-artifact **cleanup pipeline runs on the user's own editor-saved subtitles** and deletes legitimately hand-split short segments (and blank new ones). Filed as **#115** with full proof + a ready-to-implement fix. That's the next task.

## Current State

Renderer builds clean (`npm run build:renderer`, ~9s, only the pre-existing #73 chunk-size warning). **No installer built** — daily app still `0.1.6-alpha`. One CODE commit this session: `aab69c4` (the #98 ID fix). A wrap commit (HANDOFF + CHANGELOG + lessons) follows. Working tree otherwise only the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json` — NOT committed).

**An `npm start` (prod profile, shell id `bqb3wm3oa`) may still be running** from Fega's test — close the ClipFlow window (close = quit) before any `npm run build`. Path-filtered kill only; don't kill unrelated electrons.

## What Was Done (session 60)

- **#110 — CLOSED, Fega-verified.** The editor↔Projects-preview subtitle unification (shipped sessions 58-59) confirmed working hands-on. The one residual (line-break drift on never-edited long clips, self-heals on save) was split out to **#114** so closing #110 didn't orphan it.
- **#98 — ID-collision fix shipped (`aab69c4`), NOT hands-on confirmed, and NOT the reported symptom's cause.** Six sites minted segment IDs from bare `Date.now()` (ms resolution → duplicate IDs on same-ms operations). Routed all six (`splitSegment`, both `splitToWords` branches, `createSegmentAtTime`, `setSegmentMode`, `updateWordInSegment` 1-word split) + `addSegmentAt` through one helper `_newSegId()` = `"seg_" + Date.now() + "_" + (monotonic counter)`. IDs change number→string — verified safe (nothing in the tree does arithmetic on segment IDs; `addSegmentAt` already emitted strings). Proof: 100k rapid mints → 0 collisions; old scheme reproduces both collision classes; build clean. **This is a real but rare bug; it did NOT fix Fega's vanishing symptom.**
- **#115 — FILED with full diagnosis (the real bug).** See "Next Steps". This is where the session's investigation landed and the priority for next time.

## Key Decisions

- **Did NOT guess-patch when the #98 fix failed Fega's test.** Per discipline, re-diagnosed from scratch (read save path + reload/resolve path end-to-end, inspected the actual persisted `project.json`, replayed the dedup math on real numbers). Root cause proven, not theorized.
- **The vanishing is a cleanup-over-authoritative-edits bug, NOT ID collision.** `resolveClipSubtitles` applies whisperx-artifact cleanup to ALL sources including editor-saved (`hasEditorSavedSubs`). The segment dedup (start AND end within 0.3s) deletes the second half of a hand-split short phrase; the empty-drop deletes blank new segments. Editor-saved data is already curated and must skip that cleanup.
- **Kept the #98 ID fix** (it's correct and meets #98's acceptance) rather than reverting — it's orthogonal. #98 left OPEN; next session decides whether to close it independently (commented on the issue).

## Next Steps (prioritized)

1. **#115 — implement the fix (NEXT, the active reported bug).** Full root cause + proof + proposed fix are ON THE ISSUE. Plan: in `src/renderer/editor/utils/resolveSubtitles.js`, **skip the three destructive segment-level cleanup steps when `hasEditorSavedSubs`** — mega-segment filter (188-198), segment dedup (203-209), empty-segment drop (275). Keep word repair (idempotent). Gate is trivial (`hasEditorSavedSubs` computed line 72). No fresh-clip regression: raw transcription still gets cleaned on its FIRST load. **I stopped for approval before coding — confirm with Fega, then implement + verify.**
   - **Verify:** synthetic harness feeding editor-saved `sub1 = [{"This"},{"guy"}]` through `resolveClipSubtitles` (assert "guy" survives) + a fresh-clip regression check (whisperx dedup still fires) + Fega hands-on (split "This guy" → backout → reopen → both survive; create new subtitle → persists).
2. **#98 close-out decision** — ID fix done (`aab69c4`); rare to trigger by hand so effectively untested. Either close with `status: untested` or leave for a future race-y verification. NOT the vanishing cause.
3. **#114** — Step 3 line-break residual (low).
4. Backlog unchanged: #64 (waveform maxBuffer, root-caused), #112/#62 (child-process stdio), #57 (lag), #108, #40, #107, #95, #84.

## Watch Out For

- **#115 fix must gate strictly on `hasEditorSavedSubs`** — fresh/never-edited clips still NEED whisperx segment-dedup on first load. Skipping cleanup globally would regress raw transcription quality.
- **The vanishing becomes permanent via re-save** (split→save both → reopen drops "guy" from editSegments → next autosave persists without it). Verify the full split→backout→reopen cycle, not just in-memory state.
- **Don't re-attribute the vanishing to #98 / ID collision** — proven separate (#115). The disk showed "guy" gone with neighbors intact and a gap; IDs aren't even persisted (assigned `i+1` at load).
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** (runtime churn). Stage source explicitly.
- **Kill the `npm start` (bqb3wm3oa) ClipFlow electron before `npm run build`** (packaging locks the binary). Path-filtered only.

## Logs / Debugging

- **Build:** `npm run build:renderer` (~9s, renderer only); `npm run build` for the full installer. `npm start` runs prod profile from `build/`.
- **#115 repro data (the proof):** `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\proj_1780522166723_dichz1\project.json`, Clip 1 — `"This"` ends `602.1616210374377`, `"just"` starts `602.40`, **"guy" absent** (gap where it belongs). `nleSegments` = `[586.97, 599.12]`, `[601.53, 610]` → "guy" `[602.16, 602.40]` is inside a LIVE segment (rules out the #84 save filter). Dedup on real numbers: `Δstart=0.122, Δend=0.238` (both < 0.3) → "guy" dropped as a "duplicate of This".
- **#115 code map (`resolveSubtitles.js`):** `hasEditorSavedSubs` line 72; cleanup = mega-filter 188-198, **segment dedup 203-209 (the "guy" killer)**, consecutive-word dedup 216-234, **empty-segment drop 275 (the blank-subtitle killer)**; returns `isPreChunked` line 279. `initSegments` consumes it at `useSubtitleStore.js:308-366` (`editSegments = isPreChunked ? segs : []`).
- **Inspect on-disk clip data:** quick shape-agnostic node walker — recurse `project.json` for any object with `subtitles.sub1`, print each segment's `text`/`startSec`/`endSec`/`words.length` + `nleSegments`. (Used this session to prove the loss; rebuild it as a scratch when touching #115.)
- **Save path:** `useEditorStore.js:_doSilentSave` (665-744) — writes `subtitles:{sub1: persistedSubs, _format:"source-absolute"}`; the #84 range filter is lines 723-727 (overlap test against `nleSegments`). Autosave/flush on blur + unmount (793).
- **#98 ID fix:** helper `_newSegId` at `useSubtitleStore.js:18-20`; 7 call sites (463, 561, 635, 672, 696, 743, 914). Synthetic uniqueness check: replicate the helper, 100k tight-loop calls into a Set, assert no dupes.
- **Clip data on disk:** `W:\...\.clipflow\projects\<projectId>\project.json` → `clips[]`, each with `subtitles.sub1` (+ `_format:"source-absolute"` if editor-saved), `transcription`, `nleSegments`, `captionSegments`, styles.
