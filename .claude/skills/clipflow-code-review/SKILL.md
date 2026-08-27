---
name: clipflow-code-review
description: Use AUTOMATICALLY after writing any code change in ClipFlow. This skill runs a self-review checklist before declaring any task done. Triggers after every code modification, before build, and before commit.
---

# ClipFlow Code Review — Self-Check Before Done

Run this checklist EVERY TIME before saying a task is complete. No exceptions.

## Pre-Build Checklist

### 1. No Fake Fallbacks
- [ ] Does any code path produce placeholder/fake/degraded output?
- [ ] If real data isn't available, am I showing empty/loading state (NOT fake data)?
- [ ] No fake waveforms, no even-distribution timestamps, no placeholder images

### 2. Data Shape Verification
- [ ] Am I unwrapping IPC responses before storing in state?
- [ ] If I filter/map on a field, does that field actually exist in the data?
- [ ] If I changed a schema, did I write a migration function?

### 3. React/Zustand Correctness
- [ ] All store subscriptions use selectors: `useStore((s) => s.field)`
- [ ] No `getState()` in render paths
- [ ] Hooks reference values declared ABOVE them (no TDZ)
- [ ] **Mount-only effects see PRE-LOAD state.** App renders every tab pane at launch, BEFORE the async electron-store load — an effect with `[]` deps that captures loaded data (counters, animations, derived UI) freezes at empty/0 forever. Give it real deps and compute/animate from the last shown value. (Frozen weekly-goal ring, session 100.)
- [ ] **Rename safety:** After renaming ANY variable, function, or export — search ALL 6 categories for the old name: (1) direct calls, (2) type-level references, (3) string literals, (4) dynamic imports, (5) re-exports/barrel files, (6) test files/mocks. Assume grep missed something.
- [ ] **Refs inside setState updaters:** never read a mutable ref (or anything the handler mutates later) inside an updater function — React 18 runs updaters AFTER the handler body, so the ref already holds the new value. Capture it into a local const at the top of the handler (session 117: shift-click range anchor always equaled the clicked row).
- [ ] **Changing a parameter's SHAPE (id → object) is rename-class:** grep every call site, including secondary entry points — context menus, keyboard shortcuts, batch paths. s195: `handleSingleDelete` changed to take the project object; the row's trash icon was updated, the right-click menu still passed the bare id and deleted `undefined`.

### 4. CSS/Layout Sanity
- [ ] ResizablePanel `defaultSize` values sum to exactly 100%
- [ ] No `flex-1` on elements that should have fixed/auto width
- [ ] Dark theme: Radix portals have explicit `dark` class + hardcoded dark HSL
- [ ] Text minimum: 12px labels, 14px body

### 5. No Regressions
- [ ] **A summary/list IPC must carry every field its consumers read.** When a "lightweight" list feeds more surfaces than the screen it was built for (Queue + auto-publish scheduler read clips from the startup project list), omitting a field silently empties those surfaces until a full load happens. Strip only fields MEASURED heavy, and grep the list's consumers before trimming. (Queue empty at launch, session 100.)
- [ ] **Load-path invariant:** if a list's sort/filter is enforced at LOAD time (not at render), it's an invariant EVERY path that writes the full list into state must satisfy. When adding/touching any `setX(rows)` from a DB/IPC reload, grep ALL sibling setters and confirm each applies the same sort/filter — the DB's `ORDER BY` is not the UI's order. One missed `setFiles(rows)` (resetFileDone, no `compareRecordings`) flipped the whole Recordings list to newest-first until restart (session 86).
- [ ] **Last write wins — enumerate every writer of a state object the UI reads.** When a feature starts reading NEW fields off shared state (progress, status), grep ALL its `setX` writers and confirm the one that executes LAST carries those fields. s195/#74: the pipeline's "complete" event carried `clipCount`/`signalSummary`, but a post-invoke `setProgress` clobbered it with a bare object, so every successful run's resting headline read "nothing made the cut" — and the direct function checks passed, because they fed well-formed shapes the real UI never produced. Test the function against what the writers actually write.

