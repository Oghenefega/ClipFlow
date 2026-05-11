# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## Code Complete (Pending Verification): IG-via-FB-Login publishing + TikTok refresh fix (Session 37)

**Status:** All 4 code changes landed and build is clean. Pending: user clicks through OAuth + retries a previously-failed publish.

**Goals:**
1. Instagram publishing works again. Path: Facebook Login OAuth → resumable upload via `graph.facebook.com/{ig-user-id}/media`. Replaces current IG Direct Login flow which can't do resumable.
2. TikTok token refresh fixed. Currently fails with "malformed parameters" because `client_secret` is missing from the request body.

**Why:**
- IG: `graph.instagram.com` (IG Direct Login) doesn't support resumable upload per Meta docs. Only `graph.facebook.com` (FB Login flow) does. Session 36's IGSID/`/me/media` fix worked around one error but exposed this deeper limitation. User has rejected hosted-clip approach (option B in plan). FB Login is option A: requires user's IG to be linked to a Facebook Page — confirmed yes.
- TikTok: [tiktok.js:294](src/main/oauth/tiktok.js:294) `refreshAccessToken(clientKey, refreshToken)` sends only `client_key, grant_type, refresh_token`. TikTok's `/v2/oauth/token/` requires `client_secret` for every grant type.

---

## Plan

### A. Two separate Meta OAuth flows (not unified)

User explicitly wants separate "Connect Facebook" and "Connect Instagram" buttons, scope-minimized per flow.

| Flow | Scopes | Saves |
|---|---|---|
| Connect Facebook | `pages_show_list, pages_read_engagement, pages_manage_posts, business_management` | FB Page account (`fb_${pageId}`) — current behavior, unchanged |
| Connect Instagram | `pages_show_list, pages_read_engagement, instagram_basic, instagram_content_publish` | IG account (`ig_${igAccountId}`) with `loginType: "facebook_login"`, `accessToken = pageAccessToken` |

Note: IG flow needs `pages_show_list` + `pages_read_engagement` to resolve the IG account from the linked Page. Does **not** request `pages_manage_posts` and does **not** save a FB Page record.

### B. File-by-file changes

1. **[src/main/oauth/meta.js](src/main/oauth/meta.js)** — refactor:
   - Rename current `startOAuthFlow` → `startFacebookOAuthFlow` (same logic).
   - Add `startInstagramOAuthFlow(appId, appSecret, timeoutMs)` — different `SCOPES`, after Page fetch does `GET /{pageId}?fields=instagram_business_account{id,username,profile_picture_url}`, returns IG-shaped account data.
   - Keep `refreshLongLivedToken` shared.
2. **[src/main/main.js](src/main/main.js)** — split IPC handler:
   - Existing meta-connect handler (~line 2660) → `oauth:facebook:connect` (uses `startFacebookOAuthFlow`).
   - New `oauth:instagram:connect` (uses `startInstagramOAuthFlow`, saves IG account).
   - Remove the old IG-Direct connect handler that used `instagramOAuth.startOAuthFlow`.
3. **[src/main/preload.js](src/main/preload.js)** — expose `connectFacebook` and `connectInstagram` as separate bridge methods. Remove old IG-Direct bridge method.
4. **Settings UI (renderer)** — rewire existing "Connect Instagram" button to new IPC. Add subtitle: "Your IG must be linked to a Facebook Page." Keep "Connect Facebook" button untouched.
5. **[src/main/oauth/instagram-oauth.js](src/main/oauth/instagram-oauth.js)** — can be deleted after verification (do this at the end, not preemptively).
6. **[src/main/oauth/instagram-publish.js](src/main/oauth/instagram-publish.js)** — no changes. Existing `useIgGraph=false` branch is what we'll hit.

### C. TikTok refresh fix (bundled)

7. **[src/main/oauth/tiktok.js:294](src/main/oauth/tiktok.js:294)** — add `clientSecret` parameter to `refreshAccessToken`, include in POST body.
8. **[src/main/main.js:2557](src/main/main.js:2557)** — pass `clientSecret` (already resolved in scope above this call).

---

## Verification

1. Build + reinstall 0.1.2-alpha (or bump to 0.1.3-alpha).
2. Disconnect current IG account (which is IG Direct Login flow) in Settings.
3. Click new "Connect Instagram" → Meta OAuth dialog should show IG + Page-read scopes, no `pages_manage_posts`.
4. After consent: only an Instagram account record appears in Settings, no FB Page record.
5. Click "Connect Facebook" separately → confirm Page-only flow still works and saves only a FB Page record.
6. Retry the existing failed Arc Raiders clip in queue → IG publish succeeds via resumable upload (look for `useIgGraph=false` in app log).
7. TikTok: trigger a publish that requires a token refresh (or wait until refresh path fires) → should no longer return "malformed parameters."

## Out of scope

- App review submission to Meta for `instagram_content_publish` advanced access (separate workstream — current dev mode access is sufficient for testing with the linked IG account).
- TikTok content posting audit ([#83](https://github.com/Oghenefega/clipflow/issues/83)) — separate session.
- Migration script for users with old IG Direct Login records — disconnecting + reconnecting in Settings handles it manually.

## Effort & risk

- **Effort:** ~60–75 min code + ~5 min user reconnect.
- **Risk:** Low. Publish code path (`useIgGraph=false`) is already proven; only OAuth + account-record glue is new. TikTok fix is 4 lines.
