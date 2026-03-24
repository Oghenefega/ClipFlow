# ClipFlow — Commercial Desktop App for Gaming Content Creators

Electron + React desktop app for gaming/streaming content creators. Automates the full content pipeline: OBS recording → file rename → local clip generation (FFmpeg + Whisper) → editor (subtitles, captions, AI titles) → render → schedule & publish to multiple social platforms.

## Product Context

ClipFlow is a **commercial software product** being built for public release with a subscription/lifetime license model. Currently in personal testing phase (Fega is the sole tester), but all architecture decisions should be made with a multi-user, paid product in mind. This is not a personal tool — it is a business.

- Target market: gaming and streaming content creators
- Revenue model: subscription + optional lifetime upgrade
- Platform publishing: built for "publish on behalf of users" — each user connects their own social accounts via OAuth
- Platform scope: YouTube, TikTok, Instagram, Facebook, X (Twitter), Kick, and others added over time

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
- Token: `C:\Users\IAmAbsolute\.claude\github_token.txt` — read this file to authenticate GitHub API calls
- To fetch issues: `GET https://api.github.com/repos/Oghenefega/ClipFlow/issues?state=all&per_page=50` with `Authorization: Bearer <token>` header via WebFetch

## GitHub Issues Workflow

When the user describes a bug or feature, generate a ready-to-run PowerShell `gh issue create` command. Rules:

- Always single line — no backslash continuations, no heredocs
- Always include `--repo Oghenefega/ClipFlow`
- Use `` `n `` for newlines inside the `--body` string
- Labels: one `type:` + one `area:` from the label system
- Body structure: `## Description`, `## Steps to Reproduce` (bugs), `## Expected`, optionally `## Notes`
- Title: short, specific, lowercase after first word
- Output the command in a PowerShell code block so it's easy to copy
