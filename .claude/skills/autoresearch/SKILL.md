---
name: autoresearch
description: Autonomous self-improvement loop for any ClipFlow skill or code. Based on Karpathy's autoresearch method. Use when asked to "autoresearch", "auto-improve", "optimize a skill", or "run the loop" on any skill or measurable metric.
---

# Autoresearch — Autonomous Improvement Loop

Adapted from [Karpathy's autoresearch](https://github.com/karpathy/autoresearch).

The core idea: instead of you manually improving something, the agent does it in a loop. It tries a small change, checks if the result got better, keeps it if it did, throws it out if it didn't. Then repeats. Forever, until interrupted.

## Setup

To set up a new autoresearch run, work with the user to:

1. **Agree on a run tag**: propose a tag based on today's date (e.g. `mar18`). The branch `autoresearch/<tag>` must not already exist — this is a fresh run.
2. **Create the branch**: `git checkout -b autoresearch/<tag>` from current master.
3. **Identify the target**: What are we improving? A skill SKILL.md file, a component, a pipeline, a prompt.
4. **Define the metric**: What number tells us if it got better? Must be mechanical — no subjective "looks good."
5. **Define the verify command**: A bash command that outputs a single number. Lower or higher is better (specify which).
6. **Define the scope**: Which files can be modified. Everything else is read-only.
7. **Define the checklist** (for skill improvement): 3-6 yes/no questions that define "good output." Each question checks one specific thing.
8. **Initialize results.tsv**: Create `results.tsv` with just the header row. Baseline recorded after first run.
9. **Confirm and go**: Show setup summary, get confirmation, then begin.

## The Experiment Loop

LOOP FOREVER:

1. **Review** current state: read the target file, check git log, read results.tsv for what's been tried
2. **Pick** next change: based on what worked, what failed, what's untried. ONE focused change only.
3. **Modify** the target file with the experimental change
4. **Git commit** the change (before verification)
5. **Run the verify command**: capture output, extract the metric
6. **Evaluate**:
   - If metric improved → **KEEP** the commit, advance the branch
   - If metric is equal or worse → **DISCARD** via `git reset --hard HEAD~1`
   - If it crashed → attempt fix (max 3 tries), then skip and revert
7. **Log** the result to results.tsv (tab-separated, 5 columns)
8. **REPEAT** — go to step 1

## Results Format (TSV)

```
commit	metric	delta	status	description
a1b2c3d	56.0	0.0	keep	baseline
b2c3d4e	62.0	+6.0	keep	added specific rule for headline format
c3d4e5f	58.0	-4.0	discard	removed example section (made output vague)
d4e5f6g	0.0	0.0	crash	syntax error in skill file
```

## Critical Rules

1. **NEVER STOP**: Once the loop begins, do NOT pause to ask the human. They may be away. Run indefinitely until manually interrupted. If out of ideas, think harder — re-read the target, try combining near-misses, try radical changes.

2. **One change per iteration**: Atomic changes only. If it breaks, you know exactly why.

3. **Mechanical verification only**: No subjective judgment. The verify command is the ground truth.

4. **Automatic rollback**: Failed changes revert instantly via git reset. No accumulation of bad changes.

5. **Simplicity wins**: Equal results + less code = KEEP. A tiny improvement that adds ugly complexity? Not worth it. Removing something and getting equal or better results? Definitely keep.

6. **Git is memory**: Every experiment is committed. `git log` shows the full history. The agent reads it before each iteration to avoid repeating failed ideas.

7. **Never modify the verify command**: The measurement is sacred. Only the target changes.

8. **results.tsv stays untracked**: Do not commit it to git. It's the experiment log, not part of the codebase.

## Skill Improvement Mode

When improving a ClipFlow skill (SKILL.md file):

### Verify Command Pattern
The agent generates test prompts, runs them with the skill loaded, scores output against the checklist, and reports pass rate as a percentage.

```bash
# Example verify for clipflow-ui-debug skill:
# 1. Generate 5 test scenarios (CSS bug screenshots described in text)
# 2. Run each through Claude with the skill loaded
# 3. Score each output against the checklist (yes/no per question)
# 4. Report: pass_rate = (passed_checks / total_checks) * 100
```

### What to Change in Skills
- Add/remove/refine specific rules
- Add/remove examples
- Change instruction wording for clarity
- Add banned patterns or required patterns
- Adjust trigger description precision
- Add edge case handling

### What NOT to Change
- Don't make skills longer than ~500 lines
- Don't add vague instructions ("be careful", "try your best")
- Don't duplicate rules already in CLAUDE.md
- Don't add knowledge Claude already has (general programming, language docs)

## Adapting to Non-Skill Targets

This loop works on anything with a measurable metric:

| Target | Metric | Verify Command |
|--------|--------|----------------|
| Skill SKILL.md | Checklist pass rate % | Custom eval script |
| React component | Build success + no warnings | `npx react-scripts build 2>&1 | grep -c "warning"` |
| FFmpeg pipeline | Processing time (seconds) | `time ffmpeg ... 2>&1 | grep real` |
| Test coverage | Coverage % | `npm test -- --coverage | grep "All files"` |
| Bundle size | KB after gzip | `npx react-scripts build 2>&1 | grep "main.*js"` |

## Crash Recovery

| Failure | Response |
|---------|----------|
| Syntax error in target | Fix immediately, don't count as iteration |
| Verify command fails | Check command itself, not the target |
| Metric unchanged 5+ times | Try more radical changes |
| All ideas exhausted | Re-read target from scratch, try combinations |
