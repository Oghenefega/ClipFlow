# HANDOFF — Session 286 (2026-10-02)

## Current State

This was a tooling session; there are no app changes. A retro over sessions 256-285 found that
most wasted calls went to rebuilding the dev-app test setup and re-finding data paths, not to
searching code. Both now live in the repo:
- `scripts/dev/`: fixture, launch, kill, cdp, a README recipe and a TRAPS archive
- `.claude/docs/nav-map.md`: a generated code map
- CLAUDE.md: new "Where things live" and "Shell and file rules" sections

0.5.0-alpha.20 (the #485 revamp) is still waiting on Fega's verdict.

## Key Decisions

- **The harness lives in the repo, not in memory or scratchpads.** The 60 KB CDP memory is now a
  pointer. Its traps moved to `scripts/dev/TRAPS.md`, with the superseded ones marked.
- **The nav map lists names, never line numbers,** so it stays true between runs. Session-end
  step 5 regenerates it.
- **No banner comments were added to source files.** The generated map covers the same need
  without touching code.
- **CLAUDE.md now says to verify with the harness, not `npm start`.** Fega approved the wording.
  `npm start` exits at once while the installed Corva runs.
- **The computer-use name for the installed app is "Corva"** (checked: it resolves to
  `C:\Program Files\Corva\Corva.exe`). "ClipFlow" is gone from the installed-apps list.

## Next Steps

1. **Ask Fega how alpha.20 feels.** Suggested wording: "Did the new Rename and Projects tabs work
   for you? Scrubbing the big preview, Split, hovering clips, and the list shrinking into posters.
   Anything that felt slow or looked off?" Close #485 on his yes, and remove `status: untested`.
2. **Ask Fega about clip badges.** Suggested wording: "The mockup showed small Published /
   Scheduled / In queue tags on clip pictures in Projects. I left them off to keep the pictures
   clean. Want them back?" I recommend no: the status chips in the details panel already say it.
3. **Run the per-batch review** the s285 chip covers (`f0aa166` Rename, `deea5e2` Projects, Fable
   xhigh).
4. **Use the new harness on the next UI verification** and fix any gap in the script itself.
   Never copy it to a scratchpad.
5. **Icons:** when Wick's set lands in `tasks/mocks/ui-revamp/icons/`, cut it into tiles and swap
   the bottom-bar icons.
6. **Carried from s283:** ask how the clip judge's ranking feels, and whether the laptop check
   passed. Then drop `status: untested` from #483.
7. **#489:** remove the unreachable project-folder code. This is a chore with no user-visible
   change.

## Watch Out For

- **The dev profile reads the REAL library** until `node scripts/dev/dev-fixture.js setup` runs.
  `dev-launch.js` prints a warning when it isn't sandboxed. Opening a never-opened clip in the
  editor writes `project.json`.
- **Close the dev app before `dev-fixture.js setup` and `restore`.** Both refuse to run while it is
  open, because the app rewrites its settings file.
- **The Bash tool eats backslashes even inside a quoted heredoc.** It hit twice this session. Edit
  any file containing Windows paths with the Edit/Write tools.
- **The dev settings now have What's New dismissed** (`lastSeenVersion` was stamped during harness
  testing). This is harmless.
- `tasks/spikes/humor-study/_report.txt` is still an untracked leftover.

## Logs/Debugging

- **Dev app output:** `%TEMP%\corva-dev-app.log`, rewritten on each `dev-launch.js`.
- **`dev-launch.js` exit codes:**
  - 1 = refused (real tokens, or 9222 already taken)
  - 2 = timed out waiting for `window.clipflow`
  - 3 = script error
- **`cdp.js` exit codes:**
  - 2 = the expression threw
  - 3 = nothing listening on the port
  - 9 = 45 s timeout
- **Closing a WebSocket and calling `process.exit` in the same tick** crashes Node on Windows
  (`UV_HANDLE_CLOSING` assertion, exit 127). The scripts now await the close event first.
