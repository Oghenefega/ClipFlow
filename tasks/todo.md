# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## Completed

- [x] Electron main process with IPC handlers, file watcher, OBS log parser
- [x] Preload bridge (`window.clipflow` API)
- [x] Sidebar navigation with 6 tabs
- [x] **RenameView** — file watcher, rename cards, history, manage tab
- [x] Fix file watcher — root-only watching, skip subfolders/renamed files
- [x] Add +Add Game button to Rename header
- [x] Wire up OBS log parser for game detection
- [x] **SettingsView** — game library CRUD, main game selector, watch folder, ignored processes, downloads
- [x] **QueueView** — schedule/tracker tabs, manual logging, publish now, weekly template editor
- [x] **ProjectsView** — Vizard project browser, clip review with approve/reject, inline title editing
- [x] **CaptionsView** — YouTube descriptions per game, platform caption templates
- [x] **UploadView** — file selection, R2 upload with progress
- [x] electron-store persistence for all settings/data
- [x] Vizard API integration — project import, clip mapping, deduplication
- [x] Source video filtering (duration-based heuristic)
- [x] Tracker source tagging (Vizard vs manual) with glow dots
- [x] Time picker redesign (hour + minute split dropdowns)
- [x] Scrollbar overflow fixes across all views
- [x] Clip download support with progress tracking
- [x] Fix AI hashtag generation — pass game hashtag explicitly to Anthropic prompt
- [x] Vizard title sync — smart merge with titleEdited flag + refresh button on ClipBrowser

## In Progress

- [ ] Phase out legacy clipping software — track Vizard vs manual usage in tracker

## Up Next

- [ ] Implement real platform API integrations:
  - [ ] YouTube Data API (Shorts upload)
  - [ ] TikTok API
  - [ ] Instagram Graph API (Reels)
  - [ ] Facebook Graph API (Reels)
- [ ] Publishing automation — 30-second stagger across 6 accounts
- [ ] Vizard publish integration (publish clips directly from Projects view)
- [ ] Auto-fill tracker when publishing via platform APIs
- [ ] Cloudflare R2 upload → Vizard project creation pipeline

## Known Issues

- None currently reported

---

## Review Notes

_Add post-implementation review notes here after each major feature._
