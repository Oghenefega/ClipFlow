# TikTok Content Posting API — Audit-Pass Spec

> Goal: Pass TikTok's Content Posting API audit on first submission so `direct_post` (instant publishing) stops returning `unaudited_client_can_only_post_to_private_accounts` and ClipFlow can publish to TikTok with `PUBLIC_TO_EVERYONE` privacy.
>
> Status (2026-05-15): Application restarted from scratch on TikTok dev portal. Step 1 (General Information) and Step 2 (API client information) complete with the new "Flowve / ClipFlow" framing. Step 3 (Supporting documents) requires three screen recordings the app cannot yet produce — the export-to-TikTok UX is missing 5 mandatory controls per TikTok's [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/). This spec covers closing that gap and recording the submission.

---

## How TikTok's audit actually works

The Supporting Documents step asks for **3 MP4 recordings**, each covering one user flow:

1. TikTok authorization page (the OAuth consent screen)
2. Navigation to the Export / Post-to-TikTok page inside the app
3. What happens after the Post-to-TikTok action is triggered

Those are the **deliverables**, not the requirements. The submission form's item 4 ("Be sure to read the Content Sharing Guidelines… to meet all the UX implementation requirements") points to the rubric the reviewer scores the videos against. The reviewer watches your 3 recordings and verifies the on-screen UX matches the guidelines page. Anything visible-on-screen that the guidelines mandate must appear in the recording, or the submission is rejected.

This spec is built around hitting the live guidelines as of 2026-05-15. Re-fetch the guidelines page before building if more than ~2 weeks have passed — TikTok edits this doc without notice and minor wording shifts (e.g. "no default value" vs "default to first allowed") can flip an item from compliant to non-compliant.

---

## Requirements scope — 9 items

ClipFlow already does 4 of TikTok's guideline items for free (preview of the to-be-posted clip is rendered, no promotional watermarks are added, upload only starts on explicit Publish click, the title/caption field is fully editable with no forced preset text). The 9 items below are the real work.

### Group A — Visible on the export panel (the reviewer must see these on screen)

| # | Requirement | Live-guidelines quote / paraphrase | Current state | Notes for build |
|---|---|---|---|---|
| A1 | **"Posting as @handle"** label adjacent to the publish action | *"The upload page must display the creator's nickname, so users are aware of which TikTok account the content will be uploaded to."* | ⚠️ Partial — display name shown in the per-platform pill but not adjacent to the publish controls | Pull from `account.username` (set at OAuth time as `displayName`). Render inside the TikTok options panel header. |
| A2 | **Privacy level dropdown**, options sourced from `creator_info.privacy_level_options`, **no default value** (user must actively pick before publish becomes enabled) | *"The options listed in the UX must follow the `privacy_level_options` returned in the `creator_info API`. Users must manually select the privacy status from a dropdown and there should be no default value."* | ❌ Hardcoded to `PUBLIC_TO_EVERYONE` in publish call | The "no default" rule is non-obvious — most users would expect a default. Implementing it means publish button stays disabled until privacy is picked. |
| A3 | **Three interaction toggles** — Disable Duet, Disable Stitch, Disable Comment. None checked by default. | *"Users must manually turn on these interaction settings and none should be checked by default."* | ❌ Missing UI; publish call currently forwards `creator_info.duet_disabled` etc. as the user choice (wrong direction) | Each toggle's *default* is OFF (= allow). Greyed-out behavior in A6 is separate. |
| A4 | **Music Usage Confirmation** disclosure text near the publish action | *"By posting, you agree to TikTok's Music Usage Confirmation."* + linked Music Usage Confirmation page | ❌ Missing | Small italic line below the toggles. Anchor "Music Usage Confirmation" to `https://www.tiktok.com/legal/page/global/music-usage-confirmation/en`. |
| A5 | **Commercial Content Disclosure** toggle (OFF by default) with two sub-options — "Your Brand" and "Branded Content" — and the conditional label/policy rules below | *"Apps must include a content disclosure setting—turned off by default—allowing users to indicate if content promotes a brand, product, or service."* | ❌ Entirely missing — this is the biggest new addition since the original spec | Behavior rules in §"Commercial disclosure behavior" below. This is the most complex item in the build. |

### Group B — Behavioral (won't show in a recording but must work correctly)

These won't appear in a 90-second recording, but the audit reviewer may exercise edge cases or check the codebase narrative. They cost little but are part of "compliance" — skipping them risks rejection on a careful review.

