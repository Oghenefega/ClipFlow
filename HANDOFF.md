# ClipFlow — Session Handoff

_Last updated: 2026-08-05 — Session 150 (#239 feedback leak fixed at the source + 34 published clips backfilled; #234 status-checked: final cell data-blocked; #238 is next with a mandatory fresh baseline)._

---

## One-line TL;DR

More than half of Fega's published catalog (34 of 62 approved clips) had never entered the feedback DB because only the Pending tab's buttons wrote training rows — the editor's Queue button (his main daily flow) approved clips silently. Fixed at a single main-process choke point (`project:updateClip` → `feedback.handleStatusTransition`): every approve/reject teaches once, un-approve/un-reject DELETES the row, approve↔reject swaps, exact-window dedupe stops duplicates, and #240's imported clips are fenced out (`clip.source === "import"` never teaches — Fega: imports are post-only). All 34 missing rows backfilled with createdAt timestamps. Commit `55841bb`, [#239](https://github.com/Oghenefega/ClipFlow/issues/239) closed `status: untested`.

## Current State

Master pushed (`55841bb`). Daily driver = **0.3.0-alpha.38** — does NOT contain the #239 fix (source-only until the next batched installer); on the installed build, Pending-tab approvals still log via the old renderer path, editor-Queue approvals still leak, un-approve doesn't delete. Feedback DB: backfilled + verified (audit: 0 missing), backup at `%APPDATA%\clipflow\data\clipflow.db.bak-20260805-pre239`. Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open; [#234](https://github.com/Oghenefega/ClipFlow/issues/234) open but data-blocked (0 v3-tagged rejections yet — re-arm trigger ≥15 v3 rows in RL's 50-row window, posted on the issue); [#238](https://github.com/Oghenefega/ClipFlow/issues/238) is the next runnable cell.

## What Was Just Built (session 150)

- **#239 root cause + audit:** only feedback writer was ProjectsView's approve/reject buttons; `EditorLayout.doRender(addToQueue)` set `status: "approved"` via `project:updateClip` without teaching. Read-only audit of live data: 34 of 62 approved/published clips missing rows (every one published to 3-4 platforms).
- **Choke-point fix:** `feedback.handleStatusTransition` (feedback.js) called from the `project:updateClip` handler (main.js). Rules: gain approved/rejected → insert once (exact `HH:MM:SS`-window dedupe); clear to none/null → delete latest matching row; approve↔reject → swap; `"dequeued"` = scheduling, no action; `clip.source === "import"` → never teaches (#240 spec "Fences"). Renderer `feedbackLog` call, `feedback:log` IPC, and preload bridge removed.
- **Backfill:** 34 rows inserted, timestamped by clip `createdAt` so history interleaves correctly in the DESC-ordered few-shot windows. Post-backfill audit: 0 missing.
- **#234 status check:** v3 chips confirmed inside installed alpha.38 (commit ancestry + asar grep), but 0 rejections carry them — final cell (`--no-rejected` re-test) stays queued on data.
- Session start also verified all detection-science ship claims live in code AND in the installed asar (frames=10 at ai-pipeline.js:721, gemini gate :499, grouped rejected section, #237 caps; 60 unit tests green).

## Key Decisions

- **Feedback writes live in the MAIN process at the status-transition choke point** — no per-surface renderer writes, so no current or future surface can approve without teaching.
- **Un-approve/un-reject deletes the row** (Fega's explicit call) — the engine forgets retracted decisions. Dequeue is NOT a retraction.
- **#240 imports never teach** (Fega + spec fence): they're OpusClip-era, post-only. Enforced in code now, before the feature exists.
- **#239 sequenced before #238** because the backfill changes the harness answer key — old cell numbers are not comparable post-backfill.

## Next Steps (priority order)

1. **Run the fresh f10-mix baseline** on the six standard recordings (~$0.60, `tasks/spikes/replay-score/harness.js`). Truth grew 26 → ~29 pooled: RL Day8 Pt8 +2 (ANKLES BROKEN backfill @00:00:19 + organic "Clip 17" @00:11:45 approved 2026-08-05 ~2:24 AM EST), EO Day4 Pt1 +1 ("I was ONE jump away" @00:09:24). Harness copies the DB fresh per run — no manual truth step.
2. **Design #238 cells against the new baseline** (pick-budget scaling + cause/payoff cut-boundary extension), get Fega's approval, run.
3. **At session start, check the #234 trigger:** count v3-tagged rows (`setup-talk`/`chat-banter`/`flat-delivery`) in RL's 50-row rejected window; fire the re-test at ≥15 (~$0.26).
4. **Next installer** (whenever the batch justifies it) carries the #239 fix to the daily driver. Fega's in-app check is on the issue: approve via editor Queue button → approval stats count it; un-approve → count drops.
5. **#240 queue imports build** — spec locked (`tasks/specs/queue-imports.md`), greenlit, its own session.

## Watch Out For

- **Pre-backfill harness numbers (24/26, 25/26…) are NOT comparable to any post-backfill run.** Re-baseline first — this is why step 1 exists.
- `fmtHMS` now exists in BOTH ProjectsView.js and feedback.js and must stay byte-identical — reject-reason chips (`updateReasons`) and dedupe/delete all match rows by the exact `HH:MM:SS` strings.
- Until the next installer, the installed app still runs the OLD feedback path (Pending-tab-only inserts, no deletes, possible re-approve dupes). Don't diagnose "the fix doesn't work" from the daily driver.
- The audit counted 61 overlapping same-decision row pairs — an UPPER bound on legacy duplicates, not a clean count: adjacent published clips legitimately overlap (e.g. RL Day8 Pt3 1740-1774s vs 1761-1774s). Don't run a naive dedup sweep on midpoint overlap.
- `listProjects` only scans `proj_*`-prefixed folders (projects.js:166) — a hand-written fixture folder with another name loads by id but never appears in lists.
- Clip status `"ready"` has zero writers (legacy read-side only); clip creation paths (`addClip`/`duplicateClip`) hard-force `status: "none"`, which is what makes the choke point complete.

## Logs / Debugging

- **Verification this session:** 14-case standalone transition test (electron stubbed via the harness's `Module._load` trick, scratch DB) — all pass; end-to-end CDP test on the dev profile (real `projectUpdateClip` IPC → row appears in `%APPDATA%\clipflow-dev\data\clipflow.db` with correct window → un-approve → row gone). Dev profile shares the REAL projects tree (`projectsRoot` = W:\ path) — test used a throwaway fixture project, deleted after.
- **Scripts** (session scratchpad, not persisted): audit (34-missing finder), backfill, transition test, CDP driver. The audit/backfill logic is documented in [#239's comments](https://github.com/Oghenefega/ClipFlow/issues/239) if ever needed again.
- Feedback transition failures log to main-process console as `[feedback] status transition failed:` — non-critical by design (never blocks the clip update).
- DB backup from before the backfill: `%APPDATA%\clipflow\data\clipflow.db.bak-20260805-pre239` (delete whenever Fega's comfortable).
