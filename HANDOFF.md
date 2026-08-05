# ClipFlow — Session Handoff

_Last updated: 2026-08-05 — Session 153 (#240 queue imports BUILT; alpha.39 installer cut AND installed on the daily driver; Fega's 6-step verification deferred to next session)._

---

## One-line TL;DR

The Queue tab can now import finished pre-ClipFlow clips: drag-and-drop or an Import button → review grid (AI title anchored on the old filename + game guess via one Gemini video call per clip) → copy-and-keep into `ClipFlow Imports\<Game>\` → normal scheduling/publish/tracker. Imports are hard-fenced out of every learning surface. Code complete and machine-verified headlessly; Fega's 6-step script in the spec is the remaining gate before closing #240.

## Current State

Master pushed. Daily driver = **0.3.0-alpha.39, installed and confirmed by Fega this session** — it carries the 4-change batch: #239 (feedback choke point), #238 (pick-budget scaling), #183 (title formula rebuild), #240 (queue imports). The batch counter is reset; nothing is riding toward a next installer yet. Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open; [#234](https://github.com/Oghenefega/ClipFlow/issues/234) still data-blocked (0/50 v3 chips at session-152 check; moves at the pace of Fega's post-install rejection tagging). [#183](https://github.com/Oghenefega/ClipFlow/issues/183) open, longitudinal. [#240](https://github.com/Oghenefega/ClipFlow/issues/240) open until Fega's verification passes.

## What Was Just Built (session 153) — #240 queue imports

Spec `tasks/specs/queue-imports.md` implemented in full; working plan + verification detail in `tasks/todo.md`.

- **Main process, new `src/main/queue-imports.js`:** `inspect` (extension gate, content fingerprint = sha1 of size+head+tail 256KB, import-memory check, ffprobe dims/duration, vertical-only gate, fingerprint-cached thumbnails), `generate` (one Gemini video call per clip, concurrency 2, cancellable, cost-logged, per-row progress events), `confirm` (stream-copy with progress into `ClipFlow Imports\<Game>\` — sibling of the renders root, originals never touched — then a fully-formed clip into a per-game synthetic project `kind:"import"`, found-or-created, saved once per game per wave), memory writes for imported AND skipped fingerprints. IPC: 4 thin handlers in main.js (`queueImports:*`), bridge methods in preload.js, `importMemory: {}` in STORE_DEFAULTS (main-owned key — deliberately NOT in the App.js persist loop).
- **Prompt layer (`title-caption-prompt.js`):** `buildImportSystemPrompt` (CLIP_TRUTH + voice examples + title-only rules + games-candidates list with hashtags + JSON schema `{title, game, confidence}`) and `buildImportUserContent`; the intent-anchor wording is now a shared `titleAnchorSection()` used by both the batch path and imports so it can't drift. No caption generated — social captions ride the per-platform templates once a game is assigned (#223 path).
- **Renderer:** new `src/renderer/components/ImportReviewModal.js` (T-theme review grid: rows appear instantly with stripped filenames, AI results stream in, bulk game assign, inline new-game creation with derived tag/hashtag/color + collision handling, per-row platform toggles, skip, unassigned rows held back and re-offered later); QueueView gains the Import button (Unscheduled header), drop-anywhere overlay (depth-counted dragenter/leave), the modal mount, and a projects re-read after confirm. New games route through App's `handleNewGame` (so YouTube description templates are seeded exactly like manual adds).
- **Clip identity:** `clip_import_<ts>_<rand>` id, `source:"import"`, born `status:"approved"` + `renderStatus:"rendered"`, `renderPath` = the imported copy, real `duration`/`endTime`, lowercased `gameTag`, `<clipId>_renderthumb.jpg` thumbnail — every `_projectId`-coupled downstream path (queue list, auto-fire scheduler, claim, publish, tracker, Tracker-calendar preview) works unchanged.
- **Fences (imports NEVER teach):** feedback.js choke point was already live (#239); added — logPost skips `titleCaptionRecordPublish` and stamps tracker rows `source:"import"`; title-caption-log `backfill` skips `clip_import_` ids and import tracker rows (both merge inputs); queue + sidebar-badge title-knockout is id-only for imports (OpusClip titles repeat — title matching would eat siblings); RowActions hides the editor button; delete-popover copy rewritten for imports; import projects hidden from the Projects tab by prop filter.
- `projects.js` passes `kind` through create/list (one line each).

## Verification status

- **Machine-verified:** renderer build green; dev-profile boot clean (schema v8, backfill 0-inserted, renderer alive); headless electron harness (scratchpad, stub store, fixture videos) ALL-PASS across inspect verdicts, confirm side-effects, fence fields, memory, wave-2 project reuse, and list passthrough.
- **NOT yet verified:** the grid UI end-to-end in the running app; a LIVE Gemini call on the import path (zero API spend this session — the call body mirrors the proven #193 path but has never executed); Fega's 6-step script (spec bottom) on the real OpusClip folder. That script is the close gate for #240.

## Key Decisions

- **Synthetic per-game import projects** (`kind:"import"`) over a parallel store — everything downstream stays untouched; the Projects tab just filters them out.
- **Fingerprint memory over path memory** — skip/imported survives the original being renamed or moved; stored main-side only.
- **Game guesses only auto-fill at high confidence**; low confidence lands unassigned with a one-click hint chip (spec: "never silently wrong"). Unassigned rows are never imported and never remembered.
- **No caption from the import AI pass** — clip.caption stays empty; platform captions come from templates + game assignment. One less surface to review in a 50-row grid.
- **Title knockout exemption** (id-only dedup for imports) — a deliberate behavior fork from legacy clips, mirrored in QueueView and the App.js badge count.

## Next Steps (priority order)

1. **Fega runs the 6-step script on alpha.39** (installed; he deferred it to next session): drag 5 mixed OpusClip files → grid; bulk-fix a game + add Baby Steps inline; skip 1, confirm 4 → files in `ClipFlow Imports\<Game>\` + 4 queue entries; re-select the same 5 → nothing offered; schedule 1 → publishes + tracker +1; horizontal file → flagged with the Auto-Reframe message. Close #240 only on his pass. Also expect his read on AI title/game-guess quality and per-clip Gemini pass time.
2. **First real wave watch-fors:** Gemini JSON schema in the wild (title/game/confidence), upload times on his connection (50MB-class files via Files API), and whether high-confidence game guesses are trustworthy on OpusClip-era footage.
3. **#234 v3 re-test trigger check at session start** (standing): count v3 chips in RL's 50-row rejected window; fire at ≥15.
4. **#183 measurement continues:** `SELECT title_source, COUNT(*) FROM title_caption_rounds GROUP BY title_source` after a batch of posts on the new build.

## Watch Out For

- **`ClipFlow Imports` lands next to the renders root** (`path.dirname(outputFolder)`) — if Fega ever moves his Output Folder, new imports follow it; old copies stay put (paths on clips remain valid).
- **Retitling an imported clip in the queue renames the MP4** inside `ClipFlow Imports\<Game>\` (existing #188 behavior inherited on purpose).
- **Removing an import from the queue is permanent-ish:** status→dequeued with no editor to re-approve from, and its fingerprint stays remembered, so it can't be re-imported either. The grid's Skip (before confirm) is the intended cull point. If Fega wants an "un-remember" tool later, it's a small Settings action on `importMemory`.
- **`importMemory` is main-owned** — never load it into App.js state or add it to the persist loop (two-writers clobber, session-113 lesson).
- **Import projects are invisible in the Projects tab by design** — if Fega asks "where did my imports go", the answer is the Queue (and `ClipFlow Imports\` on disk).
- The title prompt layer still has no unit tests; the import builders were only exercised via require + harness, not against live Gemini.
- `Desktop\ClipFlow Eyeball 238-A\` and `241-clipStd\` are verdicted/disposable; `_tmp/proxy/*.proxy.mp4` (~640MB) stays while the #231 program is active; pre-#239 DB backup `clipflow.db.bak-20260805-pre239` still exists.

## Logs / Debugging

- Headless harness: `scratchpad/qi-harness/harness.js` (run `npx electron <path>`) — stub store + fixture videos; prints INSPECT/CONFIRM/CLIP JSON and `HARNESS-ALL-PASS`. Pattern: queue-imports.js takes `store` as an argument precisely so this works.
- Boot-verify: `CLIPFLOW_PROFILE=dev npm start` — clean, schema v8, `Backfill complete: 0 inserted`; killed via `taskkill //F //IM electron.exe`.
- Import progress events ride one channel (`queueImports:progress`, `type: "ai" | "copy" | "imported" | "failed"`); copy events throttled to ~4/s per file.
- Gemini import calls: maxTokens 4000 (thinking spends output budget), timeout 300s, one 503/429 retry inside the provider; cost rides PipelineLogger like #193.
- gh CLI: comment bodies with backticks/parens go through `--body-file` from the scratchpad, not inline `--body`.
