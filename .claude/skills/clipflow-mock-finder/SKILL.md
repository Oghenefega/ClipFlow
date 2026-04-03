---
name: clipflow-mock-finder
description: >-
  Find stubs, mocks, placeholders, TODOs, and fake code in ClipFlow. Use when:
  find mocks, find stubs, find placeholders, check for fake code, audit incomplete,
  find TODO, find unimplemented, what's not done yet.
---

# ClipFlow Mock/Stub Finder

> **Core Insight:** Solo-dev projects accumulate stubs, placeholders, and TODO code across sessions. Single-keyword grep misses structural stubs (short functions that do nothing). You need keywords + structure + behavioral detection.

## The Loop

```
1. SCAN        → Run all detection methods (keywords, structure, behavior)
2. COMPILE     → Table of findings with file:line, type, snippet, justification
3. TRIAGE      → Categorize: needs-code / blocked-on-infra / dead-code / intentional
4. TRACE       → For each suspect, trace callers to confirm real impact
5. RESOLVE     → Plan and fix (or document blockers), one at a time
6. RE-SCAN     → Confirm zero remaining after resolution
```

---

## Detection Methods

### Method 1: Keyword Search

```bash
# Explicit markers — highest confidence
rg -n "TODO|FIXME|HACK|XXX|STUB|PLACEHOLDER|MOCK|DUMMY|FAKE|TEMP\b|TEMPORARY" \
  --type js -g '!node_modules/' -g '!build/' -g '!dist/' src/

# Weaker signals — need manual review
rg -n "WORKAROUND|KLUDGE|REFACTOR|REVISIT|LATER|WIP|INCOMPLETE|SKELETON" \
  --type js -g '!node_modules/' -g '!build/' src/

# JS/Electron-specific unimplemented patterns
rg -n "throw new Error.*(not implemented|TODO|stub)" --type js src/
rg -n "return undefined\b" --type js src/
```

### Method 2: Suspicious Return Values

```bash
# Functions returning hardcoded trivial values (likely placeholders)
rg -n "return true$|return false$|return 0$|return -1$|return null$" --type js src/
rg -n "return \[\]$|return \{\}$|return ''$|return \"\"$" --type js src/

# Empty catch blocks (swallowed errors)
rg -n "catch.*\{\s*\}" --type js src/
```

### Method 3: Structural — Short/Empty Functions

Look for functions that are suspiciously short for what they claim to do:

```bash
# Empty function bodies
rg -n "function \w+\([^)]*\)\s*\{\s*\}" --type js src/
rg -n "=>\s*\{\s*\}" --type js src/

# Functions that are just a single return of a trivial value
rg -n "function \w+.*\{" -A2 --type js src/ | rg "return (true|false|null|undefined|\[\]|\{\}|0|''|\"\")"
```

### Method 4: Behavioral Detection (ClipFlow-Specific)

```bash
# Fake delays simulating real operations
rg -n "setTimeout.*simul|fake.*delay|sleep.*mock" --type js src/

# Hardcoded values that should be computed
rg -n "score\s*=\s*[0-9]|count\s*=\s*0[^.]|duration\s*=\s*0" --type js src/

# Console.log used as placeholder for real error handling
rg -n "catch.*console\.(log|warn)" --type js src/

# Features returning early / disabled
rg -n "return.*//.*todo|return.*//.*later|return.*//.*not.*implemented" -i --type js src/
```

### Method 5: ClipFlow Domain-Specific Stubs

These are the areas most likely to have stubs given ClipFlow's development stage:

```bash
# OAuth/publishing — features still being built out
rg -n "oauth|publish|upload" -i --type js src/ | rg -i "todo|stub|placeholder|fake|mock|not.implemented"

# IPC handlers declared but not fully implemented
# Check preload.js bridge functions against actual main process handlers
rg -n "invoke\(" --type js src/main/preload.js

# AI pipeline placeholders
rg -n "TODO|placeholder|stub|mock" --type js src/main/ai-pipeline.js

# Render pipeline stubs
rg -n "TODO|placeholder|stub" --type js src/main/subtitle-overlay-renderer.js src/main/ffmpeg.js
```

### Method 6: Cross-Reference (Caller Tracing)

For each suspect function, trace who calls it:

```bash
# Find callers of a suspect function
rg -n "functionName\(" --type js src/

# If callers depend on real output but the function returns fake data → confirmed stub
# If no callers exist → dead code, candidate for deletion
```

---

## Compile Findings Table

```markdown
| # | File:Line | Type | Code Snippet | Why Suspicious | Category |
|---|-----------|------|-------------|----------------|----------|
| 1 | src/main/x.js:42 | stub | `return []` | Should return real data | needs-code |
| 2 | src/renderer/y.js:100 | todo | `// TODO: implement` | Explicit marker | needs-code |
| 3 | src/main/oauth.js:55 | blocked | `return null` | Needs API credentials | blocked-on-infra |
| 4 | src/renderer/z.js:30 | dead | `function unused()` | No callers found | dead-code |
```

**Categories:**
- **needs-code** — No external dependency, can implement now
- **blocked-on-infra** — Needs API keys, external service, platform approval (document the blocker)
- **dead-code** — No callers, unreachable (candidate for deletion)
- **intentional** — Abstract/interface pattern, feature flag, or legitimate simple function (false positive)

---

## Triage: Real Stub vs False Positive

| Signal | Likely Real Stub | Likely False Positive |
|--------|-----------------|----------------------|
| `// TODO` with description | Real — missing work described | Old resolved TODO left behind |
| `return true` / `return false` | In validation or check function | In feature flag or simple predicate |
| `return []` / `return {}` | In data-fetching function | In initializer / default state |
| Empty catch block | Error silently swallowed | Intentional ignore (with comment) |
| Short function (1-3 lines) | In business logic module | Getter/setter/accessor |
| `console.log` in catch | Placeholder for real error handling | Acceptable in dev-only code |

**Rule:** Trace callers. If callers depend on real output, it's a stub. If callers just need the type signature or a default, it may be intentional.

---

## Resolution

For each confirmed stub:

1. **Trace callers** — understand what the real implementation should do
2. **Check if blocked** — does it need external services, API keys, or other stubs resolved first?
3. **Implement or document** — write real code, or add a clear `// BLOCKED: reason` comment
4. **Verify** — build, launch, test the changed feature
5. **Remove markers** — delete the TODO/STUB comment once resolved

### Resolution Checklist Per Item

```markdown
## Resolving: [file:line — description]
- [ ] Traced callers to understand expected behavior
- [ ] Identified dependencies / blockers
- [ ] Implemented real logic (or documented why blocked)
- [ ] App builds with no errors
- [ ] App launches normally
- [ ] Changed feature works correctly
- [ ] Removed TODO/STUB comment
```

---

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Grep only for "TODO" | Use ALL detection methods |
| Fix stubs without tracing callers | Understand what the real impl should do |
| Replace stub with slightly better stub | Implement fully or defer with documented blocker |
| Delete dead code without checking git history | Check if it's WIP from a recent branch |
| Assume short function = stub | Getters, accessors, simple predicates are fine |
| Fix everything in one giant commit | One stub resolution per commit |

---

## Post-Resolution Verification

After resolving all actionable items:

```bash
# Re-run keyword scan — should show only blocked/intentional items
rg -n "TODO|FIXME|HACK|XXX|STUB|PLACEHOLDER|MOCK|DUMMY|FAKE" \
  --type js -g '!node_modules/' -g '!build/' src/

# Build and launch
npx react-scripts build && npm start

# Confirm: zero new console errors, all features work
```
