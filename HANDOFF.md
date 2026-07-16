# ClipFlow — Session Handoff
_Last updated: 2026-07-16 — Session 108 — **#164 B2 SHIPPED: "Detect layout" button live in the calibrating view, CDP-verified. B3 (nullable camRect + no-cam presets) is next.**_

---

## One-line TL;DR
B2 built and verified in one session: the Layout panel's calibrating view now has a [Detect layout] button that runs the B1 engine ("Analyzing 8 frames…" progress state, ~6s), prefills the draft cam/game boxes on stacked/overlay outcomes with a green "Found your webcam — adjust or Apply" status row, and falls back to the existing red error row on `none`/`nocam`/engine errors — 41 lines, one file (RightPanelNew.js), manual calibration untouched.

## Current State
- **Daily driver unchanged: 0.1.9-alpha.5 (no B1/B2).** Plan remains ONE installer after B4; version sized at wrap (0.2.0 epic-completion candidate). `dist/` still holds the stale same-version installer from session 107 — don't reinstall from it mid-epic.
- master has B1 (engine) + B2 (button). B2 diff: `RightPanelNew.js` only — `detecting`/`detectStatus` state, `handleDetect` (post-await staleness guards: project-id + draft-null via `getState()`), button + green status row above the RectRow block, stale-status clear in the calibration lifecycle effect.
- todo.md: B2 section marked SHIPPED with full results; B3/B4 specs unchanged and current.
- **Dev-profile note:** the verification Apply overwrote the dev library's "RL Main" entry rects with detection output (cam {0,0,2560,1442}, game {0,1442,2560,1438}) — the old taste-nudged values (cam y11/h1429, game insets) are gone from the DEV sandbox only. Prod (real) data untouched. Fine for B3/B4 testing; `npm run dev:seed --force` re-copies prod if a clean slate is ever needed.

