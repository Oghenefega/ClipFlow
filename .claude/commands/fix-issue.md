---
description: Investigate and fix a bug from a description or screenshot
argument-hint: [describe the bug or paste screenshot context]
---

The user reported a bug: $ARGUMENTS

## Step 1: Investigate

Analyze the bug report. Search the codebase for relevant files:

! git log --oneline -5

Identify:
1. **Root cause** — what is actually wrong and why
2. **Affected files** — every file that needs to change
3. **Fix approach** — how to fix it with minimal impact

## Step 2: Present plan

Present the plan clearly and **STOP**. Wait for user approval before writing any code.

Format:
```
Root cause: [one sentence]
Files to change:
  - path/to/file.js — [what changes]
Fix approach: [brief description]
Risk: [what could break]
```

Do NOT write code until the user approves.
