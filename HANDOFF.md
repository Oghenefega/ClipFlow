# HANDOFF — Session 191 (2026-08-24)

## Current State

No app code changed. This was a tooling audit: the agent config (global + project
CLAUDE.md, commands, always-on skills) caught up with the current Claude Code harness,
two enforcement hooks are live, Codex remnants and stale worktrees are deleted, and the
council reports moved into `council-reports/`. Product state is unchanged from s190:
batches 1 + 2 shipped and review-clean, desktop and laptop still on **0.4.0-alpha.4**,
nothing has reached a machine yet.

## Key Decisions

1. **Two former prose rules are now hooks** (`.claude/settings.json` + `.claude/hooks/`):
   every Edit/Write is scanned for invisible control characters (the s187 0x08 class),
   and a session-wrap commit is blocked when CHANGELOG.md is untouched. Deterministic
   beats remembered.
2. **Skill slimming was deliberately conservative** — only generic coaching that current
   models do by default was cut from `clipflow-code-review` / `clipflow-trace-verify`;
   every project-specific trap and distilled lesson stayed.
3. **HANDOFF drops "What Was Just Built"** — commits and CHANGELOG.md own that record.

## Next Steps (unchanged from s190 — product work resumes)

1. **Batch 3 — recordings that aren't mine still work:** #62, #300, #178. #178 and #300
   share a root shape — the `<video>` has no `onError`; add that regardless. Opus@high
   builds it; Fable reviews in its own session after it lands, given the commit hash.
2. **Batch 4 — the first ten minutes don't look broken:** #153, #74 (**needs Fega to
   approve replacement copy** — the long pole), #152.
3. **Then cut ONE installer** covering all batches (~14 issues). Optional batch 5 if
   there is room: #157, #151, #158.

## Watch Out For

- **The wrap-changelog hook** blocks any commit whose message contains "wrap" when
  CHANGELOG.md is untouched in the working tree AND absent from the last commit.
  Update the changelog first — don't fight the hook.
- **All s190 product watch-items still stand:** `gatewayAuthTokenPreMigration` has no
  reader (keep until the installer reaches the laptop); the prod profile has NOT run the
  #301 migration; "Corva Default" still never seen on screen (needs a fresh profile);
  `LEGACY_TIME_SLOTS` in App.js is load-bearing for Fega's old-format store.
- **Global CLAUDE.md edits live outside the repo** (`~/.claude/CLAUDE.md`) — updated
  this session but not versioned here.
- **The lessons.md outflow pipe is fully drained** — the file ends at s185 and
  everything through there is distilled; s186–190 captured lessons directly into
  skills/memory.

## Logs / Debugging

- **Hook feedback appears in the tool result:** a control-char hit names file + offset +
  line; the changelog gate names the rule. Scripts in `.claude/hooks/`, config in
  `.claude/settings.json`. Both were pipe-tested and fire-verified live in s191.
- **Dev boot-verify recipe unchanged (s190):** `CLIPFLOW_PROFILE=dev npx electron .
  --remote-debugging-port=9222`, poll `http://127.0.0.1:9222/json/list` for the "Corva"
  page, then read `%APPDATA%\clipflow-dev\logs\app.log`. Clean boot = `Database
  initialized … (schema v9)` and no `is unreadable` / `Recovered from` lines.
  `taskkill //F //IM electron.exe` between runs, or CDP attaches to a stale zombie.
