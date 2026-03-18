---
name: autoresearch:plan
description: Interactive wizard to build Scope, Metric, Direction & Verify from a Goal
argument-hint: "[goal description]"
---

Load and follow the autoresearch plan workflow protocol.

1. Read the skill file: `.claude/skills/autoresearch/SKILL.md` — understand the overall autoresearch framework
2. Read the plan workflow reference: `.claude/skills/autoresearch/references/plan-workflow.md` — this is the FULL protocol to follow
3. Accept the user's goal from arguments: $ARGUMENTS
4. Execute the 7-step planning wizard as defined in `plan-workflow.md`

Follow the plan workflow protocol exactly. All gates (mechanical metric, dry-run, scope resolution) must pass before accepting.
