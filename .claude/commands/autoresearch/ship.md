---
name: autoresearch:ship
description: Universal shipping workflow — ship code, content, marketing, sales, research, or anything through structured 8-phase workflow
argument-hint: "[--dry-run] [--auto] [--force] [--rollback] [--monitor N] [--type <type>] [--checklist-only]"
---

Load and follow the autoresearch ship workflow protocol.

1. Read the skill file: `.claude/skills/autoresearch/SKILL.md` — understand the overall autoresearch framework
2. Read the ship workflow reference: `.claude/skills/autoresearch/references/ship-workflow.md` — this is the FULL protocol to follow
3. Parse any flags from the user's arguments: $ARGUMENTS
4. Execute the 8-phase ship workflow as defined in `ship-workflow.md`

Follow the ship workflow protocol exactly. All phases, checklists, and verification steps must be executed as documented.
