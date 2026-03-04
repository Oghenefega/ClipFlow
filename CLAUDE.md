# ClipFlow — Desktop App for Gaming Content Pipeline

## Git Workflow
Always commit and push directly to main. Do not create pull requests or feature branches.

## What This Project Is

ClipFlow is an **Electron + React** desktop app for a gaming content creator named **Fega**. It automates the full pipeline from OBS recording to published short-form clips across YouTube Shorts, TikTok, Instagram Reels, and Facebook Reels.

**The pipeline:** Record gameplay (OBS) → Detect & rename files → Upload to Cloudflare R2 → Send to Vizard AI for clipping → Review/approve clips → Schedule & publish to 6 platform accounts.

## Owner / User

- **Creator:** Fega (YouTube: @Fega, TikTok: @fega, Instagram: @fegagaming)
- **Content:** Vertical gaming clips (9:16) from OBS Studio with Vertical Canvas plugin
- **Games:** Arc Raiders (main), Rocket League, Valorant, Egging On, Deadline Delivery, Bionic Bay, Prince of Persia
- **Publishing:** 8 clips/day across 6 days (Mon–Sat), 48 clips/week total
- **Platform accounts:** YT-Fega, IG-fegagaming, FB-Fega Gaming, TT-fega, YT-ThatGuy, TT-thatguyfega

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop shell | Electron 28 |
| UI | React 18 (CRA build) |
| File watching | chokidar |
| Persistence | electron-store (planned) |
| File operations | Node.js fs via IPC |
| OBS log parsing | Custom parser in main process |
| Fonts | DM Sans (UI) + JetBrains Mono (code/filenames) via Google Fonts CDN |

## Project Structure

```
ClipFlow/
├── public/
│   └── index.html
├── src/
│   ├── main/
│   │   ├── main.js          ← Electron main process, IPC handlers, file watcher
│   │   └── preload.js        ← Context bridge (window.clipflow API)
│   ├── renderer/
│   │   ├── App.js             ← Shell with sidebar nav, view routing, global state
│   │   ├── components/
│   │   │   └── Sidebar.js     ← Navigation component
│   │   ├── views/
│   │   │   ├── RenameView.js  ← FULLY FUNCTIONAL — file watcher, rename cards, history
│   │   │   └── PlaceholderView.js ← Stub for remaining 5 tabs
│   │   └── styles/
│   │       └── theme.js       ← Design tokens
│   └── index.js
├── package.json
├── .gitignore
└── CLAUDE.md                  ← THIS FILE
```

## How to Build & Run

```bash
# Install dependencies
npm install

# Build React frontend
npx react-scripts build

# Run Electron
npm start
```

**Important:** In `src/main/main.js`, `isDev` is set to `false` so Electron loads from the `build/` folder. If you want hot reload, set `isDev = true` and run a React dev server on port 3000 first.

## Design System

The app uses a dark theme. Key tokens (from the v6.2 prototype and current theme.js):

- **Background:** `#0a0b10` (app bg), `#111218` (surface/cards)
- **Accent:** `#8b5cf6` (purple), `#a78bfa` (light purple)
- **Status:** Green `#34d399`, Yellow `#fbbf24`, Red `#f87171`, Cyan `#22d3ee`
- **Text:** `#edeef2` (primary), `rgba(255,255,255,0.55)` (secondary), `rgba(255,255,255,0.32)` (tertiary)
- **Border radius:** sm=6px, md=10px, lg=14px, xl=20px
- **Fonts:** `'DM Sans', sans-serif` for UI, `'JetBrains Mono', monospace` for filenames/code

## Current State (What's Built)

### ✅ Fully Working
- **Electron main process** with 12 IPC handlers (file ops, dialogs, watcher, OBS log parser, shell)
- **Preload bridge** exposing `window.clipflow` API to renderer
- **Sidebar navigation** with 6 tabs and active state indicators
- **RenameView** — watches OBS folder, shows pending files, rename cards with game/day/part controls, history with undo

### ⚠️ Known Bugs to Fix
1. **File watcher picks up files from subfolders** (2025-12, 2026-01, 2026-02, 2026-03). It should ONLY watch the ROOT of the watch folder, not recurse into monthly subfolders. Only raw unrenamed files like `2026-03-02 18-23-40.mp4` should appear as pending. Already-renamed files like `2026-02-06 AR Day25 Pt18.mp4` should be skipped.
2. **No +Add Game button** next to the Refresh button in the Rename header
3. **Game detection defaults everything to Arc Raiders** — needs OBS log parser integration for real detection
4. **TOTAL and DAY stat cards show dashes** instead of real values

### 🔴 Not Built Yet (Placeholder Views)
- **Upload** — Select renamed files → upload to Cloudflare R2 → trigger Vizard AI clipping
- **Projects** — Browse Vizard projects, review clips (approve/reject), edit titles, view transcripts
- **Queue** — Schedule approved clips, publish to platforms, weekly tracker grid
- **Captions** — YouTube descriptions per game, TikTok/IG/FB caption templates
- **Settings** — Game library CRUD, main game selector, platform connections, watch folder config, ignored processes

