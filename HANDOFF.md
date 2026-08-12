# ClipFlow — Session Handoff

_Last updated: 2026-08-12 — Session 163 (#244 BUILT + machine-verified: pre-flight token warnings, loud scheduled-publish failures, one-click retry. #163 folded in and closed. Next session: cut the tester installer)._

---

## One-line TL;DR

#244 shipped in one session exactly as Fega ratified it: the scheduler now pre-flight-checks accounts up to an hour before each scheduled slot (OS notification if a connection is dead), any scheduled-publish failure raises an OS notification + a persistent red banner (Review → Queue filtered to failed), and a "Retry all failed (N)" button recovers everything in one click after a reconnect. #163 rode along — dead-token errors now say "reconnect in Settings" instead of "Bad Request", and dead accounts get an amber "Needs reconnect" badge in Settings. Both issues closed `status: untested` (commit 3de83c5). Nothing new is in an installer yet.

## Current State

Master at session-163 commit. **Fega is still on alpha.45 (installed)** — neither #248 (pill) nor #244 (loud failures) is in his daily driver. Both ship with the next cut, which is **the tester installer** (next session's job).

## What Was Built (session 163 — #244 + #163, per the approved plan in tasks/todo.md)

- **`src/main/main.js`** — `system:notify` (generic OS toast, click focuses the window; `app.setAppUserModelId("com.clipflow.app")` added near the top for Windows), `publish:preflight` + `preflightAccount()` (YouTube/TikTok: the liveness probe IS the token refresh their publish would run; Meta/IG: refresh only near expiry, else no-op by design), #163 friendly errors + `setNeedsReconnect` in all four refresh blocks (YouTube, TikTok, IG business login, IG-via-Facebook — the Facebook handler has NO refresh block, page tokens don't expire that way), `scheduled` flag threaded into all four publish handlers' `logBase`.
- **`src/main/token-store.js`** — `needsReconnect` flag: `setNeedsReconnect()`, cleared inside `updateTokens()` on any successful refresh, auto-cleared by reconnect (saveAccount rebuilds the entry), exposed via `getAccountsForUI()`. New optional field, reads falsy-safe — no migration.
- **`src/main/preload.js`** — `systemNotify`, `publishPreflight` bridges.
- **`src/renderer/views/QueueView.js`** — scheduler tick gained: (a) the pre-flight sweep for clips due within 60 min (`preflightedRef` dedupes per account+slot — one warning per slot, no per-minute nagging); (b) loud-failure handling after each auto-fired `publishClip` (toast + `onScheduledPublishFailure` → App banner + `refreshOauthAccounts` so the Settings badge appears without a restart). `publishClip` gained `opts.scheduled` + returns `{ allSuccess, failures }` (this run's failures only — publishState holds older ones). `retryAllFailed` + "Retry all failed (N)" button in the filter bar. `focusFailedSignal` effect sets the Failed filter when the banner's Review is clicked.
- **`src/renderer/components/PublishFailureBanner.js`** (NEW) — persistent app-level banner, DependencyBanner's visual pattern. Review = acknowledge (dismisses + jumps to Queue/Failed).
- **`src/renderer/App.js`** — banner state + render (after DependencyBanner), oauth-account fetch/merge extracted into `refreshOauthAccounts()` (used at load AND passed to QueueView for live badge refresh), three new QueueView props.
- **`src/renderer/views/SettingsView.js`** — amber "Needs reconnect" badge + border + yellow dot on flagged accounts; all four connect-flow merges force `needsReconnect: false` (the connect handlers' return shape doesn't carry the flag).

## Verification record (machine-verified; Fega's look happens on the tester build)

- Dev profile, fabricated dead YouTube account (garbage refresh token DPAPI-encrypted into the dev token store, prod's client id/secret copied into dev settings temporarily) → **real `invalid_grant` from Google** through BOTH paths: the tick's automatic pre-flight sweep (app log: `(preflight) > YouTube pre-flight refresh failed {"error":"invalid_grant"}`) and the scheduled publish itself (publish log: friendly #163 error + `scheduled: true`).
- 15/15 CDP assertions: banner (text names clip + platform), Review → banner gone + Failed filter on + failed card visible, #163 error text on the card, Retry all failed (1) present → clicked → still failed (token dead) → NO banner from the manual retry, `system:notify` returns ok, preflight IPC + `oauthGetAccounts` both carry `needsReconnect: true`, Settings badge renders (fresh-boot state too).
- Two of the original "failures" were probe bugs, not code bugs: the scheduled clip's title was matching in the always-mounted-but-hidden Tracker pane (filter works — scope probes to visible panes), and the Settings badge lives inside the collapsed PUBLISHING group (expand before probing).
- **Everything restored**: dev settings + tokens byte-identical from backup, scratch projectsRoot fixture deleted, CF244 publish-log entries scrubbed. Real project data was never touched (dev projectsRoot was pointed at a scratch folder for the whole test — both profiles share the real projectsRoot, session-141 lesson).
- **NOT verified**: the OS toast's visual appearance/branding (dev toasts attribute to Electron's identity; correct ClipFlow branding needs the installed exe's AppUserModelID — check on the tester build), and TikTok/Meta dead-token paths live (code-identical shape to YouTube's, which was proven).

## Key Decisions (session 163 — all ratified by Fega before build)

- Retry lives in the Queue only (no Settings-side retry prompt).
- Notifications on failures only — no success pings.
- #163 folded in rather than left open.
- Meta/IG pre-flight is intentionally a near-no-op (long-lived tokens, refresh near expiry only); their failures are caught loudly at post time by layer 2.
- Manual publishes never raise the banner/toast — the user is watching those; the #248 pill pulse still covers them.

## Next Steps

1. **Cut the tester installer** (`clipflow-update-launcher` skill) — bundles #248 + #244 + the already-aboard #219 fix. Needs the TWO git-ignored vendor files (`vendor/ffmpeg/`, `vendor/beta-token.json`) present before `npm run build`. After install: Fega runs #248's 6-step script (spec bottom), the 10-second #219 Rename-tab check, and #244 gets its live shakedown at the next scheduled slot / weekly YouTube death.
2. **#250** (beta distribution / auto-update) once tester #1 has that build.
3. Carry-overs: Arc Raiders scheduled clip publish-log tail (Aug 8 "Video file not found" failures with a title/path mismatch — Queue territory); #156 close on Fega's nod.

## Watch Out For

- **`safeStorage` is per-profile** — its key hides in the profile's "Local State". Any script seeding tokens must `app.setPath("userData", …clipflow-dev)` BEFORE `app.whenReady()`, or the app decrypts seeded values to `""` (cost one full verification round).
- **The pre-flight sweep runs inside the scheduler tick on EVERY tab** (QueueView is always mounted). It only touches accounts of clips scheduled within 60 min, and `preflightedRef` dedupes per account+slot — don't add anything to the tick that runs unconditionally per minute.
- **TikTok pre-flight refresh ROTATES the refresh token** (stored via `updateTokens`) — that's fine for the app's own store, but never point a test at a token store that shares refresh tokens with prod (rotation invalidates prod's copy).
- **`publishClip`'s early returns now return `{ allSuccess, failures }`** — the busy-guard path still returns `undefined` (unreachable from the scheduler, which checks `publishingRef` first). Callers must handle both.
- The banner's Review = acknowledged (dismisses). A retry that fails AGAIN raises no new banner (manual path) — the queue card + pill pulse carry it from there.
- Wrap commits: never put a close keyword before "#N" (session-159 incident) — this session's issues were closed via `gh issue close`, deliberately.

## Logs/Debugging

- **Publish results:** `%APPDATA%\clipflow\clipflow-publish-log.json` (prod) / `clipflow-dev` (dev). Scheduled attempts now carry `"scheduled": true`. A dead token logs `"<Platform> connection expired — reconnect the account in Settings, then retry."`
- **Pre-flight activity:** app log, scope `(preflight)` — warns with accountId + raw error on every failed probe. No log line = the sweep found nothing due within the hour (or accounts already checked for that slot).
- **needsReconnect flag:** `%APPDATA%\clipflow[-dev]\clipflow-tokens.json` → `accounts.<id>.needsReconnect`. Cleared by successful refresh (`updateTokens`) or reconnect.
- **Feedback reports in Sentry:** project `flowve/clipflow` → User Feedback; token at `C:\Users\IAmAbsolute\.claude\sentry_token.txt` (org `flowve`). The two session-162 test reports ("please ignore") are safe to delete.
- **Bubble state:** `feedbackBubble` key in `clipflow-settings.json`; delete to reset.
