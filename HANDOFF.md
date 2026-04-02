# ClipFlow — Session Handoff
_Last updated: 2026-04-01 (Sentry + PostHog analytics infrastructure)_

## Current State
App builds and launches with Sentry error tracking and PostHog product analytics both active. All existing features (folders, rename, recordings, editor, queue, publishing) working and verified.

## What Was Just Built

### Sentry Error Tracking (@sentry/electron v7.10.0)
- `Sentry.init()` at top of `src/main/main.js` (before all other code) — captures main process crashes
- `Sentry.init()` in `src/index.js` (before React mounts) — captures renderer errors
- `AppErrorBoundary` wrapping entire app in `src/index.js` — catches React tree errors, reports to Sentry, shows reload button
- `EditorErrorBoundary` wired to `Sentry.captureException()` — editor crashes now report remotely
- Removed `electronLog.errorHandler.startCatching()` from logger.js — Sentry owns crash capture, electron-log remains local file logger
- Sentry preload module wrapped in try/catch after it crashed the entire preload bridge (see Watch Out For)

### PostHog Product Analytics (posthog-js)
- Initialized in `src/index.js` with `autocapture: false`, `capture_pageview: false`
- Stable device ID generated via electron-store UUID on first launch, used with `posthog.identify()`
- 7 events tracked (all prefixed `clipflow_`):
  - `clipflow_tab_changed` (property: `tab_name`) — App.js nav()
  - `clipflow_pipeline_started` — UploadView handleGenerate()
  - `clipflow_pipeline_completed` (property: `clip_count`) — UploadView success handler
  - `clipflow_pipeline_failed` — UploadView error handler
  - `clipflow_clip_approved` — ProjectsView handleDecision() (guarded on resulting state, not toggle-off)
  - `clipflow_clip_rejected` — ProjectsView handleDecision() (same guard)
  - `clipflow_publish_triggered` — QueueView publishClip()
- Opt-out toggle in Settings > Diagnostics: "Send anonymous usage data" with toggle switch, persists to electron-store, calls `posthog.opt_out_capturing()` / `posthog.opt_in_capturing()`
- `posthog.shutdown()` called on `beforeunload` to flush event queue before quit

### Council Reviews
- Two full LLM Council sessions (5 advisors + 5 peer reviews + chairman synthesis each)
- Reports saved: `reference/council-report-2026-04-01-sentry.html`, `reference/council-report-2026-04-01-posthog.html`
- Full transcripts: `reference/council-transcript-2026-04-01-sentry.md`, `reference/council-transcript-2026-04-01-posthog.md`

## Key Decisions
- **Dual system (Sentry + electron-log):** Sentry = remote crash intelligence. electron-log = local file-based diagnostics. They coexist independently, serve different purposes. Don't merge them.
- **No manual process.on handlers:** @sentry/electron hooks uncaughtException and unhandledRejection automatically. Manual handlers would double-report or swallow errors.
- **PostHog in index.js, not App.js:** Init outside React tree avoids React 18 strict mode double-mount issues and guarantees PostHog is ready before any component renders.
- **clipflow_ event prefix:** Prevents namespace collisions with PostHog autocapture defaults and any future analytics consolidation.
- **Approve/reject guard on resulting state:** `handleDecision` toggles — clicking "approve" on an already-approved clip sets status to "none". Events only fire when the resulting state is actually "approved" or "rejected", not on toggle-off.

## Next Steps
1. **Sentry backlog (see memory: project_sentry_backlog.md):** 7 deferred items — GDPR opt-in toggle (#1) and source maps (#7) are hard blockers before public launch
2. **Preview template styling** — `_buildAllShadows()` in ProjectsView still simpler than editor's `buildAllShadows()` (carried from prior session)
3. **Subtitle segmentation spec update** — needs Rule 7 (comma flush), Rule 8 (atomic phrases), and linger duration (carried from prior session)
4. **Video splitting phases 3-5** — phases 1-2 complete (steps 1-14), remaining: Phase 3 (split UI in recordings view), Phase 4 (post-split pipeline), Phase 5 (polish)

## Watch Out For
- **Preload script is FATAL territory:** Any uncaught error in `preload.js` kills the entire IPC bridge — `window.clipflow` becomes `undefined` and the app loads as an empty shell. The `@sentry/electron/preload` require crashed the preload this session. It's now wrapped in try/catch. NEVER add bare `require()` calls to preload.js without try/catch. After ANY preload.js change, open DevTools and check for red errors.
- **Sentry preload fallback:** The Sentry preload IPC bridge isn't loading (module resolution fails in preload context). Sentry falls back to protocol mode automatically, which works fine. Not a blocking issue but renderer errors may have slightly different transport path than expected.
- **PostHog offline behavior:** posthog-js has no persistent offline queue in Electron. Events during offline periods may be lost. Acceptable for now, flagged in Sentry backlog for pre-launch verification.
- **Three render sites for ProjectsListView in App.js** — lines ~563, ~574 (fallback), and ~596 (main path). ALL three must receive folder props. (Carried from prior session.)

## Logs / Debugging
- Sentry events confirmed received in dashboard (tested with `captureMessage` in both processes)
- PostHog events confirmed received (verified `clipflow_tab_changed` via PostHog verification flow)
- electron-log still writes to `%APPDATA%/ClipFlow/logs/app.log` — use `console.warn` (level 2+) for debug logging visible in terminal, or open DevTools
- Preload failures only surface in renderer DevTools console, NOT in terminal output — always check DevTools after preload.js changes