## The 6 Views (Full Spec from v6.2 Prototype)

### 1. Rename View
- **Watch status bar:** Green dot + "WATCHING" + folder path. Cyan dot + "OBS LOG" on right.
- **Stats cards:** Total (all renamed files ever), Today (pending count), Games (game count), Day (current main game day count)
- **Sub-tabs:** Pending | History | Manage
- **Pending tab:** File cards showing original OBS filename, proposed new name in yellow (`→ 2026-03-03 AR Day25 Pt1.mp4`), game dropdown, Day/Part spinboxes with hold-to-increment, RENAME and HIDE buttons. "Rename All" button at bottom.
- **History tab:** Shows old→new name pairs with UNDO/REDO. Undo moves file BACK to pending queue.
- **Manage tab:** Browse renamed files by monthly subfolder. Select multiple → batch change part/day/tag.
- **Header buttons:** 🔄 Refresh (re-scan folder) + ✨ Add Game (opens AddGame modal)
- **Auto-correction:** Files sorted by timestamp, grouped by tag+day, sequential parts assigned silently within conflict batches.

### 2. Upload View
- List renamed files ready for upload
- Checkbox selection with Select All
- Upload progress bars per file
- Upload to Cloudflare R2, then trigger Vizard AI project creation
- Status: selected → uploading (progress %) → done ✅

### 3. Projects View
- List Vizard projects with status badges (Processing %, Review, Done)
- Click project → ClipBrowser showing all clips
- Each clip: title (editable inline), viral score bar, duration, transcript button
- Approve (👍) / Reject (👎) buttons always visible, both shown even when dimmed
- Rejected clips shown at 35% opacity
- Clips without hashtags hidden with warning banner

### 4. Queue View
- **Schedule sub-tab:** List approved clips. Click clip → "⚡ Publish Now" or "📅 Schedule" (pick date up to 2 weeks + time in 5min increments). No auto-slotting.
- **Tracker sub-tab:** Weekly grid (Mon–Sat × 8 time slots). Cells show M (main game) or O (other game). Filled cells = published. Template is editable in Settings.
- Stats: total published/48, main game count, other count
- Publishing order: YT-Fega → IG → FB → TT-fega → YT-ThatGuy → TT-thatguyfega (30s stagger)

### 5. Captions View
- **YouTube tab:** Per-game description templates (Fega has full descriptions with affiliate links, social links, etc.)
- **Other Platforms tab:** Template strings for TikTok, Instagram, Facebook. Uses `{title}` and `#{gametitle}` placeholders.

### 6. Settings View
- **Watch Folder:** Editable path (default: `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards`)
- **Main Game:** Horizontal pill selector from game library. Each pill has ✕ delete button.
- **Game Library:** Horizontal pills showing tag, name, hashtag, edit icon. Click → GameEditModal (edit tag, hashtag, color with color picker)
- **Connected Platforms:** Toggle pills with green/red pulse dots
- **Ignored Processes:** List of exe names to skip during OBS log detection
- **Downloads:** Section for downloading Vizard clips locally
- **+Add Game modal:** Game name, tag (max 4 chars), hashtag, color picker with 10 presets + hue slider + hex input. Preview shows `2026-03-03 {TAG} Day1 Pt1.mp4`. Confirm → generating animation → success screen.

## Game Data Model

```javascript
{
  name: "Arc Raiders",       // Display name
  tag: "AR",                 // 1-4 char code used in filenames
  exe: ["ArcRaiders.exe"],   // OBS-detected process names
  color: "#ff6b35",          // Brand color for pills/badges
  dayCount: 24,              // How many unique days recorded
  hashtag: "arcraiders"      // Used in clip titles and captions
}
```

