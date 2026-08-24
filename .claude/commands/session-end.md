---
description: End session — distill lessons, write HANDOFF.md, commit, set the session name
---

## 1. What changed this session

! git log --oneline -15

! git diff --stat HEAD~5..HEAD 2>/dev/null || git diff --stat

Identify which commits belong to THIS session (usually everything since the previous "Session N wrap" commit).

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

Keep it lean — commits and CHANGELOG.md already record what was built; don't restate it. Sections:
- **Current State** — one or two sentences on the app's condition and where the work stands
- **Key Decisions** — only if any were made: one line each, with the why
- **Next Steps** — prioritized list for next session
- **Watch Out For** — gotchas, fragile areas, known issues
- **Logs/Debugging** — any relevant error patterns or debug findings

## 4. Commit and push

Stage HANDOFF.md, the distilled skill changes, and any uncommitted work, commit with a descriptive message, and push to master.

## 5. Set the session name (template-locked)

Set the title directly with the session-title tool — don't just suggest it. A title that does not START with `S<number> ·` is INVALID — check before setting (3 violations: s143, s145, s146). Template: `S<N> · alpha.<X> — <plain summary>` when an installer was cut this session; `S<N> · <plain summary>` when not. Copy the anchor from HANDOFF's header. State what you set; Fega can rename if he prefers a different headline.
