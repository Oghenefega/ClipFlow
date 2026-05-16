# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## Active Plan: TikTok Content Posting API audit-pass UX (Session 38)

**Spec:** [`tasks/specs/tiktok-content-posting-audit.md`](specs/tiktok-content-posting-audit.md)
**Issue:** [#83](https://github.com/Oghenefega/ClipFlow/issues/83)
**Trigger:** TikTok dev portal form is open at Step 3 ("Supporting documents"). The form is parked in a browser tab waiting for the 3 MP4 recordings that this plan unblocks.

### Goal

Build the 9 UX/behavioral items the audit reviewer scores against, ship them in a fresh `0.1.x` build, record the 3 MP4s, and submit the form. Outcome: TikTok `direct_post` stops returning `unaudited_client_can_only_post_to_private_accounts` and ClipFlow can publish public TikTok posts.

### Scope (the 9 items, see spec for full rationale)

| Group | ID | Item |
|---|---|---|
| Visible on panel | A1 | "Posting as <nickname>" header (uses `account.displayName` — TikTok's "nickname" is `display_name`) |
| | A2 | Privacy dropdown sourced from `creator_info.privacy_level_options`, **no default value** |
| | A3 | Three interaction toggles (Disable Duet / Stitch / Comment), none checked by default |
| | A4 | Music Usage Confirmation italic line with link |
| | A5 | Commercial Content Disclosure (master toggle + 2 sub-options + conditional labels + conditional legal text + privacy constraints) |
| Behavioral | A6 | Grey-out toggles when `creator_info.{duet,stitch,comment}_disabled` is true |
| | A7 | Block publish if `clip.duration > creator_info.max_video_post_duration_sec` |
| | A8 | Block publish if `creator_info` reports the creator is at posting capacity |
| | A9 | Post-publish "may take a few minutes to appear" notice |

### File impact

| File | Change |
|---|---|
| `src/main/main.js` | (a) New IPC handler `tiktok:queryCreatorInfo`. (b) Migration in store-init section that bumps schema version (no-op for additive fields). (c) `tiktok:publish` handler ([line 2527](../src/main/main.js:2527)) accepts and forwards per-clip TikTok fields; the hardcoded `privacy_level: "PUBLIC_TO_EVERYONE"` at [line 2584](../src/main/main.js:2584) is removed. |
| `src/main/oauth/tiktok-publish.js` | `publishVideo` lines 344–346 ripped out (the `creatorInfo.duet_disabled` auto-fill). Replaced with caller-supplied `privacy_level` / `disable_duet` / `disable_stitch` / `disable_comment`. `initializeUpload` body grows `brand_content_toggle` + `brand_organic_toggle`. |
| `src/main/preload.js` | New export `tiktokQueryCreatorInfo` ([near line 210](../src/main/preload.js:210)). |
| `src/renderer/views/QueueView.js` | (a) New TikTok options sub-panel inside the per-platform caption card ([rendered near line 1107](../src/renderer/views/QueueView.js:1107)) when `pk === "tiktok"`. (b) New local state for `tiktokCreatorInfo[accountId]`. (c) New save functions matching the `saveYoutubePrivacy` pattern for each `clip.tiktok*` flat field. (d) Both publish call sites — [line 499](../src/renderer/views/QueueView.js:499) and [line 671](../src/renderer/views/QueueView.js:671) — pass the new fields through. (e) Publish button gate: disabled until privacy picked + (if commercial disclosure on) at least one sub-option picked + duration + capacity OK. |

Total: 4 files. No new files needed.

### Build sequence (risk-isolated waves)

Per `.claude/rules/pipeline.md`: **migration is written first, before any data-shape change.** Each wave below is independently verifiable before moving to the next.

#### Wave 0 — Migration (skipped — not applicable)

Discovered during execution: the new `clip.tiktok*` fields live in per-project JSON files (`{watchFolder}/.clipflow/projects/{id}/project.json`), not in electron-store. The `projects.updateClip` function ([projects.js:210](../src/main/projects.js:210)) is a pure spread (`{ ...existing, ...updates }`) with no schema concept — missing fields read as `undefined` and consumers default with `||` / `??`.

The pipeline rule fires for **electron-store** schema changes specifically. No electron-store change is happening in this feature, so no migration is required.

- [x] N/A — verified during execution, plan adjusted in-flight.

#### Wave 1 — Backend plumbing (no UI yet)

- [ ] Extend `tiktokPublish.publishVideo` in `tiktok-publish.js` to accept caller-supplied options; remove the auto-fill from creator_info.
- [ ] Add `brand_content_toggle` and `brand_organic_toggle` to the `initializeUpload` body. Verify field names against the live `/v2/post/publish/video/init/` API docs at build time.
- [ ] New IPC handler `tiktok:queryCreatorInfo` in `main.js`.
- [ ] New `tiktokQueryCreatorInfo` export in `preload.js`.
- [ ] Extend `tiktok:publish` handler to accept the per-clip fields; remove the hardcoded `PUBLIC_TO_EVERYONE`.
- [ ] Verify: from DevTools console, call `await window.clipflow.tiktokQueryCreatorInfo("<accountId>")` and confirm it returns `privacy_level_options`, the three `*_disabled` flags, `max_video_post_duration_sec`, and the capacity flag.

#### Wave 2 — Panel shell + A1, A2

- [ ] Add the TikTok options sub-panel skeleton inside the per-platform caption card.
- [ ] A1: render "Posting as <account.displayName>" in the panel header.
- [ ] A2: privacy dropdown populated from `creator_info.privacy_level_options`, **blank by default**, saves to `clip.tiktokPrivacy` via new `saveTiktokPrivacy` helper.
- [ ] Publish button disabled until `clip.tiktokPrivacy` is set.
- [ ] Verify: open a clip with TikTok enabled, panel renders, dropdown is blank, Publish button disabled until a privacy is picked. Switch tabs and back — selection persists.

#### Wave 3 — A3 toggles + A6 grey-out

- [ ] Three toggles (Disable Duet / Stitch / Comment), each saves to its own flat field. All default false (unchecked).
- [ ] If `creator_info.duet_disabled === true`, force the Disable Duet toggle ON, disable interaction, render with reduced opacity + the standard "locked" cursor. Same for stitch/comment.
- [ ] Verify: toggles work independently, state persists across tab switches, grey-out behavior triggers when creator_info says a feature is disabled (test by mocking the response or — if a real test account is available — by toggling the setting in TikTok app and re-opening the panel).

#### Wave 4 — A4 disclosure + A9 success notice

- [ ] Music Usage Confirmation italic line with link to `https://www.tiktok.com/legal/page/global/music-usage-confirmation/en`.
- [ ] On successful publish, add an inline "Your post may take a few minutes to appear on your TikTok profile." line to the per-platform status row.
- [ ] Verify: text visible in correct typography (theme.js tokens), link opens externally, success-notice appears after a real or simulated publish_complete.

#### Wave 5 — A5 Commercial Content Disclosure (the meaty one)

- [ ] Master toggle (`clip.tiktokCommercialDisclosure`), default off. Saves via new helper.
- [ ] When ON: render two checkboxes for `clip.tiktokIsYourBrand` and `clip.tiktokIsBrandedContent`, both default off.
- [ ] Conditional label rendering per spec §"Commercial disclosure behavior":
  - Only Your Brand: "Your photo/video will be labeled as 'Promotional content'."
  - Only Branded Content (or both): "Your photo/video will be labeled as 'Paid partnership'."
- [ ] Conditional legal text:
  - Branded Content active (alone or with Your Brand): swap Music Usage Confirmation line for "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation." with both linked.
- [ ] Privacy constraint: when Branded Content is on, filter `SELF_ONLY` out of the privacy dropdown. If `clip.tiktokPrivacy === "SELF_ONLY"` at the moment Branded Content gets toggled on, clear it and show inline "Branded content cannot be set to private — please choose a different privacy level."
- [ ] Publish gate: if `clip.tiktokCommercialDisclosure === true` AND neither sub-option is checked, disable Publish with tooltip "You need to indicate if your content promotes yourself, a third party, or both." (verbatim from guideline).
- [ ] Forward `brand_content_toggle` / `brand_organic_toggle` in the publish call (already plumbed in Wave 1).
- [ ] Verify: all five states from spec §"Commercial disclosure behavior" produce the correct label, legal text, privacy options, and publish gate behavior.

#### Wave 6 — A7 duration check + A8 capacity check

- [ ] Compare `clip.duration` (already on the clip object) against `creator_info.max_video_post_duration_sec`. If over, inline error "This clip is X seconds — TikTok only allows up to Y seconds for this account." Publish disabled.
- [ ] If creator_info's capacity flag indicates the account is at limit, inline error "This account has reached its TikTok posting limit — try again later." Publish disabled.
- [ ] Verify: pick a deliberately too-long clip — error shows, publish blocked. Mock the capacity flag to simulate limit — error shows, publish blocked.

#### Wave 7 — Build, install, smoke

- [ ] `npm run build` → fresh installer in `dist/`.
- [ ] Install the new build. Daily update banner picks it up automatically since version differs.
- [ ] Run the full 11-step verification list from the spec on the installed exe (not the dev profile).
- [ ] If any verification step fails, fix and reinstall before recording.

#### Wave 8 — Record + submit

- [ ] Per spec §"Screen recording playbook":
  - [ ] `01-tiktok-auth.mp4` — disconnect → connect → authorize → reconnected
  - [ ] `02-tiktok-export-configure.mp4` — open clip → TikTok panel → exercise every visible control
  - [ ] `03-tiktok-publish-result.mp4` — Publish click → status row → check post on TikTok
- [ ] Total size ≤ 50 MB combined; each file ≤ 50 MB. Trim with built-in Windows Photos app if needed.
- [ ] Upload the 3 files on the parked TikTok dev portal Step 3.
- [ ] Paste the "API response data fields" answer from spec §"API response data fields" into the second text field.
- [ ] Click Next → Review → Submit.

### Verification criteria (final, ship gate)

These are the gates between "code complete" and "form submitted":

1. All 9 items implemented per spec.
2. All 11 spec verification steps pass on the installed build.
3. Migration runs cleanly against an existing prod profile (no data loss, no crash, schema version bumped).
4. Three recordings produced, total ≤ 50 MB.
5. Form fields filled per spec.
6. `CHANGELOG.md` entry added under today's date.
7. Code committed and pushed to master per the global auto-commit rule.

### Effort estimate

Per spec: **~3.25 hours** of build + ~30 min recordings + ~10 min form submission. Realistic session: one focused 4-hour block.

### Risk

- **Low** for migration (additive, no transform).
- **Medium** for A5 conditional logic (5 interacting states). Wave 5 verification step is non-negotiable.
- **Low** for TikTok payload changes — verify `brand_content_toggle` / `brand_organic_toggle` field names against live API docs in Wave 1.
- **Process risk:** the dev portal tab must stay open through the multi-hour build, OR Steps 1+2 must be re-entered from screenshots. Mitigated by screenshotting Step 2 before building.

### Approval gates

1. **Now (Gate 1):** approve this plan as written, request changes, or split into smaller chunks. **No code written until Gate 1 passes.**
2. **End of Wave 1 (Gate 2):** demo of `tiktokQueryCreatorInfo` returning live data from DevTools — confirms backend plumbing works before any UI investment.
3. **End of Wave 5 (Gate 3):** screenshot of the panel with all states exercised, before recording. Last chance to catch UX issues cheaply.
4. **Before submitting (Gate 4):** review the three recordings together — anything off, re-record.

---

## Deferred plans

### Interactive architecture/flows visualizer

A previous session drafted a plan for a single-page HTML architecture visualizer to live in the Obsidian vault (`context/architecture/`) using vis-network 9.x. Never approved or started. Plan body is recoverable from git history (`git log -p tasks/todo.md` before the TikTok plan replaced it). Re-introduce when the TikTok audit is shipped and there's appetite for a docs-quality artifact.