| # | Requirement | Live-guidelines quote / paraphrase | Current state | Notes for build |
|---|---|---|---|---|
| A6 | **Grey-out conditional** on toggles: if `creator_info` returns that the creator has disabled duet/stitch/comment in their TikTok app settings, ClipFlow's corresponding toggle must be **forced on, disabled, and greyed-out** | *"If the `creator_info API` returns that one or more of these interactions have been disabled in their app settings, your UX must disable and grey out the checkbox for the interaction."* | ❌ Not implemented (we currently silently auto-fill it server-side) | Read `creator_info.{duet,stitch,comment}_disabled` and lock the corresponding toggle in the panel. |
| A7 | **Video duration check** against `creator_info.max_video_post_duration_sec` before publish | *"API clients must check if the duration of the to-be-posted video follows the `max_video_post_duration_sec` returned in the creator_info API."* | ❌ Not implemented | Read clip duration (already known from `clip.duration`), compare, block publish + show inline error if exceeded. |
| A8 | **Posting capacity check** — if `creator_info` says the creator can't post more right now, ClipFlow must block and show "try again later" | *"When the creator_info API returns that the creator can not make more posts at this moment, API Clients must stop the current publishing attempt and prompt users to try again later."* | ❌ Not implemented | The creator_info response includes a `can_post` / capacity flag — block publish, show banner. |
| A9 | **"Processing may take a few minutes" notification** after a successful publish, before the post is visible on the user's profile | *"API Clients must clearly notify users that after they finish publishing their content, it may take a few minutes for the content to process and be visible on their profile."* | ⚠️ The per-platform status row already shows "Processing…" → "done" — borderline OK, but the guideline calls for an explicit user-facing message about visibility delay | Add one line to the success state: "Your post may take a few minutes to appear on your TikTok profile." |

---

## Commercial disclosure behavior (A5) — detailed rules

This is the most complex item because it has internal conditional logic. Get this wrong and the audit fails on a careful review.

State (flat fields on the clip, per the data-shape decision in §"Data shape & migration" below):

```js
clip.tiktokCommercialDisclosure  // master toggle — false by default
clip.tiktokIsYourBrand           // "Your Brand" sub-option — false by default
clip.tiktokIsBrandedContent      // "Branded Content" sub-option — false by default
```

Behavior:

