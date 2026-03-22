---
description: Quick project status — git state, todo progress, recent changes
---

## Git Status

! git status -s

## Recent Commits

! git log --oneline -8

## Task Progress

! cat tasks/todo.md 2>/dev/null | head -30 || echo "No todo.md"

## Lessons (recent)

! tail -20 tasks/lessons.md 2>/dev/null || echo "No lessons.md"

Summarize: what's the current state of the project, what's in progress, and what's next.
