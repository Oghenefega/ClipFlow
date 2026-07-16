# ClipFlow — Session Handoff
_Last updated: 2026-07-16 — Session 105 — **#164 polish round 2 (bg zoom/position + named layouts), SHIPPED in 0.1.9-alpha.4. Awaiting Fega's hands-on.**_

---

## One-line TL;DR
Fega's four alpha.3 feedback items, implemented via two Sonnet subagents (reviewed line-by-line), machine-verified end-to-end (node math checks + filter-args + 3-pass CDP drive + real render), cut as **0.1.9-alpha.4**: Shadow edge option removed; blurred background defaults to 2× zoom centered on the game box (fixes "background shows the floor"); new Zoom slider + drag-the-Result-preview to choose what the background shows; layouts are now named with a pickable "Saved layouts" list (★ default, apply-on-click, dimmed on dims mismatch, duplicate-on-resave bug fixed).

## Current State
- **Daily driver: 0.1.9-alpha.4 offered** — installer in `dist/`, banner will surface it. Fega still hadn't clicked alpha.2/alpha.3 banners as of session start; alpha.4 supersedes them (all changes cumulative).
- All work committed + pushed to master. CHANGELOG current through alpha.4.
- Dev sandbox (`%APPDATA%\clipflow-dev\`): proj_polish_real now carries a TEST style (blur 0 / darken 80 / edge 15 / zoom 100 / pos 36,29) and links to library entry "RL Dual Band v2" (2560×2880). Library also has the old "1920×1080 layout" entry. Default = RL Dual Band v2. All deliberate CDP-test residue — harmless, it's the sandbox.

## What Was Just Built (session 105)
1. **`bgSourceWindow(gameRect, style, outW, outH)` in reframeStyle.js** — THE new core: integer, even-rounded source-pixel window the blurred bg samples. zoom = 1 + bgZoom/50 (0→1× exact old cover framing, 50→2× default, 100→3×); bgPosX/bgPosY 0-100 pan the leftover range; clamped inside the game rect. Both engines consume the same window: render.js `crop=<win>,scale=270:480,…` (replaced scale-cover+center-crop pair), PreviewPanelNew scratch `drawImage(video, win…)` (replaced coverScale math).
2. **Style schema: `seam` REMOVED** (always fade now), `bgZoom/bgPosX/bgPosY` added, all resolver-backfilled at read time. Shadow branches deleted from render.js + PreviewPanelNew. Fade/Shadow chips deleted from the panel; Zoom slider added between Darkness and Edge size. main.js library migration re-resolves every entry's style (adds bg fields, drops seam; JSON-compare so it's idempotent).
3. **Result-preview drag** (RightPanelNew LayoutPanel): pointer capture on the Result wrapper, content-follows-pointer (drag right → bgPosX decreases), per-axis skip when no pan range, `e.buttons===0` bail + pointercancel (stuck-drag guards), hint line under the box. Store's `updateReframeStyle` resolver-clamps to ints — fine on a blurred bg.
4. **Named layout library**: store actions `saveReframeLayout(name)` (upsert by `project.reframe.layoutId`; writes layoutId back onto the project after first save — THE fix for silent duplicate entries; default claimed only when none valid exists) and `applyReframeLayout(entry)` (exact dims guard, commit-style identity re-check). Panel: "Save layout" → inline prefilled name row (Enter saves, Esc closes); `SavedLayoutsList` in both non-calibrating views (★ default toggle w/ stopPropagation, "In use" tag on the linked entry, mismatch rows dimmed + tooltip). SettingsView untouched — its list shows the names automatically.

## Key Decisions (this session)
- **Default bg framing CHANGED deliberately**: 2× centered (the item-2 fix). Old projects/layouts inherit it via read-time resolve — Zoom 0 restores the exact old framing if ever wanted. Byte-parity with alpha.3 bg was explicitly NOT a goal (the old look was the complaint).
- **Position control = drag the Result preview** (not sliders) — Fega asked to "play with" the framing; zoom stayed a slider.
- First saved layout auto-becomes default; afterwards the ★ is the only thing that moves it (saves never steal).
- Version: alpha tick (4-item polish batch on the existing subsystem), per delegated sizing policy.

## Next Steps
1. **Fega installs alpha.4** → hands-on: calibrate on real footage, feel the Zoom + drag, save a named layout, check the list. If his preferred zoom/pos differs from 2×-centered, consider new REFRAME_STYLE_DEFAULTS (one line).
2. Carried: first-recording auto-offer slice (approved), Projects-tab preview consistency for reframe projects (cosmetic), **Phase B** (MediaPipe box detection pre-filling calibration).
3. **0.2.0** when the Auto-Reframe epic completes and verifies on his real workflow.
4. Parked: #165 zoom tuning, #163 YouTube reconnect messaging, old non-v2 waveform cache cleanup, session-102 waveform regression check (Clip 1 of "2026-02-12 EO Day2 Pt1", burst under "MOVE,").

## Watch Out For
- **All bg-window math lives in `bgSourceWindow`** — never re-derive cover/zoom/pan in an engine; both engines consume the returned integer window verbatim (parity by construction). Blur/darken/seamSize mappings unchanged from 104.
- `resolveReframeStyle` no longer emits `seam` — anything reading `style.seam` is dead code; don't reintroduce it.
- **projects.updateReframe whitelists reframe fields but passes `style` wholesale through resolveReframeStyle** (projects.js ~272) — new style SUBfields flow automatically; a new TOP-LEVEL reframe field still needs whitelisting (the session-104 trap, re-verified this session).
- `saveReframeLayout` writes `layoutId` back onto the project after a first save — if that write path changes, the duplicate-entries-on-resave bug returns.
- CDP driver gotchas (cost a full failed pass): the editor top bar has its own "Save" button — scope clicks to the panel row; the Result box sits below the panel fold — `scrollIntoView` before dispatching pointer events; the timeline zoom control is a 5th `[role=slider]` — scope slider assertions to the panel (x>880, y<580).
- Still true from 104: TaskStop on a bash-wrapped `npx electron` orphans electron.exe (kill via `taskkill //F //IM electron.exe`); headless render harnesses need `app.on("window-all-closed", () => {})`; `%APPDATA%\clipflow-dev\clipflow-settings.json` is the dev store file.

## Logs/Debugging
- Render: `[Render] FFmpeg args:` — grep `crop=` on the `[rf_bg_in]` chain to see the exact bg window (this session's real-render check: `crop=272:482:838:1713` matched the hand computation from style zoom100/pos36,29).
- Editor compositor logs nothing — diagnose via the panel Result canvas (draft) vs main canvas (committed), or `reframe.style` in project.json.
- `project:updateReframe` errors surface inline in the Layout panel (red text); save/apply errors from the new flows land in the same red box.
- Session-105 scratchpad `spike/` (session id `7053b5a0…`): `cdp-bg.js` (v1, full nav + migration checks), `cdp-bg2.js` (v2, instrumented drag — the one that proved pointer delivery + pos persistence), `cdp-bg3.js` (v3, save/rename/star/apply-from-list, 22/22), screenshots (bg0*, v2-0*, v3-0*, render-frame-v2.png), plus session-104's harnesses copied over (`render-test-real.js` reused for the real render).
- Verify what shipped with `npx asar list dist/win-unpacked/resources/app.asar | grep reframeStyle` if a packaged-app crash ever points at the cross-tree require.
