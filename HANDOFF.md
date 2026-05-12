# ClipFlow — Session Handoff
_Last updated: 2026-05-11 — Session 37 — 0.1.3-alpha: Instagram via Facebook Login + TikTok refresh fix_

---

## One-line TL;DR

**Instagram publishing is unblocked.** Switched the Connect Instagram flow to authenticate via Facebook (the only path Meta exposes that supports resumable upload of local MP4s). User confirmed end-to-end success on the Arc Raiders clip that had been failing for two sessions: `post_id: 18088961429203817`. Also fixed TikTok token refresh (missing `client_secret`).

---

## What shipped (session 37)

### The IG fix

The deep diagnosis: `graph.instagram.com` (Instagram Business Login direct) **does not support resumable upload**. Only `graph.facebook.com` (Facebook Login flow) does. Session 36 worked around one symptom (`/me/media` routing) but hit this fundamental wall next. Verified against Meta's official docs: *"Resumable upload is only for apps that have implemented Facebook Login for Business."*

User explicitly rejected the alternative (hosting the clip at a public URL and using `video_url` pull) — that's the path Meta actually pushes for IG Direct apps, but it requires Supabase Storage or equivalent. Out of scope until the broader backend stack lands.

So the fix was structural: **route the Connect Instagram button through facebook.com OAuth.** The user's IG must be linked to a Facebook Page they manage. Confirmed yes for Fega.

### Files changed (all committed in `be528b1`)

- **[src/main/oauth/meta.js](src/main/oauth/meta.js)** — refactored into two public flows sharing one OAuth callback server:
  - `startFacebookOAuthFlow(appId, appSecret)` — renamed from `startOAuthFlow`. Same scopes as before (`pages_show_list, pages_read_engagement, pages_manage_posts, business_management`). Returns Facebook Page account record.
  - `startInstagramOAuthFlow(appId, appSecret)` — new. Scopes: `pages_show_list, pages_read_engagement, instagram_basic, instagram_content_publish, business_management` (deliberately NO `pages_manage_posts`). After auth, walks user's Pages, GETs `/{pageId}?fields=instagram_business_account{id,username,profile_picture_url}` on each until it finds a linked IG Business Account. Returns an Instagram account record using **the page's access token** (the credential that authenticates IG publishing via FB Login).
- **[src/main/main.js](src/main/main.js)** — split IPC handlers:
  - `oauth:instagram:connect` now reads `metaAppId/metaAppSecret` (not the legacy `instagramAppId/instagramAppSecret`) and invokes `metaOAuth.startInstagramOAuthFlow`. Saves the new account record with `loginType: "facebook_login"`.
  - `oauth:facebook:connect` calls renamed `metaOAuth.startFacebookOAuthFlow`. Behavior unchanged.
- **[src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js)** — `handleConnectInstagram` validates `metaAppId/metaAppSecret`. Updated alert copy + tooltip on the "+ Instagram" button: *"Authenticates via Facebook. Your Instagram must be linked to a Facebook Page you manage."*
- **[src/main/oauth/tiktok.js](src/main/oauth/tiktok.js) + [src/main/main.js:2552](src/main/main.js:2552)** — `refreshAccessToken` now takes `(clientKey, clientSecret, refreshToken)`. TikTok's `/v2/oauth/token/` requires `client_secret` for every grant type; the previous 2-arg call returned "The request parameters are malformed" on every refresh.

### Version bump

`0.1.2-alpha` → `0.1.3-alpha`. Installer at `dist/ClipFlow Setup 0.1.3-alpha.exe` (113 MB). Daily update banner picks it up automatically since the version differs from the prior install.

---

## Verified

