# ClipFlow — Session Handoff
_Last updated: 2026-04-20 — "Tier 1+2 complexity cleanup"_

---

## Current State

Two code-cleanup commits landed on master, build clean, Electron boot smoke-tested twice. A **stable baseline tag** was created pointing at the last pre-cleanup commit so there's a known-good fallback if anything surfaces later.

**Tag:** `stable-2026-04-20-pre-cleanup` → [c7c2d60](https://github.com/Oghenefega/ClipFlow/commit/c7c2d60)
**Head:** [3248ae8](https://github.com/Oghenefega/ClipFlow/commit/3248ae8) (Tier 2 on top of Tier 1)

Mid-session the user reverted both cleanups out of caution ("app is beginning to run a bit slow"), then re-applied them after confirming the changes were deletions/moves only — nothing that could affect runtime. The revert+re-apply round-trip lives in git history; `b53e63b` / `3248ae8` are the final live commits.

Net LOC removed across the two commits: **–901** (dead code + duplicated helpers).

---

## What Was Built

### Tier 1 — [b53e63b](https://github.com/Oghenefega/ClipFlow/commit/b53e63b) (~–860 LOC)

- **Deleted 8 unused shadcn/ui components** from [src/components/ui/](src/components/ui/): `context-menu.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tabs.tsx`, `toggle.tsx`, `toggle-group.tsx`, `input.tsx`. Zero imports verified via grep across renderer + editor before deletion.
- **Deleted no-op `rotateLogs()`** in [src/main/logger.js](src/main/logger.js) and its single call site in [src/main/main.js](src/main/main.js). electron-log manages rotation natively (5 MB max, 5 archives); the stub was kept-for-compat dead weight.
- **Inlined `getLogsDirPath()` wrapper** into `getLogsDir()` at both call sites in main.js.
- **Dropped `async` keyword** from three synchronous IPC handlers (`store:get`, `store:set`, `store:getAll`). They never awaited anything — renderer still sees Promises via Electron's IPC marshalling, no behavior change.
- **Collapsed dead ternary** `"Next" : "Next"` in [OnboardingView.js:172](src/renderer/views/OnboardingView.js:172).

### Tier 2 — [3248ae8](https://github.com/Oghenefega/ClipFlow/commit/3248ae8) (~–41 LOC)

- **Created [src/main/uuid.js](src/main/uuid.js)** as the single-source UUID v4 helper. Removed three identical `_uuid()` copies previously defined inline in `main.js`, `file-migration.js`, `naming-presets.js`.
- **Added `formatDuration` to [shared.js](src/renderer/components/shared.js)** (seconds → `"Xh Ym"` / `"Ym"`). Removed two identical local copies in `UploadView.js` and `RenameView.js`.
- **Deleted dead `findActiveWord`** (33 LOC) from [buildPreviewSubtitles.js](src/renderer/editor/utils/buildPreviewSubtitles.js). All external callers (PreviewOverlays, subtitle-overlay-preload) import from the canonical [utils/findActiveWord.js](src/renderer/editor/utils/findActiveWord.js) — the buildPreviewSubtitles variant was never imported anywhere.

---

## Key Decisions

- **Tiered cleanup approach:** scoped the review into three tiers by regression risk. Tier 1 = pure deletes (very low risk). Tier 2 = extract duplicates (low risk). Tier 3 = structural extractions (deferred, higher risk). Only Tier 1+2 landed; Tier 3 intentionally not done this session.
- **Skipped deliberately despite showing up in the audit:**
  - Merging `llm-provider` / `transcription-provider` registries — duplication real but each module is already tight; churn > payoff.
  - ProjectsView's local `fmtTime` / `fmtHMS` — single-file use, not duplicated.
  - Merging ProjectsView's `fmtTime` with editor's `timeUtils.fmtTime` — **different format contracts** (`"MM:SS.d"` vs `"m:ss"`). Intentional divergence.
  - `gatherWords` / `stripPunct` in buildPreviewSubtitles — still internally used by `buildPreviewSegments`. Not dead.
- **Tag naming convention:** annotated tag with absolute date + intent suffix (`stable-2026-04-20-pre-cleanup`). Pushed to GitHub so it's visible in Releases.
- **Cherry-pick over revert-of-revert** when re-applying: cleaner history, 2 new commits instead of 4. Cherry-picks of `f48c58a` + `c98063c` applied without conflict.

---

## Next Steps

**Tier 3 cleanup is available when ready** — more invasive, worth doing one item at a time with verification between each:

1. **Extract subtitle/caption style builder** — identical 25-field style object constructed in both [EditorLayout.js:323](src/renderer/editor/components/EditorLayout.js:323) (doRender) and [useEditorStore.js:1105](src/renderer/editor/stores/useEditorStore.js:1105) (\_doSilentSave). Touches save + render paths — verify carefully.
2. **Extract `ClipNavigator`** (130 LOC) out of [EditorLayout.js:73-203](src/renderer/editor/components/EditorLayout.js:73) into its own file. Self-contained, safe.
3. **Collapse FFmpeg IPC try/catch boilerplate** — 9 handlers in main.js share identical `try { ... } catch { return { error } }` pattern. ~18 LOC saved via one `wrapFfmpeg` helper.
4. **Rename `XxxPanelNew.js` → `XxxPanel.js`** — four files. Signals a finished migration; no old versions remain.

**Unrelated to cleanup:** the Lever 1 multi-signal pipeline spec from session 20 is still queued for Opus 4.7 review + implementation. That was parked, not abandoned. See the previous HANDOFF entries in git history for the full context, or read [specs/lever-1-signal-extraction-v1.md](specs/lever-1-signal-extraction-v1.md).

---

## Watch Out For

- **User reported "app beginning to run a bit slow"** mid-session. Likely unrelated to this cleanup (pure deletions + moves can't affect runtime), but flagging it here — if performance feels off in the next session, worth a proper profile pass. Possible culprits to check first: dev/build running in background, Sentry session replay overhead, preview-frame generation at startup (seen in logs), DB size at `data/clipflow.db`.
- **Stable fallback exists** — if any regression surfaces that the smoke tests missed, `git checkout stable-2026-04-20-pre-cleanup` returns to the exact pre-cleanup state. Prefer this over manually hunting through the cleanup commits.
- **Tier 3 has higher risk than 1+2** — especially the subtitle/caption style builder extraction. Those paths drive both live rendering AND saved-clip persistence; a subtle field mismatch would desync the two. Not a blocker, but don't batch it with other work.

---

## Logs / Debugging

- **Electron log file:** `%APPDATA%\clipflow\logs\app.log` (resolved via `getLogsDir()` in [src/main/logger.js:44](src/main/logger.js:44))
- **Session smoke tests** in this session confirmed:
  - `App started` logged cleanly (version, electron version, platform, logsDir)
  - `(database)` initialized at `data/clipflow.db` (schema v4)
  - `(migration)` file migration already complete — skipping
  - `(preview)` generating preview frames for existing recordings at boot — normal background work
  - Zero errors, zero stack traces on either Tier 1 or Tier 2 boot
- **Vite build** — 2728 modules transformed, bundle size unchanged between Tier 1 and Tier 2 (~1858 kB before gzip, ~543 kB gzipped). Pre-existing 500 kB chunk warning is unrelated to this session.
- **Background process cleanup** — if Electron smoke tests leave stale processes, `taskkill //IM electron.exe //F` from git-bash kills them all.
