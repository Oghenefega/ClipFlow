# ClipFlow — Session Handoff
_Last updated: 2026-06-02 — Session 49 — Anti-hallucination tooling: skills as enforcement, lessons.md distilled_

---

## One-line TL;DR

**No app code changed — this was a tooling/process session.** Root problem fixed: `tasks/lessons.md` was a write-only dumping ground (logged but never read mid-work, so it never changed behavior). Built a system where **skills are the enforcement layer** (they auto-load at the moment of work) and lessons.md is just the raw capture log, with a `session-end` step that distills new lessons into skills. Also created a new `clipflow-trace-verify` skill that fires *before* I explain/trace code — born from the previous session's failure where I confidently planned a fix for **dead code** (`commitAudioResize`, zero callers) and only the user's domain knowledge caught it.

---

## Current State

App builds clean and boots clean (v0.1.5-alpha, Electron 40.9.1, prod profile) — unchanged this session. **No source code was touched.** All work was in `.claude/` (skills + commands), `tasks/lessons.md`, `CHANGELOG.md`. Working tree is clean; everything pushed to master (`b1603e2` and the HANDOFF commit on top).

## What Was Just Built (tooling/process, no app code)

- **New skill `clipflow-trace-verify`** — triggers BEFORE describing/tracing/diagnosing existing code. Enforces: grep callers first (zero callers = dead = stop), trace top-down from the mount point, attach a liveness proof to every claim, tag verified-vs-assumed. Closes the exact gap that produced the dead-`commitAudioResize` plan.
- **Distillation pipe in `session-end`** — new step 2 scans lessons added since the `DISTILLED-THROUGH` marker and promotes each into its enforcement home (domain skill / code-review / trace-verify / rarely CLAUDE.md), then reports what moved.
- **Backstop in `clipflow-code-review`** — new check #7 "am I editing code that actually RUNS?" (grep callers, confirm mounted component). Also fixed the stale `Co-Authored-By: Opus 4.6` → `4.8` in its commit template.
- **Drained the lessons.md backlog into skills (first full pass)** — skills were already ~40% populated; added only the gaps, terse + deduplicated, across all six skills (segmentation guards, audio-track model, karaoke, whisperx/CUDA, EBUSY/preload, stopPropagation, done-means-audited, root-cause-first, etc.). `lessons.md` reframed as the raw log with a "new lessons below this line" divider; marker advanced.
- **Memory:** added `feedback_no_code_narration` (always-loaded seatbelt) + linked it to the trace-verify skill.

## Key Decisions

| Decision | Why |
|---|---|
| Skills (not CLAUDE.md) are the enforcement layer | Skills load only when relevant → zero bloat when irrelevant + room for detailed checklists. CLAUDE.md can't hold 114 lessons without becoming the bloat the user refuses. |
| lessons.md stays the raw capture log | It's fine as a dumping ground IF there's an outflow pipe. The bug was no pipe, not the file. |
| "Read first" upgraded to "prove it's LIVE" | Last session I *did* read — but read dead code. A `file:line` citation proves existence, not execution. The real teeth are grep-callers + top-down + liveness proof. |
| Distillation runs at session-end, reports before commit | Keeps the user in the loop to veto routing. |

## Next Steps (prioritized)

1. **Prove the system works.** It's built but unproven — the skills only matter if they auto-fire on the next editor/media/IPC task and I follow them unprompted. **#104 (dead-code removal) is the ideal first test** of `clipflow-trace-verify` for real.
2. **USER DECISION — #105:** auto-remove on audio over-trim (recommended — matches subtitle/caption tracks + industry-standard NLE principle) vs keep the floor (then just unify the two `MIN_SEGMENT_DURATION` constants).
3. **USER DECISION — #104 vs #40:** dead-code removal as its own pass or folded into #40. Run a final caller check before deleting (incl. dynamic `getState()` access + `preload.js` exports).
4. **Session-46 audit leftovers still open:** #99, #92, #93, #87–#90, #95, #98, #101.

## Watch Out For

- **`commitAudioResize` and friends are DEAD but look live.** Zero callers: `commitAudioResize` (`useEditorStore.js:488`), `commitLeftExtend` (`:628`), `_recutAfterDelete` (`:881`), `revertClipBoundaries` (`:1103`), `deleteAudioSegment` (`:367`), `clip:recut` IPC (`main.js:1298`). Do NOT reason about audio-trim from these. **The LIVE path:** `TimelinePanelNew.js:1026` → per-segment `WaveformTrack` → `trimNleSegmentLeft/Right` (`segmentOps.js:86,104`). Keep `_concatRecutAfterDelete` + `_trimToAudioBounds` (still live via `LeftPanelNew.js:939`).
- **Two `MIN_SEGMENT_DURATION` constants disagree:** `segmentOps.js:14`=0.05 vs `timelineConstants.js:66`=0.1 (and `WaveformTrack.js` hardcodes 0.1). Unify in #105.
- **The whole point of this session is unproven until exercised.** If on the next editor task the relevant skill does NOT auto-load, the fix is to sharpen that skill's `description` trigger — not to abandon the approach.
- **Standing process rule:** a `file:line` citation proves a function EXISTS, not that it RUNS. Grep callers before building any claim on it. User's trigger phrase: **"did you grep the callers?"**

## Logs / Debugging

- **No app build run this session** — only `.md` (skill/command/doc) edits, nothing the renderer or main process executes. No verification build needed.
- **Commits this session:** `18b528d` (distillation system + trace-verify skill), `ae6cc7f` (4.6→4.8 attribution fix), `b1603e2` (backlog distillation), + this HANDOFF commit.
- **New skill is live** — `clipflow-trace-verify` appears in the skill registry. First real trigger test pending (next trace/explain request).
- **Issue tracker unchanged this session** — no issues filed/closed. Open work tracked under #104, #105, and the session-46 leftovers.
