# ClipFlow

Desktop content pipeline for gaming creators — rename, upload, clip, schedule, publish.

## Setup

```bash
npm install
npm start
```

## Development

```bash
npm run dev
```

This runs the React dev server and Electron concurrently with hot reload.

## Build

```bash
npm run build
```

Creates a distributable Windows installer in the `dist/` folder.

## Architecture

- **Electron** — Desktop shell, file system access, native dialogs
- **React** — UI renderer (all views from prototype v6.2)
- **chokidar** — File watching for OBS recordings folder
- **electron-store** — Persistent local storage for settings, game library, tracker data

### Folder Structure

```
clipflow/
├── public/              # Static assets, index.html
├── src/
│   ├── main/            # Electron main process
│   │   ├── main.js      # Window creation, IPC handlers
│   │   └── preload.js   # Secure bridge to renderer
│   └── renderer/        # React frontend
│       ├── App.js       # Root component, routing
│       ├── components/  # Shared UI components
│       ├── views/       # Page-level views
│       ├── hooks/       # Custom React hooks
│       ├── styles/      # Theme, design tokens
│       └── assets/      # Fonts, images
├── scripts/             # Build scripts
└── package.json
```
