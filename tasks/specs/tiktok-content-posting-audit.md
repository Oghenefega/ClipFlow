# TikTok Content Posting API — Audit-Pass Spec

> Goal: Pass TikTok's Content Posting API audit on first submission so `direct_post` (instant publishing) stops returning `unaudited_client_can_only_post_to_private_accounts` and ClipFlow can publish to TikTok.
>
> Status: Application started on TikTok dev portal. Stuck at "Supporting documents" step because ClipFlow's current TikTok UX doesn't meet TikTok's [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/). Audit will reject any submission until UX gaps are closed.

---

## Why this exists

ClipFlow's TikTok integration *technically works* (token routing fixed in session 36, Production Client Key confirmed correct) — but the Content Posting API has its own audit track separate from the overall app approval. TikTok requires `direct_post` apps to expose specific per-post user controls on the export screen. Without them, the audit team rejects the recording, no matter how clean the code is.

Today (2026-05-09) we discovered:
- Login Kit: approved ✅
- Content Posting API audit: never submitted ❌
- Without that audit, every direct_post API call returns the "unaudited_client" error, forcing posts to SELF_ONLY (which the API then rejects on the init step entirely).

The user explicitly wants **Path A — do it correctly the first time**. No iterative rejections.

---

## Required UX (per TikTok Content Sharing Guidelines)

Reference: https://developers.tiktok.com/doc/content-sharing-guidelines/

Each item below MUST be visible on ClipFlow's export-to-TikTok screen **before** the user clicks the final "Publish" button. The audit recording will be paused at this exact moment for the reviewer to verify.

