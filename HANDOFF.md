# ClipFlow — Session Handoff
_Last updated: 2026-04-02 (AI state persistence, gateway auth fix, settings UX)_

## Current State
App builds and launches cleanly — Cloudflare AI Gateway working end-to-end in both BYOK and passthrough modes, AI title/caption generation confirmed functional, all existing features intact.

## What Was Just Built

### Bug Fixes
- **AI title/caption persistence between clips:** `useAIStore` was not being reset when switching clips in the editor. Added `useAIStore.getState().reset()` to `initFromContext()` in `useEditorStore.js` so generated titles, captions, rejections, and accepted indices clear on clip switch.
- **Cloudflare AI Gateway 2009 Unauthorized:** Root cause was a truncated account ID in the default gateway URL — 29 chars instead of 32 (missing `ef9` segment). Fixed in `main.js` store defaults.

### Enhancements
- **Three gateway routing modes:** Refactored `anthropicRequest()` to support: (1) BYOK — `cf-aig-authorization` only, no `x-api-key`, Cloudflare injects API key server-side; (2) Passthrough — `x-api-key` through gateway URL for logging/analytics without BYOK; (3) Direct — `x-api-key` straight to `api.anthropic.com`. Mode is determined by which fields are configured (URL only = passthrough, URL + token = BYOK, neither = direct).
- **BYOK-only support:** `chat()` no longer requires a local Anthropic API key when gateway auth token is configured.
- **Gateway error detection:** Cloudflare returns errors as JSON arrays (`[{"code":2009,"message":"Unauthorized"}]`), not objects with `.error`. Added array-format detection with proper error messages and logging.
- **HTTP status code logging:** All Anthropic responses now log HTTP status codes for debugging.
- **Settings section collapse persistence:** Lifted `collapsedGroups` state from `SettingsView` to `App.js`. All sections start collapsed on fresh launch but remember expanded/collapsed state when navigating between tabs within the same session.

## Key Decisions
- **Gateway URL presence = routing (not token presence):** Previously, both URL and auth token were required to activate gateway routing. Now URL alone is sufficient (passthrough mode). This gives users Cloudflare logging/analytics even without BYOK auth.
- **All settings sections collapsed by default:** Cleaner first impression. Users expand what they need, and it stays open for the session.
- **No `x-api-key` in BYOK mode:** Per Cloudflare docs, sending both `x-api-key` and `cf-aig-authorization` causes auth conflicts. In BYOK mode, only `cf-aig-authorization` is sent.

## Next Steps
1. **Sentry backlog (see memory: project_sentry_backlog.md):** 7 deferred items — GDPR opt-in toggle (#1) and source maps (#7) are hard blockers before public launch
2. **Security hardening pass** — safeStorage encryption for ALL credentials in electron-store (Anthropic key, gateway token, YouTube/Meta/TikTok/Instagram secrets), renderer-side token isolation
3. **Preview template styling** — `_buildAllShadows()` in ProjectsView still simpler than editor's `buildAllShadows()`
4. **Subtitle segmentation spec update** — needs Rule 7 (comma flush), Rule 8 (atomic phrases), and linger duration
5. **Video splitting phases 3-5** — phases 1-2 complete, remaining: Phase 3 (split UI), Phase 4 (post-split pipeline), Phase 5 (polish)

## Watch Out For
- **Gateway URL format:** Stored URL is the base (e.g. `.../anthropic`), and `/v1/messages` is appended in code. If someone pastes a URL that already includes `/v1/messages`, it will double up. Placeholder text in edit mode shows the expected format.
- **`cf-aig-authorization` header name:** Looks like a typo but it's the real Cloudflare header name. There's a doc-link comment in the code — don't "fix" it.
- **`useAIStore` import cycle:** `useEditorStore` imports `useAIStore` lazily via `require()` to avoid circular dependency. The reset call in `initFromContext()` and the `setAiGame` call both use this pattern.
- **Preload script is FATAL territory:** Any uncaught error in preload.js kills the IPC bridge. Never add bare `require()` calls without try/catch.
- **Three render sites for ProjectsListView in App.js:** lines ~563, ~574, ~596 — all must receive folder props.

## Logs / Debugging
- Gateway routing mode logged on every request: `[anthropic] Direct → ...`, `[anthropic] Gateway (BYOK) → ...`, or `[anthropic] Gateway (passthrough) → ...`
- HTTP status codes logged: `[anthropic] Response: HTTP <code> (<bytes> bytes)`
- Cloudflare array errors detected and logged: `[anthropic] Gateway error: HTTP <code> — [{"code":...}]`
- electron-log writes to `%APPDATA%/ClipFlow/logs/app.log`
- Preload failures only surface in renderer DevTools console, NOT in terminal output
