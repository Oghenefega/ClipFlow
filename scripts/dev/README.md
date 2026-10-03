# Verifying in the dev app

The harness for driving the real app from a script. Use these; don't write new
copies in a session scratchpad.

```bash
npm run build:renderer                      # the app loads build/, never Vite
node scripts/dev/dev-fixture.js setup       # sandbox the dev profile (app must be closed)
node scripts/dev/dev-launch.js              # start, wait until ready, dismiss What's New
node scripts/dev/cdp.js "<expr>"            # evaluate in the app window, prints JSON
node scripts/dev/cdp.js @probe.js           # same, from a file (use for anything with \ ` or quotes)
node scripts/dev/cdp-shot.js out.png        # screenshot of the app window
node scripts/dev/cdp-click.js X Y           # trusted click at window coordinates
node scripts/dev/dev-kill.js                # stop ONLY the source-run app
node scripts/dev/dev-fixture.js restore     # put the dev settings back byte for byte
```

## The scripts

| Script | What it does |
|---|---|
| `dev-fixture.js setup [--project <proj_id>]... [--accounts]` | Backs up the dev settings and tokens. Points all four folders (`projectsRoot`, `watchFolder`, `outputFolder`, `testWatchFolder`) at `%TEMP%\corva-fixture`, with copies of the chosen projects. With no `--project`, it picks the newest project with zero approved clips. `--accounts` seeds token-less placeholder accounts, because the Queue's per-platform blocks only render for connected accounts. |
| `dev-fixture.js restore` / `status` | Restores the backup, or shows where the dev folders point now. |
| `dev-launch.js [--main]` | Refuses to start if the dev tokens hold accounts or if something already holds port 9222. Starts the app with CDP on 9222 and the flags that keep animations running when the window is covered. Waits until `window.clipflow` answers, then dismisses What's New. `--main` also opens the main-process inspector on 9229 and waits for it to settle. |
| `dev-kill.js` | Stops the `electron.exe` tree running from this repo. It never stops `Corva.exe` (the installed app) or DaVinci Resolve's `electron.exe`. |
| `cdp.js [--main]` | Evaluates an expression in the app window, or in the main process with `--main`. |
| `render-e2e-probe.js` | Checks a render against its output file. Required for render-path changes (see the code-review skill). |

## Rules that still bite

- **The dev profile reads your REAL library until `dev-fixture.js setup` runs.** `dev:seed`
  copies prod's settings, so every dev folder points at `W:\`. `dev-launch.js` warns when it
  isn't sandboxed.
- **Dev tokens must stay empty** (`{"accounts":{}}`). `dev:seed` copies real tokens back in, so
  re-empty them after any seed. In s214 a dev boot posted two real clips.
- **Opening a clip in the editor writes its `project.json`**, even with no edits. Autosave fires
  about 800 ms after any edit, so killing the app doesn't discard edits. Use the fixture.
- **Every tab stays mounted, hidden with `display:none`.** Scope DOM queries with
  `e.offsetParent !== null`, or you match the Rename tab's elements while "on" another tab.
- **`.click()` is not a real click.** Drags, `onMouseDown` buttons, the bottom nav and canvas
  overlays need trusted input: `cdp-click.js`, or `Input.dispatchMouseEvent` with `buttons:1` on
  press and move. Re-read coordinates right before every gesture.
- **When a probe contradicts what you expect, take a screenshot first.** Text probes lie:
  hidden panes, CSS uppercase, `innerText` newlines.
- **An exception thrown inside an evaluated expression crashes the app** through the error
  boundary. Return a string on every path.
- **Never `taskkill //IM electron.exe`.** It also kills DaVinci's plugin, and `//IM Corva.exe`
  kills the daily driver. Use `dev-kill.js`.

Everything else (Radix sliders, the fiber-tree way to open a clip without clicking, faking AI
calls from the main process, drag-and-drop, theme checks) is in [TRAPS.md](TRAPS.md). Search it
when a probe misbehaves; don't read it top to bottom.
