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
- [ ] **Load-path invariant:** if a list's sort/filter is enforced at LOAD time (not at render), it's an invariant EVERY path that writes the full list into state must satisfy. When adding/touching any `setX(rows)` from a DB/IPC reload, grep ALL sibling setters and confirm each applies the same sort/filter — the DB's `ORDER BY` is not the UI's order. One missed `setFiles(rows)` (resetFileDone, no `compareRecordings`) flipped the whole Recordings list to newest-first until restart (session 86).

### 7. Liveness — am I editing code that actually RUNS?
- [ ] Before editing a function, `Grep` for its callers. **Zero callers = dead code.** Editing it has no user-facing effect (this is how #102/#97 got patched into the dead `commitAudioResize` path).
- [ ] Did I confirm the component/handler I changed is the one actually mounted (top-down from `EditorLayout`), not a similarly-named twin?
- [ ] If I claimed "this fixes X," can I name the live path mount→handler that the user's gesture actually hits? If not, verify in the running app before saying done.
- [ ] See the `clipflow-trace-verify` skill for the full grep-callers / top-down / liveness-proof protocol.

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

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Verbs: Fix, Add, Remove, Update, Refactor, Clean up

## Anti-Patterns — Things I Must NEVER Do

1. **Pattern-match fixes** — "too wide" ≠ "reduce padding". Diagnose the actual CSS property.
2. **Tweak the same property twice** — if first fix didn't work, the diagnosis is wrong. Start over.
3. **Build features the user didn't ask for** — no WordColorPicker, no extra controls, no "nice to have" additions.
4. **Incremental nudges** — don't change 25% → 28% → 32% → 49%. Ask what the user actually wants or calculate it correctly the first time.
5. **Skip screenshot analysis** — every screenshot deserves 10 seconds of actual visual analysis.
6. **Add fallbacks** — the user explicitly said: "I would rather the app not work than use something unbearable and frankly unusable." Fail visibly. Always.

## Distilled Lessons (process — write/done time)

- **Calendar dates are LOCAL (Fega is EST), never `toISOString()`.** `toISOString().split("T")[0]` stamps the UTC date — 4–5h ahead, so evening actions get dated *tomorrow* (Sunday nights: *next week*). Any user-facing date written to state (tracker entries, schedule keys, history logs) must use `localISO()` from `src/renderer/utils/trackerEngine.js` or local `getFullYear/getMonth/getDate` formatting. Full ISO *timestamps* stored as instants are fine — the rule is about extracting calendar DATES. Grep `toISOString().split` before shipping date-touching code (#160, sessions 94–95; memory `user_timezone_est`).
- **"Done means audited."** When a fix is confirmed working, BEFORE pivoting to the next task: re-read the actual shipped diff (not a summary), re-read logs from the successful run (double-fires, new warnings), trace edge cases the test didn't hit, grep for scaffolding left behind, and state the root cause in one plain sentence. File any separate issues found.
- **Never mark a task DONE until the user confirms.** Mark "awaiting verification" at most. If they go quiet for a couple sessions, proactively ask "did X work?"
- **Batch related fixes.** Read ALL affected files first, diagnose ALL root causes, implement together, build once — don't fix-one/rebuild/repeat.
- **Never remove working features during a fix without explicit approval.** If code looks unused, grep callers, then ASK. Document anything removed in the commit message.
- **Never recommend or implement auto-deletion of user data** without asking first (pipeline logs hold cost/perf history).
- **When migrating to a new system, delete the old code aggressively** — don't keep fallbacks to the deprecated path "just in case." They rot, mask new-system bugs, and cause "which path am I on?" confusion. Git is the backup. (Only check: is it actually dead? grep callers.)
- **Never remove debug `console.log`s during active development** — they're load-bearing for current debugging. Cleanup is only for stable, shipped, confirmed-working features. ClipFlow is not there yet.
- **ClipFlow is a desktop app — never optimize web metrics.** No bundle-size reduction, code-splitting, lazy-loading, or CDN concerns (files are on local disk; lazy-load adds "Loading…" flashes for zero benefit). Valid targets: IPC speed, FFmpeg efficiency, render perf, memory, startup time.
- **New visual styles must be additive / opt-in** — never replace the user's established default look (karaoke highlight, subtitle style) without consent. Their current look is their brand.
- **Always add diagnostic logging** for any IPC call that can fail (`console.error` with full context values); add `console.log` at key decision points during feature dev.
- **A count in a label must name what it counts.** When a button/label shows a number + noun, the noun has to be the unit the number counts. If the action turns N inputs into a *different* output unit, count the inputs and name them ("Clip N Recordings"), or drop the number — never put the input count next to the output noun ("Generate N Clips" when N = recordings, each yielding several clips; #123/session 68). Re-read every count+noun string this way before shipping.
- **Fix the user's reported symptom, not the literal (often rescoped) ticket text.** Before closing a bug, restate the symptom in Fega's own words and confirm the fix makes THAT observable thing change. If the ticket title and his description diverge (common after a ticket has been rescoped — e.g. #32 drifted to "caption width" while he meant "panel widths"), his description wins: fix what he means, or split a new issue and say so. A ticket number labels a user-visible problem, not whatever narrow root-cause the last triage wrote down. For visual/interactive fixes a build-pass is never sufficient — leave `status: untested` until he sees it in the running app (sessions 60/63/65/75; memory `feedback_fix_user_symptom_not_ticket`).
- **Verification steps for the user must be jargon-free, and split from my own checks.** Fega is the tester but NOT a coder. Present any verification as two parts: "I'll do this (you don't watch)" — build, automated repro/tests, log inspection — and "What I need from you (~N min, no tech)" in plain app-user words ("open a couple clips, do the captions still match the audio? screenshot anything off"). NEVER ask him to read logs, confirm an internal field value (`startSec`), use code verbs ("init", "re-transcribe"), or hunt for a broken clip by its symptom. Prefer proving the fix myself with a synthetic reproduction so his look is a bonus regression pass, not the correctness gate. **Every test item must be a full instruction, not a fixture name:** starting state + explicit action (verb + what to click) + what to look at + ✅good / ❌flag-it tell. Listing clip/screen TYPES ("an edited clip", "an extended clip") with no action is useless — Fega: "you're not telling me exactly what to do with them" (session 58). Lead with the single item that proves the fix; mark edge cases skippable. See memory `feedback_plan_clarity`.

## Lesson Capture

After ANY correction from the user:
1. Immediately append to `tasks/lessons.md`
2. Format: what the mistake was, why it happened, the rule to prevent it
3. Do this BEFORE continuing with the next task
