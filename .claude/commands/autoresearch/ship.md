---
name: autoresearch:ship
description: Universal shipping workflow — ship code, content, marketing, sales, research, or anything through structured 8-phase workflow
argument-hint: "[--dry-run] [--auto] [--force] [--rollback] [--monitor N] [--type <type>] [--checklist-only]"
---

Load and follow the autoresearch ship workflow protocol.

1. Read the skill file: `.claude/skills/autoresearch/SKILL.md` — understand the overall autoresearch framework
2. Read the ship workflow reference: `.claude/skills/autoresearch/references/ship-workflow.md`
3. Parse any flags from the user's arguments: $ARGUMENTS
4. Execute the 8-phase ship workflow as defined in `ship-workflow.md`

Keep the dry-run gate and the confirmation before the ship action exactly as documented; adapt the checklist to what is being shipped.
