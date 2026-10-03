# HANDOFF — Session 285 (2026-10-02)

## Current State

0.5.0-alpha.20 is on the update feed with the #485 revamp: Rename uses the full window (file tiles, a scrub-preview panel, a filmstrip for Split), and Projects is one page (list, clips, player, poster rail, hover-play). It was verified on the dev profile at 2000×1125, 1280×860 and in Daylight. Fega hasn't tried it in the installed app yet, so #485 stays open.

## Key Decisions

- **Selection is one crisp signal:** a brighter own-colour fill plus a 1px own-colour border at about 70%. No ring and no glow (Fega, s285: the stacked stroke and glow looked "low level").
- **The list collapses in one motion.** Every property starts on the same frame, and card text is pinned to its expanded width (`--pcw`) so it clips instead of reflowing.
- **Rename's preview never opens the video.** It uses 100 keyframe stills made once per recording (temp `clipflow-preview/<md5>`, reused after restart). Main stops the frame job before any rename, convert or split of that file. The old `thumbs:generate` strip job is gone.
- **Rename moved into the header** and follows the selection. The floating bar keeps only Set Game, Hide Selected and Clear.
- **Clip-picture badges (Published, Scheduled, In queue) were left off,** although the mockup showed them. The older rule says clip pictures stay clean.
- **History and Manage keep their old look,** inside the wider page at 860px.

## Next Steps

1. **Ask Fega how alpha.20 feels.** Suggested wording: "Did the new Rename and Projects tabs work for you? Scrubbing the big preview, Split, hovering clips, and the list shrinking into posters. Anything that felt slow or looked off?" Close #485 on his yes, with `status: untested` removed.
2. **Ask Fega about clip badges.** Suggested wording: "The mockup showed small Published / Scheduled / In queue tags on clip pictures in Projects. I left them off to keep the pictures clean. Want them back?" I'd recommend no: the status chips in the details panel already say it.
3. **Run the per-batch review.** A spawned chip covers commits `f0aa166` (Rename) and `deea5e2` (Projects), at Fable xhigh.
4. **Icons:** when Wick's set lands in `tasks/mocks/ui-revamp/icons/`, cut it into tiles and swap the bottom-bar icons.
5. **Carried from s283:** ask how the clip judge's ranking feels, and whether the laptop check passed (then drop `status: untested` from #483).
6. **#489:** remove the unreachable project-folder code (a chore, no user-visible change).

## Watch Out For

- **The dev profile shares the real `projectsRoot`.** Opening a never-opened clip in the editor writes `project.json` even with no edits. Snapshot first (memory `project_cdp_verification_gotchas` #84).
- **Rename verification:** repoint the dev `watchFolder` and `testWatchFolder` at a scratch folder (the s285 scripts were `repoint.js` / `devcfg.js`). A renderer reload empties Pending until you press Refresh.
- **Projects page structure:** `selClipId` lives in `ProjectsPage`, and `ClipBrowser` renders the middle and right columns as a fragment, keyed by project id. Project deletion and the editor return go through App's `selProj` and `returnClipId`.
- **The Projects pane is always mounted.** Width measurements (`pwW`, `--pcw`) re-run through a ResizeObserver when the tab first shows.
- `TranscriptModal` in App.js can no longer open. Nothing called `onTranscript` even before this session, so it was already dead.
- `tasks/spikes/humor-study/_report.txt` is still an untracked leftover.

## Logs/Debugging

- Frame-job lines in the main log read `((preview)) > Generated 99 preview frames for <file> (<secs>s)`. A stopped job logs nothing now (the queue answers `{error}`). Before the fix it was an unhandled rejection with "Preview frames failed: stopped".
- A hover-play that stops at the clip start points to the rAF loop: it must skip until `readyState >= 1`.
- Dev-profile side effects from s285 testing are dev data only: a few renamed-file rows in the dev DB. The dev settings were restored from backup.
