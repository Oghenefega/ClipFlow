# HANDOFF — Session 213 (2026-08-27)

## Current State

**The whole pending batch review is done and alpha.8 is live on the feed.** All eight commits from
the s212 list (s210's six, the s211 splash `bc2184a`, #322's `1c010a4`) got the Fable@xhigh
fresh-eyes pass. Three small defects found, all fixed and pushed: the stale-tag "All games" tick and
the clickable dropdown headers (`d21d8ae`, #322-side) and the `occupantsFromLane` lane-coercion
mismatch (`974b573`, #320/#321-side). One rare corner filed as #323 instead of fixed. Installer
`0.4.0-alpha.8` built, published to `https://engine.flowve.app/updates/` (feed verified serving it,
alpha.7 pruned), bump committed as `4bdaa48`.

**Everything now waits on Fega's eyes**: #322 game scoping, the boot splash on an installed build,
and the s210 batch (#315/#318/#319/#320/#321) — all `status: untested`. A machine still on alpha.6
gets it all in one hop.

## Key Decisions

1. **Latent model disagreements get fixed, not just noted** — `occupantsFromLane` judged a lane
   with `|| 0` while `normalizePlacements` draws with the finite guard; nothing in the app writes a
   non-number, but #320 itself shipped on the models-must-agree rule, so the same standard applied.
   Test pins the agreement.
2. **#323 filed, not fixed inline** — a platform enabled *after* a partial publish is never attempted
   by Retry, so `everyDone` stays false and the clip can go invisible again after a successful retry.
   Needs cross-component knowledge (toggles live in QueueView, the derived card in App.js) and a
   product call on what the card means. Body has the full trace.
3. **Cosmetic corners deliberately left** (recorded in the s213 review report, no code): first-run
   full-success logs at end-of-run not the mid-loop stamp (minutes of skew, pre-fix behavior); the
   Media panel refresh toast counts new files across ALL scopes; the "this clip" hint shows for a
   project-fallback tag; a folder assigned to a deleted game shows its bare tag in Settings.

## Next Steps

1. **Fega verifies alpha.8** — one pass covers the splash, #322, and the s210 batch; close the
   `status: untested` issues as he confirms.
2. **#323** when he prioritizes it (low likelihood, silent failure mode).
3. **Stale comment cleanup next time someone is in App.js**: line ~114 still claims clip.gameTag is
   lowercased — the exact misconception the s212 lesson corrected. One-line comment fix, not worth
   its own session.
4. **Audio panel scoping** stays the obvious #322 follow-up, still only if Fega asks.

## Watch Out For

- **Never `.toLowerCase()` a game tag** (s212 rule stands). Editor-path clips carry verbatim tags
  ("RL", "EO"); queue-import paths lowercase theirs — QueueView normalizes at its own boundaries.
  MediaPanel matches verbatim by design and verified behavior.
- **`occupantsFromLane` and `normalizePlacements` must keep agreeing** on how a lane index is
  judged — a change to either guard changes "who holds this lane" AND "where does this block draw";
  the new test in audioPlacements.test.js pins them together.
- **`"universal"` is a stored sentinel; `ALL_GAMES = "__all__"` is UI-only** — don't merge them
  (s212 rule stands).
- **`Select` in shared.js now treats `o.isHeader` options as inert labels** — new consumers of
  header rows get that for free; don't re-add per-callsite guards (SettingsView's onChange guard
  stays as a second wall).
- **The everyDone gate in QueueView (~line 1501) only counts platforms that have a publishState
  entry** — see #323 before touching retry/publish logging.

## Logs/Debugging

- **Dev-profile boots here take ~20-35s cold** — I killed one mid-hydration at 18s and briefly read
  the absent "Main window revealed" line as a possible regression. Gate any boot assertion on the
  reveal line (`grep "revealed" app.log` for the newest `sess_*`), not on a fixed sleep.
- **CDP hydration probe**: `%TEMP%\probe.js` (needs repo `ws`) connects to 9222, evaluates
  root-children/bridge/title in one shot — cheap proof the renderer is alive. Launch with
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`, kill with
  `taskkill //F //IM electron.exe //T`.
- **Feed check**: `curl -s https://engine.flowve.app/updates/alpha.yml | head -1` → must read
  `version: 0.4.0-alpha.8`.
- Zero errors in the dev `app.log` across all three verification boots this session; model suites
  135/135 green.
