# HANDOFF — Session 278 (2026-09-24)

## Current State

**0.5.0-alpha.15 is on the update feed.** It adds one thing over alpha.14: imported clips link back to their original file, and removing an import no longer strands it (#471).
- **Queue:** imported clips show "from <original file>" under the title, plus a Show original button. There is now one "Remove import" option.
- **Tracker:** the clip panel shows "Imported from" and a Show original button, and no longer offers "Open in editor" for imports.
- **Boot repair:** stuck imports are cleaned up at launch.

#471 is closed and labelled `status: untested`. Fega's desktop has run alpha.15 (`lastSeenVersion`, 2026-09-28). Its first boot repaired both real stuck imports, "A brazilian hopped in my chat" and "What are these Arc Raiders Outfits?!", and cleared their memory entries (prod `app.log`, 00:24:44). He hasn't confirmed anything in chat yet.

## Key Decisions

- **Imports keep being copied into `ClipFlow Imports`** (Fega: "keep copying as is"). The link back to the original file comes from the `importedFrom` path already on each clip, not from changing how files are stored.
- **Imports get one "Remove import"** (Fega's pick). It deletes the copy and the clip record and forgets the file in `importMemory`, so the original can be imported again.
  - A **repost** of an import is never forgotten, because its content has already been posted. Forgetting it would reopen the double-post hole this work exists to close.
- **The boot repair (`repairStuckImports`) never deletes files.** It only clears memory and drops `dequeued` import records. A leftover copy might be the last copy of the clip.
- **The Queue row wording is short:** "from <name>" and "original missing". The title column is about 135 px at 1280×860, and the full path is on hover.

## Next Steps

1. **Ask Fega to test alpha.15:**
   > "Did the update to alpha.15 come through? In the Queue, your imported clips now say 'from <file name>' under the title. Hover one and click the new page-with-arrow button, and Explorer should open on your original. Your 2 stuck imports ('A brazilian hopped in my chat' and the Arc Raiders outfits one) were cleaned up on launch, so dropping those originals on Import clips should work again. Anything off?"

   A yes removes `status: untested` from #471.
2. **Everything from the s277 handoff is still unasked.** That's the alpha.14 test script (Projects approve/reject, Rank Glass/Metal, Switch, Analytics link), the auto-advance question, and the carried s273–s276 checks. The exact wording is in `git show 37b238f:HANDOFF.md` (Next Steps 1–3).
3. **Fable review** of e46f65d (#471), plus the s277 and s276 lists in `37b238f:HANDOFF.md`.
4. **#456 superseded by #466** (close it if Fega agrees). **#462** is still waiting for repost metrics history.

## Watch Out For

- **The dev profile reads Fega's REAL library (W:\…).** Any dev boot now runs `repairStuckImports` against it, which drops `dequeued` import records from the REAL project.json files. The dev `importMemory` is separate, though, so the prod entries for those files would then never be cleared.
  - For any dev-profile run, repoint `projectsRoot`, `outputFolder` and `testWatchFolder` to a fixture first. This session did: the dev settings were backed up, pointed at the scratchpad `fx/`, and restored afterwards.
  - Prod already repaired its 2 on 2026-09-28, so the prod library has no `dequeued` imports left.
- **Only new imports carry `importFingerprint`.** Older ones are matched by fingerprinting the copy, then the original, then the file name. If both files are gone and two memory entries share a name, the entry stays and the clip is still deleted.
- **The Bash tool ate backslashes again.** Inline `node -e` scripts collapsed `\\n` and `\\u00B7`. Patches with backslashes go through the Edit tool or a script written to a file (memory `feedback_bash_backslash_collapse`).

## Logs/Debugging

- **Log lines** (`app.log`, module `system`):
  - `Repaired stuck imported clip {clipId,title,importedFrom,forgotten}` and `Repaired N stuck imported clip(s)`, at boot.
  - `Removed imported clip {clipId,title,importedFrom,repost,forgotten}`.
- **Scratchpad for this session:**
  - `build-fixture.js` builds an import project, dev settings pointed at a fixture, and tracker rows.
  - `hover.js` sends a CDP mouseMoved event to reveal row hover actions.
  - The repo's own `scripts/dev/cdp.js`, `cdp-click.js` and `cdp-shot.js` did the rest.