### 6. Liveness — am I editing code that actually RUNS?
- [ ] Before editing a function, `Grep` for its callers. **Zero callers = dead code.** Editing it has no user-facing effect (this is how #102/#97 got patched into the dead `commitAudioResize` path).
- [ ] Did I confirm the component/handler I changed is the one actually mounted (top-down from `EditorLayout`), not a similarly-named twin?
- [ ] If I claimed "this fixes X," can I name the live path mount→handler that the user's gesture actually hits? If not, verify in the running app before saying done.
- [ ] **Every side claim in the commit/changelog ("X works too", "also handled") maps to a verification step actually performed.** A renderer gate/UI-copy change advertising new input is only half a path — trace the gesture through the IPC handler it calls. Three consecutive batch reviews (s188, s190, s193) caught an unexercised side claim; s193's: "dropped .mkv accepted" while `import:externalFile` still refused it.
- [ ] See the `clipflow-trace-verify` skill for the full grep-callers / top-down / liveness-proof protocol.

## Build & Launch Protocol

After passing the checklist:
1. `npm run build:renderer` — must complete with zero errors
2. `npm start` — app must launch (run in background)
3. Commit with descriptive message
4. `git push origin master`

NEVER skip steps 1-2. NEVER say "done" without a successful build.

## Commit Message Format

```
<verb> <what changed>: <brief why>

- Detail 1
- Detail 2

Co-Authored-By: <the current model's trailer — the harness states it>
```

Verbs: Fix, Add, Remove, Update, Refactor, Clean up

## Anti-Patterns — Things I Must NEVER Do

1. **Tweak the same property twice** — if first fix didn't work, the diagnosis is wrong. Start over.
2. **Incremental nudges** — don't change 25% → 28% → 32% → 49%. Ask what the user actually wants or calculate it correctly the first time.
3. **Add fallbacks** — the user explicitly said: "I would rather the app not work than use something unbearable and frankly unusable." Fail visibly. Always.

## Distilled Lessons (process — write/done time)

- **Calendar dates are LOCAL (Fega is EST), never `toISOString()`.** `toISOString().split("T")[0]` stamps the UTC date — 4–5h ahead, so evening actions get dated *tomorrow* (Sunday nights: *next week*). Any user-facing date written to state (tracker entries, schedule keys, history logs) must use `localISO()` from `src/renderer/utils/trackerEngine.js` or local `getFullYear/getMonth/getDate` formatting. Full ISO *timestamps* stored as instants are fine — the rule is about extracting calendar DATES. Grep `toISOString().split` before shipping date-touching code (#160, sessions 94–95; memory `user_timezone_est`).
- **"Done means audited."** When a fix is confirmed working, BEFORE pivoting to the next task: re-read the actual shipped diff (not a summary), re-read logs from the successful run (double-fires, new warnings), trace edge cases the test didn't hit, grep for scaffolding left behind, and state the root cause in one plain sentence. File any separate issues found.
- **Never mark a task DONE until the user confirms.** Mark "awaiting verification" at most. If they go quiet for a couple sessions, proactively ask "did X work?"
- **Batch related fixes.** Read ALL affected files first, diagnose ALL root causes, implement together, build once — don't fix-one/rebuild/repeat.
- **Never remove working features during a fix without explicit approval.** If code looks unused, grep callers, then ASK. Document anything removed in the commit message.
- **Never recommend or implement auto-deletion of user data** without asking first (pipeline logs hold cost/perf history).
- **When migrating to a new system, delete the old code aggressively** — don't keep fallbacks to the deprecated path "just in case." They rot, mask new-system bugs, and cause "which path am I on?" confusion. Git is the backup. (Only check: is it actually dead? grep callers.)
- **Never remove debug `console.log`s during active development** — they're load-bearing for current debugging. Cleanup is only for stable, shipped, confirmed-working features. ClipFlow is not there yet.
- **ClipFlow is a desktop app — never optimize web metrics.** No bundle-size reduction, code-splitting, lazy-loading, or CDN concerns (files are on local disk; lazy-load adds "Loading…" flashes for zero benefit). Valid targets: IPC speed, FFmpeg efficiency, render perf, memory, startup time.
- **New visual styles must be additive / opt-in** — never replace the user's established default look (karaoke highlight, subtitle style) without consent. Their current look is their brand.
- **Always add diagnostic logging** for any IPC call that can fail (`console.error` with full context values); add `console.log` at key decision points during feature dev.
- **Classify at the origin, not the catch-all.** When a flag or error message gates an expensive/destructive action (a re-encode, a retry, a delete), set it where the *specific* condition is detected and let summary/exhaustion sites inherit it. A shared catch site's failure taxonomy is always wider than the case you're designing for — ask "what else reaches this line?" before attaching meaning to it. Same for user-facing error text written at a catch-all: it will confidently name a cause it hasn't established. (Session 130, #189: `processingWall` stamped at "all attempts exhausted" would have made an expired OAuth token trigger a pointless 720p transcode and report itself as a clip-length problem.)
- **A count in a label must name what it counts.** When a button/label shows a number + noun, the noun has to be the unit the number counts. If the action turns N inputs into a *different* output unit, count the inputs and name them ("Clip N Recordings"), or drop the number — never put the input count next to the output noun ("Generate N Clips" when N = recordings, each yielding several clips; #123/session 68). Re-read every count+noun string this way before shipping.
- **A script-driven source edit can corrupt an escape without breaking the build.** Patch scripts that write JS through a template literal lose one level of escaping in this harness: an intended word-boundary escape landed as a literal 0x08 (backspace) byte inside a regex, which then compiled, minified, shipped and silently never matched. `git diff`, `grep` and `sed` all render 0x08 invisibly, so three review passes missed it. After ANY node/sed/script patch of a source file, scan the changed files for control characters (char code under 32, excluding tab/CR/LF) before building; prefer constructions with no backslashes at all, or write the payload to a file and have the script read it. (Session 187, #297; memory `feedback_bash_backslash_collapse`.)
- **Fix the user's reported symptom, not the literal (often rescoped) ticket text.** Before closing a bug, restate the symptom in Fega's own words and confirm the fix makes THAT observable thing change. If the ticket title and his description diverge (common after a ticket has been rescoped — e.g. #32 drifted to "caption width" while he meant "panel widths"), his description wins: fix what he means, or split a new issue and say so. A ticket number labels a user-visible problem, not whatever narrow root-cause the last triage wrote down. For visual/interactive fixes a build-pass is never sufficient — leave `status: untested` until he sees it in the running app (sessions 60/63/65/75; memory `feedback_fix_user_symptom_not_ticket`).
- **Decision requests are jargon-free too, not just verification steps (s156).** A sentence asking Fega to decide something ("sign off the gc245 cell?") must survive the app-user-words test on its own: name the thing plainly ("the safety test I run before shipping a detection change"), state what yes/no means in consequences ("okay to include in the next installer?"). Program vocabulary — cell, ablation, recall, baseline — stays in the linked issue, never in the chat ask.
- **Verification steps for the user must be jargon-free, and split from my own checks.** Fega is the tester but NOT a coder. Present any verification as two parts: "I'll do this (you don't watch)" — build, automated repro/tests, log inspection — and "What I need from you (~N min, no tech)" in plain app-user words ("open a couple clips, do the captions still match the audio? screenshot anything off"). NEVER ask him to read logs, confirm an internal field value (`startSec`), use code verbs ("init", "re-transcribe"), or hunt for a broken clip by its symptom. Prefer proving the fix myself with a synthetic reproduction so his look is a bonus regression pass, not the correctness gate. **Every test item must be a full instruction, not a fixture name:** starting state + explicit action (verb + what to click) + what to look at + ✅good / ❌flag-it tell. Listing clip/screen TYPES ("an edited clip", "an extended clip") with no action is useless — Fega: "you're not telling me exactly what to do with them" (session 58). Lead with the single item that proves the fix; mark edge cases skippable. See memory `feedback_plan_clarity`.

- **Multi-component files: confirm the enclosing function before inserting.** EditorLayout.js alone holds five components. Before adding state/handlers next to "related code," run `grep -n "^function \|^export default function" <file>` and confirm the insertion point and every reference to it are in the SAME component — nearest-similar-code is not proof of same scope. A cross-component reference compiles, builds, and boot-smokes clean, then throws ReferenceError at mount (session 124: alpha.8 shipped with every editor open crashing).
- **Editor-touching changes require an actual clip-open drive, not just build + boot.** The Editor is the ONE always-conditional view — boot smoke tests never mount it, Vite doesn't lint undefined identifiers, `node --check` can't parse JSX. After any change under `editor/`, launch with `--remote-debugging-port=9222` and drive a real clip open via CDP (click `.pl-open` → "Open in Editor", assert no "Editor Crash" text; script pattern in session 124's scratchpad, traps in memory `project_cdp_verification_gotchas`).
- **Destructive options: consequences in screen terms, least-destructive default.** Any plan/confirm-UI for an action that deletes or removes something must state what disappears from WHICH SCREENS in app-user words ("the clip also vanishes from the Projects tab and its edits are gone") — never internal nouns ("removes the record"). When a destruction request has two readings, implement the LEAST destructive one that satisfies the stated goal and ask about the rest. Anything that destroys hand-edited data (clips, subtitles, profiles) needs an explicit "your edits on X will be lost" line in both the plan and the confirm UI. (Session 123: Queue "Delete clip + rendered file" deleted project clip records; Fega meant queue-scoped removal — real, unrecoverable data loss.)

- **A backup is only valid until the user touches the thing it shadows.** Session-long "back up → test → restore" loops are correct only while the file is still mine. Fega added his audio folder mid-session and scanned 760 tracks into the SAME shared index the dev app writes; the next routine restore put the 2-entry backup back and cost him the scan. Before restoring ANY backup, re-read the target and confirm it still matches what the backup was taken against — if it grew or changed shape, the user owns it now: leave it and say so.
- **When a memory or lesson names a command as forbidden, its named substitute is not optional.** `asar extract-file` run with the repo as CWD overwrites `package.json` with the stripped packaged copy (scripts, devDependencies and the whole `build` block gone) — documented in memory `project_package_json_strip`, and re-committed anyway in session 137 while checking a packaged version. To read anything out of an asar use `npx asar list` or grep the archive; never extract. Recovery is `git checkout -- package.json` plus re-applying any uncommitted version bump.

- **Verify the LOOP, not one pass on fresh data (session 139).** Three bugs shipped past a green CDP run because the checks only ever did each gesture once, on records created seconds earlier, and asked whether elements *existed*. For any interactive change assert: (1) the gesture **repeated** 5+ times with the measurement **unchanged** (hover/toggle/open-close — one pass is stable in a ratchet); (2) behaviour on data **a previous session wrote to disk**, not only on a record just created in this run — a stale stored reference is the class that breaks, so it must be the class you test; (3) **position, not existence** — `el.getBoundingClientRect().right <= container.getBoundingClientRect().right` for anything that can be pushed out of view. An element sitting 1230px off-screen passes every `querySelector` check ever written.

- **A migration that fingerprints store state is tested against a store the REAL boot sequence produced, never a hand-built replica of the defaults (session 173).** First boots mutate the store (file-migration appends Just Chatting to gamesDb, stamps `entryType`), so an exact-match condition written from the defaults misses the real shape — the #262 heal shipped in alpha.57 and never fired on its one target. Cheapest honest test: boot the OLD code on a blank profile, run the NEW code on the result. And when verification surfaces an unexplained entry ("where did JC come from?"), reconcile it against every exact-match condition in the diff before shipping.

- **A spec's description of a stored value is a claim; the store is the fact (session 212).** Before writing code that compares, normalises or keys off a persisted value, open the real store and read the actual values — one `python -c` on `clipflow-settings.json` or the project JSON. #322's spec (self-authored the session before) said game tags are "the lowercased short tag"; gamesDb actually holds `RL`, `EO`, `SCoG`, `PoP`, and clips carry them verbatim, so the `.toLowerCase()` written from the spec would have stored `rl` against comparisons looking for `RL` — a feature that builds, ships and silently matches nothing. Own specs are the most trusted and least verified documents in the room. Never case-fold or reshape an identifier you did not watch being written.

- **`CLIPFLOW_PROFILE=dev` sandboxes settings, NOT project data (session 141).** Both profiles read the same `projectsRoot`, so a destructive dev-profile verification writes to Fega's real library — pressing the new "End to playhead" key trimmed a genuine 27.3s clip to 5s, and autosave persisted it within the second. Before any destructive test: diff `projectsRoot` across both `clipflow-settings.json` files, record the pre-state (`nleSegments`, etc.), and restore through the app's own undo + Save, then confirm on disk. Only `userData` and `outputFolder` are actually isolated.

- **`wc -l` before any full-file Write to a file this session didn't create (session 166).** `head -40` tells you what a file starts with, not what it IS — todo.md's header claims "active plan only" but the file is a 3.7k-line archive. If the file is bigger than what you've read, Edit the section instead of Writing the file. A commit diffstat with deletions you can't name = stop and `git show --stat` before pushing.

- **"What is running?" answers must check BOTH layers, and every armed watcher gets stopped at wrap (session 164).** OS-level checks (tasklist/netstat) can never disprove a harness background task — check TaskList / the Background tasks panel too. Until-loop watchers must watch a condition guaranteed reachable (the QUERY that finds new items, not a hardcoded id), and session wrap explicitly stops or confirms-finished every watcher armed during the session.

- **Status-color/aesthetic changes verify against the REAL data distribution, worst-case first (session 167).** Vibrancy amplifies whatever the data says: the glass-orb redesign passed mocks and CDP behavior checks, then rendered Fega's real library — rejection-heavy BY DESIGN — as a wall of vivid red ("doesn't look like ClipFlow works"). Before shipping any change that recolors or amplifies a status indicator: sample real per-status counts (prod DB), put the worst-case card in the mock (the one where the "bad" status dominates), and eyeball the gestalt, not just element behavior. A color that's honest per-item can still lie at volume.

- **A filter/logic block whose comment says it mirrors another copy MUST update both (session 198).** Batch 5 exempted reposts from QueueView's title knockout but not from App.js's badge count — whose own comment says "mirrors QueueView's list filter so the badge matches the list (#139)". Before done: grep for the code you changed being referenced elsewhere ("mirror", "same as", "matches", the issue number in comments) and patch every declared copy in the same commit.

- **A fix that flips a SHARED flag must be re-verified on the cases it did NOT target (session 204).** s203 changed the media-overlay `eof_action` from `pass` to `repeat` so a play-once GIF freezes instead of vanishing — proven, on a play-once GIF. But `eof_action` governs every overlay on that stage, and the two kinds it wasn't tested against (a still, `-loop 1`; a forever-looping GIF, `-ignore_loop 0`) are endless inputs: with `repeat` the render never finishes. Shipped, reviewed, and caught only in the next session. Before done on any change to a shared option/flag/default: list the OTHER inputs that option applies to, name what makes them different from the one you tested, and run at least the one that differs most.

- **"The cases the fix didn't target" is an ENUMERATION, not a judgment call — and for render work, measure output DURATION, not just termination (session 205).** s204 honoured the rule above (re-proved the still and the play-once GIF) yet both export-overrun bugs shipped anyway, because the untested shapes sat on axes nobody listed: placement time (a looping GIF at tlStart>0) and length-vs-clip (a video window past the timeline's end). For any overlay/flag/graph change, write the matrix first — media kind × placement time (0 / mid-clip) × length vs clip (shorter / longer) — and check `ffprobe format=duration` on each cell you run; "it finished, exit 0" passed both bugs. Corollary that fixed it: bound the OUTPUT (`-t timelineDuration`) instead of inferring export length from input behaviour.

- **A new CHANGELOG session section is INSERTED above the previous heading — never written by editing the existing heading line (sessions 208+209).** Using the current top heading as the edit anchor and "updating" it to the new session replaces it, erasing the prior session's record and stranding its entries under the wrong heading with duplicate `### Fixed`/`### Changed` labels. Happened in 446d6f3 and again (self-caught) in the very review that flagged it. Anchor the insertion on content that comes AFTER the new section, or prepend above the old heading — one heading per session, even same-day.

- **An exact twin of the bug gets fixed in the same commit, not filed as a caveat (session 210).** #315's stamp-overwrite and wrong-slot logging lived in `retryFailed` AND, character for character, in `publishClip` beside it. Fixing one and writing the other up as "noted, not changed" ships a known bug and leaves two copies free to drift — which is exactly how #321's UI gate and store check diverged. Before done: grep the module for the same shape (the same variable init, the same derivation, the same guard) and either fix every copy or collapse them into one function. Scope discipline forbids inventing new work; it does not license leaving half of the work you just found. If a twin genuinely must wait, ASK in the same breath — don't file it as a caveat.

## Lesson Capture

After ANY correction from the user:
1. Immediately append to `tasks/lessons.md`
2. Format: what the mistake was, why it happened, the rule to prevent it
3. Do this BEFORE continuing with the next task
