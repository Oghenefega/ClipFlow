# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## Active: Session 33 — Dead code audit (3 reviewable passes)

**Goal:** sweep the codebase for legacy / orphaned code that piled up across sessions 23–32. Three discrete passes, each producing a deletion list reviewed and approved before any code is removed. After the audit, refresh the canonical external technical summary.

**Why:** the user flagged at end of session 32 that recent feature-heavy sessions (NVENC, batched retranscribe, lazy-cut, signal cleanup) likely left orphaned IPC bridges, dead Zustand actions, defunct helpers, and stale planning docs.

---

## Pass 1 — Orphaned IPC handlers + preload bridges (RECONNAISSANCE COMPLETE)

### Methodology — what I cross-referenced

1. Every `ipcMain.handle("...")` in [src/main/main.js](src/main/main.js) (132 handlers).
2. Every `ipcRenderer.invoke("...")` in [src/main/preload.js](src/main/preload.js) (the bridge).
3. Every `window.clipflow.<method>` call across all of `src/` — **324 total usages, 18 callsite files**, including [src/index.js](src/index.js) (the renderer entrypoint OUTSIDE `src/renderer/`) and the Electron-detection truthy check in [RenameView.js:186](src/renderer/views/RenameView.js).
4. Verified no destructuring (`const { foo } = window.clipflow`) or aliasing (`const cf = window.clipflow`) patterns exist anywhere in `src/`.
5. Verified no bracket-notation access (`window.clipflow[name]`) exists.
6. Verified no project test files (only [segmentWords.test.js](src/renderer/editor/utils/segmentWords.test.js) and [nleModel.test.js](src/renderer/editor/models/__tests__/nleModel.test.js) exist, neither references any candidate).
7. Verified `tools/` has no JS files referencing these names.
8. Verified [TrackerView.js](src/renderer/views/TrackerView.js) uses `clipflow` only as string literals (`"Published via ClipFlow"`, `source === "clipflow"`) — not method calls.
9. For each candidate, confirmed the only references are in [preload.js](src/main/preload.js) + [main.js](src/main/main.js) — zero renderer references.
10. For ffmpeg/whisper/projects helpers: confirmed the underlying module functions ARE called internally elsewhere (e.g., `ffmpeg.extractAudio` from `ai-pipeline.js:443`, `mainWindow.webContents.send("whisper:progress")` from main.js:1226), so deleting the IPC layer doesn't orphan the helpers themselves. Helper-orphaning gets handled in Pass 3.

### Deletion list — 31 orphan IPC entries + 1 dead fallback

Each row = drop the bridge entry in [preload.js](src/main/preload.js) AND the matching `ipcMain.handle` block in [main.js](src/main/main.js) (if applicable). Listener-style entries have no handler block to delete.

#### A. fs surface (3 bridges + 3 handlers)

| Bridge | preload.js line | IPC channel | main.js handler line |
|---|---|---|---|
| `readDir` | 11 | `fs:readDir` | 536 |
| `readFile` | 14 | `fs:readFile` | 575 |
| `writeFile` | 15 | `fs:writeFile` | 584 |

#### B. Watcher event listeners with no consumer (2 bridges, NO handler — they're `ipcRenderer.on` wrappers; the events fire from the chokidar watcher in [main.js:708/725](src/main/main.js))

| Bridge | preload.js lines |
|---|---|
| `onFileRemoved` | 23–25 |
| `onTestFileRemoved` | 37–39 |

The `removeAllListeners("watcher:fileRemoved")` and `("watcher:testFileRemoved")` lines inside `removeFileListeners` (preload.js:28) and `removeTestFileListeners` (preload.js:42) become inert — leave them as defensive cleanup, no harm.

The chokidar watcher itself in main.js still emits these events to nobody (harmless — `mainWindow.webContents.send` to a channel with no listener is a no-op). Optional follow-up in Pass 3: drop the `unlink` emit in `createRecordingFolderWatcher`.

#### C. Test watcher stop + shell + dialog (3 bridges + 3 handlers)

| Bridge | preload.js line | IPC channel | main.js handler line | Note |
|---|---|---|---|---|
| `stopTestWatching` | 33 | `watcher:stopTest` | 730 | Test watcher is started ([RenameView.js:243](src/renderer/views/RenameView.js)) but never stopped from renderer. Pre-existing pattern — not a regression of this audit. Test watcher cleans up on app quit. |
| `openFolder` | 46 | `shell:openFolder` | 736 | `revealInFolder` is the one that's used. |
| `saveFileDialog` | 50 | `dialog:saveFile` | 746 | `openFileDialog` is the one that's used. |

#### D. Legacy ffmpeg surface (3 bridges + 3 handlers)

| Bridge | preload.js line | IPC channel | main.js handler line |
|---|---|---|---|
| `ffmpegExtractAudio` | 62 | `ffmpeg:extractAudio` | 781 |
| `ffmpegThumbnail` | 63 | `ffmpeg:thumbnail` | 795 |
| `ffmpegAnalyzeLoudness` | 64 | `ffmpeg:analyzeLoudness` | 800 |

`ffmpeg.extractAudio()`, `ffmpeg.generateThumbnail()`, `ffmpeg.analyzeLoudness()` module functions remain — called internally from `ai-pipeline.js`, `highlights.js`, etc. Just dropping the IPC layer.

#### E. Whisper renderer-call surface (3 bridge entries, 1 handler)

| Bridge | preload.js lines | IPC channel | main.js handler line |
|---|---|---|---|
| `whisperTranscribe` | 71 | `whisper:transcribe` | 1211 |
| `onWhisperProgress` | 72–74 | (listener for `whisper:progress`) | — |
| `removeWhisperProgressListener` | 75–77 | (listener cleanup) | — |

