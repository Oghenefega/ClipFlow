---
description: Review all uncommitted changes before committing
---

## Changes to Review

! git diff --stat

## Detailed Diff

! git diff

## Unstaged Files

! git status -s

Review the above changes for:
1. Bugs or logic errors
2. Security issues (exposed keys, injection, XSS)
3. Regressions — does anything break existing behavior?
4. Code quality — unused variables, dead code, missing error handling
5. Consistency — does it match project conventions?

Give specific, actionable feedback per file. If everything looks good, say so and suggest a commit message.
