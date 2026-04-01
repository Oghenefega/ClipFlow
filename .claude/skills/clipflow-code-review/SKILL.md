---
name: clipflow-code-review
description: Use AUTOMATICALLY after writing any code change in ClipFlow. This skill runs a self-review checklist before declaring any task done. Triggers after every code modification, before build, and before commit.
---

# ClipFlow Code Review — Self-Check Before Done

Run this checklist EVERY TIME before saying a task is complete. No exceptions.

## Pre-Build Checklist

### 1. Screenshot Match (if user sent a screenshot)
- [ ] Did I actually LOOK at the screenshot and describe what's wrong?
- [ ] Does my fix address the SPECIFIC visual symptom shown?
- [ ] Did I mentally simulate: "will this CSS change cause the element to look like what the user expects?"

### 2. No Fake Fallbacks
- [ ] Does any code path produce placeholder/fake/degraded output?
- [ ] If real data isn't available, am I showing empty/loading state (NOT fake data)?
- [ ] No fake waveforms, no even-distribution timestamps, no placeholder images

### 3. Data Shape Verification
- [ ] Am I unwrapping IPC responses before storing in state?
- [ ] If I filter/map on a field, does that field actually exist in the data?
- [ ] If I changed a schema, did I write a migration function?

### 4. React/Zustand Correctness
- [ ] All store subscriptions use selectors: `useStore((s) => s.field)`
- [ ] No `getState()` in render paths
- [ ] Hooks reference values declared ABOVE them (no TDZ)
- [ ] **Rename safety:** After renaming ANY variable, function, or export — search ALL 6 categories for the old name: (1) direct calls, (2) type-level references, (3) string literals, (4) dynamic imports, (5) re-exports/barrel files, (6) test files/mocks. Assume grep missed something.

### 5. CSS/Layout Sanity
- [ ] ResizablePanel `defaultSize` values sum to exactly 100%
- [ ] No `flex-1` on elements that should have fixed/auto width
- [ ] Dark theme: Radix portals have explicit `dark` class + hardcoded dark HSL
- [ ] Text minimum: 12px labels, 14px body

### 6. No Regressions
- [ ] Did I change imports? Check nothing is unused or missing
- [ ] Did I remove a component? Check it's not referenced elsewhere
- [ ] Did I change a store action? Check all call sites still pass correct args

## Build & Launch Protocol

After passing the checklist:
1. `npx react-scripts build` — must complete with zero errors
2. `npm start` — app must launch (run in background)
3. Commit with descriptive message
4. `git push origin master`

NEVER skip steps 1-2. NEVER say "done" without a successful build.

## Commit Message Format

```
<verb> <what changed>: <brief why>

- Detail 1
- Detail 2

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

Verbs: Fix, Add, Remove, Update, Refactor, Clean up

## Anti-Patterns — Things I Must NEVER Do

1. **Pattern-match fixes** — "too wide" ≠ "reduce padding". Diagnose the actual CSS property.
2. **Tweak the same property twice** — if first fix didn't work, the diagnosis is wrong. Start over.
3. **Build features the user didn't ask for** — no WordColorPicker, no extra controls, no "nice to have" additions.
4. **Incremental nudges** — don't change 25% → 28% → 32% → 49%. Ask what the user actually wants or calculate it correctly the first time.
5. **Skip screenshot analysis** — every screenshot deserves 10 seconds of actual visual analysis.
6. **Add fallbacks** — the user explicitly said: "I would rather the app not work than use something unbearable and frankly unusable." Fail visibly. Always.

## Lesson Capture

After ANY correction from the user:
1. Immediately append to `tasks/lessons.md`
2. Format: what the mistake was, why it happened, the rule to prevent it
3. Do this BEFORE continuing with the next task
