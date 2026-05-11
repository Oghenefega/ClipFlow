# ClipFlow — Session Handoff
_Last updated: 2026-05-11 — Session 36 — 0.1.2-alpha: queue staleness, IG token routing + endpoint fix, retry-failed publishes, auto-fire scheduler, thumbnail URLs, Test pill consistency, TikTok audit spec'd_

---

## One-line TL;DR

**Built 0.1.2-alpha. Eleven things land: schedule persistence, YT-description per-game lookup, IG token routing (`loginType` infer + backfill) plus the deeper `/me/media` endpoint fix, retry-failed-publishes with disk persistence, 60s auto-fire scheduler, thumbnail-URL `#`/`?` encoding, TestChip-on-queue, plus diagnostic logging that turned vague TT/IG errors into actionable codes. TikTok Content Posting audit is now spec'd in [#83](https://github.com/Oghenefega/ClipFlow/issues/83) for the next session to execute end-to-end.**

---

## Action item — install 0.1.2-alpha (~118 MB)

`dist/ClipFlow Setup 0.1.2-alpha.exe` was overwritten **five times** during this session as features stacked. Final timestamp: **2026-05-11 01:17**. Daily should show the update banner on next launch — click Install. Once installed, run through "How to verify" below.

---

## What shipped (session 36)

### Group 1 — Queue + publish foundation

1. **Save Schedule + 8 other clip-mutations now refresh local state** ([QueueView.js](src/renderer/views/QueueView.js)). New `updateClipInState` helper plus `setLocalProjects` plumbed from App.js. Without this the disk got written but UI showed stale data — scheduled clips didn't appear in the Scheduled section, etc.
2. **YT description per-game lookup fixed for multi-word games.** Was matching `"rocket league"` (display-name lowercased) against `"rl"` (`clip.gameTag` lowercased) — never resolved. Now matches either `gamesDb.tag` (short form) OR `gamesDb.hashtag` (slug) against the clip's gameTag.
3. **Retry-failed-publishes feature.** Per-platform results persist on `clip.publishState` so failure state survives app restart. Partial-fail clips stay in queue with Retry button; `logPost` only fires on full success of currently-enabled platforms (not all-platforms-ever).
4. **Auto-fire scheduler** — 60s tick + once on mount. Clears `scheduledAt` at fire time to prevent double-fire. Skips test clips. Stable-interval ref pattern so closure always sees latest `publishClip`. Logs `[Scheduler] Firing scheduled publish:` to DevTools console for visibility.

### Group 2 — Visual polish

5. **Thumbnail URLs encode `#` and `?`** via new `toFileUrl()` helper in [components/shared.js](src/renderer/components/shared.js). Applied at 7 render sites. Clips with hashtags in their filenames (e.g. `Something Is WRONG ... #rocketleague_thumb.jpg`) now render their thumbnails — Chromium had been silently truncating at the `#` fragment delimiter.
6. **TestChip on Queue tab** — replaced two inline disabled-button representations with the existing yellow-glow `<TestChip isTest disabled />`. Queue now matches Projects/Rename/Recordings.

### Group 3 — Instagram

7. **`loginType` is now persisted in token store** ([token-store.js](src/main/token-store.js)). OAuth callbacks were passing it but `saveAccount` dropped it. Added to entry shape + a `setLoginType(id, value)` backfill helper.
8. **Publish handler infers IG Business Login** when `loginType` is blank, `platform === "Instagram"`, and `accountId` starts with `ig_`. Backfills via `setLoginType` on first fire. This fixed the original `"Cannot parse access token"` error — graph.facebook.com couldn't read IG-format tokens.
9. **`/me/media` for IG Business Login** ([instagram-publish.js](src/main/oauth/instagram-publish.js)). The OAuth response's `user_id` field is the Instagram-Scoped User ID (IGSID), not the Instagram User ID the Content Publishing API expects at `/{ig-user-id}/media`. Routed both container-create and media-publish through `/me/...` for IG Business Login (FB Login flow kept explicit ID since it gets the right ID from `page.instagram_business_account.id`).
10. **OAuth diagnostic** — `fetchProfile` now also requests the `id` field and logs both `id` and `user_id` at connect time.

### Group 4 — Diagnostics that surfaced root causes

