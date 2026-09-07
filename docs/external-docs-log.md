# External Docs Refresh Log

Append-only ledger of refreshes to ClipFlow documentation that lives **outside this repo**. The repo's CHANGELOG covers code changes; this file covers external doc changes (Obsidian vault, dashboards, etc.) so we always know when and where they were last updated.

Format: one entry per refresh, newest first. Each entry: date, file path, session, one-line summary of what changed.

---

## 2026-09-07 (Session 244)

**File:** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md`

End-to-end rebuild — previous version was dated 2026-08-23 (v0.4.0-alpha.4) and missed 210 commits / 217 files /
+30,900 −6,917 lines. Six agents each read one subsystem against the current tree at v0.4.0-alpha.28. New version
reflects:
- **Defects the old doc listed that are now FIXED**, marked `[fixed]` so a reader carrying the old version is corrected:
  unguarded `whenReady` bootstrap (#298), non-atomic `database.save()` (new `atomic-write.js` + `.bak` + recovery),
  silent autosave failure (#297), the render ignoring audio-track calibration (#272), MKV bytes under an `.mp4` name,
  `log` undefined in `project:delete`, the un-rotatable gateway token (#301), `"Fega"` in the Whisper decoder prompt,
  `#fega #fegagaming` in the caption seed, "Fega Default" preset name, Fega's 48-post schedule as everyone's default,
  and "no test runner exists"
- **One architectural claim INVERTED**: the publish scheduler moved from the renderer into the main process
  (`src/main/publish.js`, formerly 47 lines of dead stubs, now the 364-line scheduler), with streaming mode (#329)
- Two entirely new subsystems: media overlays + per-clip/per-section layouts (#308–#314, #348, #349), and word timing
  (4-voter median, 78.4% → 86.1%, engine runtime 1.1.0 with three voter models)
- Theme system rewritten as one CSS-variable palette file with EIGHT themes and no `.dark` class (#328), plus the three
  surfaces `var()` cannot reach and how each gets colour
- Repeated footage (#351/#352) and the #353 projection gap; recording levels (#272); per-caption-line styling (#366)
- Settings nine-section rail (#331), What's New / release history (#330), Queue redesign (#354), Tracker day toggles (#161)
- New Part 3 hazard: `npm start` on the prod profile is now a live publisher (sessions 214/218), with the open
  `!app.isPackaged` question flagged as Fega's call
- Refreshed scale figures: 78,262 LOC under `src/`, 137 open issues, feedback table 644 rows, schema still v9

Length: ~600 lines. New sections §2.4 (word timing) and §2.7 (media overlays and layouts). Companion
`tasks/specs/backlog-truth-audit-2026-08-23.md` explicitly marked stale (110 issues audited then, 137 open now).

---

## 2026-08-23 (Session 186) — logged retroactively

**File:** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md`

Full rebuild by eight agents (one per subsystem) plus a ninth folding the reports together; introduced the three-part
structure (narrative / subsystem reference / engineering assessment) the file still uses, and the companion backlog
truth audit. **This refresh was never logged here at the time** — recorded now from the file's own header and git
history so the ledger isn't missing a rewrite.

---

## 2026-04-28 (Session 33)

**File:** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md`

End-to-end rewrite — previous version was dated 2026-04-18 and missed 10 days of major work. New version reflects:
- Lazy-cut pipeline architecture (clips are source-references, not materialized MP4s)
- NVENC encoding + batched single-process clip retranscription
- YAMNet audio-event signal added; `scene_change` deliberately dropped
- "Clip N" titles + game-tag badge replaced AI-narrated titles
- Subtitle timing rebuild: 4-pass `cleanWordTimestamps`, unified `findActiveWord`, progressive karaoke
- Editor autosave (debounced 800ms + blur/unmount flushes)
- Test-mode-per-clip workflow
- Security hardening: CSP, sandbox on all BrowserWindows, hardened offscreen subtitle window
- Toolchain modernization: CRA → Vite 6.4.2, electron-store v8 → v11, chokidar v3 → v4, Electron upgrade
- Sentry crash reporting + PostHog analytics
- Pipeline performance arc: 810s → 397s on 30-min reference recording
- Updated IPC bridge surface (~118 APIs / 93 handlers), schema v4, current open-issue list

Length: ~360 lines. Added new sections §3.10 (test-mode) and §8 (Recent Major Changes — April 2026 timeline).

---
