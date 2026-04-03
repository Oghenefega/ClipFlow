# ClipFlow — Session Handoff
_Last updated: 2026-04-03 — "Skills Evaluation & Installation"_

## Current State
App is stable (no code changes this session). Three new ClipFlow-specific skills and one global skill were evaluated and installed.

## What Was Just Built
- **clipflow-optimize** — Profile-driven performance optimization skill adapted from `extreme-software-optimization`. Covers React re-renders, IPC round-trips, memory leaks, startup time, FFmpeg pipeline, Whisper transcription, file system ops. Methodology: measure first, score opportunities (>= 2.0), one lever per commit.
- **clipflow-mock-finder** — Stub/mock/placeholder detection skill adapted from `mock-code-finder`. Multi-method scan: keyword search, suspicious return values, short function detection, behavioral detection (fake delays, hardcoded scores), caller tracing. Produces prioritized findings table.
- **clipflow-ux-audit** — UX evaluation skill adapted from `ux-audit`. Nielsen's 10 heuristics mapped to ClipFlow views, Big 4 accessibility checks (keyboard, contrast, not-color-only, screen reader), user flow analysis with happy/error paths.
- **research-software** (global) — Software research skill installed as-is at `~/.claude/skills/research-software/`. Clone repos at stable tag, read source code over docs, mine PRs/issues, structured output.

## Key Decisions
- **Evaluated 5 skills, installed 4, rejected 1:** `readme-writing` was rejected — designed for open-source projects needing public READMEs, not relevant for ClipFlow's current private/pre-launch stage. Can revisit at launch.
- **3 skills trimmed for ClipFlow, 1 installed as-is:** Optimization, mock-finder, and UX audit were heavily adapted (cut 60-70% irrelevant content, added ClipFlow-specific patterns). Research-software was generic enough to use directly.
- **ClipFlow skills in project dir, global skills in user dir:** ClipFlow-specific skills at `.claude/skills/clipflow-*/`, research-software at `~/.claude/skills/research-software/`.

## Next Steps
1. Continue feature development (editor, queue, publishing pipeline)
2. Run `/clipflow-mock-finder` before next major milestone to audit stubs
3. Run `/clipflow-ux-audit` on each view before public release
4. Use `/clipflow-optimize` when specific performance complaints arise
5. Push unpushed commit from last session (1 commit ahead of origin)

## Watch Out For
- The 3 new skill directories are untracked — need to be committed
- `reference/TECHNICAL_SUMMARY.md` was deleted (shows in git status) — verify this was intentional
- `data/clipflow.db` has changes — don't commit database files
- 1 unpushed commit from previous session still needs `git push`

## Logs/Debugging
- No code changes this session, no errors to report
- Codebase scan during optimization skill creation found ClipFlow is already clean: proper Zustand selectors, no sequential async loops, no problematic array chains, 113 IPC handlers all cleanly bridged
