# External Docs Refresh Log

Append-only ledger of refreshes to ClipFlow documentation that lives **outside this repo**. The repo's CHANGELOG covers code changes; this file covers external doc changes (Obsidian vault, dashboards, etc.) so we always know when and where they were last updated.

Format: one entry per refresh, newest first. Each entry: date, file path, session, one-line summary of what changed.

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
