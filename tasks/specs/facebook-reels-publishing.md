# Facebook Reels Publishing

> Goal: move Facebook publishing off the legacy Page video endpoint and onto the Reels
> endpoint, so ClipFlow's vertical clips actually enter Facebook's short-form distribution
> surface. Keep the existing video endpoint alive as a fallback for clips that fall outside
> Facebook's Reels duration window.
>
> Status (2026-07-24): diagnosed and specced by Wick (GM agent). Fega has already fixed the
> visibility half of the problem (see below). This spec covers the distribution half.
> All code anchors verified against this repo 2026-07-24.

---

## Background: why this exists

Fega reported that every video ever posted to his Facebook page via ClipFlow had **zero
views**, while Instagram and TikTok were normal. Investigation found two independent causes.

**Cause 1 (FIXED by Fega, 2026-07-24, no code involved).** The Meta app "ClipFlow Pages
Publisher" (app ID `713765408423963`) was in Development mode. Per Meta's documentation,
content published by a development-mode app "can only be seen by role users", so Fega could
see his own posts as app admin while the public could not. He switched the app to Live mode
on 2026-07-24. Meta un-hides that content retroactively. **Nothing to build for this.**

**Cause 2 (THIS SPEC).** `src/main/oauth/facebook-publish.js:73` posts to
`/{page-id}/videos`, which creates a legacy Page video post, not a Reel. Compare
`src/main/oauth/instagram-publish.js:154`, which correctly sends `media_type: "REELS"`.
On Facebook, short-form distribution lives in the Reels surface. A 9:16 clip sent to
`/videos` lands in the page's Videos tab and never enters the Reels feed.

Note: the publish pipeline itself is healthy. Every Facebook upload in
`AppData/Roaming/ClipFlow/logs/app*.log` succeeded with a returned video ID and zero errors.
Do not go looking for an upload bug. There isn't one.

## Render compliance (already verified, do not re-encode)

All 28 clips in Fega's render folder were probed against Facebook's Reels requirements:

| Requirement | Actual | Verdict |
|---|---|---|
| 9:16 aspect | 1080x1920, all 28 files | Pass |
| Frame rate 24 to 60 fps | 60 fps | Pass |
| Audio AAC / 48kHz / stereo / 128kbps+ | AAC, 48kHz, stereo, ~194kbps | Pass |
| Duration 3 to 90 seconds | 8.6s to 90.7s | One file over |

**This is an API swap only.** No render pipeline changes, no re-encoding, no reframing.
The single outlier is `Absolutely Not Taking On That Lipper.mp4` at 90.73s.

## Locked decisions (Fega, 2026-07-24)

1. **Clips outside the Reels duration window post as a normal video, not an error.**
   Fega's call, and it is the right one: the `/videos` code path already exists and has
   never failed, so it becomes a proven fallback rather than dead code. A clip over 90
   seconds cannot be a Facebook Reel, so a regular video post is its correct home.
2. **The guard is symmetric: 3 to 90 seconds inclusive uses Reels, anything outside uses
   the legacy video post.** Facebook Reels has a 3-second floor as well as the 90-second
   ceiling. Fega's shortest clip today is 8.6s, so the floor is defensive only.
3. **Never fail the whole multi-platform publish over Facebook's format boundary.** The
   fallback must be silent-but-logged, not a user-facing error.
4. **No native Facebook scheduling in this change.** The Reels endpoint supports
   `video_state=SCHEDULED` with a `scheduled_publish_time`, which would let Facebook posts
   fire without ClipFlow being open. That is a genuine future win given the scheduler's
   app-must-be-open limitation, but it is scope creep here. Ship the publish fix first.

## The build

### Reference implementation

`src/main/oauth/instagram-publish.js` already implements this exact pattern against the
same Meta upload infrastructure: create a session, upload binary to a returned URL with
`Authorization: OAuth <token>` plus `offset` and `file_size` headers, then finalize. Adapt
it. Do not invent a new HTTP layer; the helpers in that file are the model.

### Phase 1: start the upload session

```
POST https://graph.facebook.com/v21.0/{page-id}/video_reels
  upload_phase=start
  access_token={page-access-token}
```
Returns `{ video_id, upload_url }`.

### Phase 2: upload the binary

