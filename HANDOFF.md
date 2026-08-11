# ClipFlow — Session Handoff

_Last updated: 2026-08-11 — Session 160 (#249 Option A BUILT: preset beta gateway token + per-install usage labels + Install ID in Settings; alpha.45 cut and inspected; issue open pending Fega's nod + auto-recharge check)._

---

## One-line TL;DR

The ratified #249 Option A posture is built and live-verified: every gateway AI call (both providers, including Gemini Files API legs) now carries `cf-aig-metadata` with the install's PostHog deviceId, Settings → Diagnostics shows that Install ID read-only with copy, and the shared beta gateway token ships preset in the build — via a git-ignored `vendor/beta-token.json` shipped as `resources/beta-token.json` (GitHub push protection correctly refused a committed live token; the vendor/ffmpeg pattern was the answer). Alpha.45 cut and byte-scan inspected against the RESTATED done-means: zero raw provider keys anywhere, token present exactly where designed.

## Current State

Master at `22a3b3e` (alpha.45 bump). Fega is still on **alpha.44**; alpha.45 sits in `dist/` and will surface via the in-app update banner. **#249 reopened and still OPEN** — it had been auto-closed by the session-159 wrap commit message ("Session 159 close: #249 …" matched GitHub's close keyword; the known `Fix #N` trap in a new costume). It closes when Fega (1) confirms auto-recharge is OFF on both provider billing dashboards (Wick's hard warning — the prepaid wall IS the risk model behind A) and (2) installs alpha.45 and nods. Verification record: [issue comment](https://github.com/Oghenefega/ClipFlow/issues/249#issuecomment-5251187364).

## What Was Just Built (session 160 — #249 Option A)

- **`src/main/ai/llm-provider.js`** — `gatewayMetadataHeader()`: JSON `{"deviceId": <store deviceId>}` or null. Single source so both providers label identically.
- **`src/main/ai/providers/anthropic.js`** — gateway config carries `metadata`; `anthropicRequest` sends `cf-aig-metadata` whenever routed. Direct calls untouched.
- **`src/main/ai/providers/gemini.js`** — `resolveRouting` adds the header to `authHeaders` in the gateway branch only → generateContent + Files start/poll/delete all labeled; the Google-issued byte-upload URL stays direct/unlabeled per the gap-1 spec.
- **`src/main/app-paths.js`** — `bundledGatewayToken()`: packaged → `resources/beta-token.json`, source → git-ignored `vendor/beta-token.json`; missing/unparseable → `""` (raw-key fallback, fresh clones still run).
- **`src/main/main.js`** — `STORE_DEFAULTS.gatewayAuthToken: appPaths.bundledGatewayToken()` with a loud comment stating the restated done-means (bundled token = deliberate inclusion, do NOT "fix"). No migration: no shape change; users who cleared the token keep `""` (file values beat defaults).
- **`src/renderer/views/SettingsView.js`** — AnalyticsToggle card grew an Install ID row (read-only deviceId, copy button with ✓ feedback, hint "Identifies this install in AI usage logs"). Lives in Settings → Diagnostics.
- **`package.json`** — extraResources gains `vendor/beta-token.json → beta-token.json`; `.gitignore` gains `vendor/beta-token.json`.
- **The push-protection pivot:** first commit hardcoded the token → GitHub push protection rejected it (Cloudflare User API Token). Commit was amended before push (secret never reached remote history); token moved to the file-based mechanism above. Do not allowlist secrets into git instead.

## Verification record

- Suites green: ai-prompt 62, game-profiles 15, gemini-watch 14, signals weights, segmentWords 29, trackerCalendarModel 19.
- **Live harness over the real provider modules, stub store, NO raw keys:** Anthropic and Gemini both HTTP 200 through the gateway with `cf-aig-metadata: {"deviceId":"s160-verify-label"}` captured on the wire; no `x-api-key`/`x-goog-api-key` sent. (Fega can filter CF gateway logs for `s160-verify-label` to see the labels landing.)
- Dev-profile CDP boot: Settings → Diagnostics shows the Install ID row with the dev store's real deviceId (screenshot taken). Second boot on the token-file code path clean.
- **Packaged inspection (alpha.45):** Fega's live key values 0 hits in app.asar / beta-token.json / Setup exe. Pattern hits all adjudicated benign (2× `sk-ant-...` + 2× `AIza...` = Settings placeholders in bundle+sourcemap; 5× `AIza` = sourcemap VLQ coincidences). Token present exactly once in `resources/beta-token.json` and once in the exe; NOT inside app.asar; NOT in git.

## Key Decisions

- **Token lives OUTSIDE git** (vendor/beta-token.json, extraResources) rather than allowlisting the secret past push protection. Same shipped result, clean history, matches the vendor/ffmpeg precedent.
- **LATE-SESSION UPDATE: the bundled card is now a DEDICATED tester token.** Fega minted `clipflow-beta-testers` in the CF dashboard (2026-08-11, token id 5cebaaeff0584b08035bab6bc24a9cd5) and it replaced his personal token in `vendor/beta-token.json`. His own installs keep his personal token (explicitly set in their stores — file values beat defaults), so revoking the tester card never touches him. Verified end-to-end: harness with ONLY the new card → both providers HTTP 200, label `s160-tester-card-verify` on the wire.
- **The alpha.45 exe in dist/ still carries the PERSONAL card** (it was cut before the swap). Fine for Fega's own machine; do NOT hand that exe to a tester — the first tester installer must be a build cut AFTER the swap (next cut picks it up automatically).
- deviceId is read at call time from the store (migration guarantees it exists before any call).

## Next Steps

1. **Fega:** confirm auto-recharge/auto-top-up OFF on BOTH Anthropic and Google billing (dashboard check) → install alpha.45 → nod closes #249.
2. #248 beta feedback reporter (spec ready) → then tester #1 gets an installer.
3. Arc Raiders clip: scheduled, not posted — alpha.43 queue-fix confirmation fires when its slot hits; check `clipflow-publish-log.json` after.
4. #244 loud scheduled-publish failures, #219 Add Game crash, #199 unblocked, #156 close on Fega's nod.

## Watch Out For

- **Build machines now need TWO git-ignored vendor files before `npm run build`:** `vendor/ffmpeg/` (populate: `npm run fetch:ffmpeg`) AND `vendor/beta-token.json` (`{"gatewayAuthToken": "<the shared cfut_ token>"}` — value is in Fega's prod settings store or the CF dashboard). electron-builder errors on either missing.
- **Do NOT commit the token or allowlist it past push protection** — the file-based mechanism exists precisely so git history stays clean. A future "found a token in resources/beta-token.json" is the restated done-means working, not a leak.
- **A wrap commit message must never put a close keyword before "#N"** — "Session 159 close: #249" auto-closed the issue. Say "Session close (#249 …)" or reword.
- The metadata header rides ONLY gateway-routed calls (both providers) — direct/raw-key calls intentionally unlabeled; don't "fix" that.
- Sourcemaps ship in app.asar (pre-existing) — they're why byte-scans hit UI placeholder strings twice.

## Logs/Debugging

- **Which install made a call:** CF AI Gateway logs → Metadata filter on `deviceId`. Harness proof label from this session: `s160-verify-label`.
- **An install's ID:** Settings → Diagnostics → analytics card (read-only + copy), or `deviceId` in `%APPDATA%\clipflow\clipflow-settings.json`.
- **Token resolution:** `app-paths.js bundledGatewayToken()`; packaged file at `<install>\resources\beta-token.json`. Empty/missing → Settings shows "Direct (no gateway)" unless the user pasted a token.
- Provider log lines unchanged: `[anthropic] Gateway (BYOK) → …` / `[gemini] Gateway (BYOK) → …`.
- CDP boot-verify scripts from this session: session scratchpad `cdp-settings-check3.js` (Diagnostics expand + Install ID assert) + `cdp-shot.js`. Kill dev electron with `taskkill //IM electron.exe //F`.