Main pipeline still emits `whisper:progress` to nobody at [main.js:1226](src/main/main.js) — harmless. Optional Pass 3 cleanup.

#### F. Project mutation surface (4 bridges + 4 handlers)

| Bridge | preload.js line | IPC channel | main.js handler line |
|---|---|---|---|
| `projectCreate` | 80 | `project:create` | 1508 |
| `projectSave` | 82 | `project:save` | 1524 |
| `projectAddClip` | 88 | `project:addClip` | 1747 |
| `projectDeleteClip` | 89 | `project:deleteClip` | 1754 |

ClipFlow architecture: AI pipeline writes projects internally; renderer mutates only specific fields via `project:updateClip`, `project:delete`, `project:updateTestMode` (all confirmed live).

#### G. Misc orphan handlers (12 bridges + 12 handlers)

| Bridge | preload.js line | IPC channel | main.js handler line |
|---|---|---|---|
| `importCancel` | 154 | `import:cancel` | 1183 |
| `fileMetadataGetById` | 166 | `metadata:getById` | 1925 |
| `presetGetAll` | 173 | `preset:getAll` | 2052 |
| `presetCalculateDayNumber` | 177 | `preset:calculateDayNumber` | 2074 |
| `presetExtractDate` | 180 | `preset:extractDate` | 2090 |
| `feedbackGetApproved` | 184 | `feedback:getApproved` | 1804 |
| `feedbackGetCounts` | 185 | `feedback:getCounts` | 1810 |
| `gameProfilesGetAll` | 188 | `gameProfiles:getAll` | 2095 |
| `getPublishLogsForClip` | 274 | `publishLog:getForClip` | 3118 |
| `folderReorder` | 297 | `folder:reorder` | 3267 |
| `logsGetModules` | 300 | `logs:getModules` | 3125 |
| `logsGetSessionLogs` | 301 | `logs:getSessionLogs` | 3130 |
| `logsGetDir` | 303 | `logs:getDir` | 3159 |

(`logs:exportReport` IS used — kept.)

#### H. Dead fallback in waveformUtils (no IPC, just renderer)

[src/renderer/editor/utils/waveformUtils.js:20–28](src/renderer/editor/utils/waveformUtils.js):

```js
} catch {
  // Fallback: use IPC to read the file buffer
  if (window.clipflow?.readFileBuffer) {
    const buffer = await window.clipflow.readFileBuffer(filePath);
    arrayBuffer = buffer;
  } else {
    console.warn("Waveform: Cannot read file, no IPC fallback available");
    return null;
  }
}
```

`window.clipflow.readFileBuffer` is **not exposed in preload.js anywhere**. The fallback branch is unreachable — `if (window.clipflow?.readFileBuffer)` is always false → `console.warn` → return null. The `fetch("file://...")` path above is the only working path. Replace the catch branch with `return null` (or just `console.warn(...); return null;`).

### Verification plan after deletion

1. `npm run build:renderer` — must succeed with no errors.
2. `npm start` — Electron launches, no `is not a function` errors in DevTools console.
3. Walk through each touched feature area:
   - Rename tab — start watching, drag-drop file, rename, undo, history.
   - Test mode — start test watching (verify test watcher still spins up).
   - Settings — pick folder, save settings, dev mode dashboard.
   - Editor — open clip, render, retranscribe.
   - Pipeline — run on reference recording end-to-end.
   - Queue — publish to one platform.
4. Compare reference pipeline log vs session-32 baseline (`processing/logs/RL_2026-10-15_Day9_Pt1_1777373571340.log`) — total runtime should be unchanged (~397s).
5. CHANGELOG.md updated with deletion list under 2026-04-28 / Removed.

### Estimated impact

- ~31 entries removed from preload.js (~50 lines)
- ~31 handler blocks removed from main.js (~150–200 lines)
- 1 dead fallback branch simplified in waveformUtils.js (~7 lines → 2)
- Net: ~200–250 lines removed, no behavior change.

---

## Pass 2 — Orphaned Zustand actions, state fields, legacy migrations (PENDING)

Methodology: enumerate exports of every store in `src/renderer/editor/stores/` (6 stores), trace which are actually consumed via selectors. Specifically:
- The `audioSegments` → `nleSegments` migration in [useEditorStore.initFromContext](src/renderer/editor/stores/useEditorStore.js).
- `transcription` field handling — multiple set paths, identify what's read.
- Recut handler return shapes — verify renderer only uses fields that are returned.

**Migration discipline:** any stored-shape change requires a migration per `.claude/rules/pipeline.md`.

---

## Pass 3 — Dead helpers, exports, stale TODOs, planning docs (PENDING)

- Module exports with no importers (now possibly larger after Pass 1 — e.g. internal helpers behind dropped IPC handlers).
- `// TODO`, `// FIXME`, `// removed`, `// deprecated` comments referencing resolved issues.
- Stale planning docs in `tasks/`.
- Optional: drop `mainWindow.webContents.send("watcher:fileRemoved", ...)` and `("whisper:progress", ...)` emits if the corresponding bridge is gone.

---

## Post-audit — Refresh external technical summary

Path: `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md` (single file, overwrite).

Do AFTER all 3 passes are committed.

---

## Stop here for approval

Pass 1 reconnaissance complete with full cross-reference verification across 324 `window.clipflow.*` callsites, destructuring/aliasing/bracket-access patterns, test files, tools dir, and main-side handler bodies. Awaiting "go" on the deletion list above.
