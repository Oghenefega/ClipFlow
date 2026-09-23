# HANDOFF — Session 273 (2026-09-22)

## Current State

Fega's installed copy is still 0.5.0-alpha.12. Source (e0d3cdd) adds two things, not in any installer yet:
- **Section re-transcribe (#459):** right-click a timeline section, or use the new top-bar menu. It re-transcribes one stretch and leaves every other line alone, and it undoes in one step.
- **Approvals follow edits (#458):** an approved clip's feedback row follows its saves, and a one-time repair fixes older rows at the first launch after install.

Both issues stay open until Fega has the installer. Still open from before with `status: untested`: #454, #456, #457, #451, and #446–#448.

## Key Decisions

- **Re-transcribe never writes the project from main.** `retranscribe:ranges` returns words in source time; the editor splices them in and autosave saves. So it can't race autosave, and one Ctrl+Z undoes it.
- **The #458 repair is guarded in the DB, not a settings flag.** It uses a `maintenance_runs` table (migration v13). This deviates from the approved plan on purpose, per the IPC skill lesson: source-prod and the packaged app share settings but not databases.
- **A recording whose audio track count ≠ `audioSetup.trackCount` is refused, not recalibrated.** Recalibrating for one old file would break the setting for every new recording. January's AR files have 4 tracks, today's setup describes 5.
- **Approval identity stays the AI's original window** (`clip_start`/`clip_end`); only words and title follow edits. So a clip and its duplicate share one row, and the last save wins, as before. `final_ranges` for the harness is not built.
- **Approve-time title cards (#420) use the words as cut:** `resolveClipSubtitles` + `visibleSubtitleSegments`, the same as the editor's Generate button.

## Next Steps

1. **Carried from s272.** If #454, #456 and #457 are still open, ask Fega:
   > "When you updated, did you check the other three things inside Corva? One: drag the slider under a clip's picture in the Queue, and that frame becomes the clip's picture in its row and in the Tracker. Two: the Tracker popup shows the whole frame next to the details. Three: pressing play on a Projects clip looks like the editor, with your webcam and game boxes. If they all look right, I'll close those three."
2. **One real in-app run of #459.** In s273 the engine ran by hand; the in-app run used a stand-in because memory was full.
   - Check commit free first (≥ ~8 GB, see Watch Out For).
   - Rebuild the fixture with `node fx459/setup459.js --project proj_1785454737951_7iy0vq` (it backs up and repoints the dev profile), right-click section 2, and read app.log for `[TIMING] … median4`. Then run `restore459.js`.
3. **Fable review of e0d3cdd,** per the model/effort split.
4. **After the next installer, ask Fega:**
   > "Open any clip, right-click one section on the timeline and choose 'Re-transcribe this section'. Only that part's subtitles should change, and Ctrl+Z should bring them back. Does it?"

   On a yes, close #459. #458 has nothing for him to see: close it with `status: untested` once his app.log shows `#458 approved taste rows refreshed from the clips: N` (about 131 expected).
5. **Question for Fega:**
   > "Two of your oldest approvals (an Egging On clip from February and an Arc Raiders clip from January) belong to clips you later rejected, and Corva still uses them as examples of clips you liked. Want me to remove those two? You won't see anything change; it just stops two wrong examples. I'd say yes."

   These are the feedback rows #3 and #29.
6. **Before the next detection experiment,** re-take the replay harness baseline, because the #458 repair changes the approved examples.
7. **Possible follow-up:** a shorter timeout for a single-section run. It inherits the batch's 60-minute timeout, so a stalled engine shows "Transcribing…" with no cancel. The old button had the same limit.
8. **Carried from s271–s272,** rewrite each in plain words before asking:
   - the question about redoing the pictures of the two Sept 20 clips, in `proj_1788433070416_i2dcg8`;
   - the #452 test, when Fega is ready;
   - #453, before launch;
   - the s268–s270 list: #451, #446–#448, the Media tab newest-first question, #442–#444, #438's first real end-to-end, #445, #439, #440, #433–#437, #425, #419, #418, #416, #265, and #176, which is probably settled.

## Watch Out For

- **Engine tests vs DaVinci Resolve.** Resolve can hold ~15 GB. Near the commit limit, `transcribe.py` stalls ~15 min in the word-timing vote or dies with "bad allocation", and it could starve Resolve. Read `(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory/1MB` first. If it's low, stub `whisper.transcribeBatch` (see memory `project_engine_memory_pressure`).
- **Test fixtures must match today's 5-track audio layout.** January's AR files (4 tracks) now get "Can't tell which track is your mic" by design; that isn't a bug. The only clean 5-track project with rejected clips is `2026-07-29 MC Day1 Pt1`.
- **What happens at Fega's first launch after the next installer.** The #458 repair reads every project with an approved clip (~0.5 s) and keeps `clipflow.db.bak-pre458` in `%APPDATA%\Corva\data`. If the W: drive isn't mounted at launch, it waits for the next one.
- **A ripple delete (`clip:concatRecut`) moves `startTime`/`endTime`.** That clip's feedback row can no longer be found by window, which predates this session (noted in #458).
- **The top-bar Re-transcribe menu is portaled to `<body>`.** Keep it that way: inside the top bar's z-10 layer it draws under the preview.
- The changelog hook blocks any git commit command containing the word "wrap". Reword; don't bypass.
- Stop the dev app by its main PID with a tree kill (`taskkill //F //T //PID`), never by image name.

## Logs / Debugging

- **app.log (subtitles):**
  - `Section re-transcribe {clipId, seconds, ranges:[{start,end,words,silent?,error?}]}`
  - `Section re-transcribe refused: audio layout differs {fileTracks, setupTracks}`
  - `Section re-transcribe failed {error}`
  - the engine's `retranscribe [TIMING] {… 'method': 'median4' …}`
- **app.log (system):** `#458 approved taste rows refreshed from the clips: N {backup}`.
- **Scratchpad `edab23d1-…/scratchpad/`:**
  - `fx459/`, the dev fixture kit. `setup459.js [--dry] [--fixture-only] [--project <id>]` and `restore459.js` back up and restore the dev settings, tokens and DB. `snap.js <label>` / `snap.js diff <a> <b>` diff saved lines per section. `t-section.js`, `t-menu.js` and `t-undo.js` drive the UI, `stub-engine.js` and `build-plans.js` provide the stand-in engine, `devdb.js` reads the feedback rows, and `list-candidates.js` finds clean fixtures with their track counts.
  - `probe-learning.js <db copy>` measures how many approvals hold the final cut vs the AI's cut. Before the repair it read 144/70/11; after, 218/1/6.
  - `repair-run.js` and `repair-diff.js` run the repair headless on a prod DB copy: 131 rows changed, 0 rejections touched.
  - `engine/`, the real engine run by hand on MC section B.
