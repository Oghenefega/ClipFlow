# ClipFlow — Session Handoff
_Last updated: 2026-06-08 — Session 70 — Built the #125 (i) info popover + Play-recording-in-editor (shipped & closed), fixed #126 Recordings sort order (shipped, proven at data layer), and refined the (i) glyph to a bare italic `i` (font-based; SVG redraw deferred to #127). Wrapped on request ("we're losing the plot" on icon micro-polish)._

---

## One-line TL;DR

Three things landed: (1) **#125 (i) info popover + Play-in-editor** — built, Fega confirmed working, **closed** (`1d33a9d`). (2) **#126 Recordings sort** — parts were ordered by rename-click time, not part number; now date→game→day#→part# via one shared comparator, **proven 0 violations against the live 114-row DB** (`f2240e2`). (3) **(i) glyph** — dropped the circle (it caused a sub-pixel lean) for a bare italic `i`; it's a system serif-font glyph and renders inconsistently across mockup/preview, so a **vector (SVG) redraw is deferred to #127**.

## Current State

Healthy on `0.1.6-alpha`, schema v4. App is currently **running from source** (`npm start`, background) with the latest build. Two commits pushed this session (`1d33a9d`, `f2240e2`); the **(i)-glyph refinement + this wrap are in the session-end commit**. Working tree also has the usual `data/clipflow.db` + `data/game_profiles.json` runtime churn — **DO NOT commit those**.

## What Was Just Built

1. **#125 — Recordings (i) info popover + Play-in-editor (CLOSED, `1d33a9d`).**
   - Hover-revealed `(i)` on each card (left of the green ✓) opens the "Spotlight" popover: filename, Duration+Size stats, **Play in editor**, **Open in Explorer**, clickable **TEST chip**. Closes on outside-click / Esc / scroll.
   - **Play = watch-only "source-preview" editor mode.** `useEditorStore.initFromContext` has an early branch for `editorContext.sourcePreviewPath` that synthesizes a `{ id:"__source_preview__", sourceFile, name, clips:[], transcription:null }` shell with `clip:null`. The video/timeline/waveform self-fill from `onLoadedMetadata`; Save/Render/Re-transcribe all no-op (guard on `!clip`) → zero disk-write risk. Back returns to Recordings.
   - TEST moved off the card into the popover chip; hover tooltip gained duration.
   - Files: `src/renderer/views/UploadView.js`, `src/renderer/App.js` (`handleOpenSourcePreview`, onBack routes source-preview → recordings), `src/renderer/editor/stores/useEditorStore.js`.
