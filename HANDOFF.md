# ClipFlow — Session Handoff
_Last updated: 2026-03-26 (Meta OAuth Fresh Setup + Bug Fixes)_

## Current State
Both Facebook and Instagram OAuth apps have been **recreated from scratch** on Meta Developers and are fully working in Development Mode. All APIs tested and confirmed. App builds and runs clean.

## What Was Built

### New Meta Developer Apps (replacing old broken ones)
- **ClipFlow Pages Publisher** (Facebook) — App ID: `713765408423963`
  - Use case: "Manage everything on your Page"
  - Permissions: `pages_manage_posts`, `pages_read_engagement`, `pages_read_user_content`, `pages_show_list`, `business_management`, `public_profile`
  - OAuth redirect: `http://localhost:8083/callback`
  - Business: Fega - Most Hyped Streamer

- **ClipFlow Reels Publisher-IG** (Instagram) — App ID: `1760748151572374`
  - Use case: "Manage messaging & content on Instagram"
  - Permissions: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`, `instagram_manage_comments`
  - OAuth redirect: `https://localhost:8084/callback`
  - Uses Instagram Business Login (independent from Facebook, no FB Page required)

### Code Fixes
1. **Instagram OAuth race condition** (`instagram-oauth.js`): Promise now settles BEFORE closing the auth window — prevents "closed" event from rejecting before token exchange completes
2. **Facebook Page avatar** (`meta.js`): Fetches Page profile picture instead of user's personal profile pic

### API Testing Completed (via Graph API Explorer)
- Facebook: profile read, list pages, post to page, read published posts — all confirmed
- Instagram: profile read, list media, create container + publish image — all confirmed

## Key Decisions
- **Two separate Meta apps required** — Facebook Login use case and Instagram API use case cannot be combined (Meta restriction). Aligns with user's requirement for independent login flows
- **Development Mode only** — no App Review needed until ClipFlow launches to real users. Fega has full API access as admin
- **Old Meta apps (904335115744229, 1450688126508008, 3368958993263538) should be archived/deleted**

## Next Steps
1. Start posting real content through ClipFlow (dev mode works for personal use)
2. Test actual video/reel publishing through ClipFlow's publish pipeline
3. Archive old broken Meta apps from developer dashboard
4. When ready for launch: Business Verification → App Review → Publish both apps
5. GitHub Issue #26: multi-account per platform (future feature)
6. Fix Issue #12 — Undo debounce captures intermediate drag states (carried over)

## Watch Out For
- `pages_read_engagement` doesn't work on `/feed` endpoint — use `/published_posts` instead
- Instagram API uses `graph.instagram.com` not `graph.facebook.com`
- Meta testing dashboard counters take up to 24 hours to update
- App secrets were visible during setup session — consider resetting before launch
- Instagram Business Login only works for Business/Creator accounts (Meta limitation)
- Two Meta apps = two sets of credentials — don't mix `instagramAppId` with `metaAppId`

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/` (rotated: app.log through app.5.log)
- Instagram OAuth: scope `instagram-oauth`, Facebook OAuth: scope `meta`
- Token storage: encrypted via `token-store.js`
- Publish log: `%APPDATA%/clipflow/clipflow-publish-log.json`
- If Instagram connect fails: check `https://localhost:8084/callback` in Meta dashboard → ClipFlow Reels Publisher-IG → Instagram API → Business login settings
