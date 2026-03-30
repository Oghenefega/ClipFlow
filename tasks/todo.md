# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## 🔲 In Progress — Split Instagram & Facebook into Independent Login Flows

### Goal
Split the current single "+ Meta" OAuth into two independent connections: "+ Instagram" (Instagram Business Login) and "+ Facebook Page" (Facebook Login). Users can connect either or both, with different accounts if they want. No requirement to link IG to a FB Page for Instagram-only publishing.

### Architecture Decisions
- **Two separate OAuth flows:** Instagram Business Login (`instagram.com`) and Facebook Login (`facebook.com`) are independent
- **Instagram Business Login:** Auth via `instagram.com/oauth/authorize`, tokens via `graph.instagram.com`. Scopes: `instagram_business_basic`, `instagram_business_content_publish`. Works for Business/Creator IG accounts without FB Page.
- **Facebook Login (Pages):** Auth via `facebook.com/dialog/oauth`. Scopes: `pages_manage_posts`, `pages_show_list`, `pages_read_engagement`, `business_management`. For FB Page video publishing only.
- **Shared credentials:** Both flows use the same Meta App ID + App Secret (same Meta app, two login products)
- **OAuth callback ports:** TikTok=8080, Facebook=8083 (existing), Instagram=8084 (new), YouTube=8082
- **Token storage:** `ig_{ig-user-id}` for Instagram accounts, `fb_{page-id}` for Facebook Pages
- **IG account limitation:** Only Business or Creator IG accounts work (Meta API restriction, not ours)
- **YouTube separate OAuth:** Google OAuth 2.0 (unchanged)
- **Instagram video upload:** Instagram Graph API requires publicly accessible `video_url` — serve via temp local HTTP server
- **Facebook video upload:** Direct multipart upload to `/{page-id}/videos`

### Phase 1 — Instagram Business Login OAuth (NEW)
- [ ] Create `src/main/oauth/instagram-oauth.js` — Instagram Business Login flow
  - Auth URL: `https://www.instagram.com/oauth/authorize`
  - Token URL: `https://api.instagram.com/oauth/access_token` (short-lived)
  - Long-lived exchange: `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token`
  - Refresh: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`
  - Local callback server on port 8084
  - Scopes: `instagram_business_basic,instagram_business_content_publish`
  - Fetch profile: `GET https://graph.instagram.com/v21.0/me?fields=user_id,username,account_type,profile_picture_url`
  - Store: IG user token, IG user ID, username, profile pic
- [ ] Add IPC handler `oauth:instagram:connect` in `main.js`
- [ ] Add preload bridge method `oauthInstagramConnect()`
- [ ] Test: Instagram OAuth flow connects and stores tokens

### Phase 2 — Update Facebook Login to Pages-Only
- [ ] Update `src/main/oauth/meta.js` — remove Instagram scopes
  - Scopes: `pages_manage_posts`, `pages_show_list`, `pages_read_engagement`, `business_management`
  - Remove `instagram_basic`, `instagram_content_publish` from SCOPES
  - Stop fetching `instagram_business_account` — no longer needed here
  - Store account as `fb_{page-id}` with page name, page token
- [ ] Rename IPC handler from `oauth:meta:connect` → `oauth:facebook:connect`
- [ ] Update preload bridge: `oauthMetaConnect()` → `oauthFacebookConnect()`

### Phase 3 — Split Settings UI
- [ ] Update `SettingsView.js` — replace "+ Meta" with two buttons
  - "+ Instagram" → calls `oauthInstagramConnect()` — connects IG Business/Creator account
  - "+ Facebook Page" → calls `oauthFacebookConnect()` — connects FB Page
  - Show connected accounts with platform icon (IG vs FB) and display name
  - Keep shared Meta App ID + App Secret credentials section (both flows use same app)
- [ ] Update platform list rendering to distinguish IG-Login accounts from FB-Login accounts

### Phase 4 — Update Instagram Publish to Support IG Tokens
- [ ] Update `src/main/oauth/instagram-publish.js`
  - Detect token type: Instagram User Token (from IG Login) vs Facebook User Token (from FB Login)
  - IG Login tokens use `graph.instagram.com` base URL
  - FB Login tokens use `graph.facebook.com` base URL
  - Both use same endpoints: `/{ig-user-id}/media` → `/{ig-user-id}/media_publish`
  - Token refresh: IG tokens use `graph.instagram.com/refresh_access_token`, FB tokens use `graph.facebook.com/oauth/access_token`
- [ ] Update `instagram:publish` IPC handler to handle both token types
- [ ] Test: publish Reel via Instagram Business Login token

