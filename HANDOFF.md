# ClipFlow — Session Handoff
_Last updated: 2026-04-03 — "Blank Screen Root Cause + Fix"_

## Current State
App builds, launches, and no longer crashes when rapidly switching between tabs. The critical blank screen bug is resolved.

## What Was Just Built

### Blank Screen Fix — Chromium Renderer Crash (Root Cause)
- **Root cause identified via Sentry**: `blink::DOMDataStore::GetWrapper` — a FATAL Chromium-level crash (EXCEPTION_ACCESS_VIOLATION_READ / null pointer). Not a JavaScript error at all. Occurred 23 times in Sentry.
- **Cause**: Video `<video>` elements were being removed from the DOM (via React conditional rendering on tab switch) while Chromium's internal fetch stream was still reading the file. The detached ArrayBuffer caused a null pointer dereference in Blink's rendering engine.
- **Fix**: Added `useEffect` cleanup hooks in both video components that pause the video, remove the `src` attribute, and call `.load()` before unmount — this tells Chromium to abort the fetch stream cleanly.
  - `src/renderer/editor/components/PreviewPanelNew.js` — editor video player
  - `src/renderer/views/ProjectsView.js` — projects preview video player

### Defensive Hardening (Secondary Fixes)
- **`src/index.js`** — Added global `window.addEventListener("error/unhandledrejection")` handlers with DOM-level crash screen that bypasses React entirely. Added `.catch()` to PostHog analytics Promise.all.
- **`src/renderer/components/AppErrorBoundary.js`** — Made Sentry import lazy with try-catch so boundary can't cascade-crash. Changed to monospace font for reliability.
- **`src/renderer/views/ProjectsView.js`** — Added `ClipPreviewBoundary` error boundary wrapping `ClipVideoPlayer` — bad clip data shows "Preview error" with retry instead of crashing app.
- **`src/renderer/editor/components/PreviewOverlays.js`** — Guarded `currentSeg.text.split()` (line 264) against null/undefined text.
- **`src/renderer/editor/utils/templateUtils.js`** — Guarded `applyTemplate()` against malformed templates (`tpl.caption || {}`, `tpl.subtitle || {}`).
- **`src/renderer/App.js`** — Wrapped `posthog.capture` in try-catch in nav function.
- **`src/main/main.js`** — Added `render-process-gone`, `unresponsive`, `responsive` event handlers on webContents for crash detection and auto-reload.

### Sentry API Integration
- Personal API token saved at `C:\Users\IAmAbsolute\.claude\sentry_token.txt`
- Org: `flowve`, Project: `clipflow`
- Can query errors directly: `curl -H "Authorization: Bearer <token>" "https://sentry.io/api/0/projects/flowve/clipflow/issues/?query=is:unresolved&sort=date&limit=10"`

## Key Decisions
- **Video cleanup over tab persistence**: Chose to properly clean up video elements on unmount rather than keeping tabs mounted with CSS `display:none`. Cleanup is simpler, lower memory, and directly addresses the root cause.
- **DOM-level crash screen**: Added a `showCrashScreen()` function in index.js that writes directly to `#root.innerHTML` — completely independent of React. This ensures users always see an error message even if React is dead.
- **Kept all defensive fixes**: Even though the root cause was Chromium-level (not JS), the JS guards (error boundaries, null checks, global handlers) are valid improvements that prevent other potential crashes.

## Next Steps
1. **Navigation race condition** — When rapidly switching tabs while a project is loading (async IPC), the view can flash to wrong tab. `handleSelectProject` is async and can override a nav that happened during its await. Low priority but noticeable.
2. **Editor position persistence** — Drag positions revert on reopen (from previous session's HANDOFF). Fix `initFromContext` to restore saved positions after `applyTemplate()`.
3. **Tab flash on switch** — Brief 1-frame flash on Recordings/Rename tabs (unmount/remount pattern). Could use CSS `display:none` for these lightweight tabs.
4. **Sentry backlog** — 7 deferred items before launch.
5. **Other Sentry issues** — `TypeError: Lp.shutdown is not a function` (51 occurrences, PostHog shutdown issue), `SyntaxError: Identifier 'audioTrack' has already been declared` (old code issue).

## Watch Out For
- **Electron 28 / Chrome 120**: The Chromium crash is a known class of bug with video stream handling. If it recurs despite the fix, consider upgrading Electron.
- **Video cleanup pattern**: Any NEW video element added to the app MUST have the cleanup effect (pause + removeAttribute("src") + load() on unmount). Without it, the Chromium crash will return.
- **`handleSelectProject` is async**: It does IPC then sets state. Any rapid navigation during the await creates a race. A future fix should check if the user has navigated away before setting state.
- **PostHog `Lp.shutdown` error**: 51 occurrences in Sentry. The `beforeunload` handler calls `posthog.shutdown()` but it may not be a function in some states. Worth investigating.

## Logs / Debugging
- Build succeeds, app launches and runs stable
- Sentry org: `flowve`, project: `clipflow` — query via API with saved token
- The `blink::DOMDataStore::GetWrapper` crash (23 occurrences) should stop accumulating after this fix
- `render-process-gone` handler in main.js now logs to electron-log and auto-reloads on crash
- Global error handlers in index.js log `[Global]` prefix + render DOM crash screen
