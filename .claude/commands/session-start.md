---
description: Start a new session — read handoff, check context, ask focus
---

## 0. Heal the previous session's title (silent, no user involvement)

If HANDOFF.md contains a `> Pending session title` line: the previous wrap couldn't set its own title (the app's session registry lags behind a live session — s193). Fix it now, when the session is flushed and addressable: `list_sessions`, find the most recent entry with this repo's cwd, `set_session_title` with the pending title, then delete the pending line from HANDOFF.md (ride the change into this session's next commit). One sentence of report, then move on. If the pending line is absent but the newest ClipFlow session's title doesn't start with `S<number> ·`, same repair using HANDOFF's `# HANDOFF — Session N` anchor.

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
