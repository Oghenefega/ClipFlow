# /autoresearch

Launch an autonomous improvement loop on a target file or skill.

## Usage

```
/autoresearch
```

The agent will ask you:
1. What to improve (skill name, file path, or metric)
2. How to measure improvement (verify command)
3. What "good" looks like (checklist questions for skills)

Then it creates a branch, establishes a baseline, and enters the loop.

## Quick Start Examples

**Improve a skill:**
```
/autoresearch
Target: clipflow-ui-debug skill
Checklist:
- Does the response analyze the screenshot before proposing a fix?
- Does it check flex/layout properties before padding?
- Does it mention dark theme portal rules when relevant?
```

**Reduce bundle size:**
```
/autoresearch
Target: build output size
Scope: src/**/*.js
Metric: bundle size KB (lower is better)
Verify: npx react-scripts build 2>&1 | grep "main.*js" | awk '{print $1}'
```

**Fix all build warnings:**
```
/autoresearch
Target: zero build warnings
Scope: src/**/*.js, src/**/*.tsx
Metric: warning count (lower is better)
Verify: npx react-scripts build 2>&1 | grep -c "WARNING" || echo 0
```

## How It Works

Based on [Karpathy's autoresearch](https://github.com/karpathy/autoresearch):

1. Makes ONE small change
2. Measures the result
3. Keeps if better, reverts if worse
4. Repeats forever until you interrupt

The agent runs autonomously — you can walk away. Every experiment is git-committed so nothing is lost. Results are logged to `results.tsv`.

## Stop It

Just interrupt the agent. Your original code is safe — the loop runs on a dedicated `autoresearch/<tag>` branch, and every failed experiment is reverted.
