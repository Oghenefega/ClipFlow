# HANDOFF — Session 249 (2026-09-10)

## Current State

**alpha.33 is installed and running on Fega's desktop** (log: "App started 0.4.0-alpha.33", What's New
acknowledged). It carries the Analytics tab (#387, epic #386) and the s248 palette lift. Master is at
`edc1697`, clean. **Analytics is blocked on the Meta reconnect:** Fega disconnected Instagram and
Facebook (both gone from `clipflow-tokens.json`, only TikTok + YouTube remain) and every fresh
connect died in the browser. Until they reconnect, the Instagram and Facebook tiles print
"No … account connected" and the Tracker/Queue cannot publish to either platform — that is the
more urgent consequence, and it is the next session's first job.

## Key Decisions

- **Root cause of the reconnect failure is on the Meta dashboard, not in the app.** Facebook
  showed "Can't load URL — the domain of this URL isn't included in the app's domains". The app's
  return address is `http://localhost:8083/callback` (unchanged, `meta.js:35-36`); Graph reports
  `app_domains: ["flowve.app"]` only. Facebook accepts a localhost return address ONLY while the
  app is in Development mode, so the Corva Meta app (id 713765408423963) is almost certainly in
  **Live** mode now. Proposed fix, awaiting Fega: flip App Mode → Development, then reconnect. If
  it must stay Live, the fix is an https return page on flowve.app (a real piece of work, plan it).
  Not yet known: why/when it went Live — ask before flipping.
- **The insight scopes may also need adding on the dashboard** (Use cases → Customize →
  `read_insights`, `pages_manage_engagement`, `instagram_manage_insights`). Unverified — the
  dialog never got past the domain error, so nothing about scopes has been observed yet.
- Design decisions for Analytics v1 are recorded in #386/#387 and the s249 CHANGELOG entry
  (new tab not merged into Tracker; TikTok "—" until #388; `title_caption_rounds.views` stays
  YouTube-only; Facebook queries the VIDEO id from the `/reel/` url; per-row freshness).

## Next Steps

1. **Unblock Instagram + Facebook** (Fega's accounts, in this order): confirm the Meta app mode,
   flip to Development if Live, run "+ Facebook Page" then "+ Instagram" one at a time, finishing
   each in the browser ("Continue" on the account-switch screen is correct — the gaming Page is
   picked on the next screen). Then Analytics → Refresh; expect ~167 IG / ~167 FB rows. If the
   dialog rejects scopes, add the three permissions on the dashboard and retry.
2. Once IG/FB numbers land: spot-check two clips against the platform apps; watch the IG `views`
   metric (Meta marks it "in development" — the tile prints Meta's error verbatim if it fails).
3. Next installer batch carries `edc1697` (both Meta buttons off while either flow waits, plain
   port-clash message, 5-minute window). Not worth its own cut.
4. Carried: #383 confirmation, #384, #385, the s247 interfaces-audit follow-ups.

## Watch Out For

- **Both Meta flows share callback port 8083.** Before `edc1697` a second click during a pending
  flow produced `EADDRINUSE` alerts (eleven in four minutes in the s249 log). The installed
  alpha.33 still has that behaviour — one button at a time until the next cut.
- **A dormant OAuth flow is an unverified flow.** The Meta connect had not run since the accounts
  were first connected; the chip was verified to render, the flow was not verified to complete,
  and the dashboard had changed underneath it. Probe `GET /{app-id}?fields=app_domains` with the
  app token (`appId|appSecret` from `clipflow-settings.json`) before telling Fega to reconnect.
- **`accountToPlatformKey` import removed from main.js**; `analytics.js` imports it itself.
  `titleCaptionViewsRefreshedAt` stays in `STORE_DEFAULTS`, nothing writes it now.
- **`analytics.init({ store, preflightAccount })` runs right before the boot timer**;
  `refreshAllViews` before init throws on `store.get` — nothing does today. A manual Refresh
  during the boot pull joins the running promise.
- **Dev profile `projectsRoot` is the REAL projects folder** (unchanged). Dev tokens are
  `{"accounts":{}}` (restored after the stand-in-account check) — confirm before any dev boot.
- **`.claude/rules/ui-standards.md` still says four themes; `cyan` still a dead token.** Untouched.

## Logs / Debugging

- Meta connect attempts: `%APPDATA%\Corva\logs\app.log`, scope `(meta)` — "Opening system browser
  for auth" with no "Got auth code" within the window = the browser step never returned.
- Refresh result per platform: same log, scope `(analytics)`, line
  `View refresh {"youtube":{updated,skipped,failed,error?},…}`.
- Table check (sql.js): `SELECT platform, COUNT(*), SUM(views IS NULL), MAX(fetched_at) FROM
  clip_metrics GROUP BY platform` on `%APPDATA%\Corva\data\clipflow.db`; and `SELECT COUNT(*)
  FROM title_caption_rounds WHERE views IS NOT NULL` (159 before s249; must not drop).
- Real-token probe without touching the daily driver: memory `project_safestorage_probe`.
- CDP loop: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion`, then
  `scripts/dev/cdp.js "<expr>"`, `cdp-shot.js out.png`. Eight bottom tabs now — click by text.
  Settings sections open via the rail (`span` text "Publishing" → `.closest('button').click()`).
- Kill with `taskkill //F //IM electron.exe` (never Corva.exe — that is the daily driver).
