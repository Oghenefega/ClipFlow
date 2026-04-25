# ClipFlow — Commercial Desktop App for Gaming Content Creators

Electron + React desktop app for gaming/streaming content creators. Automates the full content pipeline: OBS recording → file rename → local clip generation (FFmpeg + Whisper) → editor (subtitles, captions, AI titles) → render → schedule & publish to multiple social platforms.

## Product Context

ClipFlow is a **commercial software product** being built for public release with a subscription/lifetime license model. Currently in personal testing phase (Fega is the sole tester), but all architecture decisions should be made with a multi-user, paid product in mind. This is not a personal tool — it is a business.

- Target market: gaming and streaming content creators
- Revenue model: subscription + optional lifetime upgrade
- Platform publishing: built for "publish on behalf of users" — each user connects their own social accounts via OAuth
- Platform scope: YouTube, TikTok, Instagram, Facebook, X (Twitter), Kick, and others added over time

## Technical Summary (External — Source of Truth)

The canonical technical summary lives at:
`C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md`

**When generating or updating the technical summary, always write to that path. Single file, no version number. Overwrite it — git tracks history. Do not create versioned copies (v2, v3, etc.) in the local reference/ folder.**

Read it when you need full product context: stack, architecture, feature status, known issues.

## Infrastructure Dashboard (External, Filtered)

An external infrastructure dashboard lives at `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md`. **Most sessions will never need to load it.**

**Consult it only when the session's work directly touches infrastructure** — defined narrowly as: Electron/Chromium/Node version changes, build tool (CRA/Vite) changes, dependency version bumps, module system (CJS/ESM) changes, security posture (CSP, `contextIsolation`, `sandbox`, preload scripts), code signing, auto-updater, installer config, or external infrastructure (Cloudflare, Supabase, Railway, LemonSqueezy, Sentry, PostHog).

**Do NOT consult it for:** product features, new tabs, UI redesigns, platform integrations, pipeline changes, bug fixes, AI prompt changes, editor behavior changes, or anything that belongs on GitHub as a feature/bug issue. That's the vast majority of sessions.

When the dashboard IS relevant: read Section 9 ("Current decisions in flight") before proposing anything. Decisions recorded there are committed — follow them, don't re-litigate. If the work you're about to do invalidates a recorded decision (e.g., you discover a prior decision's assumption was wrong, or the fix needs to diverge), flag it explicitly in chat so the dashboard can be updated. Do not silently deviate.

## Interaction Shortcuts

When the user responds with "yes", "do it", "go", "proceed", or similar single-word confirmations — execute the last proposed plan immediately. No restatement, no recap, no asking for clarification. They've already approved it.

## Git Workflow

Commit and push directly to master. No PRs, no feature branches.

## Changelog (Non-Negotiable)

Update `CHANGELOG.md` at the end of **every session** before the final commit. Categorize entries under the current date using Added/Changed/Fixed/Removed. Each entry should be descriptive enough that someone reading the changelog understands the change without digging into code — 1-2 sentences per item. Not too terse, not a journal.

## Tech Stack

See the technical summary for current stack, versions, and dependencies:
`C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md`

That file is the source of truth. Never hardcode versions here.

## Build & Run

Renderer is Vite (migrated from CRA). Commands:

```bash
npm install                  # Install deps
npm run build:renderer       # Build renderer → build/ (vite build)
npm start                    # Launch Electron (loads from build/)
npm run dev                  # Vite dev server + Electron with hot reload
```

`isDev` in `src/main/main.js` is `false` — Electron loads from `build/`. `npm run dev` starts Vite on http://localhost:3000 and flips the renderer to dev-server mode.

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

## Autonomous Issue Filing (Non-Negotiable)

Issues are filed and closed autonomously via `gh` — never ask permission, never output PowerShell for the user to run. Always include `--repo Oghenefega/ClipFlow`.

- **File** when something surfaces that's not fixable inline in ≤60 seconds — keep working on the current task and file in parallel.
- **Close** when the user confirms resolution ("that works", "fixed", "all good") and a filed issue clearly matches the work just completed.
- **"Start session" trigger:** when the user says "start session", "let's pick up", "resume", "begin" — run the full session-start ritual including `gh issue list --repo Oghenefega/ClipFlow --state open --limit 50` grouped by label.

**Full procedure** (when to file, body requirements, label list, close trigger details, command style): [`.claude/docs/issue-filing.md`](.claude/docs/issue-filing.md). Read it before filing, closing, or running the start-session issue list.
