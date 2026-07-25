# ClipFlow — Session Handoff

_Last updated: 2026-07-24 — Session 127 — **Rebuilt AI title/caption generation around Fega's real published copy (#183). The 14k-char prompt framework was itself the cause of the slop. Shipped as 0.4.0-alpha.1; installed, first read is lukewarm, issue stays open.**_

---

## One-line TL;DR

Fega said the AI titles and captions were unusable and that he hadn't taken a single suggestion in days. His own data confirmed it: **of 31 distinct published titles, 28 were hand-written**, and all three he did accept were edited before posting — every time by cutting the second clause ("The pass was PERFECT and I still blew it" → "The pass was PERFECT"). Three independent causes: the model had **never seen the clips** (transcript only, while clip *detection* has sent frames since #85); the prompt was **14,207 chars of stacked rules** (3 pillars, 4 drivers, 6 worked examples, 11 anti-patterns), which is what produced the flatness, because the model ends up optimizing for satisfying every rule at once; and there was **no voice data** — `styleGuide` was empty, suggestions died in memory on app close, and captions were never recorded at publish at all. Fixed all four phases, cut 0.4.0-alpha.1.

## Current State

Shipped and installed: **0.4.0-alpha.1**. Fega installed it, generated clips, and reported the output is "a bit better" — a lukewarm first read, not a confirmation. **#183 stays open** (its "done means" checklist has the creator-confirmation box unchecked).

## What Was Just Built

All four phases of #183 — commit `d69af67`, version bump `ce216d5`:

- **Frames.** `ffmpeg.extractClipStills()` samples 4 stills across the clip's real cut window (`nleSegments`, falling back to start/end), downscaled to a 640px long edge, cached per clip under `userData/processing/frames/titlecaption/<clipId>/`. ~5s cold, 1ms cached. Wired in via `collectClipFrames()` in `main.js`.
- **Prompt rewrite.** `title-caption-prompt.js` went 14,207 → ~4,200 chars. The pillars/drivers/worked-example framework is gone; the budget now goes to ~20 titles Fega actually published, read live from the new table. Length spec 5-10 → **3-7 words**, plus an explicit "a fragment beats a sentence, no second clause" rule.
- **Training data.** New `title_caption_rounds` table (**schema v5**) in `title-caption-log.js`: transcript, all 6 suggestions, final published title + caption, and a `title_source` classification (`ai` / `ai_edited` / `self` / `unknown`). Written at **publish** time (from `QueueView.logPost`) so hand-written titles are captured. 35 rows backfilled from the publish log + trackerData.
- **View ranking.** `youtubeOAuth.fetchVideoStats()` pulls view counts using the video ids already stored in `trackerData.platformResults`; examples order by views, then source (`self` > `ai_edited` > `ai`), then recency. Runs once/day, 30s after boot.

Also fixed in passing: the publish log recorded `clipTitle` but never the caption — `clipCaption` added to all four platform handlers.

## Key Decisions

- **The prompt WAS the problem, not just missing context.** Removing rules improved output more than adding context did. The old framework's reasoning is preserved in `caption-frameworks.md` §4 — it belongs in docs, not in the model's context. **Don't reinstate it.**
- **Log at publish, not at accept.** Accept-time logging is what the old `titleCaptionHistory` did, and it structurally cannot see a hand-written title — which is 28 of 31 of the real data, i.e. the most valuable examples.
- **Backfill runs every startup, no "done" flag.** The flag would live in electron-store (shared by source-prod and the packaged exe) while the table lives in a DB they don't share. See Watch Out For.
- **Rank hand-written above verbatim-AI.** Feeding a model its own past output back as an example is how a voice flattens out.
- **Version sizing: minor bump, not an alpha tick.** The last two installers were repairs; this one adds capability (it learns from what gets published, and sees the footage).

## Next Steps

