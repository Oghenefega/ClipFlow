# ClipFlow — Session Handoff
_Last updated: 2026-04-01 (Cloudflare AI Gateway proxy support)_

## Current State
App builds and launches with Cloudflare AI Gateway proxy support wired into the Anthropic provider — all existing features working, gateway routes conditionally when auth token is configured.

## What Was Just Built

### Cloudflare AI Gateway Proxy Support
- Refactored `anthropicRequest()` in `src/main/ai/providers/anthropic.js` from positional args to options object: `anthropicRequest(apiKey, body, { timeout, gateway })`
- When `gatewayAuthToken` is set in electron-store, all Anthropic API calls route through the configured gateway URL with `cf-aig-authorization: Bearer <token>` header
- When `gatewayAuthToken` is empty, calls go direct to `api.anthropic.com` as before — zero behavior change for unconfigured installs
- Gateway URL stored in electron-store under `gatewayUrl` with default: `https://gateway.ai.cloudflare.com/v1/58332e30c2b9de6c53d37ee9fd3dc/clipflow-prod/anthropic`
- URL normalization: trailing slashes stripped before path construction
- Logging: every request logs `[anthropic] Direct → api.anthropic.com/v1/messages` or `[anthropic] Gateway → gateway.ai.cloudflare.com/...`
- Invalid gateway URLs caught and logged, falling back to direct
- Doc-link comment on `cf-aig-authorization` header pointing to Cloudflare docs

### Settings UI — Gateway Credentials
- New fields in Settings > API Credentials > Anthropic detail panel:
  - **Edit mode:** Gateway URL (text input, prefilled with default), Gateway Auth Token (password input with show/hide toggle)
  - **Display mode:** "Gateway" row showing masked token (first 4 + last 4 chars) or "Direct (no gateway)" when empty, with show/hide/copy buttons
  - **Status row:** Shows "Gateway active" in green when token is configured, alongside existing "Configured" API key status
- URL trailing slashes stripped on save
- All fields persist via existing `useEffect` → `persist()` → electron-store pattern

### LLM Council Review
- Full 5-advisor council session reviewing the implementation plan
- Council recommended 5 modifications; 2 adopted (options object, URL normalization), 3 deferred to a future security hardening pass (safeStorage encryption, renderer-side token isolation, gatewayEnabled boolean)
- Reports saved: `reference/council-report-2026-04-01-gateway.html`, `reference/council-transcript-2026-04-01-gateway.md`

## Key Decisions
- **Options object over positional args:** Council unanimously recommended this. `anthropicRequest(apiKey, body, { timeout, gateway })` instead of a 4th positional parameter. Cleaner, extensible, less error-prone.
- **Token presence = gateway switch (no boolean):** Council suggested `gatewayEnabled` boolean. Rejected — adding a toggle creates three things to sync (boolean + token + URL) and worse UX. Token set = gateway, token empty = direct. Simple, clear.
- **No safeStorage encryption in this change:** The existing Anthropic API key and all OAuth secrets are already plaintext in electron-store. Encrypting just the gateway token would be inconsistent. This is a valid concern but belongs in a dedicated security hardening pass that encrypts ALL credentials at once.
- **Token flows through renderer (same as all other credentials):** Council flagged renderer exposure but every other credential in the app follows this pattern. Changing it for one token would be inconsistent. Future security pass should address all credentials uniformly.

## Next Steps
1. **Test gateway end-to-end** — Set the gateway auth token in Settings and trigger an AI generation to confirm requests route through Cloudflare successfully
2. **Sentry backlog (see memory: project_sentry_backlog.md):** 7 deferred items — GDPR opt-in toggle (#1) and source maps (#7) are hard blockers before public launch
3. **Security hardening pass** — safeStorage encryption for ALL credentials in electron-store (Anthropic key, gateway token, YouTube/Meta/TikTok/Instagram secrets), renderer-side token isolation
4. **Preview template styling** — `_buildAllShadows()` in ProjectsView still simpler than editor's `buildAllShadows()`
5. **Subtitle segmentation spec update** — needs Rule 7 (comma flush), Rule 8 (atomic phrases), and linger duration
6. **Video splitting phases 3-5** — phases 1-2 complete, remaining: Phase 3 (split UI), Phase 4 (post-split pipeline), Phase 5 (polish)

## Watch Out For
- **Gateway URL format:** The stored URL is the base (e.g. `.../anthropic`), and `/v1/messages` is appended in code. If someone pastes a URL that already includes `/v1/messages`, it will double up. The placeholder text in edit mode shows the expected format.
- **`cf-aig-authorization` header name:** Looks like a typo but it's the real Cloudflare header name. There's a doc-link comment in the code — don't "fix" it.
- **Empty auth headers:** The header is only added when `gateway.authToken` is truthy. Some proxies choke on empty auth headers, so this is intentional.
- **Preload script is FATAL territory** (carried from prior session): Any uncaught error in preload.js kills the IPC bridge. Never add bare `require()` calls without try/catch.
- **Three render sites for ProjectsListView in App.js** (carried): lines ~563, ~574, ~596 — all must receive folder props.

## Logs / Debugging
- Every Anthropic API request now logs its routing path: `[anthropic] Direct → ...` or `[anthropic] Gateway → ...` in electron-log
- Invalid gateway URLs log a warning: `[anthropic] Invalid gateway URL, falling back to direct: <url>`
- electron-log still writes to `%APPDATA%/ClipFlow/logs/app.log`
- Preload failures only surface in renderer DevTools console, NOT in terminal output
