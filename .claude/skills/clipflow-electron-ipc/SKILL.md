---
name: clipflow-electron-ipc
description: Use when working with Electron main process, IPC handlers, preload bridge, electron-store persistence, file system operations, schema migrations, or window management in ClipFlow. Triggers on main.js changes, preload.js changes, store migrations, or any IPC-related code.
---

# ClipFlow Electron & IPC Patterns

ClipFlow is an Electron 28 app. Main process in `src/main/`, renderer in `src/renderer/`.

## IPC Response Unwrapping — CRITICAL

Every `ipcRenderer.invoke()` returns a wrapper: `{ success: true, project: {...} }` or `{ success: false, error: "..." }`.

**ALWAYS unwrap before storing in React state:**
```javascript
// CORRECT
const result = await window.clipflow.projectLoad(id);
if (result.success) setProject(result.project);

// WRONG — stores the wrapper, id becomes undefined
setProject(result);
```

**Rule:** NEVER store IPC wrapper objects directly in state. Extract the payload field.

## electron-store Schema Migrations

**Hard rule:** Every data structure change requires a migration function.

### Migration Pattern
```javascript
// In main.js near store initialization
function migrateStore(store) {
  // Remove stale keys
  if (store.has('whisperBinaryPath')) {
    store.delete('whisperBinaryPath');
  }
  // Add new defaults
  if (!store.has('whisperPythonPath')) {
    store.set('whisperPythonPath', '');
  }
  // Transform existing data shapes
  const games = store.get('games', []);
  if (games.length > 0 && !games[0].hashtag) {
    store.set('games', games.map(g => ({ ...g, hashtag: g.tag.toLowerCase() })));
  }
}
```

