---
name: clipflow-optimize
description: >-
  Profile-driven performance optimization for ClipFlow (Electron + React + Zustand).
  Use when: slow, laggy, optimize, bottleneck, memory leak, re-render, IPC latency,
  startup time, FFmpeg flags, or performance regression.
---

# ClipFlow Performance Optimization

> **The One Rule:** Measure first. Prove behavior unchanged. One change at a time.

## The Loop (Mandatory)

```
1. BASELINE    → Measure the specific metric (render time, IPC round-trip, startup, memory)
2. PROFILE     → Identify the actual hotspot (not the assumed one)
3. SCORE       → Opportunity matrix — only implement Score >= 2.0
4. IMPLEMENT   → One lever per commit, no unrelated changes
5. VERIFY      → App builds, launches, feature works, no regressions
6. REPEAT      → Re-profile (bottlenecks shift after each fix)
```

**Anti-patterns — NEVER do:**
- Optimize without measuring first
- Change multiple things per commit
- Assume where the bottleneck is
- Refactor "while we're here"
- Skip build + launch verification

---

## Opportunity Matrix

| Hotspot | Impact (1-5) | Confidence (1-5) | Effort (1-5) | Score |
|---------|--------------|-------------------|--------------|-------|
| *component:issue* | x | x | / | Impact x Conf / Effort |

```
Impact:     5 = 50%+ improvement, 4 = 25-50%, 3 = 10-25%, 2 = 5-10%, 1 = <5%
Confidence: 5 = profiler confirms, 3 = likely, 1 = speculative
Effort:     5 = >1 day, 3 = hours, 1 = minutes
```

**Rule:** Only implement Score >= 2.0. Log all opportunities, implement in score order.

---

## Profiling Toolkit — ClipFlow-Specific

### Renderer (React + Chrome DevTools)

```
1. DevTools Performance tab    → Record interaction → check for long tasks (>50ms)
2. React Profiler              → Identify unnecessary re-renders, slow commits
3. DevTools Memory tab         → Heap snapshots before/after to find leaks
4. Performance.now() markers   → Bracket specific operations for timing
```

**How to access in Electron:**
- Main window: `Ctrl+Shift+I` opens DevTools
- Or programmatically: `mainWindow.webContents.openDevTools()`

### Main Process (Node.js)

```
1. console.time/timeEnd        → Bracket IPC handlers, FFmpeg calls, file ops
2. process.memoryUsage()       → Track heap before/after heavy operations
3. Electron process metrics    → app.getAppMetrics() for CPU/memory per process
4. --inspect flag              → Chrome DevTools for main process profiling
```

**Launch with inspector:**
```bash
# In main.js or package.json start script:
electron --inspect=9229 .
# Then open chrome://inspect in Chrome
```

### IPC Latency

```javascript
// Temporary instrumentation — add to preload.js wrapper
const start = performance.now();
const result = await ipcRenderer.invoke(channel, ...args);
console.log(`IPC ${channel}: ${(performance.now() - start).toFixed(1)}ms`);
```

### FFmpeg Operations

```javascript
// Already logged by ClipFlow's logger — check:
// 1. FFmpeg command flags (redundant passes? missing -threads?)
// 2. Wall-clock time per operation
// 3. Output file size vs expected
```

---

## ClipFlow Hotspot Checklist

Profile these areas IN ORDER when investigating performance. Each has specific detection and fix patterns.

### 1. React Re-renders (Renderer)

**Detect:**
- React Profiler → look for components rendering when they shouldn't
- Add `console.count('ComponentName render')` temporarily
- Check: are parent components re-rendering and cascading to children?

**Common causes in ClipFlow:**
| Cause | Detection | Fix |
|-------|-----------|-----|
| Missing Zustand selector | `useStore()` without `(s) => s.field` | Add selector for only needed fields |
| Object/array in selector | `(s) => ({ a: s.a, b: s.b })` creates new ref each time | Use `shallow` from zustand or separate selectors |
| Inline objects as props | `style={{ color: 'red' }}` in render | Extract to const or useMemo |
| Callback recreation | `onClick={() => doThing(id)}` | useCallback with stable deps |
| Context provider value | New object on every render | useMemo the context value |

**ClipFlow-specific patterns:**
- Subtitle list re-rendering on every playback tick → selector should only subscribe to `currentTime` where needed
- Editor panels re-rendering when unrelated store fields change → verify selector granularity
- Waveform/timeline re-rendering on subtitle edits → check if these components subscribe to subtitle data they don't need

### 2. IPC Round-Trips (Renderer ↔ Main)

**Detect:**
- Add timing to IPC calls (see instrumentation above)
- Look for sequential `await window.clipflow.x()` calls that could be batched
- Check: is the same data being fetched multiple times?

**Patterns:**
| Pattern | Problem | Fix |
|---------|---------|-----|
| N+1 IPC calls | Loop calling IPC per item | Batch into single IPC with array param |
| Redundant fetches | Same data requested multiple times | Cache in renderer state / Zustand |
| Large payloads | Serializing entire project on every save | Send only changed fields (delta) |
| Sync-style waterfalls | `await a(); await b(); await c();` | `Promise.all([a(), b(), c()])` if independent |

### 3. Memory Leaks (Renderer)

**Detect:**
- DevTools Memory → take heap snapshot → use app → take another → compare
- Watch `Performance Monitor` panel for steadily growing JS heap
- Check Task Manager for Electron process memory over time

