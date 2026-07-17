# ClipFlow — Session Handoff
_Last updated: 2026-07-17 — Session 111 — **#166 FIXED + 0.2.0-alpha.1 installer cut (Phase B's first promotion to the daily driver). Next: Fega reinstalls + his Phase B hands-on pass.**_

---

## One-line TL;DR
Fixed #166 (calibration boxes invisible until a resize on the Open-in-Editor path) with a sync-measure-at-mount hardening in PreviewPanelNew, CDP-verified on the exact repro path with zero resizes, then cut the 0.2.0-alpha.1 installer promoting ALL of Phase B (B1–B4) + this fix to the daily driver — the "fix #166 first, then one cut" option Fega chose.

## Current State
- **Fega INSTALLED 0.2.0-alpha.1 and confirmed #166 in-app** ("boxes show up now") — `status: untested` removed; #166 fully done.
- **FRESH-TEST IN FLIGHT (post-wrap turn):** Fega asked to experience the first-run/new-user surfaces his real data suppresses (B4 banner etc.). Prep completed: (1) dev sandbox PARKED — `%APPDATA%\clipflow-dev` renamed to `%APPDATA%\clipflow-dev.bak-s111` (restore = delete the scratch `clipflow-dev` the test creates, rename the .bak back; the seeded fixtures proj_polish_real etc. live in the .bak); (2) `Desktop\ClipFlow FRESH TEST.cmd` launches the INSTALLED exe with `CLIPFLOW_PROFILE=dev` (profile switch is binary — main.js:8 only honors exactly "dev"; no lock, runs alongside the real app); (3) `Desktop\ClipFlow Fresh Test\Recordings\` holds copies of two real recordings (50MB + 203MB) — checklist step 1 repoints Watch Folder there because the projects root derives from the watch folder (main.js ~840) and the DEFAULT watchFolder is Fega's real folder (filed as #167). Awaiting his run-through; his Phase B checklist was delivered in-chat.
- **#167 FILED** (found during this prep): store defaults hardcode Fega's personal `W:\` watchFolder — every fresh install boots pointed at a nonexistent (or worse, real) folder. `milestone: commercial-launch`.
- **#164 remains OPEN** — Phase B is code-complete and shipped, but closing gates on Fega's hands-on pass (his verification, not mine).
- Dev-profile sandbox untouched this session (only opened/calibrated/cancelled on proj_polish_real — no store mutations beyond autosave of identical data).

## What Was Built (#166 fix — PreviewPanelNew.js only)
1. **Root cause, corrected from the filed hypothesis**: the issue suspected the mount-only ResizeObserver effect early-returns on a null ref (observer never attached). Impossible as written — the scroll container div renders unconditionally in the component's single return path, and React sets object refs at commit, before effects. What actually starves is the observer's **initial size report** (flaky, timing-dependent — matches session 110 not reproducing it, and matches the filed evidence that a net-zero divider nudge fixed it, which proves the observer was attached and alive). `scrollSize`'s only writer was that callback → `fitSize` null forever → fallback 9:16 canvas + the `calibrating && videoDims && fitSize` gate keeping CalibrationBoxes unmounted.
2. **Fix shape**: the mount effect now measures the container synchronously (`getBoundingClientRect`) + once more on the next animation frame (panel that gets its flex width a frame late), with a value-equality guard so redundant reports don't re-render; the observer only handles ongoing resizes. First paint no longer depends on observer delivery timing — every starvation variant is dead.
3. **Same hardening for `canvasWidth`** (the text-scaling observer four lines above — identical blind spot, would have silently mis-scaled subtitle preview text in the same broken sessions). Uses `clientWidth` to preserve the old `contentRect` semantics (the canvas div has a 1px border that gBCR would include).

## Verification evidence (session 111, CDP on dev build, exact repro path, ZERO resizes)
- Immediately after Open in Editor (700ms probe): canvas carries px dims `272.25×484` — exact 9:16, no `aspect-ratio` fallback → fitSize live at mount.
- Layout → Edit layout: canvas switches to the source's own aspect `430.222×484` (8:9 for 2560×2880), **WEBCAM + GAME boxes both in DOM** (label probe + screenshot `166-04-boxes.png` in session scratchpad).
- Cancel: canvas back to 9:16, PiP composite present AND painted, boxes unmounted.
- Ran the full pass twice (initial fix build, then final build after the clientWidth refinement); zero renderer exceptions in both logs.

## Key Decisions (this session)
- **Fix the CLASS, not a guessed variant**: since the exact starvation variant is unconfirmed (unreproducible on demand), the fix removes the dependency on the observer's first report entirely rather than patching one theory. The issue's "log which variant" triage step is moot under this shape.
- **0.2.0 line opened** (0.2.0-alpha.1, `-alpha` kept pre-launch): Phase B epic completion = flagship milestone per the session-110 plan and the delegated version-sizing judgment.
- **#166 closed by explicit `gh issue close` + `status: untested`**, not a commit keyword — keeps the label ritual intact.

## Next Steps
1. **Fega: install 0.2.0-alpha.1** (in-app "Install update" banner, or run `dist\ClipFlow Setup 0.2.0-alpha.1.exe`; data preserved). Confirm Settings shows v0.2.0-alpha.1.
2. **Fega's Phase B hands-on pass** — gates closing #164 and clearing #166's `untested`. The one #166-specific check, in plain terms: open a clip from Projects → Open in Editor, open Layout, hit Edit layout — the purple WEBCAM and cyan GAME boxes should be there immediately, without touching the window or any divider.
3. Carried, unrelated: Projects-tab preview consistency for reframe projects (cosmetic), #165 zoom tuning, #163 YouTube reconnect messaging.

## Watch Out For
- **The #166 divider-nudge workaround note in project_cdp_verification_gotchas memory is now OBSOLETE on ≥0.2.0-alpha.1 builds** — don't re-add nudge steps to future CDP drives (and if boxes ever fail to appear again on a fixed build, that's a NEW bug, file it, don't nudge past it).
- The scroll-container measure intentionally uses `getBoundingClientRect` (no border/padding on that div → equals the old contentRect exactly); the canvas measure intentionally uses `clientWidth` (1px border). Don't "unify" them without re-checking the box models.
- `setScrollSize` now has a value-equality guard returning `prev` — if a future change adds fields to that state object, keep the comparison in sync.
- Standing traps carried: `{...maybeNullRect}` → `{}` null-guard on camRect copies; `reframeAutoDetectPending` is a one-shot (clear BEFORE acting); pre-#164 projects show the B4 banner a beat after open (metadata wait — not a bug); don't trust `dist/` alpha.5-and-older installers (QUINTUPLY stale now — the only current one is 0.2.0-alpha.1).

## Logs/Debugging
- **This session's dev-app logs**: `%TEMP%\166-dev-electron.log` (run 1 — fix verification on first build) and `%TEMP%\166-dev-electron2.log` (run 2 — final build full pass). Both clean of renderer exceptions (standing CSP dev warnings only).
- **CDP toolkit (session-111 scratchpad `43b1d374…/scratchpad/`)**: `cdp.js` — single-file helper with subcommands `targets` / `eval <expr>` / `click <x> <y>` / `shot <out.png>` on Node 24's global WebSocket (no ws dep). Screenshots `166-01…166-04` (projects list → review → editor → calibration boxes visible).
- **UI-drive notes (adds to sessions 108–110 list)**: the Projects list REVIEW pill at (924,y) did NOT navigate under CDP — click the project ROW TITLE (~630,y) instead; right-rail icon buttons and shadcn panel buttons all respond to `el.click()`; nav coords @1280×860 unchanged (bottom-nav Projects (461,841), review "Open in Editor" (570,663)).
- **Launch recipe unchanged**: taskkill electron.exe first, then `CLIPFLOW_PROFILE=dev ./node_modules/.bin/electron . --remote-debugging-port=9222` (loads from `build/` — run `npm run build:renderer` after renderer edits).
- #164 trail: gate scorecard → B1 → B2 → B3 → B4 → **#166 fix + 0.2.0-alpha.1 cut** (this session). Commits: a66b787 (#166 fix), version-bump commit (this cut).
