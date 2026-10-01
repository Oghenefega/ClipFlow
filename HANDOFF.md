# HANDOFF — Session 281 (2026-10-01)

## Current State

**0.5.0-alpha.17 is on the update feed.** It carries two changes:
- the YouTube layout starter (s280)
- the Rename tab's relink tip for Resolve and Premiere (#473)

Fega has been told to relaunch and click Install. Nothing is unreleased.

## Key Decisions

- **#473 "Keep original file name" is parked, not built.** Fega can now relink Resolve himself: his editing agent Dizzy ran a Resolve script that calls `MediaPoolItem.ReplaceClip(newPath)` once per source file, which brings every cut back. The steps are in a comment on #473.
- **Customers get a tip instead.** It's a closable strip on the Rename tab's Pending list, with the Resolve and Premiere steps (store key `relinkTipDismissed`). Build the full feature only if beta testers hit the problem.
- **Fega asked for this cut explicitly**, with two changes waiting. The ~10-change batch rule was overridden on his request.

## Next Steps

1. **Ask Fega to check the Resolve wording in the tip.** Suggested wording:
   > "Next time you're in Resolve, right-click a clip in the Media Pool. Is there an option called 'Replace Selected Clip'? The new Rename tab tip tells people to use it, and nobody has clicked through it yet. If it's named differently, I'll fix the text."
2. **Ask Fega whether the React switch works on his installed app** (carried over from s280). Suggested wording:
   > "Did flipping Reacting on a real reaction recording give the right name and Day, and do your reaction shows sit under their games in Settings? If yes, I'll clear the untested flags on #472 and #474-#477."
3. **#478 (split quirks):** a code fix with no question for Fega. Plan it when there's room: month folder, Pt numbering, and what to do with the original.

## Watch Out For

- **The Premiere steps in the tip are also unverified:** Link Media, then untick File Name under "Match File Properties". They come from general knowledge. Fega doesn't use Premiere.
- **The dev profile watches the real Recordings folder.** To test anything on the Rename tab, repoint `watchFolder` at a scratch folder and put it back afterwards (see Logs). Never click Rename there otherwise.
- **The Day counter reuses the current Day for dates on or before `lastDayDate`.** Test numbering with dates after the entry's last Day.
- **A rare Day collision remains:** a whole reaction row plus a split reaction part for the same entry, renamed in one batch, can share a Day (`renumberRows` doesn't look inside scrubber markers).
- **The Bash tool eats backslashes** in inline JS. Write CDP scripts that contain Windows paths to a file, then run `node cdp.js "$(cat file)"`.

## Logs / Debugging

- **Rename-tab test recipe used this session:**
  1. `ffmpeg` testsrc makes a 3 s file named `2026-09-29 20-00-00.mp4` in a scratch folder.
  2. Point dev `watchFolder` at that folder with `storeSet`, then restart the dev app; the file shows as pending a few seconds after boot.
  3. Afterwards, restore `watchFolder` to `W:\YouTube Gaming Recordings Onward\Recordings` and `relinkTipDismissed` to false. Both are already restored.
- **The What's New modal covers the dev window** on the first boot after a version change. Click "Got it" over CDP before taking screenshots.
- `taskkill //F //IM electron.exe` worked this session. Never use it on `Corva.exe`.
