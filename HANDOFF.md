# ClipFlow — Session Handoff
_Last updated: 2026-07-17 — Session 110 — **#164 B4 SHIPPED: first-recording auto-offer banner, verified end-to-end incl. relaunch persistence. PHASE B COMPLETE (B1+B2+B3+B4 all on master). Next: installer cut (0.2.0 candidate) — decision pending on fixing #166 first.**_

---

## One-line TL;DR
B4 built and verified in one session: when the editor opens a non-9:16 project with no layout, no dims-matching library entry, and an undismissed format, a banner offers "New recording format — set up a vertical layout?" — [Set up] opens the Layout drawer and auto-runs B2 detection (live-fired: exact gate rect, conf 0.943), [Not for this format] persists the dims to a new migrated store key and survives relaunch. Phase B is done; one installer to cut.

## Current State
- **Daily driver unchanged: 0.1.9-alpha.5 (no B1/B2/B3/B4).** The plan's "one installer after B4" moment has ARRIVED — version sized at wrap (0.2.0 epic-completion candidate). `dist/` holds the QUADRUPLY-stale alpha.5 installer; don't reinstall from it.
- **Open question for Fega (asked at session-110 wrap): cut 0.2.0 now, or fix #166 first and cut once?** #166 (preview fitSize null until first resize → calibration boxes can be invisible on the Open-in-Editor path) is the drag half of the exact flow B4's [Set up] drops users into. It did NOT fire during the session-110 CDP drive (boxes showed fine), but it's filed, real, and would be embarrassing in Fega's hands-on pass. Recommendation given: fix #166 → one 0.2.0 cut.
- master has the full Phase B. B4 diff, 5 files: `reframeStyle.js` (pure `shouldOfferReframe` — CJS, node-tested), `main.js` (defaults + migration for `reframeOfferDismissed: []`), `useEditorStore.js` (`reframeAutoDetectPending` one-shot flag + request/clear actions; cleared on clip load and cancel), `RightPanelNew.js` (LayoutPanel consumes the flag → fires the same `handleDetect` as the B2 button), `PreviewPanelNew.js` (banner state/eval effect/markup + [Set up]/[Not for this format] handlers).
- Dev-profile sandbox FULLY RESTORED after testing: proj_polish_real back on "RL Main" (verified: composite paints), library back to 4 entries (Old HD Canvas, RL Main, Game Only 8x9, Fit Test HD), `reframeOfferDismissed` back to `[]`, spike projects untouched.