**ClipFlow-specific leak sources:**
| Source | Detection | Fix |
|--------|-----------|-----|
| Video elements not cleaned up | Heap snapshot shows detached HTMLVideoElement | ALWAYS revoke object URLs + remove src on unmount |
| Event listeners on window/document | Growing listener count in DevTools | Remove in useEffect cleanup |
| Zustand store accumulation | Store grows unbounded over time | Clear/reset when switching projects |
| Canvas contexts (waveform) | Detached canvas elements in heap | Explicit cleanup in useEffect return |
| setInterval/setTimeout | Timers firing after component unmount | Clear in useEffect cleanup |
| Large arrays in closures | Old subtitle/segment arrays held by stale closures | Check useCallback/useMemo deps |

**Critical rule (from past incidents):** Every `<video>` element MUST have unmount cleanup that revokes blob URLs and nulls the src. Chromium will crash otherwise (blink::DOMDataStore).

### 4. Startup Time (Main Process)

**Detect:**
- `console.time('app-ready')` at top of main.js → `console.timeEnd('app-ready')` in `app.whenReady()`
- Check: what's loading synchronously before the window opens?

**Patterns:**
| Pattern | Problem | Fix |
|---------|---------|-----|
| Sync file reads at startup | Blocks app.ready | Move to async, read after window shows |
| Loading all project data | Slow with many projects | Load project list only, lazy-load details |
| electron-store reads | Sync by default | Acceptable for small config, defer large data |
| Module requires | Large modules loaded upfront | Dynamic import() for features used later |

### 5. FFmpeg Pipeline (Main Process)

**Detect:**
- Log wall-clock time for each FFmpeg operation
- Compare FFmpeg flags against optimal settings
- Check: are we doing redundant encode/decode passes?

**Patterns:**
| Pattern | Problem | Fix |
|---------|---------|-----|
| Multiple passes when one suffices | Re-encoding intermediates | Single-pass with complex filtergraph |
| Missing -threads flag | Single-threaded encode | Add `-threads 0` (auto) |
| Unnecessary -vcodec copy | Can't apply when filter needed | Only copy when no transforms |
| No hardware accel | CPU-only encode | `-c:v h264_nvenc` / `-c:v h264_qsv` with fallback |
| Large temp files | Intermediates on disk | Pipe between FFmpeg stages where possible |
| Re-extracting audio | Extract audio every time it's needed | Cache extracted audio alongside video |

### 6. Whisper Transcription (Main Process)

**Detect:**
- Log time per transcription
- Check model size vs accuracy needs

**Patterns:**
| Pattern | Problem | Fix |
|---------|---------|-----|
| Large model for short clips | Overkill, slow | Use small/base model for < 2min clips |
| Re-transcribing unchanged audio | Wasted work | Cache transcription keyed by audio hash |
| No progress feedback | User thinks app froze | Stream progress events to renderer |

### 7. File System Operations (Main Process)

**Detect:**
- Wrap chokidar callbacks and fs operations with timing
- Check: are we scanning directories unnecessarily?

**Patterns:**
| Pattern | Problem | Fix |
|---------|---------|-----|
| readdir on large folders | Blocks event loop | Use streaming/async iteration |
| Sync fs calls | Blocks main process | Use fs.promises or fs callback API |
| Watching too many files | Memory + CPU from watchers | Narrow chokidar watched paths |
| Reading entire files to check existence | Wasteful | Use fs.access or fs.stat |

---

## TypeScript/JavaScript Trouble Spots

Quick grep commands to find common perf issues in ClipFlow:

```bash
# Sequential async in loops
rg 'for.*await|while.*await' --type js src/

# JSON parse/stringify in hot paths
rg 'JSON\.(parse|stringify)' --type js src/renderer/

# Array.includes on potentially large arrays
rg '\.includes\(' --type js src/renderer/ -c | sort -t: -k2 -rn

# Chained array operations
rg '\.(map|filter|reduce)\(.*\)\.(map|filter|reduce)' --type js src/

# Console.log left in production code
rg 'console\.(log|info|warn|error)' --type js src/renderer/ -c | sort -t: -k2 -rn

# Regex created inside loops
rg 'new RegExp' --type js src/

# Object spread in loops (potential perf issue)
rg 'for.*\{' -A5 --type js src/ | rg '\.\.\.'
```

---

## Verification Template

For EVERY optimization, document:

```markdown
## Change: [description]

### Baseline
- Metric: [what was measured]
- Before: [value]

### What Changed
- Before: [code/behavior]
- After: [code/behavior]

### Proof of Correctness
- [ ] App builds with no errors
- [ ] App launches normally
- [ ] Changed feature works identically
- [ ] No visual regressions
- [ ] No console errors

### Result
- After: [measured value]
- Improvement: [X% faster / Y MB less / Z fewer re-renders]
```

---

## Regression Prevention

After each optimization:

1. **Note the metric** — what did you measure, what was the result?
2. **Add to lessons** — append to `tasks/lessons.md` what you found and fixed
3. **Watch for shifts** — fixing one bottleneck often reveals the next one
4. **Don't over-optimize** — stop when Score < 2.0 for all remaining opportunities

---

## Iteration Rounds

- **Round 1:** Low-hanging fruit — unnecessary re-renders, IPC batching, memory leaks, missing cleanup
- **Round 2:** Algorithmic — subtitle search optimization, caching strategies, lazy loading
- **Round 3:** Infrastructure — hardware-accelerated encoding, worker threads, streaming

Each round: fresh profile → new hotspots → new matrix. Never skip profiling between rounds.
