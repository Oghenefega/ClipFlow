# HANDOFF — Session 247 (2026-09-09 → 2026-09-10)

## Current State

**alpha.32 is cut, published to the R2 feed, and waiting on Fega's relaunch.** Two installers went
out this session: alpha.31 (`4c9e537`: Sunset theme, clustered bottom tabs, editable tag box) and
alpha.32 (`836c180`: Audio panel defaults, #383 hashtag freeze + per-clip Social tags line). Master
clean, renderer builds clean, every change verified on the dev profile (screen control for the
first half, CDP on port 9222 after a PowerToys helper window blocked input).

The session was evening-UX driven: Fega asked for a "Sunset" theme, then kept naming the frictions
he hits daily (tab bar spread edge to edge, tags only deletable, Audio panel opening on Music/All,
game-level hashtag edits rewriting scheduled clips). All shipped. Wick's **interfaces** plugin
(11 UI skills, installed 2026-09-07) was mapped to Corva — see memory `reference_interfaces_plugin`.

Fega has NOT yet confirmed any of this on the installed build. #383 carries `status: untested`.

## Key Decisions

- **Sunset is a dim LIGHT theme (dark ink on an L74 sand page), not a lifted dark one.** The first
  mock offered three light-on-dark readings; Fega rejected all as "bright dark themes". The axis
  was ink polarity, not canvas brightness. Umber (L58) is the floor for readable status colours.
  Mock with all four steps: `tasks/mocks/sunset-theme.html`.
- **Hashtags freeze by copying inputs, not by snapshotting resolved text.** Scheduling writes
  `youtubeTags` + new `captionTags` onto the clip (only if it had none). No resolver gating on
  `scheduledAt`, so the scheduler's claim clearing it (projects.js:388) is irrelevant and
  post-schedule per-clip edits still flow. Descriptions/templates still resolve live — Fega scoped
  it to hashtags. If that ever needs freezing, the snapshot design is in #383's opening comment.
- **`clip.captionTags` (string, even "") beats `game.captionTags`** in `socialTagsFor()` — the
  youtubeTags precedence, mirrored. A saved line identical to the game's clears the override.
- **Audio panel lane preference = majority of the last 50 placements**, tie keeps Music; Recent is
  the default view, falling back to All only when Recent is empty. Placements count, tab clicks
  don't. A tab/view the user clicks is never overridden by the stored preference arriving late.
- **Tag-box undo is session-scoped** (unmounts on save/cancel). Fega didn't ask for undo after
  save; "Reset to game tags" covers it.

## Next Steps

1. **Contrast audit across the nine themes** — the thing deferred to keep this session coherent.
   Paste-ready prompt for Fega:
   > Start session. Run a measured contrast audit across all nine themes in
   > `src/renderer/styles/themes.css` using the `better-colors` / `better-accessibility` skills:
   > every text tier (text, textSecondary, textTertiary, textMuted, labelStrong) and every status
   > colour (green, yellow, red, orange, cyan, accent, accentLight) against bg AND surface, plus
   > the shadcn muted-foreground against background/card. Report a table of ratios, flag anything
   > under 4.5:1 for body text or 3:1 for 10–11px labels and pills, and propose lightness-only
   > fixes per theme (never hue). Mock the proposed values in `tasks/mocks/` before touching
   > themes.css. Sunset (dim light) and Umber-style floors are the ones most likely to fail.
2. Fega's hands-on checks on alpha.32: Escape in the tag box (untestable via automation —
   Escape never arrives through computer-use), #383 on a real schedule (schedule two 100T clips,
   change the game line, confirm they don't move), Audio panel opening on Sound effect after a few
   SFX placements. Close #383 and drop `status: untested` on confirmation.
3. "My brain stopped working mid hype" (scheduled 2026-09-10 12:25) was scheduled before the fix
   and still follows the game line (NRG). Fega types its players line into the new Social tags box.
4. From the interfaces audit, highest-value follow-ups after contrast: focus ring missing on the
   custom Select (`shared.js:319`) and ~13 other `outline:"none"` sites; Queue row actions are
   hover-reveal only (no keyboard path, `QueueView.js:44-58`); icon-only buttons lack `aria-label`.
   The typography floor (12–13px) collides with Fega's compact density — judgment calls, not fails.
5. Optional: undo-after-save for the tag box; a one-key way to open Sunset's mock picker as
   `/variant` next time a palette decision comes up (replaces hand-built mocks).

## Watch Out For

- **Dev profile `projectsRoot` is the REAL projects folder.** Any card/Queue save from `npm run dev`
  or `CLIPFLOW_PROFILE=dev npx electron .` writes Fega's project JSON. Repoint at a scratch fixture
  first (recipe: memory `project_cdp_verification_gotchas` #20–23). Restored at session end;
  dev tokens back to `{"accounts":{}}`; dev `audioUseLog` left seeded (harmless).
- **Computer-use can die mid-session** when a PowerToys helper takes the foreground (snap-layout
  flyout on hovering the maximize button). Fega denied PowerToys access. Pivot to CDP:
  `scripts/dev/cdp.js`, `cdp-shot.js`, plus a `cdpclick.js` (trusted press/release at coords)
  in this session's scratchpad — worth copying into `scripts/dev/` next time it's needed.
- **`--lift` polarity on Sunset is near-black** (dark ink); anything hardcoding a white tint will
  read wrong there, same as the other light themes. THEME_CHROME in main.js is the hand-maintained
  duplicate of `--bg`; Sunset's entry is `#d3bea6` / `#241610`.
- **TagInput is now 239 lines with in-place edit, undo/redo and duplicate flash.** The pill input
  and the main input share the box's mousedown guard; a focused input that unmounts never fires
  blur, so `startEdit`/`remove` commit an open edit explicitly before switching.
- **Scheduled clips from before alpha.32 have no `captionTags`** and still follow the game line
  until edited or rescheduled. Only the one clip above matters today.

## Logs / Debugging

- Publish errors live in `%APPDATA%\Corva\clipflow-publish-log.json` (rows: clipId, clipTitle,
  clipCaption, platform, status, timestamp); app log at `%APPDATA%\Corva\logs\app.log`. Dev
  profile equivalents under `%APPDATA%\clipflow-dev\`.
- CDP: launch `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`; kill with
  `taskkill //F //IM electron.exe` (never Corva.exe — that is the daily driver).
- Bottom-nav tab coordinates changed this session (tabs are now a centred 80px cluster): at
  1280×860, Editor ≈ (640,832), Queue ≈ (724,832). Probe `getBoundingClientRect()` rather than
  trusting old memory coordinates.
- Real scheduled clips on disk: `W:\...\.clipflow\projects\proj_1788551120819_9oyrwh` and
  `proj_1788551574464_d61ite` (four 100T clips for 2026-09-10). Read-only unless the app is closed.
