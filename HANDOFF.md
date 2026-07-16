# ClipFlow — Session Handoff
_Last updated: 2026-07-16 — Session 105 — **#164 polish rounds 2+3 SHIPPED and FEGA-CONFIRMED on 0.1.9-alpha.5 ("it looks good"). Sonnet-delegation policy REVERSED.**_

---

## One-line TL;DR
Two ship rounds in one session. Round 2 (alpha.4, via Sonnet subagents): Shadow removed, bg defaults to 2× centered zoom, Zoom slider + Result-drag, named layout library. Fega's hands-on then rejected two UX choices AND the delegation workflow ("let's not use sonnet… use fable instead") — round 3 (alpha.5, Fable direct): the separate "Save layout" button died (Apply now applies AND saves under a Name field in the editor, pencil-rename on list rows), and panning got dedicated Horizontal/Vertical sliders (drag-only was undiscoverable). CDP v4: 19/19, zero exceptions.

## Current State
- **Daily driver: 0.1.9-alpha.5 INSTALLED and confirmed** — Fega tested the naming flow and pan sliders hands-on and signed off ("it looks good"). #164 Phase A polish is settled.
- All work committed + pushed to master. CHANGELOG current through alpha.5.
- **PROCESS POLICY CHANGE: no Sonnet/Haiku implementation subagents** — Fable implements directly in the main session. Memory + lessons.md updated (subagents stay OK for read-only research).
- Dev sandbox (`%APPDATA%\clipflow-dev\`): proj_polish_real links to entry "RL Main" (2560×2880), test style blur 0 / darken 80 / edge 15 / zoom 100 / pos 100,0; second entry "Old HD Canvas" (1920×1080, dims-mismatch row). Default = RL Main. All deliberate CDP-test residue — harmless, it's the sandbox.

## What Was Just Built (session 105)
1. **`bgSourceWindow(gameRect, style, outW, outH)` in reframeStyle.js** — THE new core: integer, even-rounded source-pixel window the blurred bg samples. zoom = 1 + bgZoom/50 (0→1× exact old cover framing, 50→2× default, 100→3×); bgPosX/bgPosY 0-100 pan the leftover range; clamped inside the game rect. Both engines consume the same window: render.js `crop=<win>,scale=270:480,…` (replaced scale-cover+center-crop pair), PreviewPanelNew scratch `drawImage(video, win…)` (replaced coverScale math).
2. **Style schema: `seam` REMOVED** (always fade now), `bgZoom/bgPosX/bgPosY` added, all resolver-backfilled at read time. Shadow branches deleted from render.js + PreviewPanelNew. Fade/Shadow chips deleted from the panel; Zoom slider added between Darkness and Edge size. main.js library migration re-resolves every entry's style (adds bg fields, drops seam; JSON-compare so it's idempotent).
3. **Result-preview drag** (RightPanelNew LayoutPanel): pointer capture on the Result wrapper, content-follows-pointer (drag right → bgPosX decreases), per-axis skip when no pan range, `e.buttons===0` bail + pointercancel (stuck-drag guards), hint line under the box. Store's `updateReframeStyle` resolver-clamps to ints — fine on a blurred bg.
4. **Named layout library**: store actions `saveReframeLayout(name)` (upsert by `project.reframe.layoutId`; writes layoutId back onto the project after first save — THE fix for silent duplicate entries; default claimed only when none valid exists) and `applyReframeLayout(entry)` (exact dims guard, commit-style identity re-check). Panel: "Save layout" → inline prefilled name row (Enter saves, Esc closes); `SavedLayoutsList` in both non-calibrating views (★ default toggle w/ stopPropagation, "In use" tag on the linked entry, mismatch rows dimmed + tooltip). SettingsView untouched — its list shows the names automatically.

## Round 3 (105b, after Fega's alpha.4 hands-on)
- **Apply = apply + save.** `commitReframeDraft(layoutName)` now upserts the library entry (by draft layoutId, else creates with the new id in the SAME project write), claims default only when none valid exists. `saveReframeLayout` DELETED. Panel: Name field (prefilled from linked entry, else "Layout N"; re-seeds until first keystroke — `nameTouchedRef`) above Apply; active view shows the layout's name; pencil-rename on `SavedLayoutsList` rows (blur is the single commit path; Esc cancels via ref flag).
- **Pan sliders**: Horizontal (bgPosX) + Vertical (bgPosY) EffectSliders between Zoom and Edge size; whole group moved to `labelWidth="w-16"` so "Horizontal" fits. Result-drag kept as an accelerator.

## Key Decisions (this session)
- **Default bg framing CHANGED deliberately**: 2× centered (the item-2 fix). Old projects/layouts inherit it via read-time resolve — Zoom 0 restores the exact old framing if ever wanted. Byte-parity with alpha.3 bg was explicitly NOT a goal (the old look was the complaint).
- **Position control**: round 2 shipped drag-the-Result only; Fega couldn't find/use it → round 3 added Horizontal/Vertical sliders as the primary path. Lesson recorded: explicit controls first, gestures as accelerators.
- **Every Apply updates the linked library entry** (rects+style+name) — the layout stays maintained, no duplicates; renaming the field renames the entry (no forking).
- First saved layout auto-becomes default; afterwards the ★ is the only thing that moves it (Apply never steals).
- **No more Sonnet implementation subagents** (Fega, explicit) — too slow for the value; Fable does the edits.
- Version: two alpha ticks (alpha.4 batch, alpha.5 UX corrections), per delegated sizing policy.

## Next Steps
1. Carried: first-recording auto-offer slice (approved, session 103), Projects-tab preview consistency for reframe projects (cosmetic), **Phase B** (MediaPipe box detection pre-filling calibration).
2. If Fega's tuned zoom/pos taste settles somewhere other than 2×-centered, update REFRAME_STYLE_DEFAULTS (one line in reframeStyle.js) so new users start there.
3. **0.2.0** when the Auto-Reframe epic completes and verifies on his real workflow.
4. Parked: #165 zoom tuning, #163 YouTube reconnect messaging, old non-v2 waveform cache cleanup, session-102 waveform regression check (Clip 1 of "2026-02-12 EO Day2 Pt1", burst under "MOVE,").

## Watch Out For
- **`commitReframeDraft(name)` writes the LIBRARY too now** — every Apply upserts `reframeLayouts` and may claim a first default. Any future programmatic caller must pass a sensible name (falls back to "Layout"). `saveReframeLayout` no longer exists.
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
