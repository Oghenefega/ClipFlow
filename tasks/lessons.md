# ClipFlow — Lessons Learned

> After ANY correction from the user, add the pattern here.
> Review at session start. Ruthlessly iterate until mistake rate drops to zero.

---

## Vizard API

### Source video filtering — don't trust field-based heuristics
- **Mistake:** Used `!v.clipEditorUrl && !v.viralScore` to identify source videos. Failed because source videos CAN have both clipEditorUrl and viralScore from the Vizard API.
- **Fix:** Use **duration-based** detection. The source video (original upload, 10-60 min) is always drastically longer than AI clips (15-90s). Filter: longest video > 3 min AND > 3x second-longest = source.
- **Rule:** When filtering Vizard data, never assume a field is absent. Always use relative comparison (duration ratio) over absolute field checks.

### Vizard API response shape
- **Mistake:** Initially tried to access `result.data.videos` — the API returns data at the TOP level: `{ code: 2000, videos: [...], projectName, projectId }`.
- **Rule:** Always use `result.videos`, `result.projectId`, etc. directly. No `.data` nesting.

### videoId is THE unique identifier
- **Mistake:** Earlier code used auto-generated IDs for clips, causing deduplication bugs.
- **Rule:** Always use `v.videoId` from the API as the clip's primary identifier. Cast to string with `String(v.videoId)`.

---

## UI / UX

### Small visual indicators need glow, not just size
- **Mistake:** Used 5x5px dots for tracker source indicators. User said "barely visible."
- **Fix:** 7-8px dots with `boxShadow` glow effect matching the dot color (e.g., `0 0 6px 2px ${color}88`).
- **Rule:** Any indicator dot < 8px needs a glow/shadow to be visible on dark backgrounds. Always pair color with matching boxShadow.

### Long dropdowns are bad UX — split into logical groups
- **Mistake:** Time picker had a single dropdown with 288 options (every 5-min slot across 24 hours).
- **Fix:** Split into two compact dropdowns: Hour (8AM-12AM, 17 options) + Minute (00-55, 12 options).
- **Rule:** If a dropdown has > 20 options, consider splitting into multiple related dropdowns.

### Scrollbar overflow ruins polish
- **Mistake:** Scrollbars bled past rounded corners in multiple views.
- **Fix:** `overflow: hidden` on outer container + `overflow-y: auto` on inner scrollable div. Also `scrollbar-gutter: stable` and scrollbar-corner styling.
- **Rule:** Any container with `borderRadius` + scroll content needs the inner/outer overflow pattern.

### Badge placement — show detail in detail view, not list view
- **Mistake:** Showed project IDs on the main project list cards.
- **Fix:** Moved to ClipBrowser header (shown after selecting a project).
- **Rule:** Technical identifiers (IDs, hashes) belong in detail/expanded views, not list summaries.

---

## Data / Persistence

### Always add migration paths for schema changes
- **Pattern:** When changing how data is structured (e.g., adding source video filtering), also add a migration step in the data loading code to fix already-persisted data.
- **Rule:** Every schema/filter change needs TWO fixes: (1) fix the mapping function for new data, (2) add migration in the `storeGetAll` loader for existing data.

---

## Process

### Build and verify before declaring done
- **Rule:** Always run `npx react-scripts build` after changes. Never mark a task complete without a successful build.
- **Rule:** If a fix involves filtering/mapping data, trace through the logic with the actual problematic data to verify correctness.

### Always run the app after building
- **Mistake:** Built successfully but didn't launch the app to visually verify changes. User had to ask.
- **Rule:** After EVERY build or code change, run `npm start` to launch the Electron app. Do not wait to be asked. Visual verification is mandatory before committing.

### When a fix doesn't work, change the approach entirely
- **Mistake:** Tried to tweak the field-based source video heuristic when it failed.
- **Rule:** If a heuristic fails once, the underlying assumption is wrong. Don't patch it — rethink the approach from scratch (which led to the duration-based solution).

---

## Windows / Native Binaries

