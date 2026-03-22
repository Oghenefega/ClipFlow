# ClipFlow — Session Handoff
_Last updated: 2026-03-22_

## Current State
App builds and runs. No feature work this session — session was dedicated to Claude Code configuration, tooling setup, and autoresearch experimentation.

## What Was Just Built

### Claude Code Setup (permanent improvements)
- **Global CLAUDE.md** slimmed down — removed documentation, kept only rules and conventions
- **Project CLAUDE.md** slimmed down — same treatment, ~50 lines of pure instructions
- **`.claude/rules/`** created with 4 path-scoped rule files: `editor.md`, `pipeline.md`, `ui-standards.md`, `conventions.md`
- **6 custom slash commands** created in `.claude/commands/`: `build`, `review`, `session-start`, `session-end`, `fix-issue`, `status`
- **`settings.local.json`** cleaned up — replaced 22 messy one-off approvals with intentional allow/deny lists
- **`views/EditorView.js` deleted** — 2,654 lines of dead code that was never imported anywhere
- **`tasks/lessons.md`** updated with 2 new lessons (see Watch Out For)

### Autoresearch — Learned, Not Shipped
- Ran 3 autoresearch experiments as learning exercises
- Console.log cleanup: ran and then **reverted** (app in active development, logs needed for debugging)
- Bundle size / lazy loading: ran and then **reverted** (web metric — irrelevant for Electron desktop)
- LOC reduction: skipped (too risky while app is unstable)

## Key Decisions

- **Console.logs stay** until specific features are confirmed stable and shipped. Not a codebase-wide sweep.
- **Autoresearch targets for Electron** must be things that matter for a local desktop app — IPC speed, render performance, FFmpeg pipeline, memory usage. Never bundle size, network payload, or code splitting.
- **LOC reduction deferred** — too much judgment involved for an autonomous loop while the app is still actively breaking.
- **rules/ files are path-scoped** — editor rules only load when working in editor files, pipeline rules only for main.js/IPC work.

## Next Steps

1. **Resume active feature work** — check todo.md for current priority
2. **Autoresearch: LOC consolidation** — when app is more stable, target `RightPanelNew.js` (1,772 lines) and `PreviewPanelNew.js` (1,418 lines) for duplicate pattern cleanup
3. **Autoresearch: console.log cleanup** — per-feature, once each feature is confirmed working
4. **Consider agents** — code-reviewer agent on Haiku for pre-commit reviews
5. **Consider security audit** — `/autoresearch:security` when approaching a stable release

## Watch Out For

- **Debug logs are load-bearing** — do NOT remove console.logs without explicitly asking first. The app is under active development and logs like `[ExtendRight]`, `[ExtendLeft]`, `[initSegments]` are actively used to diagnose issues.
- **ClipFlow is Electron, not a web app** — bundle size, lazy loading, code splitting are irrelevant. Never suggest web performance optimizations.
- **autoresearch-results.tsv** is in the repo root — this is a working file, gitignored intent but currently tracked. Can be deleted between runs.
- **`.claude/settings.local.json`** is gitignored — don't commit it. Permissions are local-only.
- **`views/EditorView.js` is gone** — if something references it, that's a bug. The real editor is `editor/EditorView.js`.

## Logs / Debugging

No app bugs worked on this session. All debug logs restored to their original state. If you see IPC errors on clip extension, the relevant logs are:
- `[ExtendRight IPC]` / `[ExtendLeft IPC]` / `[Recut IPC]` → `src/main/main.js`
- `[ExtendRight]` / `[ExtendLeft]` / `[RevertClip]` → `src/renderer/editor/stores/useEditorStore.js`
- `[initSegments]` / `[Undo]` → `src/renderer/editor/stores/useSubtitleStore.js`
