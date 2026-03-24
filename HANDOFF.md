# ClipFlow — Session Handoff
_Last updated: 2026-03-24 (GitHub Issues Infrastructure)_

## Current State
App is unchanged — this session was pure tooling/workflow setup with no code changes.

## What Was Just Built
- **GitHub label system** — 13 labels created: 5 `type:` (bug, feature, improvement, test, chore) + 8 `area:` (editor, timeline, subtitles, projects, queue, publishing, ai, settings)
- **Removed 9 GitHub defaults** — bug, enhancement, documentation, duplicate, good first issue, help wanted, invalid, question, wontfix (all redundant)
- **GitHub issue CLI workflow** — established PowerShell format for `gh issue create` commands (single line, backtick-n newlines, always include `--repo Oghenefega/ClipFlow`)
- **GitHub API token setup** — PAT saved to `C:\Users\IAmAbsolute\.claude\github_token.txt`, CLAUDE.md updated with WebFetch endpoint so Claude can read issues on demand
- **CLAUDE.md updated** — GitHub section now documents token path + REST API fetch pattern

## Key Decisions
- PowerShell only (not CMD) — backslash continuations and heredocs don't work in CMD
- Token stored in `.claude/` folder (outside repo, never committed)
- GitHub API read via WebFetch with Bearer auth — no Docker, no extra tooling needed
- 13 labels is the right size — enough coverage, no noise

## Next Steps
- Test live uploads to all platforms (YouTube, Instagram, Facebook, TikTok) — carried over from last session
- Fix subtitle drag overlap behavior (non-destructive)
- Fix MX Master horizontal scroll on timeline
- Start logging bugs/features as GitHub issues going forward

## Watch Out For
- PAT has `repo` scope — treat it as a secret, never log or expose it
- Meta app still in dev mode — localhost OAuth works but won't in production
- YouTube uploads are PUBLIC — be intentional

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/clipflow-2026-03-24.log`
- Publish log: `%APPDATA%/clipflow/clipflow-publish-log.json`
