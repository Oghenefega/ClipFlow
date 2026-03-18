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
