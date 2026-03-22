---
description: End session — write HANDOFF.md, commit, check cost
---

## 1. What changed this session

! git log --oneline $(git log --all --oneline | head -20 | tail -1 | cut -d' ' -f1)..HEAD

! git diff --stat HEAD~5..HEAD 2>/dev/null || git diff --stat

## 2. Write HANDOFF.md

Based on the session's work, write HANDOFF.md with these sections:
- **Current State** — one sentence on the app's condition
- **What Was Just Built** — bullet list of changes
- **Key Decisions** — architectural or design choices made and why
- **Next Steps** — prioritized list for next session
- **Watch Out For** — gotchas, fragile areas, known issues
- **Logs/Debugging** — any relevant error patterns or debug findings

## 3. Commit and push

Stage HANDOFF.md and any uncommitted work, commit with a descriptive message, and push to master.

## 4. Report cost

Run /cost to show session spend.
