# ClipFlow — Session Handoff
_Last updated: 2026-03-23_

## Current State
App builds and runs. Unified logging system and bug report UI are live. Version tracking set to `0.1.0-alpha`.

## What Was Just Built
- **Unified Logger (`src/main/logger.js`)** — Structured JSON logging to `%APPDATA%/ClipFlow/logs/clipflow-YYYY-MM-DD.log`. Every entry has timestamp, level, module, sessionId, message, context. 8 module taxonomy: system, subtitles, publishing, title-generation, auth, video-processing, editor, pipeline. Auto-strips sensitive fields. 7-day log rotation on startup.
- **Report an Issue UI (SettingsView)** — Description textarea, module multi-select chips, severity radio (crash/bug/visual), include-logs checkbox. "Export Report" button saves a bundled `.json` file with session logs grouped by module.
- **Version Tracking** — `package.json` → `0.1.0-alpha`, exposed via `app:getVersion` IPC, displayed in Settings footer.
- **Pipeline Logs overflow fix** — Collapsed nested wrapper div into single flex-child scroll container. Groups collapsed by default on launch.

## Key Decisions
- **Option B (database) for future reports** — Decided to store reports in Postgres (Railway) instead of email. For now, local export; endpoint comes in a future session.
- **No external logging library** — `fs.appendFileSync` is sufficient for a desktop app. No winston/pino dependency needed.
- **Gradual console.log migration** — Only startup + migration logs use the new logger now. Existing 41 console.logs migrate per-feature as we touch each area.
- **Log files at known path for Claude Code** — Logs at `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\logs\` are directly readable during dev sessions.

## Next Steps
1. **Report submission endpoint** — Build `/api/reports` on Railway backend to receive reports (Option B: Postgres storage)
2. **Migrate existing console.logs** — As each feature is worked on, swap `console.log("[Tag]", ...)` to `logger.info(MODULES.x, ...)`
3. **Wire logger into TikTok publishing** — `tiktok.js` and `tiktok-publish.js` have 20 console.log calls ready to migrate
4. **Wire logger into FFmpeg/Whisper operations** — Capture video processing and transcription events

## Watch Out For
- **Uncommitted files from prior sessions** — `CLAUDE.md`, `App.js`, `EditorView.js`, `EditorLayout.js`, `ProjectsView.js`, `QueueView.js`, `tiktok.js`, `lessons.md`, `tiktok-publish.js`, `publish-log.js` all have unstaged changes from previous work. Don't accidentally include them in logging-related commits.
- **Pipeline Logs scroll** — Fixed the overflow glitch by collapsing to a single div, but if new UI is added inside that container, ensure `maxHeight: 500` + `overflowY: auto` stays on the direct flex child.

## Logs/Debugging
- Log files write to: `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\logs\`
- One file per day: `clipflow-YYYY-MM-DD.log`, each line is a JSON object
- Session ID format: `sess_<12 hex chars>` — filter by this to isolate one app run
- To read logs during dev: `Read` the log file directly, or `cat %APPDATA%/ClipFlow/logs/clipflow-<date>.log`