## What Was Built (B4)
1. **Decision rule** — `shouldOfferReframe({sourceWidth, sourceHeight, reframe, layouts, dismissed})` in `reframeStyle.js`: dims must be decidable (>0) and non-9:16 (±1%, same idiom as the panel's already-vertical notice), no reframe attached, no exact-dims library entry, dims string `"WxH"` not in the dismissed list. Pure CJS → 17-case node matrix in the session scratchpad (8:9 must offer; garbage/non-array inputs tolerated).
2. **Banner** (PreviewPanelNew): floats top-3/right-3 over the preview container (z-40, wraps on narrow panes), Crop icon + "New recording format — set up a vertical layout?" + [Set up] [Not for this format]. Eval effect runs once per project open: latches into a per-mount Set after any decided evaluation, so later condition flips (e.g. Remove layout) can't resurface it mid-session; undecidable dims (pre-#164 projects, metadata not loaded) skip the latch and re-evaluate when `videoDims` lands. Element dims are readyState-guarded (a src swap reports 0×0 — stale dims can't latch a wrong decision). Excluded: source-preview shells, Media Offline, already-calibrating (that latches too — user found the panel themselves). Async storeGets guarded against project switches (the #97 pattern).
3. **[Set up] handshake** — `beginReframeDraft()` + `requestReframeAutoDetect()` + open Layout drawer (`setActivePanel("layout")` + `setDrawerOpen(true)`). LayoutPanel effect: `pending && reframeDraft` → clear flag FIRST, then `handleDetect()` (the `detecting` guard is the second belt against double-fire). Zero duplicated detection logic — status lines, nocam chips, 'none' refusal all inherit B2/B3 behavior.
4. **[Not for this format]** — appends `"WxH"` to `reframeOfferDismissed` (electron-store). main.js: defaults entry + `store.has` migration (pipeline rule). NOTE: the spec's "settings whitelist" doesn't exist — `store:set` is generic, so defaults + migration is the entire main-process surface.

## Verification evidence (session 110)
- **Node matrix**: 17/17 (scratchpad `b4-matrix.js`) — offer/skip/suppress/undecidable/garbage-tolerance, incl. 2560×2880 (8:9) MUST-offer and 1080×1921 near-9:16 skip.
- **CDP drive** (dev build, real footage proj_polish_real 2560×2880, reframe detached + 2560×2880 entries stashed for the positive case): banner appeared on open; **[Set up] alone** → Layout drawer in calibrating view mid-"Analyzing 8 frames…" → green "Found your webcam — adjust or Apply", cam {0,0,2560,1442} / game {0,1442,2560,1438} — the exact session-107 gate rect (main log: world stacked, conf 0.943, clusters 20). Cancel → banner did not return (once-per-open). Fresh reopen → banner → **[Not for this format]** → gone, store `["2560x2880"]` → reopen suppressed → **app relaunch** → still suppressed. Dismissed cleared + entries restored → entry-match suppressed. RL Main restored → reframe-attached suppressed + composite regression clean (screenshot). **Live 9:16 skip**: proj_spike164_916 opened, no banner (beyond the matrix — an actual 9:16 project in-app).
- Zero renderer exceptions across both app runs (standing CSP dev warnings only).
- Screenshots in session scratchpad: `b4-04-editor-banner.png` (banner), `b4-06-detected.png` (auto-detect landed), `b4-08-rlmain-restored.png` (regression), `b4-10-916-editor.png` (9:16 no-banner).

## Key Decisions (this session)
- **Once-per-open latch is per evaluation, not per show**: a decided evaluation (including "suppressed") latches the project id for that editor mount. Removing a layout mid-session intentionally does NOT pop the banner; the panel's own "Set up vertical layout" button covers that path.
- **Cancel ≠ dismiss**: cancelling calibration (or starting it manually) hides the offer for THIS open only; only [Not for this format] persists. Next fresh open re-offers — it's an offer, not a nag, and dismissal is explicit.
- **No new IPC**: banner uses the generic storeGet/storeSet bridge; detection handshake rides a store flag so LayoutPanel's existing handleDetect stays the single detection call site.
- **Dims key format**: exact-int `"2560x2880"` strings, mirroring the library's exact-dims match (no aspect bucketing — a new format = a new decision).

## Next Steps
1. **Installer cut — awaiting Fega's answer**: (a) fix #166 first, then one 0.2.0 cut (recommended; it's the drag half of B4's landing flow), or (b) cut 0.2.0 now, #166 in the next batch. Use clipflow-update-launcher skill for the cut. Version sizing: Phase B completion = feature milestone → 0.2.0 line per the plan (memory feedback_version_semantics delegates sizing).
2. #166 (preview fitSize null until first resize) — filed, pre-existing, session-109 diagnosis in the issue.
3. Fega's Phase B hands-on pass on the new installer (his verification gates closing #164).
4. Carried, unrelated: Projects-tab preview consistency for reframe projects (cosmetic), #165 zoom tuning, #163 YouTube reconnect messaging.

## Watch Out For
- **`reframeAutoDetectPending` is a one-shot**: any new consumer must clear it BEFORE acting (LayoutPanel does), and it's already cleared on clip load + cancel. Don't add a second consumer without checking the first.
- **The banner's latch Set is per-mount** (editor remounts per clip open → banner re-evaluates per open — intended). If a future refactor keeps the editor mounted across opens, the Set keys by project id, so same-project reopens would stop re-offering — revisit then.
- **`shouldOfferReframe` compares entry dims with `===`** against resolved numbers; entries store ints from probe fields. Don't feed it stringified dims.
- **Pre-#164 projects (null probe fields)**: banner waits for video metadata (readyState ≥ 1) — on those projects it appears a beat after open. Not a bug.
- **Standing traps**: `{...maybeNullRect}` → `{}` (null-guard camRect copies); isReframeActive null-vs-undefined semantics; #166 divider-nudge workaround for CDP box work; don't `npm run build` casually (dist/ alpha.5 is stale).

## Logs/Debugging
- **This session's dev-app logs**: `%TEMP%\b4-dev-electron.log` (run 1: the auto-fired detection — `[ReframeDetect]` proposal line shows the B4 [Set up] path produced the gate rect) and `%TEMP%\b4-dev-electron2.log` (run 2: relaunch-persistence pass).
- **CDP toolkit (session-110 scratchpad `16bae84b…/scratchpad/`)**: `cdp.js` (one-shot evaluator on Node 24's GLOBAL WebSocket — no ws dep exists in the repo), `click.js` (Input.dispatchMouseEvent press+release at coords), `shot.js` (Page.captureScreenshot), `b4-matrix.js` (decision-rule tests), `b4-state-snapshot.json` + `b4-restore-stash.json` (pre-mutation dev-sandbox state, already restored).
- **UI-drive gotchas (adds to the session-108/109 list)**: bottom-nav tabs do NOT respond to `element.click()` — dispatch real Input mouse events at the label center; shadcn `<button>`s DO respond to `el.click()`; never assert the current view via `document.querySelector('h1')` (every tab pane stays mounted — first h1 is always Rename's) — screenshot instead; nav coords @1280×860: bottom-nav Projects (461,841), project row title ~(630,y-of-row), Review "Open in Editor" (570,663), editor back arrow (29,60), review→list back arrow (268,104).
- **Launch recipe unchanged**: taskkill electron/ClipFlow first, then `CLIPFLOW_PROFILE=dev ./node_modules/.bin/electron . --remote-debugging-port=9222` (loads from build/ — run `npm run build:renderer` after renderer edits).
- #164 trail: gate scorecard → B1 → B2 → B3 → **B4-shipped comment** (this session). Commits: B4 implementation + docs.