### Node.js execFile doesn't propagate PATH to Windows DLL loader
- **Mistake:** Used `execFile` with `cwd` and `env.PATH` to run whisper-cli.exe. DLLs (ggml.dll, ggml-cuda.dll, cublas64, cudart64) were not found despite being in the directory.
- **Root cause:** On Windows, `execFile`/`spawn` set the child process PATH, but the Windows DLL loader resolves DLLs using the *parent* process PATH at load time, not the child's env. Setting `cwd` doesn't help either — Windows stopped using cwd for DLL search by default.
- **Fix:** Use `exec()` with `cmd /c "set "PATH=dirs;%PATH%" && "binary" args"`. The `set PATH` inside cmd.exe updates the shell environment BEFORE the exe loads, so the DLL loader sees it.
- **Rule:** When spawning native binaries with co-located DLLs on Windows from Node.js, ALWAYS use the `cmd /c set PATH=...&&` wrapper pattern. Never rely on `execFile` env or cwd for DLL resolution.

### CUDA toolkit DLLs live in bin/x64, not bin
- **Mistake:** Assumed cublas64, cudart64 were in `CUDA\v13.2\bin\`.
- **Reality:** They're in `CUDA\v13.2\bin\x64\`. The `bin\` folder only has compiler tools (nvcc, ptxas).
- **Rule:** When auto-discovering CUDA runtime DLLs, check BOTH `bin\` and `bin\x64\` subdirectories.

### whisper.cpp JSON timestamps are STRINGS, not numbers
- **Mistake:** `parseWhisperOutput()` used `seg.timestamps?.from || seg.offsets?.from || 0`. The `timestamps.from` field is a **string** like `"00:00:00,720"`, which is truthy — so the numeric `offsets.from` (720) was never reached. Then `"00:00:00,720" / 1000 = NaN`, which serializes as `null` in JSON.
- **Root cause:** whisper.cpp `--output-json-full` has TWO timestamp formats per segment/token: `timestamps` (human-readable strings `"HH:MM:SS,mmm"`) and `offsets` (integer milliseconds). The JS `||` operator short-circuits on truthy strings.
- **Fix:** Always use `offsets` (numeric) FIRST. Created `toMs()` helper that handles both formats. Use `toMs(seg.offsets?.from) || toMs(seg.timestamps?.from)`.
- **Rule:** When parsing external JSON with multiple representations of the same data, always prefer the typed/numeric field over string fields. Never use `||` chaining when the first value could be a truthy non-numeric type.

---

## UI / State Persistence

### View-local state resets on tab switch — persist it
- **Mistake:** `collapsed` folder state in RecordingsView was `useState({})` — lost every time the user navigated away and returned.
- **Fix:** Load from `storeGet("recordingsCollapsed")` on mount, persist to `storeSet` on every toggle.
- **Rule:** Any user-interactive UI state (collapsed sections, scroll positions, sort preferences) that should survive tab switches MUST be persisted via `storeGet/storeSet`. If it's annoying to lose, persist it.

---

## IPC / Data Unwrapping

### Always unwrap IPC response wrappers before storing in state
- **Mistake:** `handleSelectProject` stored the raw IPC result `{ success: true, project: {...} }` into `localProjects` instead of unwrapping to `full.project`. This meant the stored entry had `id = undefined` and no `clips` array. `localProjects.find(p => p.id === selProj.id)` always failed, so ClipBrowser showed 0 clips even though clips existed on disk.
- **Fix:** Use `full.project` when storing into `localProjects` and `setSelProj`. The IPC handler wraps the response — always unwrap before using the data.
- **Rule:** Every `ipcRenderer.invoke()` call returns a wrapper object. ALWAYS check the actual response shape and extract the payload (e.g., `result.project`, `result.data`) before putting it into React state. Never store IPC wrappers directly.

### After renaming a variable, grep for ALL references
- **Mistake:** Renamed `fullProj` to `proj` in the variable declaration but left `project={fullProj}` in the JSX, causing an undefined reference and a blank screen crash.
- **Rule:** After renaming any variable, search the ENTIRE block for all references to the old name. Use find-and-replace or grep, don't rely on visual scanning.