### Phase 5 — Facebook Page Publish (existing, verify)
- [ ] Verify `facebook-publish.js` works with updated token storage
- [ ] Verify `facebook:publish` IPC handler uses Page Access Token correctly
- [ ] Test: publish video to Facebook Page

### Phase 6 — YouTube OAuth + Publish (unchanged)
- [ ] Create `src/main/oauth/youtube.js` — Google OAuth 2.0
  - Auth URL: `https://accounts.google.com/o/oauth2/v2/auth`
  - Token URL: `https://oauth2.googleapis.com/token`
  - Scopes: `youtube.upload`, `youtube.readonly`
  - Local callback server on port 8082
  - Fetch channel info
- [ ] Create `src/main/oauth/youtube-publish.js` — Resumable upload
- [ ] Add YouTube IPC handlers, preload bridge, QueueView integration
- [ ] Add YouTube credentials UI in SettingsView
- [ ] Test: upload video to YouTube

### Phase 7 — Verification
- [ ] Build succeeds (`npx react-scripts build`)
- [ ] App launches (`npm start`)
- [ ] "+ Instagram" connects IG Business/Creator account independently
- [ ] "+ Facebook Page" connects FB Page independently
- [ ] User can connect different IG and FB accounts (not linked)
- [ ] Publish to Instagram works via IG Business Login token
- [ ] Publish to Facebook Page works via FB Login Page token
- [ ] YouTube publish works
- [ ] Existing TikTok pipeline still works (no regressions)
- [ ] Publish log captures all platform attempts

### Meta App Review Impact
- Re-add `instagram_business_content_publish` + `instagram_business_basic` permissions to the Meta app
- Complete test calls using the new Instagram OAuth flow (not Graph API Explorer — use the actual app or curl with IG token)
- Both use cases ("Manage messaging & content on Instagram" + "Manage everything on your Page") need separate test submissions

---

## 🔲 Planned — Goal B: Cold-Start Architecture + Creator Profile System

> **Prerequisite:** Goal A (prompt redesign for model-agnosticism) must be completed first. After Goal A, both prompts read creator personality/style from a `creatorProfile` object instead of hardcoded Fega strings. Goal B builds the data layer and blending logic that feeds that profile.

### Problem

New users have zero approved clips. The few-shot examples in the highlight detection prompt come entirely from the feedback database (last 20 approved clips). Without history, the AI has no reference for what "good" looks like for a given creator.

### Deliverable 1 — Three-Tier Example Blending System

Build in `ai-prompt.js` prompt construction logic:

- **Tier 1 — Cold start (0 approved clips):** Use 3-5 static archetype examples selected by `creatorProfile.archetype`
- **Tier 2 — Warming up (1-19 approved clips):** Blend real approved clips + static archetype examples, pad to minimum 5 total. Real clips accumulate → static examples phase out naturally
- **Tier 3 — Dialed in (20+ approved clips):** Only real approved clips (current behavior). No static examples

The existing gate in `ai-prompt.js` line 87 (`if (approvedClips && approvedClips.length >= 5)`) already does tier separation — add Tier 1 fallback and Tier 2 blending.

### Deliverable 2 — Static Archetype Examples

Create `src/main/data/archetype-examples.json` — 5 example clips per archetype, 20 total.

**Archetypes:**

1. **"hype"** — High energy, reactions, chaos. Screaming reactions, unexpected moments, funny fails, over-the-top celebrations. Punchy, exclamatory titles.
2. **"competitive"** — Skilled plays, clutch moments. 1vX clutches, perfect strategies, rank-ups, close wins. Titles highlight skill/achievement.
3. **"chill"** — Commentary, storytelling, laid-back. Interesting observations, educational plays, relaxed banter. Conversational, understated titles.
4. **"variety"** — Balanced mix of all three. Default for users who don't pick a specific archetype.

Each example clip includes: `start`, `end` (fake timestamps for format), `title`, `confidence`, `energy`, `reason`, `peak_quote`.

**Important:** After generating, Fega must manually review all 20 examples to verify quality.

### Deliverable 3 — Creator Profile Data Model

Add to electron-store settings:

```javascript
creatorProfile: {
  archetype: "hype" | "competitive" | "chill" | "variety",
  description: "",        // optional free-text personality description
  momentPriorities: ["funny", "clutch", "emotional", "fails"],  // RANKED list, not toggles
  voiceMode: "hype" | "chill"
}
```

**Design decision:** Moment preferences are a RANKED LIST, not boolean toggles. AI always looks for everything but weights/ranks based on priority order. A funny clutch play should never be filtered out.