### Rules
- Write migration BEFORE changing any code that reads the store
- Handle both fresh install (key doesn't exist) and existing data (old shape)
- Test against both scenarios
- Migrations go in `src/main/main.js` near store initialization

## State Persistence

### What to persist (electron-store)
- User preferences (watch folder, main game, API keys)
- UI state that survives tab switches (collapsed folders, sort order)
- Game library data
- Weekly template configuration

### What NOT to persist
- Transient UI state (hover states, animation states)
- Data that can be recomputed (derived values)
- Secrets in plaintext (mask on display, store encrypted if possible)

### Pattern
```javascript
// Load on mount
useEffect(() => {
  window.clipflow.storeGet('recordingsCollapsed').then(val => {
    if (val) setCollapsed(val);
  });
}, []);

// Persist on change
const toggle = (key) => {
  const next = { ...collapsed, [key]: !collapsed[key] };
  setCollapsed(next);
  window.clipflow.storeSet('recordingsCollapsed', next);
};
```

**Rule:** Any user-interactive state that's annoying to lose on tab switch MUST be persisted.

## Preload Bridge (window.clipflow)

- 31+ methods exposed via contextBridge
- All methods are async (return Promises)
- File paths use Windows backslashes internally
- Platform detection: `window.clipflow.platform` returns `'win32'`

## File System Rules

- Files are NEVER auto-renamed — user must review and click Rename
- Monthly subfolder organization: `2026-03/`, `2026-02/`, etc.
- OBS filename pattern: `2026-03-03 18-23-40.mp4`
- ClipFlow rename pattern: `2026-03-03 AR Day25 Pt1.mp4`

## Window Management

- Close = quit. No minimize-to-tray.
- Windows-only build (NTFS paths, Windows file behavior)
- `isDev = false` in main.js — loads from `build/` folder
- For hot reload: set `isDev = true` and run React dev server on port 3000

## Variable Renaming Safety

After renaming ANY variable:
1. Grep the ENTIRE file for all references to the old name
2. Check JSX props, callback arguments, destructuring, imports
3. Use find-and-replace, don't rely on visual scanning
4. A missed reference = blank screen crash (ReferenceError)

## Hook Declaration Order (TDZ Prevention)

```javascript
// WRONG — useEffect references clipDuration before it's declared
useEffect(() => { doSomething(clipDuration) }, [clipDuration]);
// ... 700 lines later ...
const clipDuration = clip?.endTime - clip?.startTime;

// CORRECT — declare ABOVE the hook
const clipDuration = clip?.endTime - clip?.startTime;
useEffect(() => { doSomething(clipDuration) }, [clipDuration]);
```

`const` is NOT hoisted like `var`. Temporal Dead Zone = ReferenceError = blank screen.

## Distilled Lessons (gaps)

- **Windows file locking (EBUSY).** Before any IPC that replaces/deletes a clip file on disk, unload the `<video>` first (`removeAttribute('src')` + `.load()`), then wait ~100ms for the OS to release the handle. Replacing a file Chromium has open throws `EBUSY: resource busy or locked`.
- **The preload script is a single point of failure — never add a bare `require()`.** Any uncaught error in `preload.js` crashes the script, so `contextBridge.exposeInMainWorld('clipflow', …)` never runs and `window.clipflow` is `undefined` → the app loads as an empty shell with zero data. Wrap every third-party require in try/catch. After ANY preload change, open DevTools and check for red errors (terminal shows "no errors" even when preload died).
- **Native Node modules fail in Electron on Windows** (`better-sqlite3` → `node-gyp`/`electron-rebuild` failures). Use a WASM alternative — `sql.js` (async init, zero native compilation, cross-platform).
- **No Node `path` module in the renderer.** Use `str.split(/[/\\]/).pop()` for basename etc. `path` is main-process only.
- **Pass explicit data fields to AI prompts — never let the model infer them.** e.g. inject the game's exact `gameHashtag` into the IPC handler + system prompt; don't rely on the model deriving `#eggingon` from the name "Egging On".
- **Don't invent API model IDs** — grep `main.js` for the proven IDs already in the `anthropic:*` handlers. (See `clipflow-trace-verify`.)
- **asar packaging bugs come in FAMILIES — sweep every `__dirname`-relative main-process path before shipping the fix.** In the packaged app `__dirname` is inside the read-only `app.asar`, so a path that's (a) WRITTEN to (scratch/output/logs) or (b) read by an EXTERNAL process (python/ffmpeg scripts, models, binaries) breaks there identically. Find one → grep `src/main` for ALL of them and triage: (a) → `app.getPath("userData")`; (b) → ship via electron-builder `extraResources` (or `asarUnpack`) AND resolve from `process.resourcesPath` when `app.isPackaged` (repo-relative from source) AND make sure the dir is actually packaged (`build.files`/extraResources) or it won't ship at all; (c) Electron-read paths (`loadFile`, preload) are fine inside the asar. Fix the whole class in ONE installer, not one-per-reinstall. Source runs hide all of this (`__dirname` is the writable repo). (#142 processingDir → userData; #143 `tools/transcribe.py` + `tools/signals/*` → extraResources.)
- **The asar "family" is WIDER than `__dirname` script paths — the session-84 sweep missed three more members (proven by the session-85 audit).** When sweeping, ALSO check: (1) every cross-tree `require()` (main → renderer) — the file MUST be globbed in `build.files` or it's absent from the asar and the `require` throws (e.g. `editor/models/**` was added but `editor/utils/**` was not → the overlay preload's `require("subtitleStyleEngine.js")` throws → packaged exports silently burn in BLANK subtitles); (2) every static asset loaded by `file://` in an offscreen/overlay window (fonts in `src/fonts`, images) — not in `build.files`/`extraResources` → 404/fallback, AND `file://` into the asar is unreliable anyway, so ship via `extraResources` + `process.resourcesPath`; (3) every BARE external-binary spawn (`spawn("ffmpeg"/"ffprobe"/"python")`) — relies on the user's PATH and is bundled NOWHERE → total pipeline failure on any clean machine. **Verify against the real artifact, not the globs: `npx asar list dist/win-unpacked/resources/app.asar`** shows what actually shipped — a `build.files` glob you THINK matches may not.
- **Persistence writers that WHITELIST fields silently drop new ones.** Several IPC-backed save paths rebuild the stored object from an explicit field list (e.g. `projects.updateReframe` re-creates `{layoutId, camRect, gameRect, …}`) — adding a field to a data shape means extending EVERY whitelisting writer on its persist path, or the renderer's value evaporates on save with no error. Before assuming a new field persists, grep the save path for object-literal rebuilds of that shape and trace one round-trip (set → save → reload). (Session 104: `reframe.style` was the first casualty.)
