---
name: autoresearch:debug
description: Autonomous bug-hunting loop — scientific method + autoresearch iteration. Finds ALL bugs, not just one.
argument-hint: "[--fix] [--scope <glob>] [--symptom <text>] [--severity <level>]"
---

Load and follow the autoresearch debug workflow protocol.

1. Read the skill file: `.claude/skills/autoresearch/SKILL.md` — understand the overall autoresearch framework
2. Read the debug workflow reference: `.claude/skills/autoresearch/references/debug-workflow.md` — this is the FULL protocol to follow
3. Parse any flags from the user's arguments: $ARGUMENTS
4. Execute the 7-phase debug loop as defined in `debug-workflow.md`

Follow the debug workflow protocol exactly. Every finding requires code evidence (file:line + reproduction steps). Every disproven hypothesis is logged — equally valuable.