**Defaults (before onboarding):** archetype: "variety", description: "", momentPriorities: all included in default order, voiceMode: "hype".

### Deliverable 4 — Prompt Builder Integration

In `ai-prompt.js`:

1. Read `creatorProfile` from settings
2. If `description` is non-empty → use as creator personality section
3. If `description` is empty → generate generic personality from archetype
4. Use `momentPriorities` as weighted signals in PICK criteria ordering
5. Select static archetype examples based on `archetype` field
6. Blend with real approved clips using three-tier system

### Deliverable 5 — Fega Migration

- Migrate hardcoded personality (Sections A+B in `ai-prompt.js`) into `creatorProfile.description`
- Set archetype: "hype", momentPriorities: ["funny", "emotional", "clutch", "fails"]
- After Goal A, prompts already read from `creatorProfile` — migration just populates Fega's data

### Onboarding UI (FUTURE — separate task, not Goal B)

- First-launch wizard: "What's your content vibe?" → archetype selection
- Moment priority ranking (drag to reorder)
- Optional free-text personality description
- Per-game setup: "How do you play this game?"

### Files to modify

- `src/main/ai-prompt.js` — three-tier blending, read from creatorProfile
- `src/main/main.js` — creatorProfile store defaults, Fega migration
- New: `src/main/data/archetype-examples.json`

### Verification

- [ ] Cold start: 0 approved clips + archetype set → prompt includes archetype examples
- [ ] Warming up: 3 approved clips → prompt includes 3 real + 2 archetype = 5 total
- [ ] Dialed in: 20+ approved clips → only real clips, no archetypes
- [ ] Fega's pipeline works identically after migration

---

## 🔲 Planned — Backend Infrastructure for Commercial Launch

> All items labeled `milestone: commercial-launch` on GitHub. Build order reflects dependencies.

### Phase 1 — Foundation (must come first)
- [ ] **#20 — Supabase backend: auth, database, Edge Functions**
  - Create Supabase project + Postgres schema (users, oauth_accounts, publish_log, licenses)
  - Implement Supabase Auth (email/password + Google/Discord social login)
  - Register `clipflow://` protocol handler for Electron deep-link OAuth
  - Add login/signup screens in renderer
  - Add auth gate — app requires login before accessing features
  - Set up Row Level Security for per-user data isolation

### Phase 2 — Security (move secrets off-device)
- [ ] **#21 — Migrate OAuth flows to server-side proxy**
  - Create Edge Functions for `oauth/{platform}/start`, `/callback`, `/refresh`
  - Refactor `youtube.js`, `tiktok.js`, `meta.js` to call Edge Functions instead of local HTTP servers
  - Remove `youtubeClientSecret`, `metaAppSecret`, `tiktokClientSecret` from electron-store
  - Migrate token storage from local `token-store.js` to Supabase Postgres
  - Remove client secret input fields from SettingsView
- [ ] **#22 — Move Anthropic API key server-side, proxy AI calls**
  - Create Edge Function: `ai/generate` — authenticated proxy to Anthropic API
  - Refactor `ai-pipeline.js` and `useAIStore.js` to call Edge Function
  - Remove `anthropicApiKey` from electron-store and SettingsView
  - Add per-user usage tracking and rate limiting by tier

### Phase 3 — Monetization
- [ ] **#23 — LemonSqueezy payments + license key management**
  - LemonSqueezy store setup done in Founder Ops (products, pricing, license keys)
  - Create Edge Functions for LemonSqueezy webhooks (license creation/revocation)
  - Add license key activation flow in desktop app (LemonSqueezy validation API)
  - Gate features by subscription tier
  - Add trial period and subscription management UI

### Phase 4 — Distribution
- [ ] **#19 — Auto-updates with electron-updater + code signing**
  - Add `electron-updater` targeting GitHub Releases
  - Purchase EV code signing certificate (DigiCert, ~$400-500/yr)
  - Configure electron-builder for signed NSIS installer
  - Add update progress UI

### Phase 5 — Observability
- [ ] **#24 — Sentry crash reporting**
  - Install `@sentry/electron` — covers main, renderer, and native crashes
  - Source map uploads for readable stack traces
  - Breadcrumbs for FFmpeg, Whisper, publishing, OAuth operations
  - Tag errors with Supabase user ID
- [ ] **#25 — Product analytics (PostHog)**
  - Track key events: project creation, editing, publishing, AI usage, session duration
  - User identification linked to Supabase
  - Opt-out toggle in Settings for privacy
  - Set up dashboards for DAU, feature adoption, publish success rates

---

## ✅ Completed — Previous Tasks
(See git history for details)