1. **Master toggle OFF (default):** sub-options hidden. Music Usage Confirmation is the only legal text shown. Publish button enabled (subject to other constraints).
2. **Master toggle ON, no sub-option picked:** publish button disabled. Tooltip on hover: *"You need to indicate if your content promotes yourself, a third party, or both."* (verbatim from the guideline).
3. **Only "Your Brand" picked:** show label *"Your photo/video will be labeled as 'Promotional content'."* Music Usage Confirmation text remains the only legal disclosure. Privacy options unchanged.
4. **Only "Branded Content" picked:** show label *"Your photo/video will be labeled as 'Paid partnership'."* Legal disclosure changes to *"By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation."* (both links). **Privacy:** `SELF_ONLY` must be removed from the dropdown — branded content cannot be private. If user had picked `SELF_ONLY`, force them to re-pick.
5. **Both picked:** label shown is *"Your photo/video will be labeled as 'Paid partnership'."* (paid partnership wins). Legal text is the branded-content variant (same as #4). Privacy constraint same as #4.

When forwarded to TikTok's `/v2/post/publish/video/init/`, the `post_info` payload gains:

```js
brand_content_toggle: clip.tiktokIsBrandedContent,
brand_organic_toggle: clip.tiktokIsYourBrand,
```

(Field names per current TikTok Content Posting API — verify against `/v2/post/publish/video/init/` request body docs before shipping.)

---

## Data shape & migration

New optional fields on the clip object, **flat** to match the existing pattern (`clip.youtubeTitle`, `clip.youtubePrivacy`):

```js
clip.tiktokPrivacy            // null until user picks; one of PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | FOLLOWER_OF_CREATOR | SELF_ONLY
clip.tiktokDisableDuet        // bool, default false
clip.tiktokDisableStitch      // bool, default false
clip.tiktokDisableComment     // bool, default false
clip.tiktokCommercialDisclosure // bool master toggle, default false
clip.tiktokIsYourBrand        // bool sub-option, default false
clip.tiktokIsBrandedContent   // bool sub-option, default false
```

Flat (vs. nested `clip.tiktokOptions`) is the deliberate choice — every per-clip per-platform field in ClipFlow today is flat (see `clip.youtubeTitle`, `clip.youtubePrivacy` right next door in [QueueView.js:1144](src/renderer/views/QueueView.js:1144)). Matching that style keeps grep/search/refactor consistent across the codebase.

**Migration requirement (per `.claude/rules/pipeline.md`):** even though these are additive optional fields with sensible defaults, the pipeline rule forbids unmigrated schema changes. Bump the project store schema version, and add a no-op migration that records the version increment. Reading clips without these fields continues to work because every consumer reads with `||` / `??` defaults — but the version bump enforces "we know this change happened" hygiene.

---

## Files to touch

1. **`src/renderer/views/QueueView.js`** — new sub-panel inside the per-platform caption card, rendered when the active platform pill is TikTok. New local state: `tiktokCreatorInfo` per account (re-fetched on panel mount; no cross-mount cache in v1 — add caching only if it shows up as a real concern). New IPC call to fetch creator info on panel mount. Persist `clip.tiktok*` flat fields via existing `projectUpdateClip` IPC + `updateClipInState`. Update `publishClip` (and `retryFailed`) to pass `clip.tiktok*` fields through `tiktokPublish` IPC.

2. **`src/main/main.js`** — new IPC handler `tiktok:queryCreatorInfo` that wraps `tiktokPublish.queryCreatorInfo(accessToken)`. Extend the existing `tiktok:publish` handler ([main.js:2527](src/main/main.js:2527)) to accept and forward the per-clip TikTok flat fields (replacing the hardcoded `privacy_level: "PUBLIC_TO_EVERYONE"` at [main.js:2584](src/main/main.js:2584)). Add the migration described above.

3. **`src/main/oauth/tiktok-publish.js`** — rip out the auto-fill at lines 344–346 (where `creatorInfo.duet_disabled` is currently copied into the publish call). Replace with: accept `disable_duet`/`disable_stitch`/`disable_comment`/`privacy_level` from caller, forward verbatim to `initializeUpload`. Add `brand_content_toggle` and `brand_organic_toggle` to the `post_info` body.

4. **`src/main/preload.js`** — expose `tiktokQueryCreatorInfo`. Pattern matches existing `tiktokPublish` export ([preload.js:210](src/main/preload.js:210)).

---

## Sequence per clip (user POV)

1. User opens the per-clip card in Queue tab and toggles the TikTok platform pill on.
2. ClipFlow calls `tiktok:queryCreatorInfo` for that TikTok account (cached 5 min per account to avoid hammering the API on every interaction).
3. TikTok options panel renders inside the per-platform caption card:
   - Header: *"Posting as @<handle>"* (A1)
   - Privacy dropdown, blank by default (A2)
   - Three toggles for duet/stitch/comment, all unchecked, with grey-out if creator_info disabled them (A3 + A6)
   - Commercial Content Disclosure section (A5) — master toggle OFF
   - Music Usage Confirmation disclosure (A4)
4. Publish button is disabled until privacy is picked AND (if commercial disclosure is ON) at least one sub-option is picked. Duration and capacity checks (A7, A8) also gate it; failures show inline errors.
5. On Publish click, `publishClip` reads the `clip.tiktok*` fields and passes them in the `tiktok:publish` IPC payload (both at the initial publish site [QueueView.js:499](src/renderer/views/QueueView.js:499) and the retry site [QueueView.js:671](src/renderer/views/QueueView.js:671)).
6. `tiktok-publish.js` injects them into `/v2/post/publish/video/init/`.
7. On success, the per-platform status row shows the new "may take a few minutes to appear" notification (A9).

---

## Defaults & edge cases

- `creator_info/query` fails (offline, token expired): show panel with banner *"Couldn't load TikTok options — check connection."* Publish button stays disabled until refresh.
- User edits any `clip.tiktok*` field, switches tabs, returns: values persist via `projectUpdateClip`.
- User toggles TikTok pill off then on again: panel remounts but stored options are preserved on the clip.
- Branded Content selected → `SELF_ONLY` previously chosen: clear the privacy field, force re-pick, with banner *"Branded content cannot be set to private — please choose a different privacy level."*
- Duration check (A7): if `clip.duration > creator_info.max_video_post_duration_sec`, show inline error *"This clip is X seconds — TikTok only allows up to Y seconds for this account."* Block publish.
- Capacity check (A8): show inline error *"This account has reached its TikTok posting limit — try again later."* Block publish, but leave the rest of the queue untouched.
- Retry path (failed publish, user retries): all `clip.tiktok*` fields are reused, never reset to defaults.

---

## Verification

Run all of these on a fresh `0.1.x` build before recording:

1. Disconnect + reconnect TikTok with the audited Production Client Key (for pre-audit testing, manually flip a `force_audited` flag or simply confirm the API returns the right `privacy_level_options` on your account).
2. Pick a clip, enable only TikTok, open the per-platform card — verify all 5 visible controls appear (A1, A2, A3, A4, A5).
3. Pick a non-default privacy (e.g. `MUTUAL_FOLLOW_FRIENDS`), toggle disable-comments on, leave commercial disclosure off — verify Publish enables.
4. Toggle commercial disclosure on with nothing picked — verify Publish disables and the tooltip text matches the guideline quote.
5. Pick "Your Brand" only — verify the "Promotional content" label appears, privacy options unchanged.
6. Pick "Branded Content" — verify the "Paid partnership" label, the branded-content legal text, and that `SELF_ONLY` is removed from the privacy dropdown.
7. Publish to a test account → confirm the post appears on TikTok with the chosen privacy, comments disabled, and (for branded-content tests) the correct label visible on the post.
8. Edge case: simulate `creator_info.comment_disabled = true` — verify the Comment toggle is forced on, disabled, and greyed.
9. Edge case: pick a clip longer than the account's `max_video_post_duration_sec` — verify the inline duration error fires and Publish is blocked.
10. Persistence: edit options, switch tabs, return — verify values survive.
11. Migration: launch a build that has the schema-version bump against an existing electron-store profile that pre-dates the change — verify no crash, no data loss.

---

## Effort estimate

- Plumbing (creator_info IPC, preload, tiktok-publish.js refactor): **~30 min**
- Panel UI + A1–A4 + A6 + A7 + A8 + A9: **~75 min**
- Commercial Content Disclosure (A5) with all conditional logic: **~60 min**
- Migration + verification per the 11-step list above: **~30 min**

**Total: ~3.25 hours of build before any recording.** Add 30 min for the recordings themselves.

Earlier estimates of 90–120 min are stale — they predated the commercial disclosure requirement.

---

## Risk

- **Low** for the per-clip data shape — additive field, migration is no-op.
- **Medium** for the commercial-disclosure conditional logic — five interacting states with subtle wording rules. Test all five branches before recording.
- **Low** for TikTok-side payload changes — `brand_content_toggle` / `brand_organic_toggle` field names should be re-verified against current API docs at build time. If TikTok's body field names have shifted, fix locally; the audit team won't see the payload itself.

---

## Screen recording playbook

TikTok requires up to **3 MP4s, each ≤ 50 MB**, that together cover the four flows in their form (auth, navigate-to-export, configure, publish-result). The auth flow is its own recording. The other two cover the export panel and the publish action.

### Tools

- **Recorder:** Windows Game Bar (Win+G) or OBS Studio. Game Bar is the simplest.
- **Resolution:** cap at 1920×1080 to keep file size down.
- **Format:** MP4 (H.264). Game Bar's default.
- **Audio:** optional. If you narrate, keep it short, factual, no marketing tone.
- **Editing:** trim only. No captions, zooms, transitions. Reviewers prefer raw flow.

### Pre-recording checklist

- [ ] ClipFlow rebuilt with all 9 items above, verified per the 11-step verification list.
- [ ] TikTok currently disconnected in ClipFlow Settings (so we can record the connect flow live).
- [ ] At least one test clip already rendered and visible in the Queue tab.
- [ ] You're signed into the TikTok account you want to test with, in your default browser.
- [ ] Nothing sensitive visible on screen (close other apps, hide bookmarks bar, no notifications).

### Recording 1 — TikTok authorization flow (≤ 60 s, target ~10 MB)

Save as `01-tiktok-auth.mp4`.

1. Open ClipFlow → Settings → Connected Accounts.
2. Click **Connect TikTok**.
3. Browser opens to TikTok auth page — show the scope grant screen clearly.
4. Click **Authorize**.
5. Browser shows the redirect/callback success → return to ClipFlow.
6. ClipFlow now shows TikTok as connected with the account display name.

### Recording 2 — Navigate to export + configure post (≤ 90 s, target ~25 MB)

Save as `02-tiktok-export-configure.mp4`.

1. Open ClipFlow → Queue tab.
2. Click into a rendered clip.
3. Show the TikTok platform pill enabled.
4. Pause briefly on the TikTok options panel so each item is visible:
   - "Posting as @username" header (A1)
   - Privacy dropdown — open it to show all options (A2)
   - Three interaction toggles (A3 + show one in grey-out state if creator_info supports it)
   - Music Usage Confirmation italic line with link (A4)
   - Commercial Content Disclosure toggle (A5) — toggle it on briefly to show the sub-options + conditional labels, then toggle off for the actual test publish
5. Set privacy to `SELF_ONLY` (so the test post doesn't go public) and toggle off comments.
6. Show the caption box with text in it.

### Recording 3 — Trigger publish + show result (≤ 90 s, target ~15 MB)

Save as `03-tiktok-publish-result.mp4`.

1. Click **Publish Now** inside the clip in Queue.
2. Show the per-platform publish status indicator: pending → publishing → processing.
3. On success, the "may take a few minutes to appear" notification (A9) is visible — pause on it.
4. Switch to the TikTok app or TikTok web on the same device, navigate to your profile, and show the post with the correct privacy badge (Only Me) and comments disabled.

### After recording

- Total size should be 40–50 MB across all three files. If any single file is over 50 MB, re-record at lower bitrate or trim.
- Upload all three on the audit form's "Supporting documents" step.
- Paste the "API response data fields" answer (below) into the second text field of the same step.

---

## "API response data fields" — paste verbatim

```
ClipFlow stores the following TikTok API response fields locally on the user's device (encrypted at rest where applicable):

- access_token (encrypted) — to make authenticated API calls
- refresh_token (encrypted) — to renew the access token before expiry
- expires_in / token expiry timestamp — to detect when refresh is needed
- open_id — to identify the connected TikTok account internally
- scope — to enforce capability boundaries inside the app
- display_name, avatar_url, username — to render the connected-account UI element

After each successful publish:
- publish_id and post_id — stored in a local publish history log so the user can see which clips were posted
- The full raw API response — stored once per attempt for local debugging only; not transmitted anywhere

No data is uploaded to any third-party server. All storage is on the user's local machine.
```

---

## Out of scope

- ClipFlow's Instagram, Facebook, YouTube publish flows (separate audits/products).
- Photo posts (TikTok's guidelines have a separate photo-post variant — ClipFlow is video-only, so the photo branch can be ignored).
- TikTok analytics, comment management, or any read-side API.
- Bulk publishing or agency workflows — ClipFlow is solo-creator only, and that's part of the audit narrative.
- The Login Kit audit (already passed).
- AIGC labelling — TikTok's content guidelines have a separate AIGC disclosure flow but it's not currently in the Content Sharing Guidelines as a mandatory pre-publish UX item. Re-check before shipping; if it has been added, this spec needs a 10th item.

---

## Definition of done

- All 9 items above are implemented and verified per the 11-step list.
- Migration shipped, project store schema version bumped.
- A fresh 0.1.x build is installed.
- Three recordings produced per playbook, each ≤ 50 MB.
- All "Supporting documents" form fields filled per copy in this spec.
- Form submitted on TikTok developer portal.
- Decision email received (approval or rejection-with-reason).

If approval: TikTok direct publishing is unblocked, and 0.1.x can ship with TikTok as a flagship integration.
If rejection: read the specific reason carefully, fix the gap, resubmit. This spec is durable — iterate against it.

---

## ROUND 2 — Denial (2026-06-03) + fix list

First submission (ref `20260516072018`, submitted 2026-05-16) was **DENIED 2026-06-03**. Dev-portal feedback, verbatim:

> "Your application did not follow our UX Guidelines." Cited **Point 5d**: *"API Clients must clearly notify users that after they finish publishing their content, it may take a few minutes for the content to process and be visible on their profile."* Plus: *"Make sure to read from Point 1 - Point 5… It's best to show the UX in order according to the order from the Guideline. App Name & Organization Name should be the same."*

Root cause: A1–A7 shipped in Session 39 and are compliant, but **A9 (the 5d notification) was never built**, the panel renders controls out of guideline order, and the portal App Name (ClipFlow) ≠ Organization Name (Flowve).

**Code fixes — all in `src/renderer/views/QueueView.js`, ~1hr:**

1. **A9 / Point 5d (BLOCKER):** add an explicit post-publish message — *"Your post may take a few minutes to appear on your TikTok profile."* — to the per-platform success state. Must be visible on screen (Video 3 must capture it).
2. **Panel reorder:** present controls in guideline order Point 1→5. Specifically move **Music Usage Confirmation** up into the Point-2 block (with privacy + interaction toggles), *above* the Commercial Disclosure section. Currently A4 renders after A5.
3. **A8 / Point 1:** add the posting-capacity check — if `creator_info` indicates the creator can't post now, block publish + show "try again later."
4. Cut a fresh `0.1.x` build, verify per the 11-step list, then re-record.

**Non-code (Fega, tracked in `Wick/tiktok-reapply-checklist.html`):** rename portal Org → ClipFlow (match App Name); reuse Video 1 (auth unchanged); re-shoot Video 2 (reordered panel) + Video 3 (must show the 5d notice); resubmit. All prior assets recovered (videos in `Desktop\ClipFlow stuff\ClipFlow TikTok Review Videos\`, domain-verification txts, live flowve.app legal pages).