1. **Get a real read on the titles.** "A bit better" isn't enough to close #183. Note he said "**subtitles**" — worth confirming he means the AI titles/captions and not the karaoke subtitles, which this session did not touch at all. If he genuinely meant subtitles, the titles haven't actually been evaluated yet.
2. **Check the training table is filling.** After a few publishes: `SELECT title_source, COUNT(*) FROM title_caption_rounds GROUP BY title_source`. If everything lands as `self`, the suggestions still aren't being used and the prompt needs another pass.
3. **Confirm the view-count refresh ran.** Fires 30s after boot, once a day. Look for "Refreshed YouTube view counts" in app.log. Degrades silently to recency ordering if the account is disconnected — by design, but confirm it isn't silently failing forever.
4. **Watch the too-literal failure mode** (see below).
5. Pre-existing backlog is unchanged — run the start-session ritual for the current list.

## Watch Out For

- **The new prompt sometimes runs too literal on weak transcripts.** "One reagent and bio #arcraiders" is lifted straight off the audio. Shorter and much truer to voice than the old output, but the floor is lower. If this becomes the main complaint the fix is probably a "don't quote the transcript verbatim" rule — **not** a return to the framework.
- **`clip.caption` is the on-screen burned-in hook text** — two short lines, contains `\n`. It is NOT the social post caption; those are assembled per-platform from templates in `QueueView.resolveCaption`. The old prompt didn't know this and wrote them like tweets. Don't re-break it.
- **Never guard DB-side one-time work with an electron-store flag.** `clipflow-settings` is shared by prod-from-source and the packaged exe; `DB_DIR` in `database.js` is not (`<repo>/data` vs `userData/data`). A flag set by one context starves the other's table permanently. The backfill is idempotent and runs every boot instead.
- **The single-instance lock blocks `npm start` while the installed app is open.** Correct behaviour (#156), but it meant the app could not be verified from source this session. To test main-process changes without touching the daily driver: use the dev profile (`npm run dev`), or run headless against a **copy** of the DB (pattern below).
- **Never run `asar extract-file` with the repo as CWD** — it overwrites `package.json` with the stripped packaged copy. Grep the asar bytes directly instead.

## Logs/Debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log`. New entries use the `title-generation` module scope: "Title/caption backfill seeded rows", "Refreshed YouTube view counts", "Recorded published copy", "Clip frame extraction failed".
- **Inspect the training table headlessly (no Electron):** stub `electron` and `electron-log/main` via a `Module.prototype.require` shim, point `app.getPath` at a temp dir, and copy the DB in first. Key detail: set `process.env.CLIPFLOW_PROFILE='dev'` so `DB_DIR` resolves to `<stubbed userData>/data` instead of the repo.
- **Verify what shipped:** `npx asar list dist/win-unpacked/resources/app.asar | grep title-caption` — confirmed all four new/changed files present. `grep -c "THE 4 DRIVERS" <asar>` returns **0**, confirming the old framework is genuinely gone from the packaged app.
- **A/B harness output** is at `tmp/dbtest/ab-results.json`, blind comparison page at `tmp/titles-ab.html` (both gitignored). The old prompt is recoverable via `git show 4f86e1a:src/main/ai/title-caption-prompt.js`.
- **Frame extraction check:** stills land in `%APPDATA%\clipflow\processing\frames\titlecaption\<clipId>\still_<t*100>.jpg`. If suggestions seem blind to the footage, check that dir is populating — a silent empty result means generation fell back to transcript-only, which is the designed degradation and logs a warning rather than failing.

## Verification Status

**Verified:** migration v5 clean against a copy of the real DB with prior data intact (64 feedback, 129 file_metadata rows); backfill idempotent (35 inserted, 0 on re-run); source classification 7/7 on real edit pairs; frame extraction on a real Rocket League clip (568×640, scoreboard and clock legible); renderer + installer build clean; asar contents confirmed.

A/B against the live API on 5 real clips: avg title length **7.2 → 4.9 words** (Fega's own published average is 5.5). On one clip the new prompt independently produced "All part of the plan #rocketleague" — a title he had written himself.

**Not verified:** in-app behaviour beyond Fega's one "a bit better". No confirmation yet that a live publish writes a `title_caption_rounds` row, or that the daily view refresh succeeds against his YouTube account.
