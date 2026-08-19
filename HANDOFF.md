# HANDOFF — Session 174 (2026-08-19)

## Current State
App source is ahead of the installed builds: #264 (rename-first split with letter children) and #267 (same-session day+1 override) are on master, verified headlessly, **not yet in any installer** — alpha.59 remains current on both machines. Four issues closed this session (#173, #174, #264, #267), all `status: untested` pending Fega's in-app pass on the next cut.

## What Was Just Built
- **#264 rename-first split (3732905).** A long recording is renamed to its real name FIRST (claims its part slot via normal accounting), then splits into letter children (`Pt2a/Pt2b/Pt2c`). DB migration v9 adds `sub_part` (part_number stays numeric → MAX(part_number) accounting untouched; next same-day file = Pt3). Parent keeps its proper name on disk, status 'split', hidden in-app. Split-failure fallback: parent surfaces as a normal renamed whole file with a visible notice.
- **#173 closed by design** — children can't renumber over same-day files (exists-guard half had already shipped; this removes the collision class).
- **#174 closed with two defenses** — parent never sits under a raw OBS name, AND `handleWatcherFileAdded` now skips any path with an existing file_metadata row (kills the every-boot ghost from `ignoreInitial: false`, including legacy raw-named parents from old sessions).
- **metadata:create `noHistory` flag** — split parents excluded from rename-undo (undo would orphan children's lineage + resurrect a raw-named file). Note: the OLD flow was silently creating that dangerous undoable row; this closes it.
- **Parsers learned letters** — file-migration + reconcile accept `Pt2a`; Recordings sort (compareRecordings + byTagDate SQL) orders letters after their parent part; split badge/tooltip shows real proposed names.
- **#267 fix (f685f44).** Both watcher handlers route the last-renamed-game default through `detectForGame` — day respects the same-date rule (was hand-rolled dayCount+1 → Day3 on same-day drops after a rename), part follows the defaulted game.
- **Filed #266** — silence/scene-aware split boundaries (Fega: "the ideal thing"); pure "where to cut" upgrade inside splitFile, naming unaffected.

## Key Decisions
- **Letters live in `sub_part` (TEXT), never in part_number** — string parts would corrupt MAX() accounting. a-z then aa (bijective base-26); sort = length-then-lex.
- **Fixed-interval boundaries for now** (Fega approved); #266 tracks the silence/scene-aware end state. **Parent file stays on disk** as safety copy; archive option later (Fega approved).
- **Out of scope, deliberately:** game-switch scrubber naming (children span different games — separate accounting problem), drag-drop import split (own preset; also renumbers today, pre-existing), "Split" action on already-renamed Recordings.
- **Splits are not undoable** — by design, enforced via noHistory.

## Next Steps
1. Batch continues toward the next installer cut (~10 changes or Fega's ask) — #264+#267 ride it; then Fega's in-app pass on the four `status: untested` closures.
2. Laptop pipeline testing continues (render → queue → publish); friction feeds #265.
3. Feature sessions when ready: #263 (game auto-detection), #265 (onboarding), #266 (smart split boundaries).
4. Session-start backlog: `gh issue list --repo Oghenefega/ClipFlow --search 'is:open -label:"track: launch-ops"' --limit 50`.

## Watch Out For
- **Migration v9 ships with the next installer** — first boot on prod/laptop ALTERs file_metadata. Fresh installs + existing DBs both covered (additive column, no fingerprinting).
- **The watcher's DB-path guard runs one SELECT per raw file per boot** (after stability check) — cheap, but it means a file whose DB row exists is INVISIBLE to Pending even if the user re-drops it deliberately; deleting the row (or the Recordings entry) is the escape hatch.
- **Manage tab's batch part-renumber** updates DB part_number only (pre-existing semantics, doesn't rename files); letter children renumbered there would keep stale sub_part letters. Left alone deliberately.
- **UploadView quick-import split still renumbers children 1..N** under tag-date accounting — pre-existing, out of #264's scope; a collision there now surfaces as the exists-guard refusing (stranded `_split_*` temp name) rather than data loss.
- **Dev profile was heavily exercised then restored byte-identical** (settings + DB from bak267 backups; AR back to dayCount 1 / lastDayDate 2026-01-05, watchFolder → W:\). Scratchpad leftovers (watch264/watch267 fixtures, bak264/bak267 backups) live in this session's scratchpad — disposable.
- **Git Bash taskkill trap (burned 3 probe rounds):** single-slash `/IM` is MSYS-mangled and kills NOTHING; the next launch lock-bounces with exit 0 and CDP answers from the STALE instance. Always `taskkill //IM electron.exe //F`, never suppress output, gate relaunches on `tasklist | grep -ci electron` == 0. Memory trap 45.

## Logs/Debugging
- **CDP drivers for the Rename tab** in this session's scratchpad (`64e6dd88…/scratchpad`): `cdp264.js` (phases: probe / rename / pending-count — reads `.cfr-row` innerText, clicks Rename All), `probe264.js` (storeGet + fileMetadataSearch through the page), `legacy264.js` (simulates old-install raw-named split parent: disk rename + sql.js DB rewrite).
- **Verification pattern that worked:** fabricate OBS-named testsrc clips (vendor\ffmpeg), dev-profile store edit via node `path.join` (NEVER inline backslash literals through bash — memory trap 44), threshold 1min, drive via CDP, assert disk + DB (sql.js read of `%APPDATA%\clipflow-dev\data\clipflow.db`) + relaunch.
- Split executes as keyframe-snapped stream copy (`-c copy`) — a 3-min file split to 3 parts in ~1s; real 1-2h recordings will be I/O-bound but no re-encode.
