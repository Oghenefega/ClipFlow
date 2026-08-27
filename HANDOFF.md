# HANDOFF — Session 212 (2026-08-27)

## Current State

**#322 built, verified in the running dev app, pushed as `1c010a4`.** Game-scoped media for the
editor's Media tab: a per-folder game dropdown in Settings, a per-item override on every thumbnail,
and a scope chip on the panel that opens on the current clip's game plus everything universal.
Issue left OPEN with a full verification comment and `status: untested` — Fega sees it on the next
installer cut.

Nothing else in flight. The dev profile was returned to its pre-session state (test upload deleted,
overrides cleared, the folder assignment removed, the test media placement stripped from the clip
JSON).

## Key Decisions

1. **Effective game is resolved at LIST time, never written into the index.** Only an explicit
   per-item override is stored (`effectiveGame` in `src/main/assets.js`: item ?? folder ??
   universal). Re-pointing a folder at a different game therefore re-scopes everything inside it
   with zero index writes, and pre-existing entries need no migration — absent means "All games".
2. **Game tags are stored VERBATIM — no case folding, anywhere.** The #322 spec said "the
   lowercased short tag"; that is wrong. `gamesDb` holds `AR`, `RL`, `Val`, `EO`, `DD`, `PoP`,
   `SCoG`, `Pico`, `JC`, `MC`, `BB` and clips carry them unchanged. Lowercasing would have made
   every stored assignment fail to match a clip forever, silently.
3. **The scope chip follows the clip, and a manual pick sticks.** The effect keys on
   `clipGameTag` + the games map, so switching clips (or retagging one in the AI panel) resets the
   view to that game, while a deliberate choice survives every list refresh in between.
4. **An item tagged with a deleted/inactive game reads as universal** — the renderer treats any tag
   not in `gamesDb` as "no game", while the store keeps the value. Deciding this in the renderer
   (not `assets.js`) is deliberate: `gamesDb` lives in the renderer, and main has no business
   knowing which games are currently active.

## Next Steps

1. **Next installer cut = alpha.8** — carries #322 *and* the s211 boot splash, plus alpha.7's six
   items that Fega has still never seen running. One verification pass covers all of it.
2. **Batch review still pending** (Fable@xhigh, commit-by-hash): `2564b06`, `686f828`, `df0f5ed`,
   `a0cb39b`, `735c7aa`, `6a0214d` from s210, `bc2184a` from s211, and now `1c010a4`.
3. **Audio panel scoping** is the obvious #322 follow-up and is explicitly out of scope on the
   issue — the same mechanism drops in cleanly (audio shares the asset index). Only build it if
   Fega asks; his audio library is one tree with no game split today.

## Watch Out For

- **Never `.toLowerCase()` a game tag.** See Key Decision 2. The only lowercasing in the new code is
  on *file paths* (`folderGameMap` keys, because Windows paths are case-insensitive) — leave it.
- **`"universal"` is a sentinel stored value**, not a tag: it means "override the folder, show
  everywhere". `ALL_GAMES = "__all__"` in `MediaPanel.js` is a *different* thing — a UI-only scope
  value that never reaches the store. Don't merge them.
- **`window.clipflow` is a frozen contextBridge object** — you cannot stub a bridge method from CDP
  to record its arguments. Assignment silently no-ops and the real call runs. Verify renderer→main
  argument passing by observing the main-process result, or by grepping the built bundle.
- **The Bash tool eats a backslash inside heredocs**, so a Windows path in an injected JS string
  becomes an escape sequence and never matches. Match on a path *fragment* (`/Cutouts$/`) instead.
- **Radix popover triggers toggle.** A CDP helper that clicks the trigger to "open" a menu closes it
  if a previous script left it open — check `data-state` before clicking.
- **`innerText` is rendered text** — Settings group labels are uppercased by CSS, so
  `textContent === "FILES & FOLDERS"` fails. Match case-insensitively (already in memory).
- Inactive views stay mounted, so a bare `querySelector` for a button labelled "All" can hit the
  Projects filter instead of the Media panel's pill. Scope queries to the panel root.

## Logs/Debugging

- **CDP helpers** (session scratchpad, need `ws` from repo node_modules, run with repo as cwd):
  `cdp.js <exprFile>` evaluates an expression in the app window and prints the value;
  `shot.js <out.png>` captures the page. Launch the app for these with
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`,
  wait for `build/index.html` to appear in `/json/list` (the splash target appears first), and kill
  with `taskkill //F //IM electron.exe //T`.
- Verifying against the **built** renderer on the dev profile is the right combination here: `npm
  run dev` would have used Vite/HMR, and `npm start` would have hit the daily driver's single-
  instance lock and the prod profile.
- Dev asset index: `W:\…\Vertical Recordings Onwards\.clipflow\assets\assets.json` (767 entries at
  session start; the three media folders had never been scanned in the dev profile and absorbed 101
  items on the first `assets:list`).
- No errors in `app.log` during the session; the only failures were in my own CDP driver scripts.
