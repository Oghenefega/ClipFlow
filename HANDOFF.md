# HANDOFF — Session 274 (2026-09-23)

## Current State

Fega's installed copy is still 0.5.0-alpha.12. Source (fe8a8dc) holds s273's #458/#459 plus two things from this session, none of it in an installer yet:
- **#460:** YouTube no longer gets a thumbnail.
- **#461:** reposts are tagged, linked both ways, and recorded in a new `reposts` table.

The What's New "unreleased" entry covers all of it.

## Key Decisions

- **Dropped YouTube thumbnails (#460, 92f0972).** `thumbnails.set` stores the image, but no Shorts surface shows it. Cards, search, the /shorts page and even the watch page's `og:image` use YouTube's auto frames (`oar1`–`oar3`). Google staff confirmed on issuetracker 561838826 (Won't Fix, 2026-09-18) that only Studio reaches that slot, and they have an internal parity request with no date. Restore from `92f0972^` if the Data API revision history ever announces Shorts parity. #452 closed as moot.
- **Repost identity is the FIRST post.** A repost of a repost counts under the original, in both the renderer's `repostIndex` (App.js) and `reposts.original_clip_id`.
- **The repost list comes from two sources.** Posted reposts come from `trackerData`, whose row outlives a deleted clip. Scheduled and in-Queue ones come from the clips. A repost deleted before it posts drops out of the UI but keeps its DB row with `posted_at` NULL.
- **The original's `↻N` sits in the card's title line, not the top row.** Beside a 4-letter tag ("100T") the top row squeezed the tag to "1…" at 1280 px.
- **Analytics reads the renderer index,** so `analytics.js` is unchanged (a deviation from the plan). Times in `reposts` are local "YYYY-MM-DD HH:MM", taken from the tracker's slot times.

## Next Steps

1. **Question for Fega**, asked at the end of s274 and not yet answered:
   > "The ↻ mark on a repost's own card sits in the top row, next to the game tag. For a 4-letter game like 100T it squeezes the tag down to '10…'; you can see it on your Sep 6 reposts. Want me to move it into the title line, where the new ↻2 on originals already sits? You'd see the game name again, and both marks would be in the same place. I'd say yes."
2. **After the next installer, ask Fega:**
   > "Open the Tracker, go back to Sep 2–4, and click one of the Robot clips you reposted this week. The popup should list the repost's day, and pressing it should jump there. Does it?"

   On a yes, close #461 and remove `status: untested`.
3. **Carried from s273,** still open, and still needing Fega or an installer:
   - the #454/#456/#457 check question (see s272/s273 wording in git history of HANDOFF.md);
   - one real in-app run of #459 (check commit free first);
   - a Fable review of e0d3cdd, 92f0972 and fe8a8dc, per the model/effort split;
   - the post-installer #459 question, and closing #458 once app.log shows the repair line;
   - the feedback rows #3/#29 question;
   - re-taking the replay-harness baseline before the next detection experiment.
4. **Installer batch:** source now holds #458, #459, #460 and #461. That's close to cut-worthy if Fega wants to try the repost tags.
5. **#462 (repost payoff analysis)** waits for data. Each repost needs a few days of `clip_metrics_history` first.

## Watch Out For

- **The first launch after the next installer runs two one-time jobs:** the #458 taste-row repair and the #461 repost backfill (expect `#461 reposts recorded from the library: 17`). Both wait if W: isn't mounted. Fega's prod DB has **no** `maintenance_runs` table yet (user_version 0 in the copy). Migrations v13 and v14 both run on that launch.
- **TrackerView jumping uses `document.querySelector('[data-tracker-clip=…]')` plus `card.click()`.** The attribute name must stay unique across tabs, because every tab pane stays mounted.
- **CDP tab switching in tests:** hidden panes are still in the DOM, so find/click by text can hit a hidden tab's element. Click the nav tab by coordinates (Tracker is around 765,828 at 1280x860), or filter by `offsetParent`.
- The changelog hook blocks any git commit command containing the word "wrap". Reword; don't bypass.

## Logs / Debugging

- **app.log (system):** `#461 reposts recorded from the library: N`, and on failure `#461 repost backfill failed: …`. Also `Running migration v14: Create reposts…`.
- **app.log (repost-log scope):** `recordRepost failed` / `markPosted failed` (logging never blocks a repost or a post).
- **Query:** `SELECT * FROM reposts` in `%APPDATA%\Corva\data\clipflow.db`. The module header in `src/main/repost-log.js` has the join against `clip_metrics`.
- **Publish log (#460):** YouTube success entries no longer carry `thumbnail`; older entries still have `thumbnail:{status:"set"}`.
- **Scratchpad `662e37e4-…/scratchpad/`:**
  - `fx461.js` seeds the repost fixture on top of the s271 kit (`9d76305b-…/scratchpad/fx271/setup.js --accounts`, then `restore.js`). Back up the dev DB around it.
  - `backfill-probe.js` runs the backfill on a prod-DB copy.
  - `yt/` holds the thumbnail evidence (`oar2`/`oar3`/`maxres` downloads, `compare.jpg`).