## What Was Built (B2)
1. **The button:** full-width outline [Detect layout] above the boxes block in the calibrating view. While running: disabled + spinner + "Analyzing 8 frames…" (naturally blocks concurrent runs; the engine also rejects them by design).
2. **Outcome wiring:** stacked/overlay → `updateReframeDraft("camRect"/"gameRect", proposal.*)` + green status row "Found your webcam — adjust or Apply" (Check icon, mirrors the red row's shape). `none`/`nocam` → existing red error row: "Couldn't detect this layout — place the boxes manually." (until B3 gives `nocam` its preset path). IPC-level errors (source missing, timeout, window killed) surface raw in the same red row — the panel's existing idiom for Apply errors.
3. **Staleness safety:** after the IPC await, the result is discarded unless the same project is still open AND a draft still exists (`useEditorStore.getState()` in the handler — legal outside render paths). Draft-null is guaranteed on project/clip switch (store drops in-flight calibration), so a late result can never write into the wrong project. Stale status line cleared when calibration closes (lifecycle effect).
4. **Verification (all CDP UI-drive on the dev profile, from build/):**
   - proj_polish_real (RL Main 2560×2880 stacked): Detect → cam {0,0,2560,1442} — IDENTICAL to B1/gate for this canvas (Δy11/Δh13 vs the saved taste-nudged entry = "within nudge"); game = complement band. Engine log: stacked, confidence 0.943, 8/8 frames.
   - Apply → "RL Main" entry updated IN PLACE: library 2 entries before/after (no duplicate), name field had seeded "RL Main", project.json persisted, panel returned to "RL Main is active".
   - Error path: killed the hidden detect window mid-run (CDP /json/close) → red row "Detection window closed", button recovered, follow-up run completed clean (activeRun teardown solid).
   - NOT footage-tested: the `none`/`nocam` message branch — no face-free source on hand; 3-line reviewed branch, red-row mechanism proven by the kill test. The gate's m480 refusal frames exist if a future session wants a real `none` repro.

## Key Decisions (this session)
- **IPC errors show raw** (e.g. "Detection window closed") instead of being rewritten to the friendly manual-fallback message — matches how the panel already surfaces Apply/Remove errors; the realistic user-reachable failures ("Source video not found on disk") are already plain language. Only the world-outcome failures get the crafted message.
- **UI-driving proj_b1v1/v2/v3 was dropped** — they have 0 clips so the editor can't open them, and the UI code path is world-agnostic (identical two `updateReframeDraft` writes for stacked and overlay; the per-world engine outcomes were B1-verified). proj_polish_real covers the real UI path end-to-end.
- **CARRIED FLAG for Fega (from session 107, still open):** on borderless/feathered overlay cams (the old horizontal footage, gate v3), detection crops at the HARD content boundary — the feathered fade tail (~56px on v3) is deliberately excluded. When Fega first runs Detect on that footage he should eyeball whether he wants the feather included and just drag the edge out if so — that's the designed "taste nudge", not a bug. Worth saying out loud when he starts testing B2+.

## Next Steps
1. **B3 — nullable camRect + the two no-cam presets** (spec in todo.md): `projects.js:265` whitelist accepts camRect null; `render.js` centered game band + feather/bg skip when gameBand ≥ 1916; `PreviewPanelNew.js:917/:1244` compositor mirrors; `reframeStyle.js` presetFullyZoomed/presetFitToScreen; preset chips in the calibrating view (fresh draft OR `nocam`); null-reframe parity guard re-run.
2. B4 — first-recording auto-offer banner (consumes B1-B3).
3. One installer after B4 + CHANGELOG; version sized at wrap.
4. Carried, unrelated: Projects-tab preview consistency for reframe projects (cosmetic), #165 zoom tuning, #163 YouTube reconnect messaging.

## Watch Out For
- **B3 touches the 104 whitelist trap deliberately** (`projects.js` updateReframe must COPY camRect:null, not drop the key) — the todo spec calls it out; read the session-104 lesson before editing.
- **detect-page.js is a PLAIN static script** (publicDir copy, bypasses Vite) — no imports/ESM. The detect window's CSP lives in `public/detect.html` ONLY; main-window CSP untouched.
- **Detection determinism:** video-seek sampling means a few px drift across differently-trimmed sources is normal — compare with tolerance, not equality (cam 1442 here vs band 1440 in Fega's hand-drawn entry is the same boundary).
- **One detection at a time by design** — `runDetection` rejects concurrent calls; the disabled button makes that unreachable from the UI.
- **Don't re-run `npm run build` casually** — `dist/ClipFlow Setup 0.1.9-alpha.5.exe` is now DOUBLY stale (alpha.5 + B1 + B2 under the same version). Bump before cutting anything meant for Fega's reinstall.
- Old lesson still standing: every hidden `<video>` needs teardown (detect-page handles it in `finally`); the overlay renderer still uses the deprecated positional `console-message` signature — migrate it the same way reframe-detect.js did if touched.

## Logs/Debugging
- **This session's dev-app log:** `%TEMP%\b2-dev-electron.log` (`[ReframeDetect]` lines show the full run: clusters → band → proposal; the kill-test and success runs are both in there).
- **CDP drivers (session-108 scratchpad `4e312d69…/scratchpad/`):** `cdp.js` (one-shot evaluator: `node cdp.js "<expr>"` against port 9222 — finds the main window, awaits promises), `killtest.js` (mid-run window-kill error path), `successtest.js` (full detect→assert flow). Launch recipe unchanged: taskkill electron/ClipFlow first, then `CLIPFLOW_PROFILE=dev ./node_modules/.bin/electron . --remote-debugging-port=9222` (loads from build/ — run `npm run build:renderer` after renderer edits).
- **UI-drive gotcha:** every tab pane stays mounted (display:none) — scope DOM queries with `offsetParent !== null` or you'll match hidden panes; project cards need the pointer-cursor ancestor clicked, not the text div.
- **Objective edge measurement + spike re-run recipes** unchanged: `tasks/spikes/164-phaseb-gate/README.md`; edge-probe scripts in the session-106 scratchpad gate dir.
- #164 trail: gate scorecard → B1-shipped → **B2-shipped comment** (this session). Commits: B2 implementation + session wrap.
