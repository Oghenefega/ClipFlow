# HANDOFF — Session 208 (2026-08-26)

## Current State

**Both remaining gates are built and pushed, as two separate commits.**

- `446d6f3` — **#314**, watched-folder lists are kind-blind. Real work; unreviewed.
- `9ad0e47` — **#313**, stale ASS burn-in section in the ffmpeg skill doc. Doc-only chore.

`npm test`: 158 passing (152 + 6 new). Renderer builds. Both issues left OPEN with a comment
carrying the hash — they close after Fega's one verification pass, not before.

Epic #308's media track is now built, reviewed and gate-cleared apart from the review of
`446d6f3`. Nothing in the whole batch has been seen by Fega yet.

### What #314 actually was

`listAssets` scanned per-list (an audio root walked for audio only, a media root for
image/gif/video only) but judged membership on ONE merged set of roots. An audio root sitting
above a media root therefore vouched for files nobody had scanned — they read as covered, then
as permanent 50%-opacity "file missing" tiles. `rootsForKind(kind, sets)` now picks the roots
matching a file's own kind, applied to the prune, the listed/toggled check and the offline
check; the three sets stay split by list. Measured: five broken shapes clean, two controls
unchanged, seven locked into `src/main/__tests__/listAssets.test.js`.

## Key Decisions

1. **Unknown extensions answer to BOTH lists.** `rootsForKind` falls back to the merged set for
   a kind the classifier doesn't recognise. The prune is destructive — it drops favorites,
   locked lanes, remembered volumes and mood tags — so a kind that can't pick a side must never
   fall through to "covered by nothing". Deliberate, not defensive noise.
2. **The toggle-off half of #314 was worse than the issue described.** It doesn't merely *leak*
   entries into the wrong panel: the toggled-off list isn't scanned, so `onDisk` never holds
   those files and every leaked row arrives as a ghost. Recorded on the issue.
3. **Test-first proof.** The fix was stashed and the new tests re-run to confirm four of the six
   genuinely fail without it. A regression test that passes both ways is worth nothing.
4. **One comment line adjusted outside the diff's strict minimum** — the prune's "checked
   against every configured folder" now says "of its own list". It describes the exact line
   that changed; leaving it would have read as a contradiction to the reviewer.

## Next Steps

**Fega's standing call still holds: NO installer until the media track is done — then one big one.**

1. **Fable@xhigh fresh-eyes review of `446d6f3`** (#314) in its own session, commit-by-hash.
   Light accuracy check on `9ad0e47` (#313) — is every claim in the rewritten section true of
   the code today.
2. **THEN the one big installer** (`clipflow-update-launcher`): #309/#310/#311/#312 + review
   commits (d30fd39, 62ee3ee, 4eaa36c, d65bbdb, f98191a) + #313/#314/#317, i.e. everything from
   `0.4.0-alpha.5`. Issues stay open (`status: untested` on anything closed early) until Fega's
   one pass.

Rhythm stands: Opus@high builds, Fable@xhigh reviews commit-by-hash right after it lands.

## Watch Out For

- **The dev profile was driven through the UI this session and fully restored afterwards.** The
  fixture folders were removed from both lists, the index is back to exactly 860 entries with
  zero leftovers, and `clipflow-settings.json` matches its backup apart from runtime caches. One
  casualty was found and repaired: an exploratory click hit **Hide** next to *Dev Dashboard*,
  flipping `devMode` to false. It was set back to `true` with the app closed. If a future
  session drives Settings, note that its section headers each carry their own Show/Hide and an
  ancestor-walk lands on the wrong one — match by row (same y band), not by DOM ancestry.
- **#321** when picked up: fix the media and sound remove-gates together, one decision.
- **#320** still parked: `mediaPlacements`' `!(x >= 0)` null guard — audio twin fixed, media one
  waits for after the verification pass.
- **s206 gotchas stay live**: the drag threshold is gated (`|dx| >= 3 || (canChangeLane && |dy| >= 3)`);
  a block RE-PARENTS mid-drag so nothing in the pointer handler may depend on staying mounted;
  the last lane of a kind catches `t >= trackIndex` — don't tighten to `===`.
- The s205 sync-loop merge remains deliberately unfiled (reasoning on #312).
- The sacrificial test clip is **"Clip 4 (copy)"** in *2026-08-06 RL Day14 Pt2* (dev profile);
  the first clip there is approved AND published — don't touch. It was only opened read-only
  this session.

## Logs/Debugging

Two harnesses were built in the scratchpad (session-scoped — they will not survive, so the
technique matters more than the paths):

- **Headless `listAssets` repro.** `src/main/assets.js` can't be required under plain node —
  `./ffmpeg` → `./logger` → `require("electron")`. Run the harness with
  `npx electron <script.js>` instead; it needs no window and no `whenReady`. Point it at a
  scratch fixture tree and a throwaway `assetsRoot` so nothing real is written. Under **jest**
  the same file loads fine with `jest.mock("../ffmpeg", () => ({}))` — `listAssets` never
  probes, only `backfillDurations` does. That mock is how the new test file works.
- **CDP driver for the dev app.** `isDev` is hardcoded `false` in `main.js:709`, so even
  `npm run dev` loads from `build/` — no Vite needed. Launch
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`,
  then drive it with `Runtime.evaluate` over Node's built-in global `WebSocket` (the repo has no
  `ws` package and doesn't need one). `Page.captureScreenshot` for proof shots. Kill it with
  `taskkill //IM electron.exe //F`, never TaskStop, or the next run attaches to a zombie on 9222.
  Gotchas found this session: inactive views stay in the DOM, so scope every query to visible
  elements (`getBoundingClientRect().width > 0`) — `innerText` already excludes hidden views but
  `querySelectorAll` does not; and Media panel sub-tabs read "Images 6", not "Images", so anchor
  those regexes loosely.

No app.log digging was needed — the bug was entirely in one pure-ish function.