| # | Requirement | Current ClipFlow | Action |
|---|-------------|------------------|--------|
| 1 | **Privacy level selector** — user picks one of: `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, `SELF_ONLY` (only options returned by `creator_info/query`) | ❌ hardcoded `PUBLIC_TO_EVERYONE` | Add per-clip selector. Default to first allowed option from creator_info. Persist on `clip.tiktokOptions.privacy_level`. |
| 2 | **Disable Duet** toggle | ❌ missing | Add. Default off (allow duet). Persist on `clip.tiktokOptions.disable_duet`. |
| 3 | **Disable Stitch** toggle | ❌ missing | Add. Default off (allow stitch). Persist on `clip.tiktokOptions.disable_stitch`. |
| 4 | **Disable Comment** toggle | ❌ missing | Add. Default off (allow comments). Persist on `clip.tiktokOptions.disable_comment`. |
| 5 | **Posting target display** — must clearly show the TikTok handle the post will go to, e.g. "Posting as @fega" | ⚠️ partial (display name shown in pill but not "@handle" near publish action) | Add explicit "@handle" label adjacent to the TikTok options panel. Pull from `account.username` (stored at OAuth time as `displayName`). |
| 6 | **Music Usage Confirmation** disclosure | ❌ missing | Add a small italic line below the toggles: *"By posting, you confirm your video and its audio comply with [TikTok's Music Usage Confirmation](https://www.tiktok.com/legal/page/global/music-usage-confirmation/en)."* |
| 7 | **Link to Branded Content / Community Guidelines** | ❌ missing | Add a small footer link: *"Posts must follow [TikTok's Community Guidelines](https://www.tiktok.com/community-guidelines)."* |
| 8 | **`creator_info/query` called before showing the selector** so the allowed privacy options match the user's account state (e.g. private accounts can't post Public) | ⚠️ called inside `tiktok-publish.js` at publish time, not on UI mount | Move/duplicate: call `creator_info/query` when the user opens the TikTok options panel; populate the privacy dropdown from `creatorInfo.privacy_level_options`. |

---

## Implementation plan

### Data shape (additive — no migration needed)

New optional field on the clip object:

```js
clip.tiktokOptions = {
  privacy_level: "PUBLIC_TO_EVERYONE",  // or "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY" etc.
  disable_duet: false,
  disable_stitch: false,
  disable_comment: false,
}
```

Persisted via existing `projectUpdateClip` IPC — no schema migration.

### Files to touch

1. **`src/renderer/views/QueueView.js`** — add a TikTok options sub-panel inside the per-platform caption card when TikTok is the active platform. New state: `tiktokCreatorInfo` (allowed privacy levels, fetched on panel open). New IPC call: `window.clipflow.tiktokQueryCreatorInfo(accountId)`. New persist function: `saveTiktokOptions(clip, partial)`. Update `publishClip` and `retryFailed` to pass `clip.tiktokOptions` through `tiktokPublish` IPC.

2. **`src/main/main.js`** — add a new IPC handler `tiktok:queryCreatorInfo` that calls `tiktokPublish.queryCreatorInfo(accessToken)` and returns `{ privacy_level_options, ... }`. Update existing `tiktok:publish` handler to accept and forward the per-clip options.

3. **`src/main/oauth/tiktok-publish.js`** — extend `publish()` and `initializeUpload()` to accept `{ privacy_level, disable_duet, disable_stitch, disable_comment }` from caller. (The underlying `initializeUpload` already accepts these in `postInfo` — just need to plumb them through.)

4. **`src/main/preload.js`** — expose `tiktokQueryCreatorInfo`.

### Sequence per clip

1. User toggles TikTok platform on for a clip in the queue.
2. QueueView fetches `tiktokQueryCreatorInfo` (cached for 5 min per account to avoid re-querying on every interaction).
3. TikTok options panel renders: privacy dropdown (populated from `privacy_level_options`), 3 toggles, handle display, compliance text, guideline links.
4. User adjusts options → `saveTiktokOptions(clip, partial)` writes via `projectUpdateClip` + `updateClipInState` (uses today's staleness pattern).
5. On Publish click, `publishClip` reads `clip.tiktokOptions` and passes them in the `tiktokPublish` IPC payload.
6. `tiktok-publish.js` includes them in the `/v2/post/publish/video/init/` body.

### Defaults & edge cases

- If `clip.tiktokOptions` is missing, treat as: `privacy_level = creatorInfo.privacy_level_options[0]` (first allowed), all toggles `false`.
- If `creator_info/query` fails (offline, token expired), show panel with a banner "Couldn't load TikTok options — check connection." Disable the Publish-to-TikTok button until refresh.
- If user changes platforms toggled on/off, panel mounts/unmounts but persisted options stay on clip.

### Verification

1. Disconnect + reconnect TikTok with audited Production Client Key (assumes audit passes by then — for testing pre-audit, hack the flag).
2. Pick a clip, enable only TikTok, open the options panel — verify all 4 controls visible.
3. Pick non-default values (e.g. Friends only, disable comments).
4. Publish — confirm TikTok account shows the post with the chosen privacy and comments disabled.
5. Retry path: simulate a failure, retry — verify same options are reused (not reset to defaults).
6. Persistence: edit options, switch tabs, come back — values persist.

### Effort

90–120 minutes including UI polish + verification.

### Risk

Low. Additive data field, no schema migration, isolated to TikTok publish path. Doesn't touch IG/FB/YT flows.

---

## Screen recording playbook (for the audit submission)

TikTok requires up to 3 MP4s, **each ≤ 50MB**, that together cover four user flows. Below is the exact recording plan once the UX above is in place.

### Tools

- **Recorder:** Windows Game Bar (Win+G) OR OBS Studio. Game Bar simplest.
- **Resolution:** 1920×1080 max — keep file size down.
- **Format:** MP4 (H.264) — Game Bar default.
- **Audio:** Mic optional. If you narrate, keep it short and factual.
- **Editing:** Trim only — no captions/zooms/transitions. Reviewers want raw flow.

### Pre-recording checklist

- [ ] ClipFlow rebuilt with the new TikTok options UX
- [ ] TikTok currently disconnected in ClipFlow Settings (so we can record the connect flow)
- [ ] A test clip already rendered and visible in the Queue tab
- [ ] You're signed into the TikTok account you want to test with, in your default browser
- [ ] No private/sensitive content visible in your screen background (close other apps, hide bookmarks bar)

### Recording 1 — TikTok authorization flow (≤ 1 min, target ~10MB)

1. Open ClipFlow → Settings → Connected Accounts.
2. Click **Connect TikTok**.
3. Browser opens to TikTok auth page → show the scope grant screen.
4. Click **Authorize**.
5. Browser shows redirect/callback success → return to ClipFlow.
6. ClipFlow now shows TikTok as connected with account display name.

Save as `01-tiktok-auth.mp4`.

### Recording 2 — Navigate to export + configure post (≤ 90s, target ~25MB)

1. Open ClipFlow → Queue tab.
2. Click into a rendered clip.
3. Show the TikTok platform pill enabled.
4. Show the **TikTok options panel** clearly — pause briefly on:
   - Privacy level selector (open the dropdown to show all options)
   - Three interaction toggles
   - "Posting as @username" line
   - Music Usage Confirmation text
   - Community Guidelines link
5. Adjust at least one setting (e.g. set privacy to "Only Me" so the audit test doesn't post publicly, toggle off comments).
6. Show the caption box with text in it.

Save as `02-tiktok-export-configure.mp4`.

### Recording 3 — Trigger publish + show result (≤ 90s, target ~15MB)

1. Click **Publish Now** (still inside the clip in Queue).
2. Show the per-platform publish status indicator turning from pending → publishing → done.
3. Once successful, switch to the TikTok app or TikTok web on the same device and show the post appearing in your profile with the correct privacy badge (Only Me) and comments disabled.
4. End.

Save as `03-tiktok-publish-result.mp4`.

### After recording

- Total size: should be 40–50MB across all three files. If any single file is over 50MB, re-record at lower bitrate or trim more aggressively.
- Upload all three on the audit form's "Supporting documents" step.
- Use the "API response data fields" disclosure text already drafted in session 36 (see `tasks/specs/tiktok-content-posting-audit.md` body below).

---

## "API response data fields" form answer

Paste this verbatim in the second field of the Supporting documents step:

> ClipFlow stores the following TikTok API response fields locally on the user's device (encrypted at rest where applicable):
>
> - `access_token` (encrypted) — to make authenticated API calls
> - `refresh_token` (encrypted) — to renew the access token before expiry
> - `expires_in` / token expiry timestamp — to detect when refresh is needed
> - `open_id` — to identify the connected TikTok account internally
> - `scope` — to enforce capability boundaries inside the app
> - `display_name`, `avatar_url`, `username` — to render the connected-account UI element
>
> After each successful publish:
> - `publish_id` and `post_id` — stored in a local publish history log so the user can see which clips were posted
> - The full raw API response — stored once per attempt for local debugging only; not transmitted anywhere
>
> No data is uploaded to any third-party server. All storage is on the user's local machine.

---

## Out of scope for this issue

- ClipFlow's Instagram, Facebook, YouTube publish flows (separate audits/products)
- The auto-fire scheduler (separate issue — see session 36 plan)
- TikTok analytics, comment management, or any read-side API
- Bulk publishing or agency-style workflows (ClipFlow is solo-creator only — this is part of the audit narrative)
- The Login Kit audit (already passed)

---

## Definition of done

- All 7 UX requirements above are visible on the per-clip TikTok options panel in a fresh 0.1.x build
- Three recordings made per playbook, each ≤ 50MB, totaling ≤ 50MB combined
- All "Supporting documents" form fields filled per copy in this spec
- Form submitted on TikTok developer portal
- Decision email received (approval or rejection-with-reason)

If approval: TikTok publishing fully unblocked, can ship 0.1.x with TikTok as a flagship integration.
If rejection: read the specific reason, fix the gap, resubmit. Spec is durable — keep iterating against it.
