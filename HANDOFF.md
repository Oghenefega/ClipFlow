# HANDOFF — Session 275 (2026-09-23)

## Current State

Fega is on **0.5.0-alpha.13** (installed 21:15, feed and app both confirmed). It ships s273's #458/#459, s274's #460/#461, and this session's #463: scheduled clips missed while Corva was closed no longer all post at once. On first launch, migrations v13/v14 ran, the #458 repair refreshed 147 taste rows, and the #461 backfill recorded 17 reposts. #458 is closed on that log line.

## Key Decisions

- **Missed clips move by WHOLE HOURS (#463, 46ca0e9).** This was Fega's correction of the first version (3479a87), which respaced from "now" and lost his :30 posting minute.
  - The shift is the fewest hours that bring the oldest missed clip back to now, minus a 5-minute grace. Every missed clip moves by that same shift, so gaps (hourly, 45 min, anything) and the minute past the hour survive without detecting a pattern.
  - A clip that isn't due yet moves only when it would land within `min(its booked gap, 1h)` of the clip before it, again by whole hours. The first clip with room stops the push.
  - Nothing moves unless the oldest due clip is more than 5 minutes late.
  - Worked example: 1:30/2:30/3:30 opened at 5:00 → 5:30/6:30/7:30, and a 5:30 clip → 8:30. Opened at 5:32, the first posts now.
- **Cost of the whole-hours rule:** the first missed clip can wait up to ~55 min for its minute. Fega accepted this over a pattern-detecting variant.
- **The new times are written to `scheduledAt`** in the Queue's local no-zone format (`localSlot`), so the Queue shows them and they stay editable. One OS notification per respace.

## Next Steps

1. **Ask Fega (#463):**
   > "Did you get a chance to try the missed-clips fix? Schedule two clips an hour apart at :30, close Corva until both times are more than 5 minutes past, then reopen it. You should get a notification, and the Queue should show both moved to the next :30 slots, still an hour apart. Did they?"

   On a yes, close #463.
2. **Now askable, since alpha.13 is installed (#461):**
   > "Open the Tracker, go back to Sep 2–4, and click one of the Robot clips you reposted this week. The popup should list the repost's day, and pressing it should jump there. Does it?"

   On a yes, close #461 and remove `status: untested`.
3. **Still unanswered from s274:**
   > "The ↻ mark on a repost's own card sits in the top row, next to the game tag. For a 4-letter game like 100T it squeezes the tag down to '10…'. Want me to move it into the title line, where the ↻2 on originals already sits? I'd say yes."
4. **Carried from s273/s274:**
   - the #454/#456/#457 check question;
   - one real in-app run of #459 (check commit free first) and its post-installer question;
   - the feedback rows #3/#29 question;
   - a Fable review of e0d3cdd, 92f0972, fe8a8dc, 3479a87 and 46ca0e9;
   - re-taking the replay-harness baseline before the next detection experiment.
5. **#462 (repost payoff analysis)** waits for a few days of `clip_metrics_history` per repost.

## Watch Out For

- **#463 only fires in the installed app.** The scheduler refuses to start on source runs and on the dev profile (#376), so the only real proof is on Fega's install. `src/main/__tests__/publishRespace.test.js` is the correctness check.
- **Respace runs before `dueClips` in the same tick, and `dueClips` re-reads disk.** A clip moved to exactly now (or within the grace) posts in that same tick. Don't cache the project list across the two calls.
- **Whole-hour shifts are millisecond adds.** Across a DST change the local minute is still kept, but the hour label jumps with the clock. That's acceptable; don't "fix" it with calendar math.

## Logs/Debugging

- Respace lines in `%APPDATA%\Corva\logs\app.log`: `Scheduler: missed-slot respace moved "<title>" from <old> to <new>`. A failed write logs `couldn't move` and stops the push.
- alpha.13's first launch (21:15:23) in app.log: migrations v13/v14, `#458 ... refreshed from the clips: 147` (backup `clipflow.db.bak-pre458`), `#461 reposts recorded from the library: 17`.
