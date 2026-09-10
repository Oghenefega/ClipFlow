# HANDOFF — Session 251 (2026-09-10)

## Current State

**TikTok view counts are built and verified, switched off until TikTok approves the read scope.**
The TikTok developer app was never "frozen mid-review" — the portal shows Production Live since
2026-06-17 and no pending revision. It was approved for posting only (`user.info.basic,
video.publish, video.upload`); view counts need `video.list`, which nobody had applied for.
Fega submitted a Production revision on 2026-09-10 adding `video.list`, renaming the app to
Corva (name + icon), with a short Analytics-tab demo video beside the original ClipFlow demo.
Publishing keeps working from the live version while it is reviewed.

Code: `TIKTOK_VIEWS_ENABLED` in `src/main/analytics-core.js` (env `CLIPFLOW_TIKTOK_VIEWS=1`
for the sandbox). Off: sign-in asks for posting scopes only, tile says "TikTok views arrive once
TikTok approves the app". On: sign-in adds `video.list`, Settings shows "Reconnect for views"
for an old TikTok connection, the refresh matches clips to posts by caption + publish moment
(`buildTikTokTargets` / `matchTikTokVideos`), stores the post id in `clip_metrics`, and later
refreshes query by id (`src/main/oauth/tiktok-display.js`). Verified against the sandbox with
Fega's account as target user: 76 of 76 clips matched against 180 listed videos.

Master at `672fc7d` plus this wrap. Seven commits since alpha.33 are waiting for a cut (five
from s250 plus a26b997 and 672fc7d). Dev profile token store is `{}` again.

## Key Decisions

- **The switch stays a code constant, not a setting.** Asking TikTok for a scope the app does not
  hold fails every sign-in, so the flip is a release event: approval → constant true → installer.
- **Post ids are recovered from the video list, not from publish status.** Direct Post never
  returns `publicaly_available_post_id` (0 of 170). Matching: 45-minute window around the publish
  log's completion time (tracker date+time as fallback), caption-prefix beats closeness, each
  video claimed once.
- **The review text names view counts only** (Fega's choice), even though the fetcher also stores
  likes/comments/shares like the Meta fetchers do. Don't widen the claim in future submissions.
- **TikTok dev app renamed to Corva by Fega, ahead of the trademark opinion** — second one-off
  after the Meta app. The gate still stands for the GitHub repo and the Google app.
- **Settings credential Save buttons trim whitespace** (all four platforms) — a leading space in
  the pasted sandbox secret produced "Client key or secret is incorrect".

## Next Steps

1. **When TikTok approves (#388):** set `TIKTOK_VIEWS_ENABLED = true`, run
   `analyticsTikTok.test.js` (the "off" test flips), cut an installer, then Fega presses
   "Reconnect for views" next to TikTok in Settings. First refresh lists ~170 clips (9 pages).
   If rejected: portal → History → "Review comments".
2. **Next installer batch** carries the seven commits. Before publishing: `npx asar list
   dist/win-unpacked/resources/app.asar | grep brand` must show `clipflow-mark.png`.
3. **#392** — the 16 legacy Facebook uploads with no view count (probe one id read-only first).
4. Carried: #383 confirmation, #384, #385, #389/#390 (analytics roadmap), #395 when asked.

## Watch Out For

- **TikTok portal vocabulary:** there is no "Display API" product to add — `video.list` is picked
  under "Add scopes". Demo rule is "at least one video, up to 5 files": keep the approved video,
  add one for the new scope. Read the page before prescribing steps (lessons s251).
- **Sandbox testing works for read scopes:** Sandbox (id 7620328105793669176) has target user
  `fega`, same redirect URI, key starts `sb`. `video/list` returns his real public videos. Sandbox
  key/secret go into the DEV profile's Settings (Fega pastes them — never enter credentials
  yourself); empty `%APPDATA%\clipflow-dev\clipflow-tokens.json` after.
- **TikTok debug logging prints access/refresh tokens in plain text** (`tiktok.js` "Token
  exchange response", `app.log`). Pre-existing; worth an issue before wider testing.
- **Scripted source edits:** bytes mode only; text-mode Python flips CRLF → LF (had to restore
  four files this session). Byte-probe touched files before committing.

## Logs / Debugging

- TikTok analytics: `(analytics) TikTok: matched N of M clips against K listed videos` on the
  list path; the query path logs only through the `View refresh {...}` summary. Per-id failures
  ("Video not found on TikTok (deleted or private)") appear in the preceding `warn` line.
- Display API errors: `(tiktok) video/list failed {code, message}` / `video/query failed`.
  `access_token_invalid` flags the account for reconnect; `scope_not_authorized` means the token
  predates the scope (Settings shows "Reconnect for views" from the stored scope string).
- Dev verification: `CLIPFLOW_PROFILE=dev CLIPFLOW_TIKTOK_VIEWS=1 npx electron .
  --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`, then
  `node scripts/dev/cdp.js "window.clipflow.analyticsRefresh().then(r=>JSON.stringify(r.data.perPlatform.tiktok))"`.
  Rows: copy `%APPDATA%\clipflow-dev\data\clipflow.db` and `select * from clip_metrics where platform='tiktok'`.
- Direct endpoint check with a token from the log: `require('./src/main/oauth/tiktok-display').queryVideos(token, ids)`
  with `electron-log/main` stubbed (see s251 transcript for the one-liner).