User confirmed at 19:47:39 (Fega's local time, 2026-05-11):
- ✅ Old IG account disconnected without error.
- ✅ New "+ Instagram" button kicks off Facebook OAuth.
- ✅ After consent, only an Instagram account appears (no extra Facebook Page record from this flow — exactly what user wanted).
- ✅ Retry on the previously-failed Arc Raiders clip → IG publish succeeded. `post_id: 18088961429203817`, container/publish via `graph.facebook.com` resumable upload.

Not yet verified (no immediate testing path):
- TikTok refresh — fires only on token expiry. Will be confirmed implicitly the next time a TikTok token rolls over.
- The "+ Facebook Page" button after the meta.js refactor — should be unchanged behaviorally (same scopes, same finalizer logic, just moved into a shared helper), but a quick sanity click would be reassuring.

---

## Watch out for

- **Stale Instagram account records in `instagramAppId/instagramAppSecret` store keys.** The IG Settings credential fields in the UI are still wired to those legacy keys, but the IG connect button no longer reads them — it reads `metaAppId/metaAppSecret`. The legacy fields are harmless dead UI for now. **Cleanup follow-up:** remove the IG App ID + Secret rows from Settings → API Credentials, since they no longer drive anything.
- **`src/main/oauth/instagram-oauth.js` is now reachable from exactly one place** — the `isIgLogin` branch of the IG publish handler's token-refresh path ([main.js:2734](src/main/main.js:2734)). That branch only fires for accounts saved before session 37 (`loginType: "instagram_business_login"`). Fega's account is now FB-Login, so this code is dead for him. Safe to delete entirely along with the legacy refresh branch when the codebase is more confident it has no pre-37 IG records left. Not urgent.
- **`instagramAppId`/`instagramAppSecret` store keys** still get persisted via the App.js `useEffect` and rendered in Settings. Same cleanup as above — removing the form fields is one edit, then those store keys can be left as orphaned data (no migration needed; electron-store tolerates unused keys).
- **The `oauth:instagram:connect` handler depends on the user having configured the Meta app credentials, not Instagram-specific ones.** If they wipe Meta credentials and only keep Instagram credentials (now-orphaned), the IG connect button will throw a configure-first alert. The alert copy mentions Meta App ID specifically to head this off, but worth noting.
- **No business_management consent prompt may surprise reviewers later.** When app review happens, Meta may ask why `business_management` is in the IG scope set — it's there because the FB Login flow defaults to it, but the IG publish path doesn't strictly require it. Trim if app review pushes back.

---

## Logs / debugging

- **App log (prod profile):** `%APPDATA%\clipflow\logs\app.log` — search for `"Found linked IG account"` and `"IG account saved"` to confirm the new flow ran. Key trace lines from the verified run (2026-05-11 ~19:47):
  - `[meta] Starting Instagram (via Facebook Login) OAuth flow`
  - `[meta] FB user fetched (IG flow) { name: ..., id: ... }`
  - `[meta] Found linked IG account { igId, username: "fegagaming", pageId }`
  - `[meta] IG account saved { accountId: "ig_...", displayName: "fegagaming" }`
- **Publish log:** `%APPDATA%\clipflow\clipflow-publish-log.json` — Arc Raiders clip's successful entry has `apiResponse` with the resumable container ID and the final `post_id`.
- **OAuth dialog scope confirmation:** if you want to sanity-check what permissions the user actually granted, log the scope string from `longLived.scope` in the meta.js `runOAuthFlow` callback — it returns the actual granted scope list. Not added in this session (would require adding a log line and rebuilding), but trivial if it matters.
- **TikTok refresh:** when it does fire, look for `[tiktok] Token expired, refreshing` followed by `[tiktok] Token refresh result` with a populated `access_token`. If you see the request reach the API and come back with the legacy `"The request parameters are malformed"`, then `tiktokClientSecret` is probably empty in the store — check Settings → API Credentials.

---

## Next steps for next session — candidate priorities

**Top picks:**
- **[#83](https://github.com/Oghenefega/ClipFlow/issues/83) — TikTok Content Posting audit.** Spec at [`tasks/specs/tiktok-content-posting-audit.md`](tasks/specs/tiktok-content-posting-audit.md). ~2.5h. Unblocks the last social platform. Self-contained clean kickoff.
- **#78 — saved subtitle edits silently lost on reopen.** Biggest architectural pre-launch bug still open. Needs a source-of-truth decision (`clip.subtitles.sub1` vs `clip.transcription`).
- **Fix the `isDev` hardcode at [src/main/main.js:325](src/main/main.js:325).** ~30–45 min. Pays off in every dev session afterwards (lets HMR work via `npm run dev`).

**Smaller cleanups worth bundling:**
- Remove IG App ID / App Secret rows from Settings → API Credentials (now unused).
- Delete [src/main/oauth/instagram-oauth.js](src/main/oauth/instagram-oauth.js) + its single remaining call site at [main.js:2734](src/main/main.js:2734).
- [#82](https://github.com/Oghenefega/ClipFlow/issues/82) — OAuth avatar caching to disk (signed-URL expiry). Small, isolated.

**Cosmetic batch for momentum:** #69, #70, #74, #5, #7 — all small.

---

## Session model + cost

- **Model:** Opus 4.7 (per global rule, only for complex architecture/diagnosis; Sonnet for execution would have been fine in retrospect since the diagnosis ended up cleanly traced via Meta docs).
- **Commits this session:** 1 (`be528b1`). Pushed to origin/master.
- **Issues filed:** 0.
- **Issues closed:** 0 (no pre-existing issue tracked IG publishing — fix was diagnosed inline).
- **Tag candidate:** `git tag stable-2026-05-11-session-37` if you want a rollback point after observing 0.1.3-alpha for a day.