2. **#126 — Recordings sort fixed (shipped `f2240e2`).** All three list-load comparators sorted by `date` then **`renamed_at`** (the moment Rename was clicked) → parts scattered (AR Day19 showed Pt3,2,1,4). Now one shared `compareRecordings(a,b)` = **date → tag → day_number → part_number**, day/part compared **numerically** (Pt2<Pt10, Day4<Day33). Verified by replaying the exact comparator over the live DB (114 rows): **0 part-order violations**; a date holding two day_numbers (2026-01-30 EO Day1+Day4) sorts correctly. The same `renamed_at` tiebreaker still exists in `main.js` SQL `ORDER BY` (~1635) but the renderer re-sorts, so display is correct; left main.js alone (changing it risks other consumers).
3. **(i) glyph refinement (in this wrap's commit).** Circle dropped → bare italic `i` (no border). Hover brightens to accent. The circle was the only circled element in the row and its even-icon/odd-circle geometry caused a sub-pixel "lean" that shifted card-to-card. **Still a font glyph** (`Georgia, 'Times New Roman', serif` italic). Filed **#127** to redraw as SVG.

## Key Decisions

- **Source-preview never creates a project/clip** — it's a thin in-memory shell; the editor already tolerates `clip:null` everywhere, so it's safe by construction. Don't "fix" the no-op Save/Render by faking a clip (would risk disk writes).
- **Sort tiebreaker is tag-alphabetical for cross-game same-day** — there's no sub-day capture time stored (renamed files lost the OBS `HH-MM-SS`), so true cross-game chronological interleaving is impossible without an upstream change (persist capture time at rename). Each game's own parts are always in order, which was the actual complaint. Don't substitute `renamed_at` (reintroduces the bug) or `created_at` (bulk-import timestamps are near-identical → random).
- **`day_number` tier is load-bearing, not redundant** — verified a real case (2026-01-30 EO with both Day1 and Day4) where dropping it would mis-order. Keep numeric day + numeric part.
- **(i) glyph = bare italic `i`, no circle** (Fega's pick over circle/drawn/serif variants), font-based for now; SVG redraw deferred (#127). Decision driven by: the circle was the lean's root cause, and a bare letter matches the bare ✓.
- **Don't over-iterate micro-polish** — burned ~3 mockup rounds on the icon before Fega called it ("we're losing the plot"); lesson captured and distilled to clipflow-ui-debug.

## Next Steps (prioritized)

1. **#126 confirmed in-app & closed** — Fega was viewing the sorted Recordings list during the icon work (no sort complaints), and it's proven at the data layer; closed this session with `status: untested`. If he wants an explicit look: Recordings tab → any multi-part day reads Pt1→Pt2→Pt3→Pt4. Remove the untested label on his confirm.
2. **#127 (optional polish)** — redraw the `(i)` as SVG using a variant from `mockups/recordings-info-icon-svg.html` (E slab / F calligraphic / G dot+stem). Pick with Fega.
3. Backlog unchanged: subtitle word/text family (#95/#107/#87/#101/#89/#84), #112/#62 (EPIPE/silent audio), #57 (editor lag), #124 (waveform logs→app.log), #114/#108/#40, commercial-launch (#20–#23, #50–#56, #73/#74, #85). #64 (waveform) is fixed & can now be re-confirmed via the new Play-in-editor on a ~30-min recording.

## Watch Out For

- **#126 fix lives only in the renderer comparators.** If a NEW Recordings list-load path is added, use `compareRecordings` — don't re-inline a `date`/`renamed_at` sort (that's the bug). `main.js` ORDER BY still uses `renamed_at` but is overridden by the renderer.
- **(i) glyph is font-dependent.** It renders as serif-italic only where a serif font resolves. In the packaged Electron app (Windows) Georgia resolves; in arbitrary browsers/previews it may fall back to sans. #127 is the durable fix.
- **Source-preview waveform cache keys on `project.id`** → with id `"__source_preview__"` all source previews share one cache folder under projectsRoot. Harmless; optionally key per-file later.
- **No single-instance lock in `main.js`** — kill any open ClipFlow Electron before `npm run build`/relaunch: `powershell.exe -NoProfile -Command "Get-Process electron | Where-Object Path -Like '*Desktop\ClipFlow*' | Stop-Process -Force"`. (The `$_`-style filter gets mangled by the Bash tool; use the `Where-Object Path -Like` form.)
- **`data/clipflow.db` / `data/game_profiles.json`** = runtime churn, never commit. Stage source/docs/mockups explicitly.
- **Scratch mockups** `recordings-info-icon{,-final,-svg}.html` are this session's icon exploration — keep `-svg.html` (referenced by #127); the others are safe to delete.

## Logs / Debugging

- **Build/run this session:** `npm run build:renderer` (Vite, ~10s, clean — the >500kB chunk warning is pre-existing/expected for this desktop app, ignore). App launched via `npm start` (loads `build/`); restarted after each renderer rebuild (no HMR in `npm start` mode). All boots clean: `App started … electron 40.9.1`, `Database initialized … (schema v4)`, `File migration already complete`.
- **DB inspection:** the driver is **`sql.js`** (WASM), not better-sqlite3. To query `data/clipflow.db` from Node, write the script INSIDE the repo (so `require('sql.js')` resolves) — a script in `%TEMP%` fails with MODULE_NOT_FOUND. Pattern: `const SQL = await require('sql.js')(); const db = new SQL.Database(fs.readFileSync('data/clipflow.db'));` then `db.exec("SELECT …")`. (Used to prove the #126 sort; temp scripts deleted.)
- **#126 proof:** replayed `compareRecordings` over all 114 rows → 0 within-(date,tag,day) part-order violations; AR Day19 → Pt1,2,3,4; EO 2026-01-30 → Day1 Pt1, Day1 Pt2, Day4 Pt1.
- **Prod log:** `%APPDATA%\clipflow\logs\app.log` (electron-log; `[ts] [level] (scope) msg`). Raw `console.log` only reaches a terminal (not app.log) — that's #124.
- **Key files:** Recordings = `src/renderer/views/UploadView.js` (`compareRecordings` ~:44, three `rows.sort(compareRecordings)` at ~:237/:278/:790, the `(i)` button + popover render, `<style>` block with `.cf-info-btn`/`.cf-spot-action`). Source-preview = `useEditorStore.js` `initFromContext` early branch; `App.js` `handleOpenSourcePreview` + editor onBack; `PreviewPanelNew.js` `videoSrc`/`onLoadedMetadata` (drives waveform).
