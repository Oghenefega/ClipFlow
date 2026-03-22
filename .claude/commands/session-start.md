---
description: Start a new session — read handoff, check context, ask focus
---

## 1. Read Handoff

! cat HANDOFF.md 2>/dev/null || echo "No HANDOFF.md found — fresh start."

## 2. Recent Activity

! git log --oneline -10

## 3. Check for in-progress tasks

! cat tasks/todo.md 2>/dev/null | head -40 || echo "No todo.md found."

Now:
- Summarize what was last worked on (from HANDOFF.md and git log)
- Ask the user:

> What's the focus today?
> (1) UI/Visual — editor, components, styling
> (2) Debugging — specific bug or regression
> (3) Feature dev — new functionality
> (4) Pipeline/backend — FFmpeg, Whisper, main process, IPC
> (5) Something else — tell me

Do NOT load any files until the user answers.