**Default games:** Arc Raiders (#ff6b35), Rocket League (#00b4d8), Valorant (#ff4655), Egging On (#ffd23f), Deadline Delivery (#fca311), Bionic Bay (#06d6a0), Prince of Persia (#9b5de5)

## File Naming Convention

OBS outputs: `2026-03-03 18-23-40.mp4` (timestamp format, may also have `_` instead of space, may end with `-vertical.mp4`)

ClipFlow renames to: `2026-03-03 AR Day25 Pt1.mp4`
- Date from original filename
- Tag from detected/selected game
- Day = unique calendar day count for this game
- Pt = sequential part within same day's session (OBS splits at ~30 min)

Files are organized into monthly subfolders: `2026-03/`, `2026-02/`, etc.

## OBS Log Parsing

OBS logs are at: `C:\Users\IAmAbsolute\AppData\Roaming\obs-studio\logs\`

The parser reads the most recent log to find which game exe was hooked by OBS's game capture source. Key behaviors:
- Vertical Canvas plugin logs look different from standard OBS
- When a game exe re-hooks, it moves to END of detection list (most recent = active game)
- Known system processes (explorer.exe, steamwebhelper.exe, dwm.exe, etc.) are ignored
- Unknown exe triggers AddGame modal for user to configure

## IPC API (window.clipflow)

The preload bridge exposes these methods to React:

```javascript
window.clipflow.pickFolder()           // Native folder picker dialog
window.clipflow.readDir(dirPath)       // Read directory contents
window.clipflow.renameFile(oldPath, newPath)  // Rename/move file
window.clipflow.exists(filePath)       // Check if file exists
window.clipflow.readFile(filePath)     // Read text file
window.clipflow.writeFile(filePath, content)  // Write text file
window.clipflow.startWatcher(folderPath)      // Start chokidar watcher
window.clipflow.stopWatcher()          // Stop watcher
window.clipflow.onFileAdded(callback)  // File watcher event
window.clipflow.onFileRemoved(callback) // File watcher event
window.clipflow.parseOBSLog(logPath)   // Parse OBS log for game detection
window.clipflow.openFolder(folderPath) // Open in Windows Explorer
window.clipflow.saveFileDialog(options) // Save file dialog
window.clipflow.openFileDialog(options) // Open file dialog
window.clipflow.platform               // 'win32' | 'darwin' | 'linux'
```

## Weekly Publishing Template

8 slots per day (Mon–Sat), each slot is "main" or "other":

| Time | Mon | Tue | Wed | Thu | Fri | Sat |
|------|-----|-----|-----|-----|-----|-----|
| 12:30 PM | M | M | M | M | M | M |
| 1:30 PM | M | O | O | O | O | O |
| 2:30 PM | M | M | O | O | O | M |
| 3:30 PM | M | O | M | M | M | O |
| 4:30 PM | M | M | O | O | O | M |
| 7:30 PM | M | O | O | O | O | O |
| 8:30 PM | M | M | O | M | O | M |
| 9:30 PM | M | M | M | M | M | M |

M = main game clip, O = other game clip. Template is editable in Settings.

## Platform Accounts & Publish Order

1. YouTube — Fega (main)
2. Instagram — fegagaming
3. Facebook — Fega Gaming
4. TikTok — fega
5. YouTube — ThatGuy (second channel)
6. TikTok — thatguyfega (second account)

Published with 30-second stagger between platforms.

## YouTube Description Template (Arc Raiders example)

Each game has its own YouTube Shorts description. Fega's descriptions include:
- Live streaming schedule
- Subscribe/member links
- Multi-streaming links (Twitch, Kick, TikTok)
- Best videos playlist
- Social media links
- Stream setup with affiliate links (camera, lens, mic, etc.)
- Content/editing essentials with affiliate links

## Key Design Decisions

1. **Files are NEVER auto-renamed.** User must review game/day/part and click Rename.
2. **Close = quit.** No minimize-to-tray. Closing the window exits the app.
3. **Windows-only.** Built for Windows (NTFS paths, Windows file behavior).
4. **Electron + React chosen over Python/CustomTkinter** because the 407-line React prototype already has complete UX. Python handles system-level operations only if needed.
5. **Checkbox component is purely visual** — parent element handles all click events. This prevents double-toggle bugs.
6. **Rejected clips stay visible at 35% opacity** with both 👍/👎 buttons visible. No separate Undo button.
7. **Queue scheduling is manual** — user picks clip → Publish Now or Schedule (date + time). No auto-slotting into template.

## What Needs to Be Built Next (Priority Order)

1. **Fix file watcher** — only watch root folder, skip subfolders and already-renamed files
2. **Add +Add Game button** to Rename view header (next to Refresh)
3. **Wire up OBS log parser** for automatic game detection on pending files
4. **Build Upload view** — file selection, R2 upload with progress, Vizard API trigger
5. **Build Projects view** — Vizard project browser, clip review with approve/reject
6. **Build Queue view** — scheduling UI, publish now, weekly tracker grid
7. **Build Captions view** — YouTube descriptions per game, platform caption templates
8. **Build Settings view** — game library CRUD, main game, platforms, watch folder, ignored processes
9. **Add electron-store** for persistent settings/game library/tracker data
10. **Implement real API integrations** — Vizard API, YouTube Data API, TikTok API, Instagram Graph API, Facebook Graph API

## Coding Conventions

- React functional components with hooks
- Inline styles matching the design token system (T object)
- No CSS files — all styling via JavaScript objects
- IPC communication through `window.clipflow` bridge
- File paths use Windows backslashes internally
- Component names: PascalCase. Functions: camelCase.
- State management: React useState/useEffect at App level, passed as props

## Reference Prototypes

The `ClipFlow-v3.jsx` and `ClipFlow-v4.jsx` files in the project root are the **complete React prototypes** (each ~1100 lines) that show exactly how every view should look and behave. These are the UI spec — use them as reference when building real views. v4 is the latest.

## GitHub

- Repo: https://github.com/Oghenefega/ClipFlow.git
- Branch: main
- Private repository
