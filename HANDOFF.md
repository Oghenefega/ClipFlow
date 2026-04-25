# ClipFlow — Session Handoff
_Last updated: 2026-04-25 — Session 25: Issue #71 Direction 1 shipped end-to-end. Pipeline no longer asks Claude to narrate; clips ship with "Clip N" placeholder titles + first-class `gameTag` field + game-tag badges + publish guardrail._

---

## One-line TL;DR

#71 closed. Real RL recording produced 18 clips titled `Clip 1`..`Clip 18`, each rendered with an `[RL]` `GamePill` badge, no hallucinated `highlightReason`/`peakQuote` blocks. Founder visually confirmed in the running app. Two more commercial-launch issues remain: **#72** (Lever 1 signal timeouts — next, big) and **#70** (rename watcher rigidity — orthogonal).

---

## What this session shipped

11 steps across 6 files, all committed in one logical change:

1. **Stage 6 prompt rewrite** ([src/main/ai-prompt.js](src/main/ai-prompt.js)) — minimal output schema, dropped `title`/`why`/`peak_quote` from both schema definition and few-shot rendering.
2. **`max_tokens` 4096 → 8192** at the Claude call ([src/main/ai-pipeline.js:351](src/main/ai-pipeline.js#L351)).
3. **`Clip N` default title** + first-class `clip.gameTag` field at the pipeline write ([src/main/ai-pipeline.js:617-643](src/main/ai-pipeline.js#L617)).
4. **`gameTag` plumbed through QueueView merge** with the lowercased-once-at-source pattern (Option B from planning).
5. **All `extractGameTag(clip.title)` callers** in QueueView switched to `clip.gameTag` with legacy fallback. Six call sites.
6. **`projectInfo` lookup consolidates `projectNames` + `projectTestMap`** (single memoized map, single inline reader updated).
7. **Hashtag gate relaxed** in QueueView's queue filter and EditorLayout's render gate. Without this, every default-titled clip would silently fail to reach the queue / render.
8. **`GamePill` badge added to ProjectsView clip card** AI metadata row. QueueView already had a chip — that chip just runs on `clip.gameTag` now.
9. **Removed `highlightReason` and `peakQuote` display blocks** from ProjectsView. Removed dead-field writes to feedback DB.
10. **Publish guardrail** in QueueView confirmation modal (banner) + `scheduleClipOnly` (`window.confirm`). Title-regex `/^Clip \d+$/` only — manual renames bypass silently.
11. Build clean, smoke test on real RL recording — passed.

---

## Plan vs issue body — two intentional divergences

Both captured in `tasks/todo.md` before any code shipped:

1. **Issue claimed `RightPanelNew.js:688/715` rendered `clip.why` blocks** — wrong. Those render `t.why`/`c.why` from the AI Titles & Captions feature output (different schema entirely, downstream feature). **Did NOT touch them.**
2. **Issue missed the real `clip.why` consumer** — `ProjectsView.js:625-643` rendered `clip.highlightReason` (mapped from `clip.why`) and `clip.peakQuote`. **Those were the real removal targets.**

Plus one bonus fix the issue didn't surface: hashtag gate in QueueView and EditorLayout would have silently emptied the queue + blocked render once titles became `Clip N`.

---

## Where to start next session

**Read [#72](https://github.com/Oghenefega/ClipFlow/issues/72) end-to-end.** Path A is locked, 4-phase plan with pioneer gates. Phase 1 is the long pole and ships UX + heartbeat infrastructure that Phases 2–4 use to validate themselves. Don't skip Phase 1.

**Reference recording** for both #72 acceptance and any signals work: `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\Test Footage\2026-10\RL 2026-10-15 Day9 Pt1.mp4`

**The same recording was used to validate #71 today.** It produced valid JSON every run — the Stage 6 crash is fixed. Lever 1 signals still time out (3 of 5) but the new Stage 6 schema means even partial-signal runs no longer trip the token ceiling. So the run completed cleanly today; the silent-degradation issue from session 23 is still there waiting for #72.

---

## Logs / debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log`
- **Pipeline logs:** `processing/logs/<videoName>.log`
- **Today's run log to read in next session if helpful:** the latest `processing/logs/RL_2026-10-15_Day9_Pt1_<timestamp>.log` should show: max_tokens 8192 took effect, Claude returned the new minimal schema, 18 clips written with `gameTag: "RL"`. Three Lever 1 signals still timed out — same as session 23 — that's #72's domain, not #71's.

---

## Watch out for

- **#72 Phase 1 is non-trivial.** Heartbeat protocol + IPC events + new UI + `runPythonSignal` rewrite + electron-store migration for `strictMode: true`. The migration is a HARD RULE per [.claude/rules/pipeline.md](.claude/rules/pipeline.md) — write it before any data-shape change.
- **`extractGameTag` helper is still exported** from `src/renderer/components/shared.js`. Used as a legacy fallback for pre-#71 clips. Don't delete until we're confident no in-the-wild projects rely on it.
- **`clip.gameTag` is lowercased everywhere it's compared** but the visual badge uppercases on render (`<GamePill tag={clipGameTag.toUpperCase()}>`). If you add new comparison sites, lowercase both sides; if you add display sites, uppercase or pass through as-is.
- **Pipeline soft-migration:** old projects keep their Claude-written titles, populated `highlightReason`, populated `peakQuote`. Display sites for those fields are gone. Old fields remain on disk — readable, just not surfaced. No migration scripts needed.
- **Caption template `{title}` substitution still uses `clip.title`.** That means the placeholder `Clip 3` would land in the post body if the user publishes past the guardrail. The guardrail warns; the substitution is unchanged.

---

## Open issues (commercial-launch blockers)

- **[#72](https://github.com/Oghenefega/ClipFlow/issues/72)** — Lever 1 signal timeouts. Next session. Big — Phase 1 alone is a full session.
- **[#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — Rename watcher rigidity. Orthogonal, smaller scope, can be slotted between #72 phases.
- **[#73](https://github.com/Oghenefega/ClipFlow/issues/73)** — Cold-start UX (3-5s blank screen). Two-phase: branded splash window, then bundle code-splitting. Ship-first because perceived-speed > real-speed for the splash.

---

## Session model + cost

- **Model used:** Opus 4.7 throughout. Founder asked for the plan and a clean execution; Opus did both.
- **Files touched (final list):** `src/main/ai-prompt.js`, `src/main/ai-pipeline.js`, `src/renderer/views/QueueView.js`, `src/renderer/views/ProjectsView.js`, `src/renderer/editor/components/EditorLayout.js`. Five files. (Modal at `src/renderer/components/modals.js` and helper at `src/renderer/components/shared.js` left untouched per plan.)
- **No source files were deleted, no electron-store schema changes, no IPC additions.** Surgical change as planned.
