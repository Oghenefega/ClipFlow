# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## 🔲 In Progress — Meta (Instagram + Facebook) & YouTube Publish Pipelines

### Goal
Add OAuth + video publishing for Instagram (Reels), Facebook (Page Videos), and YouTube. Follow the exact TikTok pipeline architecture: OAuth module → publish module → token store → IPC handlers → preload bridge → QueueView integration.

### Architecture Decisions
- **Meta single OAuth:** One Facebook Login for Business flow covers both Instagram and Facebook. Scopes: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`
- **YouTube separate OAuth:** Google OAuth 2.0 with scopes `youtube.upload`, `youtube.readonly`
- **OAuth callback ports:** TikTok=8080, Meta=8081, YouTube=8082
- **Instagram video upload problem:** Instagram Graph API requires a publicly accessible `video_url` — local files don't work. Solution: serve file via temporary local HTTP server. For dev/sandbox testing this works if Meta can reach localhost (may need ngrok). Alternative: direct Resumable Upload API if available.
- **Facebook video upload:** Supports direct multipart file upload to `POST /{page-id}/videos` — no URL hosting needed.
- **YouTube video upload:** Google Resumable Upload API — direct file upload, no URL hosting needed.
- **Token storage:** Same `token-store.js` encrypted storage. Account IDs: `meta_{fb-user-id}`, `youtube_{channel-id}`
- **Credentials in Settings:** Meta App ID + App Secret, Google Client ID + Client Secret — stored in electron-store like TikTok's `tiktokClientKey`/`tiktokClientSecret`

### Phase 1 — Meta OAuth (Instagram + Facebook)
- [ ] Create `src/main/oauth/meta.js` — OAuth flow (Facebook Login for Business)
  - Auth URL: `https://www.facebook.com/v21.0/dialog/oauth`
  - Token URL: `https://graph.facebook.com/v21.0/oauth/access_token`
  - Local callback server on port 8081
  - Exchange code → short-lived token → long-lived token (60-day)
  - Fetch user profile (`/me?fields=id,name,picture`)
  - Fetch Pages (`/me/accounts`) → for each page get `instagram_business_account`
  - Store: user token, page tokens, IG business account ID, page ID
- [ ] Add Meta IPC handlers in `main.js`
  - `oauth:meta:connect` — trigger OAuth, save to token store
  - `meta:check-auth` — validate stored tokens
  - `oauth:removeAccount` — already generic, works for meta accounts
- [ ] Add Meta preload bridge methods
  - `oauthMetaConnect()`, `metaCheckAuth()`
- [ ] Add Meta credentials UI in SettingsView
  - Meta App ID + App Secret input fields (same pattern as TikTok)
  - "+ Instagram" / "+ Facebook" connect button
- [ ] Test: OAuth flow connects and stores tokens

### Phase 2 — Instagram Publish (Reels)
- [ ] Create `src/main/oauth/instagram-publish.js`
  - Serve local video via temp HTTP server (random port)
  - `POST /{ig-user-id}/media` with `video_url`, `caption`, `media_type=REELS`
  - Poll container status until `FINISHED`
  - `POST /{ig-user-id}/media_publish` with `creation_id`
  - Progress events: `instagram:publishProgress`
- [ ] Add `instagram:publish` IPC handler in `main.js`
  - Token refresh check (long-lived token refresh endpoint)
  - Build caption from template
  - Progress forwarding to renderer
  - Log to publish-log
- [ ] Add Instagram publish preload bridge methods
  - `instagramPublish(params)`, `onInstagramPublishProgress()`, `removeInstagramPublishProgressListener()`
- [ ] Wire Instagram into QueueView `publishClip()` loop
- [ ] Test: publish a Reel to Instagram sandbox

### Phase 3 — Facebook Page Publish
- [ ] Create `src/main/oauth/facebook-publish.js`
  - Get page access token from stored data
  - `POST /{page-id}/videos` with multipart file upload
  - Include `description` (caption), `title`
  - Progress events: `facebook:publishProgress`
- [ ] Add `facebook:publish` IPC handler in `main.js`
- [ ] Add Facebook publish preload bridge methods
- [ ] Wire Facebook into QueueView `publishClip()` loop
- [ ] Test: publish video to Facebook Page

### Phase 4 — YouTube OAuth + Publish
- [ ] Create `src/main/oauth/youtube.js` — Google OAuth 2.0
  - Auth URL: `https://accounts.google.com/o/oauth2/v2/auth`
  - Token URL: `https://oauth2.googleapis.com/token`
  - Scopes: `https://www.googleapis.com/auth/youtube.upload`, `https://www.googleapis.com/auth/youtube.readonly`
  - Local callback server on port 8082
  - Exchange code for tokens (access + refresh)
  - Fetch channel info (`/youtube/v3/channels?part=snippet&mine=true`)
- [ ] Create `src/main/oauth/youtube-publish.js`
  - Resumable upload: `POST /upload/youtube/v3/videos?uploadType=resumable`
  - PUT video chunks to resumable URI
  - Set snippet (title, description, tags), status (privacy)
  - Progress events: `youtube:publishProgress`
- [ ] Add YouTube IPC handlers in `main.js`
  - `oauth:youtube:connect`, `youtube:publish`
- [ ] Add YouTube preload bridge + QueueView integration
- [ ] Add YouTube credentials UI in SettingsView
- [ ] Test: upload video to YouTube

### Phase 5 — Verification
- [ ] Build succeeds (`npx react-scripts build`)
- [ ] App launches (`npm start`)
- [ ] All three OAuth flows connect successfully
- [ ] Publish to each platform works
- [ ] Existing TikTok pipeline still works (no regressions)
- [ ] Publish log captures all platform attempts

---

## ✅ Completed — Previous Tasks
(See git history for details)
