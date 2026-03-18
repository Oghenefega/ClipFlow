# Autonomous Loop Protocol

Detailed protocol for the autoresearch iteration loop. SKILL.md has the summary; this file has the full rules.

## Loop Modes

Autoresearch supports two loop modes:

- **Unbounded (default):** Loop forever until manually interrupted (`Ctrl+C`)
- **Bounded:** Loop exactly N times when `Iterations: N` is set in the inline config (or `--iterations N` flag for CLI/CI)

When bounded, track `current_iteration` against `max_iterations`. After the final iteration, print a summary and stop.

## Phase 1: Review (30 seconds)

Before each iteration, build situational awareness:

```
1. Read current state of in-scope files (full context)
2. Read last 10-20 entries from results log
3. Read git log --oneline -20 to see recent changes
4. Identify: what worked, what failed, what's untried
5. If bounded: check current_iteration vs max_iterations
```

**Why read every time?** After rollbacks, state may differ from what you expect. Never assume — always verify.

## Phase 2: Ideate (Strategic)

Pick the NEXT change. Priority order:

1. **Fix crashes/failures** from previous iteration first
2. **Exploit successes** — if last change improved metric, try variants in same direction
3. **Explore new approaches** — try something the results log shows hasn't been attempted
4. **Combine near-misses** — two changes that individually didn't help might work together
5. **Simplify** — remove code while maintaining metric. Simpler = better
6. **Radical experiments** — when incremental changes stall, try something dramatically different

**Anti-patterns:**
- Don't repeat exact same change that was already discarded
- Don't make multiple unrelated changes at once (can't attribute improvement)
- Don't chase marginal gains with ugly complexity

**Bounded mode consideration:** If remaining iterations are limited (<3 left), prioritize exploiting successes over exploration.

## Phase 3: Modify (One Atomic Change)

- Make ONE focused change to in-scope files
- The change should be explainable in one sentence
- Write the description BEFORE making the change (forces clarity)

## Phase 4: Commit (Before Verification)

```bash
git add <changed-files>
git commit -m "experiment: <one-sentence description>"
```

Commit BEFORE running verification so rollback is clean: `git reset --hard HEAD~1`

## Phase 5: Verify (Mechanical Only)

Run the agreed-upon verification command. Capture output.

**Timeout rule:** If verification exceeds 2x normal time, kill and treat as crash.

**Extract metric:** Parse the verification output for the specific metric number.

## Phase 5.5: Guard (Regression Check)

If a **guard** command was defined during setup, run it after verification.

The guard is a command that must ALWAYS pass — it protects existing functionality while the main metric is being optimized. Common guards: `npm test`, `npm run typecheck`, `pytest`, `cargo test`.

**Key distinction:**
- **Verify** answers: "Did the metric improve?" (the goal)
- **Guard** answers: "Did anything else break?" (the safety net)

**Guard rules:**
- Only run if a guard was defined (it's optional)
- Run AFTER verify — no point checking guard if the metric didn't improve
- Guard is pass/fail only (exit code 0 = pass). No metric extraction needed
- If guard fails, revert the optimization and try to rework it (max 2 attempts)
- NEVER modify guard/test files — always adapt the implementation instead
- Log guard failures distinctly so the agent can learn what kinds of changes cause regressions

**Guard failure recovery (max 2 rework attempts):**

When the guard fails but the metric improved, the optimization idea may still be viable — it just needs a different implementation that doesn't break behavior:

1. Revert the change (`git reset --hard HEAD~1`)
2. Read the guard output to understand WHAT broke (which tests, which assertions)
3. Rework the optimization to avoid the regression — e.g.:
   - If inlining a function broke callers → try a different optimization angle
   - If changing a data structure broke serialization → preserve the interface
   - If reordering logic broke edge cases → add the optimization more surgically
4. Commit the reworked version, re-run verify + guard
5. If both pass → keep. If guard fails again → one more attempt, then give up

**Critical:** Guard/test files are read-only. The optimization must adapt to the tests, never the other way around. If after 2 rework attempts the optimization can't pass the guard, discard it and move on to a different idea.

## Phase 6: Decide (No Ambiguity)

```
IF metric_improved AND (no guard OR guard_passed):
    STATUS = "keep"
    # Do nothing — commit stays
ELIF metric_improved AND guard_failed:
    git reset --hard HEAD~1
    # Rework the optimization (max 2 attempts)
    FOR attempt IN 1..2:
        Analyze guard output → rework implementation (NOT tests)
        git add + commit reworked version
        Re-run verify
        IF metric_improved:
            Re-run guard
            IF guard_passed:
                STATUS = "keep (reworked)"
                BREAK
        git reset --hard HEAD~1
    IF still failing after 2 attempts:
        STATUS = "discard"
        REASON = "guard failed, could not rework optimization"
ELIF metric_same_or_worse:
    STATUS = "discard"
    git reset --hard HEAD~1
ELIF crashed:
    # Attempt fix (max 3 tries)
    IF fixable:
        Fix → re-commit → re-verify → re-guard
    ELSE:
        STATUS = "crash"
        git reset --hard HEAD~1
```

**Simplicity override:** If metric barely improved (+<0.1%) but change adds significant complexity, treat as "discard". If metric unchanged but code is simpler, treat as "keep".

## Phase 7: Log Results

Append to results log (TSV format):

```
iteration  commit   metric   status   description
42         a1b2c3d  0.9821   keep     increase attention heads from 8 to 12
43         -        0.9845   discard  switch optimizer to SGD
44         -        0.0000   crash    double batch size (OOM)
```

## Phase 8: Repeat

### Unbounded Mode (default)

Go to Phase 1. **NEVER STOP. NEVER ASK IF YOU SHOULD CONTINUE.**

### Bounded Mode (with Iterations: N)

```
IF current_iteration < max_iterations:
    Go to Phase 1
ELIF goal_achieved:
    Print: "Goal achieved at iteration {N}! Final metric: {value}"
    Print final summary
    STOP
ELSE:
    Print final summary
    STOP
```

**Final summary format:**
```
=== Autoresearch Complete (N/N iterations) ===
Baseline: {baseline} → Final: {current} ({delta})
Keeps: X | Discards: Y | Crashes: Z
Best iteration: #{n} — {description}
```

### When Stuck (>5 consecutive discards)

Applies to both modes:
1. Re-read ALL in-scope files from scratch
2. Re-read the original goal/direction
3. Review entire results log for patterns
4. Try combining 2-3 previously successful changes
5. Try the OPPOSITE of what hasn't been working
6. Try a radical architectural change

## Crash Recovery

- Syntax error → fix immediately, don't count as separate iteration
- Runtime error → attempt fix (max 3 tries), then move on
- Resource exhaustion (OOM) → revert, try smaller variant
- Infinite loop/hang → kill after timeout, revert, avoid that approach
- External dependency failure → skip, log, try different approach

## Communication

- **DO NOT** ask "should I keep going?" — in unbounded mode, YES. ALWAYS. In bounded mode, continue until N is reached.
- **DO NOT** summarize after each iteration — just log and continue
- **DO** print a brief one-line status every ~5 iterations (e.g., "Iteration 25: metric at 0.95, 8 keeps / 17 discards")
- **DO** alert if you discover something surprising or game-changing
- **DO** print a final summary when bounded loop completes
