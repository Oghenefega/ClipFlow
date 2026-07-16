# ClipFlow — Session Handoff
_Last updated: 2026-07-16 — Session 107 — **#164 B1 SHIPPED: detection engine in-app, gate-verified in dev + packaged exe. B2 (Detect button) is next.**_

---

## One-line TL;DR
B1 built and verified in one session: the gate-proven detection algorithm now runs inside the app behind `window.clipflow.reframeDetect(projectId)` — hidden window, page-scoped CSP, vendored MediaPipe (zero network, zero native modules), reproduces the gate proposals on all three real videos from both dev source and the packaged exe, plus a new native-res edge refinement that landed all four v3 edges within 0-1px of the objective boundary. Zero UI (that's B2).

## Current State
- **Daily driver unchanged: 0.1.9-alpha.5.** B1 is engine-only (no user-visible change). `dist/` now holds a same-version installer that INCLUDES B1 (built for packaged verification) — safe to install but pointless until B2; the plan stays one installer after B4.
- master has B1: `src/main/reframe-detect.js` (window lifecycle + `reframe:detect` IPC), `src/main/reframe-detect-preload.js` (narrow bridge: getJob/readAsset/report), `public/detect.html` (own CSP — main window's CSP untouched), `public/detect-page.js` (algorithm), `public/mediapipe/` (11.6MB vendored assets + provenance README), `main.js` handler, `preload.js` bridge method, pinned devDep `@mediapipe/tasks-vision@0.10.35`.
- Dev profile has three test projects (`proj_b1v1/v2/v3` in `%APPDATA%\clipflow-dev\spike164-watch\.clipflow\projects\`) pointing at the three W: gate videos — reusable for B2 CDP verification.
- todo.md: B1 section marked SHIPPED with full results; B2-B4 specs unchanged and current.

## What Was Built (B1)
1. **Probe first, build second:** a 4-file standalone Electron probe killed the three architecture unknowns in one run before any app code — file://-page canvas readback of file:// video is NOT tainted in Electron; blob-URL dynamic import of the ESM bundle works under the planned CSP; manual `{wasmLoaderPath, wasmBinaryPath}` blob fileset + `modelAssetBuffer` initializes and detects (131ms init, found Fega's face on the real video). The planned `protocol.handle` fallback was never needed.
2. **The engine:** detect-page.js ports snap.js 1:1 (consensus cluster with containment dedupe → stacked-band check → overlay flood/trim → refusal caps; minG map dropped — it only fed the superseded snapDir). Sampling = 8 seeks at 10-90% of duration on a hidden `<video>` (torn down in `finally` — DOMDataStore crash memory). Grids [2,4] +6 when min(dim)<1200 (matches gate jobs). Outcomes: `stacked`/`overlay`/`nocam` (strongest cluster ≤1 frame)/`none` (refusal).
3. **Native-res edge refinement (the one NEW piece):** overlay world only; two far-apart frames re-sampled; per edge, profile median |Δluma| per line over ±60px; long-window (12) quiet/loud qualification, winner = sharpest 3-line gradient (floor 6). Two iterations to get right — argmax-delta alone dragged v3's left edge 5px into the game (feather ramp), a minIn constraint then broke top (deep interior quieter than edge-adjacent interior); sharpness scoring fixed both.
4. **Verification:** v1 cam IDENTICAL to gate {0,0,2560,1442} (= 0/0/0/2px vs Fega's saved layout); v2 band 704 vs gate 702 (same boundary); v3 refined {30,430,625,353} = 0-1px on all edges vs objective 8-frame std boundaries (L≈29-30/T≈431/R≈655/B≈783). Packaged exe (win-unpacked): identical v1 + v3 results, asar list confirmed all assets shipped, devDep pruned from packaged node_modules. ~6s for the 15GB v3 source.

## Key Decisions (this session)
- **Bridge naming:** flat `clipflow.reframeDetect(projectId)` (returns `{success, proposal}`/`{error}`) — preload.js has no dotted namespaces; the plan's `clipflow.reframe.detect` shape lost to file idiom. B2 calls this.
- **Refinement rule:** a hard cam boundary steps quiet→loud in ~2 lines (grad 17-32 on gate footage); feather fades ramp 1-2/line. Qualify with long windows, WIN by short-gradient. Edges with no decisive step keep the coarse position. Stacked worlds never refine.
- **The gate's "v3 right edge shaved ~54px" was re-measured and reinterpreted:** objective per-column 8-frame std shows the hard content boundary at x≈655 — exactly where B1 lands. The eyeballed truth ~712 is the tail of a feathered/semi-transparent fade (x 656-712 carries damped game motion, std 18-33, between quiet ≤3 and full-game 43-49). Crop-at-hard-step is the shipped posture; feather taste is a user nudge in calibration. **Fega should eyeball the v3 box in B2 calibration and veto if he wants the feather included** — flag this when B2 lands.
- MediaPipe assets vendored under `public/mediapipe/` (README documents provenance + re-vendor steps + model URL); pinned exact devDep exists only as provenance.

## Next Steps
1. **B2 — "Detect layout" button** in the Layout panel calibrating view (spec in todo.md): button → progress state → prefill draft via existing updateReframeRect on stacked/overlay; 'none' → existing red-box error row; 'nocam' → same manual message until B3. CDP-verify on proj_polish_real AND the proj_b1v* projects.
2. B3 — nullable camRect + the two no-cam presets (the four both-rects sites listed in todo.md: projects.js:265, render.js:58 area, PreviewPanelNew.js:917/:1244).
3. B4 — first-recording auto-offer banner.
4. One installer after B4; version sized at wrap (0.2.0 epic-completion candidate).
5. Carried, unrelated: Projects-tab preview consistency for reframe projects (cosmetic), #165 zoom tuning, #163 YouTube reconnect messaging.

## Watch Out For
- **detect-page.js is a PLAIN static script** (publicDir copy, bypasses Vite). No imports/ESM in it; the MediaPipe bundle arrives via blob dynamic import. Don't "modernize" it into the bundle.
- **The detect window's CSP lives in public/detect.html only.** Main window CSP (index.html:7) untouched — keep it that way. Infra dashboard note added this session (single-purpose hidden window, sandbox:false + fs-preload like the subtitle overlay).
- **Detection determinism:** consensus + temporal maps make results reproducible across runs/contexts (dev vs packaged matched exactly), but frames come from video seeks — a source whose 10-90% window lands differently (e.g. trimmed file) shifts numbers by a few px. Compare against the gate with tolerance, not equality.
- **One run at a time by design** — `runDetection` rejects concurrent calls ("Detection already running"). B2's button should disable while running (its progress state does this naturally).
- **Don't re-run `npm run build` casually** — it overwrites `dist/ClipFlow Setup 0.1.9-alpha.5.exe` (Fega's promotion artifact). Harmless now (the built exe = alpha.5 + B1 engine), but after B2+ lands mid-epic, a same-version installer with half-shipped UI could confuse a manual reinstall. Bump before cutting anything meant for Fega.
- The `console-message` handler in reframe-detect.js uses the NEW Electron signature (`(event) => event.message`) — verified working on Electron 40. The overlay renderer still uses the deprecated positional form; if you touch it, same migration applies.
- Old-scratchpad gate assets (frames, node_modules, model) survived at session id `8d14e408…` and were reused; the vendored copies + spike README now make B1 independent of it.

## Logs/Debugging
- **Detection logs:** every run prints `[ReframeDetect]` lines to the MAIN process stdout (per-frame detections, cluster summary, sharpness/trim, refine decisions, final proposal). Dev run log: `%TEMP%\b1-dev-electron.log`; packaged run log: `%TEMP%\b1-packaged.log` (this session's runs).
- **CDP driver** for headless verification: session-107 scratchpad `cdp-detect.js` (`node cdp-detect.js <projectId> [port]` against a dev app launched with `CLIPFLOW_PROFILE=dev electron . --remote-debugging-port=9222`). taskkill electron/ClipFlow first — stale-zombie-on-9222 memory applies.
- **Objective edge measurement** (the tool that settled the 54px question): `edge-probe.js` / `edge-probe4.js` in the OLD session-106 scratchpad gate dir — per-line 8-frame std profiles from the gate PNGs.
- **Spike re-run recipe** unchanged: `tasks/spikes/164-phaseb-gate/README.md` (+ new session-107 appendix documenting the refinement rule + objective boundaries).
- #164 trail: gate scorecard comment → B1-shipped comment (this session). Commits: B1 implementation + session wrap.
