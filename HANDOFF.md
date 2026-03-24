# ClipFlow — Session Handoff
_Last updated: 2026-03-23 (TikTok Pipeline session)_

## Current State
App builds and runs. TikTok OAuth + Content Posting API fully working in sandbox. Videos publish successfully to TikTok (SELF_ONLY in sandbox mode). Publish log tracks all attempts with success/failure details.

## What Was Just Built
- **TikTok OAuth scope upgrade** — Now requests `user.info.basic,video.publish` (was only `user.info.basic`). Existing tokens still work but won't have publish scope until user reconnects.
- **TikTok Content Posting API (`src/main/oauth/tiktok-publish.js`)** — Full publish flow: query creator info → initialize upload → single-chunk PUT (≤64MB) or multi-chunk upload (>64MB) → poll publish status until PUBLISH_COMPLETE or FAILED.
- **Publish IPC handler** — `tiktok:publish` in main.js handles token refresh, caption building, and progress events. Preload bridge exposes `tiktokPublish()`, `onTiktokPublishProgress()`, `removeTiktokPublishProgressListener()`.
- **QueueView real publishing** — `publishClip()` now calls real TikTok API for TikTok accounts (stubs remain for other platforms). Progress bar with gradient fill and stage text (permissions → init → upload → processing → done).
- **Publish logging** — `src/main/publish-log.js` persists publish attempts to `clipflow-publish-log.json`. QueueView shows Publish Log panel with success/failure details.
- **Editor → Queue flow fix** — Queue button in EditorLayout now renders clip AND refreshes `localProjects` state in App.js via `onProjectUpdated` callback, so rendered clips appear in Queue tab.
- **ProjectsView Render All fix** — Batch render now refreshes `localProjects` after completion.

## Key Decisions
- **Sandbox = SELF_ONLY always** — Creator info is queried but privacy is hardcoded to `SELF_ONLY` for sandbox compliance. The account must be set to private in TikTok settings.
- **Single-chunk for ≤64MB** — Most gaming clips are under 64MB. Uses `chunk_size = video_size, total_chunk_count = 1`. Multi-chunk (10MB chunks) only for files >64MB.
- **Creator interaction settings respected** — `disable_duet`, `disable_stitch`, `disable_comment` pulled from creator info query, not hardcoded.

## Next Steps
- **Reconnect TikTok account** — Current token was issued with only `user.info.basic`. Need to disconnect and reconnect to get `video.publish` scope for future sessions.
- **Scheduling** — Queue tab has schedule UI but `publishClip` with `scheduleOpts` doesn't delay actual publishing. Need a scheduler (cron/setTimeout) to publish at the scheduled time.
- **Reschedule clips** — User wants to change date/time after scheduling (logged in memory).
- **Caption templates** — QueueView references `captionTemplates?.tiktok` but the template substitution needs testing with real Captions tab data.
- **Other platforms** — YouTube, Instagram, etc. are still stubs in `publishClip()`.
- **Production mode** — When TikTok approves the app, switch from `SELF_ONLY` to using `allowedPrivacy` from creator info.

## Watch Out For
- TikTok sandbox rate limit: 6 publish init requests per minute per user
- Token expiry: access tokens last ~24h, refresh token flow is implemented but untested
- `extractGameTag()` function in QueueView — used to build caption hashtag, verify it works with your title format
- The `nul` file and `.claude/` directory in repo root are artifacts — don't commit them

## Logs / Debugging
- Publish logs: `%APPDATA%/clipflow/clipflow-publish-log.json`
- App logs: `%APPDATA%/clipflow/logs/clipflow-YYYY-MM-DD.log`
- Electron console: TikTok publish stages logged with `[TikTok Publish]` prefix
- QueueView Publish Log panel: click "Show" to see recent publish attempts
