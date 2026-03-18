---
name: autoresearch:security
description: Autonomous security audit — STRIDE threat model + OWASP Top 10 + red-team with 4 adversarial personas
argument-hint: "[--diff] [--fix] [--fail-on <severity>]"
---

Load and follow the autoresearch security audit protocol.

1. Read the skill file: `.claude/skills/autoresearch/SKILL.md` — understand the overall autoresearch framework
2. Read the security workflow reference: `.claude/skills/autoresearch/references/security-workflow.md` — this is the FULL protocol to follow
3. Parse any flags from the user's arguments: $ARGUMENTS
4. Execute the 7-step security audit as defined in `security-workflow.md`

Follow the security workflow protocol exactly. Every finding requires code evidence (file:line + attack scenario). Track OWASP Top 10 + STRIDE coverage.
