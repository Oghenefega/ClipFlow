# Autonomous Issue Filing — Full Procedure

This is the full procedural reference for ClipFlow's autonomous issue filing. The high-level policy lives in the project `CLAUDE.md`; load this file when you're about to file, close, or look up an issue.

## File an issue when

During work, something surfaces that's not fixable inline in ≤60 seconds. File it immediately and keep working on the current task. Covers:

- Bugs or regressions spotted but not being fixed this session
- Features or improvements the user sketches out as "we should do X"
- Cleanup / hygiene items out of current scope (dead code, stale docs, missing tests)
- Major plans with multiple subtasks — plan becomes an epic issue; subtasks become child issues with `Related to #N` in the body
- Blockers for current work — file the blocker AND park the current task as its own issue, then pivot
- Open questions needing user input that won't resolve this session

**Don't file for:**
- Inline fixes handled in the same commit
- Pure in-conversation exploration not yet actionable
- Obvious duplicates (run `gh issue list --search "keywords"` first when cost is low)

## Issue body must include

As much as known at filing time:

- Root cause or working hypothesis
- File paths + line numbers
- Acceptance criteria / "done means..."
- Why this matters (user impact, what it blocks)

**Full context goes in the issue body — HANDOFF.md is a pointer, not a carrier.** Next-session-me must be able to act on the issue without reading HANDOFF.

## Labels (always one `type:` + one `area:`)

**Types:** `type: bug`, `type: feature`, `type: improvement`, `type: chore`, `type: test`

**Areas:** `area: editor`, `area: subtitles`, `area: timeline`, `area: captions`, `area: projects`, `area: recordings`, `area: rename`, `area: queue`, `area: tracker`, `area: publishing`, `area: ai`, `area: settings`, `area: backend`, `area: auth`, `area: billing`, `area: distribution`, `area: observability`, `area: security`

**Milestone label:** `milestone: commercial-launch` when blocking v1.0

If unsure, run `gh label list --repo Oghenefega/ClipFlow` and pick the closest.

## Close an issue when the user confirms resolution

When the user says "that works", "fixed", "resolved", "no issue", "all good", "great, it's working" — and a filed issue clearly matches the work just completed — close it immediately:

```
gh issue close <N> --repo Oghenefega/ClipFlow --comment "<brief resolution note + commit SHA>"
```

If the match is ambiguous, ask once which issue to close. Don't close on vague acknowledgments ("ok", "moving on").

## "Start session" trigger (natural language)

Whenever the user says "start session", "let's pick up", "resume", "begin", or any similar phrase meaning "kick off a new session" — run the full session-start ritual without being asked: read HANDOFF.md, `git log --oneline -10`, `tasks/todo.md`. Then **also** run `gh issue list --repo Oghenefega/ClipFlow --state open --limit 50` and group the results by label so forgotten work surfaces at the top of every session.

## Command style

- Always include `--repo Oghenefega/ClipFlow`
- Title: short, specific, lowercase after first word
- Body uses real markdown (not backtick-n escape sequences — we're running `gh` directly, not generating PowerShell)
- Never ask permission. Never output PowerShell commands for the user to run. Run `gh` directly and report filed/closed issues at end-of-turn.
