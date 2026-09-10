# HANDOFF — Session 249 (2026-09-10)

## Current State

**Analytics v1 (#387, epic #386) is built, verified on the dev profile, and committed. No installer
cut.** alpha.32 is still the installed build; the palette lift (s248) and the Analytics tab both
ride with the next cut. Fega has confirmed nothing this session — #383 stays `status: untested`.

What landed: a new Analytics tab (between Tracker and Settings) with per-platform view counts for
every published clip, a `clip_metrics` table (migration v10), `src/main/analytics.js` replacing
the old YouTube-only `refreshYoutubeViews`, Meta insight fetchers in
`src/main/oauth/meta-insights.js`, the pure target/freshness/scope logic in
`src/main/analytics-core.js` (13 jest tests), new OAuth scopes in `meta.js`, and a "Reconnect for
views" chip on the IG/FB Settings cards. Full spec and done-criteria are in #387.

Verified: `npm test` 439/439; migration v10 ran on the dev DB; the boot pull fired 30 s after
launch and the manual Refresh works (dev log shows the per-platform result object); Analytics on
Midnight and Sunset at 1280×860; the Settings chip rendered against two stand-in accounts
(dev tokens restored to `{"accounts":{}}` afterwards). A read-only probe with the real prod tokens
confirmed 167 YT / 166 IG / 167 FB targets resolve and both Meta endpoints return exactly the
missing-permission error the reconnect fixes (IG `(#10)`, FB `(#200) read_insights permission
missing`). What is NOT verified: a real fetch after reconnect — that needs Fega on the installed
build.

## Key Decisions

- **New tab, not merged into Tracker.** Fega's pick from a one-line choice. Tracker = "did I post",
  Analytics = "what worked".
- **TikTok is "—" in v1 (#388).** Zero TikTok post ids in 170 publishes AND the read scope
  (`video.list`) needs the frozen dev app. Scraping the public page was offered and rejected.
- **`title_caption_rounds.views` stays YouTube-only.** The prompt ranks its examples by it; a
  cross-platform sum would inflate multi-platform clips and reshuffle the examples the day IG/FB
  permissions land. Revisit in #389 once IG/FB history is ≥ 30 days deep.
- **Facebook: query the VIDEO id, not the stored postId.** The tracker's FB `postId` is the Reels
  post id (0 of 166 match the url); `/reel/{id}` in the url is the video id, publish-log
  `publishId` is the fallback, bare postId = legacy upload. Prod split: 151 reels / 16 legacy.
- **Per-row freshness replaced the once-a-day store flag.** The flag lived in electron-store
  (shared by source and installed runs) while the table is per-build; now every boot runs the
  pull and stale rows decide. 24 h normally, 7 d once a clip is a month old.
- **Chip, not a badge.** "Reconnect for views" is an accent-coloured button on the account card
  (not the yellow "Needs reconnect" — publishing still works). It calls the existing connect
  handler; the connect return now carries `insightsScope: true` so the chip clears without a
  restart.

## Next Steps

1. **Cut the next installer** (alpha.33): palette lift + Analytics. What's New copy in app-user
   words: "New Analytics tab — see views per clip across YouTube, Instagram and Facebook. Reconnect
   Instagram and Facebook once in Settings to switch it on." Then Fega's checks from #387: the two
   reconnects, Refresh, ~168/167/166 rows, spot-check two clips against the platform apps.
2. **Watch the IG `views` metric** on the first real fetch — Meta's docs mark it "in development".
   A media that rejects the six-metric set is retried with `views` alone; if THAT fails the tile
   prints Meta's error text verbatim. Also watch whether the Meta app itself (dev portal) needs
   `instagram_manage_insights` / `read_insights` added to its use case — Fega is the app admin, so
   dev-mode grant should work, but the `(#10)` wording could also mean the app-level permission.
3. Mock review: `tasks/mocks/analytics-tab.html` was opened for Fega but not signed off before the
   build (autonomous session). The built tab matches it; if he wants changes, they're view-only.
4. Carried: #383 confirmation, #384, #385, the s247 interfaces-audit follow-ups.

## Watch Out For

- **`accountToPlatformKey` import was removed from main.js** (its only use was the deleted
  `refreshYoutubeViews`); `analytics.js` imports it itself. `titleCaptionViewsRefreshedAt` stays
  in `STORE_DEFAULTS` but nothing writes it now.
- **`analytics.init({ store, preflightAccount })` runs right before the boot timer** in the
  bootstrap block; `preflightAccount` is a hoisted declaration so the early reference is fine.
  Calling `refreshAllViews` before init throws on `store.get` — nothing does today.
- **A manual Refresh during the boot pull joins the running promise** (`running` guard) rather
  than firing a second batch.
- **Dev profile `projectsRoot` is the REAL projects folder** (unchanged). This session only viewed
  Analytics/Settings. Dev tokens are back to `{"accounts":{}}` — confirm before any dev boot.
- **`.claude/rules/ui-standards.md` still says four themes; `cyan` still a dead token.** Untouched.

## Logs / Debugging

- Refresh result per platform: `%APPDATA%\Corva\logs\app.log`, scope `(analytics)`, line
  `View refresh {"youtube":{updated,skipped,failed,error?},…}`. `skipped` = rows fresh enough;
  `failed` = ids the API answered without a count (first three error samples logged as a warn).
- Table check (sql.js, repo has no sqlite CLI): copy the snippet from #387's "Done means" or
  `node -e` over `%APPDATA%\Corva\data\clipflow.db`: `SELECT platform, COUNT(*), SUM(views IS NULL),
  MAX(fetched_at) FROM clip_metrics GROUP BY platform` and `SELECT COUNT(*) FROM
  title_caption_rounds WHERE views IS NOT NULL` (was 159 before this session; must not drop).
- Real-token probe without touching the daily driver: memory `project_safestorage_probe`
  (copy `Local State` into a scratch userData; delete the dir after).
- CDP loop unchanged from s248: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion`, then
  `scripts/dev/cdp.js "<expr>"`, `cdp-shot.js out.png`. Eight bottom tabs now, so the s248 x
  coordinates are stale — click by text: `[...document.querySelectorAll('button')].find(b =>
  b.textContent.includes('Analytics')).click()`. Settings sections open via the rail
  (`span` text "Publishing" → `.closest('button').click()`).
- Kill with `taskkill //F //IM electron.exe` (never Corva.exe — that is the daily driver).
- Publish errors: `%APPDATA%\Corva\clipflow-publish-log.json`.
