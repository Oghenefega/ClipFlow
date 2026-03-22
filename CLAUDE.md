# ClipFlow — Desktop App for Gaming Content Pipeline

Electron + React desktop app for gaming content creator Fega. Automates the pipeline from OBS recording → file rename → local clip generation (FFmpeg + Whisper) → editor (subtitles, captions, AI titles) → render → schedule & publish to 6 platform accounts.

## Git Workflow

Commit and push directly to master. No PRs, no feature branches.

## Tech Stack

Electron 28, React 18 (CRA), Tailwind CSS 3 + shadcn/ui, Zustand 5 (editor state), electron-store 8, chokidar 3, FFmpeg (local), whisper.cpp (local), Anthropic API (Claude Sonnet 4 / Opus 4), lucide-react, DM Sans + JetBrains Mono fonts.

## Build & Run

```bash
npm install                  # Install deps
npx react-scripts build      # Build React → build/
npm start                    # Launch Electron (loads from build/)
npm run dev                  # Dev mode with hot reload
```

`isDev` in `src/main/main.js` is `false` — Electron loads from `build/`. Set `true` + run React dev server on port 3000 for hot reload.

**After ANY code change:** build + `npm start` to visually verify. Non-negotiable.

## Coding Conventions

- React functional components with hooks
- **Existing views:** Inline styles via `T` (theme) object from `src/renderer/styles/theme.js`
- **Editor UI:** shadcn/ui + Tailwind CSS utility classes
- IPC through `window.clipflow` bridge (see `src/main/preload.js` for full API)
- File paths use Windows backslashes internally
- PascalCase components, camelCase functions
- App state: useState/useEffect in App.js, passed as props
- Editor state: Zustand stores with selector subscriptions (never `getState()` in render paths)

## Key Design Decisions

1. Files are NEVER auto-renamed — user must review and click Rename
2. Close = quit — no minimize-to-tray
3. Windows-only (NTFS paths, Windows file behavior)
4. Fully local pipeline — no cloud deps except Anthropic API for AI generation
5. Checkbox component is purely visual — parent handles clicks (prevents double-toggle)
6. Queue scheduling is manual — no auto-slotting into template
7. Editor state isolated in 6 Zustand stores with selector subscriptions

## GitHub

- Repo: https://github.com/Oghenefega/ClipFlow.git
- Branch: master (private)
