---
name: autoresearch:fix
description: Autonomous fix loop — iteratively repairs errors until zero remain. One fix per iteration, atomic, auto-reverted on failure.
argument-hint: "[--target <cmd>] [--guard <cmd>] [--scope <glob>] [--category <type>] [--from-debug]"
---

Load and follow the autoresearch fix workflow protocol.

1. Read the skill file: `.claude/skills/autoresearch/SKILL.md` — understand the overall autoresearch framework
2. Read the fix workflow reference: `.claude/skills/autoresearch/references/fix-workflow.md` — this is the FULL protocol to follow
3. Parse any flags from the user's arguments: $ARGUMENTS
4. Execute the 8-phase fix loop as defined in `fix-workflow.md`

Follow the fix workflow protocol exactly. ONE fix per iteration. Never suppress errors. Fix implementation, not tests. Auto-revert on regression.