```
POST https://rupload.facebook.com/video-upload/v21.0/{video-id}
  Authorization: OAuth {page-access-token}
  offset: 0
  file_size: {bytes}
  Content-Type: application/octet-stream
  <binary body>
```
Prefer the `upload_url` returned by phase 1 verbatim if present, rather than reconstructing
the URL.

### Phase 3: finish and publish

```
POST https://graph.facebook.com/v21.0/{page-id}/video_reels
  video_id={video-id}
  upload_phase=finish
  video_state=PUBLISHED
  description={caption}
  access_token={page-access-token}
```
Returns `{ success, post_id }`.

### Status polling between phases 2 and 3

Meta's public reference does not document the status shape for `video_reels` as clearly as
it does for Instagram containers. `GET /{video-id}?fields=status` is the endpoint to use.
**Log the full raw response on the first real run** and adapt from what actually comes back,
rather than trusting field names from documentation. Mirror the Instagram polling shape
(10s interval, generous ceiling, bail out with a clear error on a terminal status). If
polling proves unnecessary because `finish` blocks until ready, drop it and say so.

### API version

The repo standardises on `v21.0` (`GRAPH_API_VERSION` in both meta.js and
facebook-publish.js). Keep v21.0. `video_reels` is long-established and available there. Do
not bump the version as part of this change.

## File impact

- **`src/main/oauth/facebook-publish.js`** — the substantive work. Keep the existing
  `publishVideo` logic intact as the fallback path (rename to something like
  `publishLegacyVideo`), add the three-phase `publishReel`, and add a duration probe plus
  router that picks between them. FFmpeg/ffprobe is already available in the app; reuse
  whatever the codebase already uses for media probing rather than adding a dependency.
- **`src/main/main.js:3199-3216`** — the `facebook:publish` IPC handler. The call signature
  should not need to change. Line 3212 currently records `postId: result.videoId`; it should
  prefer a real `postId` when the Reels path returns one.

Nothing else in the app touches Facebook publishing.

## Return shape

Both paths should return a consistent object so the caller does not branch:

```js
{ videoId, postId, status, surface: "reels" | "video" }
```

`surface` must reach the publish log. When Fega asks why a clip underperformed, the log
should answer it without a code read.

## Bonus win: real Facebook post links

The Reels finish phase returns a `post_id`, which the legacy `/videos` endpoint never gave
us. Today the tracker stores a video ID that is not a usable link. Derive and store a real
Facebook URL where one is available, matching how YouTube links are already handled, so
`platformResults` (added in the Phase 1 tracker work) finally carries a clickable Facebook
link. Do not fabricate a URL for the legacy path if one cannot be derived reliably; leave it
null rather than store a link that 404s.

## Verification (Fega-runnable)

1. Publish a clip **under 90 seconds** to Facebook. It appears in the page's **Reels** tab,
   not only the Videos tab.
2. The publish log records `surface: "reels"` and a real post ID.
3. The tracker shows a Facebook link that actually opens the post.
4. Publish `Absolutely Not Taking On That Lipper.mp4` (90.73s). It posts successfully as a
   normal video, logs `surface: "video"`, and the multi-platform publish does not fail.
5. A multi-platform publish still succeeds end-to-end across all four platforms.
6. After 24 hours, a Reels-path post shows non-zero views.

Check 6 is the one that actually proves the fix. Checks 1 through 5 can pass while the real
outcome is still wrong, so do not call this done on build-clean alone.

## Gotchas

- **Rate limit:** 30 API-published Reels per 24 hours per page. Fega's cadence is well under
  this, but surface a clear message on error 613 rather than a raw API dump.
- **Error codes worth handling by name:** 613 (rate limit), 6000 (upload problem), 190 (auth
  or expired token), 100 (bad parameter), 200 (permissions).
- **Token type:** this uses the **Page** access token (`account.pageAccessToken`), not the
  user token. The existing handler already resolves this correctly at main.js:3191.
- **App is now Live.** If OAuth starts failing after the mode switch, have Fega reconnect
  Facebook in Settings before assuming a code bug.
- **`business_management` scope** (`meta.js:42`) is requested by the Facebook flow and is
  likely unnecessary for page posting. Out of scope here, but flag it if it causes friction
  during reconnect; it is a heavier permission than this feature needs.