11. **TikTok + IG error codes now visible.** TikTok's init failure includes the actual code + log_id in the thrown error string. IG's container-creation surfaces `type`, `code`, `error_subcode`, `fbtrace_id`. Without these we'd have stayed stuck. Specifically they revealed:
   - **TikTok:** `unaudited_client_can_only_post_to_private_accounts` — TikTok Content Posting API has its own audit track separate from Login Kit, and Fega had only completed Login Kit. Application started this session, got stuck at "Supporting documents" → filed as **[#83](https://github.com/Oghenefega/ClipFlow/issues/83)** with the full spec at [`tasks/specs/tiktok-content-posting-audit.md`](tasks/specs/tiktok-content-posting-audit.md) for the next session to complete.
   - **IG:** `code=100, sub=33` "Object with ID does not exist" — diagnosed as the IGSID/IG-User-ID mismatch, fixed via the `/me/media` change above.

---

## Open verification items

These shipped but need you to run them in the installed daily:

1. **IG publish via `/me/media`** — click Retry Failed on the Arc Raiders clip currently in the queue. Should succeed. If it does, IG is fully unblocked.
2. **Auto-fire scheduler** — schedule a clip 2 minutes out, wait. Open DevTools → Console → watch for `[Scheduler] Firing scheduled publish:` at the scheduled time. Within 60s of `scheduledAt` the publish should kick off automatically.
3. **Retry-failed across restart** — schedule something with IG disabled. Let it fail on IG. Close + reopen ClipFlow. Verify the clip still shows as "failed" with the Retry button available (publishState hydrated from disk).
4. **TestChip on Queue** — any test-project clip in the queue should show the yellow-glow TEST chip, not a muted gray "Test" button.

---

## Filed for follow-up

### [#83](https://github.com/Oghenefega/ClipFlow/issues/83) — TikTok Content Posting API audit

**Spec:** [`tasks/specs/tiktok-content-posting-audit.md`](tasks/specs/tiktok-content-posting-audit.md). Full plan including 7 UX requirements, file-by-file implementation, additive `clip.tiktokOptions` data shape, three-MP4 scripted recording playbook, and verbatim form copy. Effort estimate ~2.5h end-to-end including recording. **This is the next session's clean kickoff** — read the spec end-to-end before starting.

Why it's here, not done: TikTok's Content Sharing Guidelines require specific per-post UX controls (privacy selector populated from `creator_info/query`, three interaction toggles, handle display, Music Usage Confirmation text, Community Guidelines link). ClipFlow today exposes none of those — they'd reject the audit recording on sight.

### [#82](https://github.com/Oghenefega/ClipFlow/issues/82) — Cache OAuth avatars to disk (still open)

No movement this session. Filed in session 35; durable fix for IG/TikTok signed-URL expiry. Independent of #83.

---

## Pre-launch issue list snapshot

Open issues unchanged from session 35 unless noted. Two additions this session: **#83 filed**, **#78 still untouched** (the big subtitle-edits-lost one — flagged session 34, still the most architecturally significant pre-launch bug after publishing flows are settled).

(Full open list in session-35 HANDOFF — not re-pasting here to keep this file scannable. Run `gh issue list --repo Oghenefega/ClipFlow --state open --limit 50` at next session start.)

---

## Watch out for

- **0.1.2-alpha was rebuilt with the same filename five times** during this session as features stacked. The newest one (timestamp **2026-05-11 01:17**) has everything. If you accidentally installed an earlier 0.1.2-alpha from earlier in the session, it'll be missing pieces — reinstall from `dist/` to be safe.
- **Auto-fire scheduler only fires while ClipFlow is running.** If you schedule 10 PM and the app is closed at 10 PM, nothing happens at 10 PM. On next launch the first tick (within ~1s of mount) catches anything overdue and fires it. True background scheduling requires Supabase + cron worker (separate, pre-launch).
- **The `isDev` hardcode in main.js:325 is still false.** `npm run dev` starts Vite on localhost:3000 but Electron loads `build/index.html`. Existing wart, not addressed this session.
- **All my `npm start` / dev-source Electron windows from this session were killed by `taskkill /IM electron.exe /F` during rebuilds.** If you have a dev-source ClipFlow open later, that's a fresh launch, not lingering state from today.
- **Main-process changes (token-store, main.js, oauth/*.js) only take effect on full app restart**, not Ctrl+R. Reinstalling 0.1.2-alpha forces this anyway, but worth knowing for next session's iteration loop.
- **The TikTok publish flow still hardcodes `PUBLIC_TO_EVERYONE`** at line 122 of [tiktok-publish.js](src/main/oauth/tiktok-publish.js). This is part of what #83's UX rebuild will replace — until then, even after audit approval, every TikTok post would go public regardless of user intent.
- **The Instagram `igAccountId` field is still stored on the account record** even though we now publish via `/me/media`. Harmless — it's just not used by the IG Business Login path anymore. Could be cleaned up but not pressing.

---

## Logs / debugging

- **App log (prod profile):** `%APPDATA%\clipflow\logs\app.log` — most useful trace from this session is around `2026-05-09 09:41:14` (first TT/IG failures), then `16:21:05` (loginType backfill), then `16:36:59` (post-`/me/media` test, where IG and TT both showed the new diagnostic codes).
- **Publish log:** `%APPDATA%\clipflow\clipflow-publish-log.json` — JSON history of every publish attempt with timestamps, status, error, and (where captured) raw apiResponse.
- **DevTools console** — `[Scheduler] Firing scheduled publish:` lines are visible from the auto-fire tick. Open with Ctrl+Shift+I in the running app.
- **Build artifacts:** `build/index-*.js` is ~1.87 MB minified, ~547 KB gzipped (2728 modules). `dist/ClipFlow Setup 0.1.2-alpha.exe` is ~118 MB.

---

## Next steps for next session — candidate priorities

**Strongest single-session candidate: #83 (TikTok Content Posting audit).** Spec is durable, ~2.5h, unblocks the last social platform. Read [`tasks/specs/tiktok-content-posting-audit.md`](tasks/specs/tiktok-content-posting-audit.md) before starting.

**Strong alternatives:**
- **#78** — saved subtitle edits silently lost on reopen. Still the biggest architectural pre-launch bug. Needs a decision on `clip.subtitles.sub1` vs `clip.transcription` as the source of truth.
- **Fix the `isDev` hardcode.** ~30–45 min, pays off every dev session thereafter (and would let HMR work in `npm run dev`).
- **Clear out a few cosmetic pre-launch issues** (#69, #70, #74, #5, #7) for momentum.

If #83 lands cleanly and you have time the same session, follow up with #82 (avatar caching) — small, isolated, finishes the OAuth-data-hygiene loop.

---

## Session model + cost

- **Model:** Sonnet throughout.
- **Commits this session:** none yet — wrap-up commit pending.
- **Issues filed:** 1 (#83).
- **Issues closed:** 0.
- **Tag candidate after this session:** `git tag stable-2026-05-11-session-36` for instant rollback if 0.1.2-alpha breaks something subtle.
