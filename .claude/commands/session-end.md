---
description: End session — write HANDOFF.md, commit, check cost
---

## 1. What changed this session

! git log --oneline $(git log --all --oneline | head -20 | tail -1 | cut -d' ' -f1)..HEAD

! git diff --stat HEAD~5..HEAD 2>/dev/null || git diff --stat

## 2. Distill new lessons into enforcement homes (the outflow pipe)

`tasks/lessons.md` is a raw capture log — it never changes behavior on its own because it is not read mid-work. This step drains new lessons into places that actually fire.

1. Read `tasks/lessons.md`. Find every lesson added BELOW the `<!-- DISTILLED-THROUGH: ... -->` marker (i.e. since the last distillation).
2. For each new lesson, route it to the home where it will trigger at the right moment:
   - **Code-pattern lesson** (FFmpeg flag, whisper parsing, segment op, IPC unwrap, CSS rule) → append a concise checklist line to the matching domain skill: `clipflow-ffmpeg-media`, `clipflow-editor-patterns`, `clipflow-electron-ipc`, or `clipflow-ui-debug`.
   - **Process/behavior lesson about writing or finishing code** (verify before done, no fake fallbacks, rename safety) → add to the `clipflow-code-review` checklist.
   - **Process/behavior lesson about reading/explaining/tracing code** (hallucination, dead-code, liveness) → add to the `clipflow-trace-verify` skill.
   - **Universal non-negotiable** that must hold every session → propose a ONE-LINE addition to CLAUDE.md or a memory entry. Keep CLAUDE.md tiny; default to a skill, not CLAUDE.md.
   - **Too niche / one-off** → leave in lessons.md only, no promotion.
3. Keep additions terse — a checklist line, not a paragraph. The full story stays in lessons.md; the skill gets the actionable rule.
4. Update the `<!-- DISTILLED-THROUGH: -->` marker date in `tasks/lessons.md` to today.
5. Report what was promoted and where (one line each), so the user can veto any routing before commit.

## 3. Write HANDOFF.md

Based on the session's work, write HANDOFF.md with these sections:
- **Current State** — one sentence on the app's condition
- **What Was Just Built** — bullet list of changes
- **Key Decisions** — architectural or design choices made and why
- **Next Steps** — prioritized list for next session
- **Watch Out For** — gotchas, fragile areas, known issues
- **Logs/Debugging** — any relevant error patterns or debug findings

## 4. Commit and push

Stage HANDOFF.md, the distilled skill changes, and any uncommitted work, commit with a descriptive message, and push to master.

## 5. Report cost

Run /cost to show session spend.
