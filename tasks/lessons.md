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

### Always pass explicit data fields, never let AI infer from names
- **Mistake:** AI title generation didn't receive the game's `hashtag` field. It saw game name "Egging On" and inferred `#eo` (the tag code) instead of `#eggingon` (the actual hashtag).
- **Fix:** Pass `gameHashtag` explicitly from the store to the IPC handler, and inject the exact hashtag into the system prompt.
- **Rule:** When an AI prompt needs a specific value (hashtag, tag, ID), pass it as an explicit parameter. Never rely on the AI to derive it from a name or context.

### Always verify data shapes before writing filters
- **Mistake:** Queue filter used `trackerData.map(t => t.clipId)` but tracker entries had no `clipId` field — filter matched nothing.
- **Rule:** Before filtering on a field, verify it exists in the data creation code, not just the reading code.

---

## Data / Persistence

### Always add migration paths for schema changes
- **Pattern:** When changing how data is structured (e.g., adding source video filtering), also add a migration step in the data loading code to fix already-persisted data.
- **Rule:** Every schema/filter change needs TWO fixes: (1) fix the mapping function for new data, (2) add migration in the `storeGetAll` loader for existing data.

---

## Process

### NEVER pattern-match fixes — actually diagnose from the screenshot
- **Mistake:** User sent screenshots showing timecode inputs stretching way past their text content. Instead of analyzing the screenshot and recognizing the inputs were filling the FULL container width (a layout issue), I pattern-matched "too wide" → "reduce padding" and kept tweaking `px-2` → `px-1` → `px-0.5` across MULTIPLE rounds. The real cause was `flex-1` forcing inputs to stretch. This wasted the user's entire afternoon on a 5-second fix.
- **Root cause:** Laziness. Did not actually look at the screenshot carefully. Did not ask "what CSS property causes an element to fill its container?" — which immediately points to `flex-1`, not padding.
- **Rule:** When the user sends a screenshot of a UI bug:
  1. LOOK AT THE SCREENSHOT. Actually analyze what's wrong visually — don't skim it.
  2. Ask: "What CSS property could cause THIS specific visual behavior?" — not "what's the most common fix for this category of problem?"
  3. If a fix doesn't work on the first try, the diagnosis is WRONG. Stop tweaking the same property. Re-examine the screenshot and re-diagnose from scratch.
  4. Never submit a fix without mentally simulating whether it actually addresses what the screenshot shows.
- **This is non-negotiable.** Lazy debugging that wastes the user's time is unacceptable. One round max for trivial CSS issues.

### Build and verify before declaring done
- **Rule:** Always run `npx react-scripts build` after changes. Never mark a task complete without a successful build.
- **Rule:** If a fix involves filtering/mapping data, trace through the logic with the actual problematic data to verify correctness.

### Always run the app after building
- **Mistake:** Built successfully but didn't launch the app to visually verify changes. User had to ask.
- **Rule:** After EVERY build or code change, run `npm start` to launch the Electron app. Do not wait to be asked. Visual verification is mandatory before committing.

### Moving hooks but not their dependencies causes TDZ crashes
- **Mistake:** Added `useEffect` and `useCallback` that referenced `clipDuration` in their dependency arrays, but `clipDuration` was declared 700 lines later. JavaScript's Temporal Dead Zone (TDZ) makes `const` variables inaccessible before their declaration — `ReferenceError` at runtime, blank screen.
- **Rule:** When adding hooks that reference derived `const` values, ALWAYS check that those values are declared ABOVE the hook in the component body. Move declarations up if needed. `const` is NOT hoisted like `var`.

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

### Refs don't trigger re-renders — use store subscriptions for render-critical state
- **Mistake:** `EditorView` used `useRef(false)` for `initialized` and `useEditorStore.getState().clip` (one-time read) in a guard check. After `useEffect` set `initialized.current = true` and `initFromContext` populated the store, the component never re-rendered because refs and `getState()` don't trigger React updates. Editor opened blank.
- **Fix:** Subscribe to `clip` via `useEditorStore((s) => s.clip)` so the component re-renders when the store updates.
- **Rule:** If a component's render output depends on store data, ALWAYS subscribe with a selector hook. Never use `getState()` in render-path guards — it's a one-time snapshot, not a subscription. Refs are for side-effect tracking, not render control.

### NEVER use generic/fake/placeholder waveforms
- **Mistake:** Drew a fake sine-wave pattern in the audio track when real waveform data wasn't available. User called the timeline "absolutely broken" — the fake waveform served no purpose and was misleading.
- **Fix:** If no real waveform peaks exist, show "Extracting waveform..." text instead. Extract real peaks via FFmpeg in the main process (`ffmpegExtractWaveformPeaks` IPC) when video loads.
- **Rule:** NEVER fall back to a generated/fake/generic waveform. EVER. Only render actual audio data from the real video file. If data isn't ready, show a loading state or empty track.

### Timeline ruler must align with track content — account for label column offset
- **Mistake:** Ruler ticks started at x=0 but track content started at x=LABEL_W (72px). The ruler was visually misaligned from the tracks.
- **Fix:** Add LABEL_W offset to all ruler tick positions, playhead position, and scrub calculations. Use `contentWidth = timelineWidth - LABEL_W` for the actual content area.
- **Rule:** When a timeline has fixed-width labels on the left, ALL position calculations (ruler ticks, playhead, scrub-to-time) must account for the label offset. Introduce a `contentWidth` variable early and use it consistently.

### Subtitle segments must never overlap — push neighbors instead
- **Mistake:** Dragging a subtitle segment edge could overlap adjacent segments, creating invalid state.
- **Fix:** Resize handler now finds neighbors in sorted order. If a resize would overlap a neighbor, it pushes that neighbor's boundary (shrinking it) instead. If the neighbor can't shrink below minimum duration (0.1s), the resize is clamped.
- **Rule:** Timeline segments on the same track must enforce non-overlap constraints during resize. Always sort segments and check neighbors.

### Video duration must come from the video element, not clip metadata
- **Mistake:** Used `clip?.duration` which was undefined (clips store `startTime`/`endTime` but not `duration`). Timeline showed 00:00.0 for total duration, ruler had no ticks, everything was broken.
- **Fix:** Added `duration` to `usePlaybackStore`, set it from the video element's `loadedmetadata` event. Timeline subscribes to `usePlaybackStore.duration` instead of `clip?.duration`.
- **Rule:** For playback-critical values (duration, currentTime), always source from the actual HTML5 video element events, not from clip metadata which may be incomplete or structured differently.

### Never load full video files into the renderer process
- **Mistake:** `extractWaveformPeaks` used `fetch(filePath)` + `arrayBuffer()` + `decodeAudioData()` in the renderer to extract waveform peaks. Gaming recordings are multi-GB — loading the full file into renderer memory caused an instant OOM crash (DevTools showed "disconnected from page").
- **Fix:** Removed renderer-side waveform extraction entirely. Real waveform extraction must happen in the main process via FFmpeg (which can stream/seek without loading the whole file).
- **Rule:** NEVER load large files (video, audio) into the renderer process. Use the main process + FFmpeg for any media processing. The renderer's memory budget is ~512MB-1GB — a single large video file exceeds that.

### Never nest Radix Popover trigger inside Tooltip trigger (or vice versa)
- **Mistake:** Wrapped a `PopoverTrigger` around a `TooltipProvider > Tooltip > TooltipTrigger > Button`. The popover never opened because the tooltip swallowed the click events.
- **Fix:** Use a plain `<button>` as the `PopoverTrigger` child. If both tooltip and popover are needed on the same element, choose one — don't nest them.
- **Rule:** Radix primitives that manage focus/clicks (Popover, Dialog, Tooltip) conflict when nested on the same trigger element. Only one can own the trigger.

### When two UI controls are the same feature, merge them
- **Mistake:** Had separate "Sentence/Paragraph" toggle AND a "Segment mode" popover (Sentence/3-Word/1-Word). They controlled the same concept — how subtitles are chunked. Two controls for one feature is confusing.
- **Fix:** Merged into a single dropdown that shows the current mode label and opens a menu with all options.
- **Rule:** Before adding a new toolbar control, check if an existing control already covers the same behavior. Merge rather than duplicate.

### shadcn Slider only renders one thumb by default
- **Mistake:** Passed `value={[start, end]}` to the shadcn Slider expecting two thumbs. Only one thumb rendered because the component hard-codes a single `<SliderPrimitive.Thumb>`.
- **Fix:** Modified slider.tsx to dynamically render N thumbs based on the `value` array length.
- **Rule:** When using shadcn components with features beyond their defaults (multi-thumb, etc.), always check the component source — they are minimal wrappers and may not expose all Radix capabilities.

### CUDA version must match between torch and ctranslate2
- **Mistake:** torch was installed with cu118 (CUDA 11.8) but ctranslate2 4.7.1 requires cublas64_12.dll (CUDA 12). Transcription crashed with `cublas64_12.dll not found`.
- **Root cause:** `torch.version.cuda` returned `11.8` — torch ships its own CUDA DLLs (cublas64_11.dll in torch/lib/), and ctranslate2 needs the matching version.
- **Fix:** Installed torch 2.7.1+cu126 (CUDA 12.6) which ships cublas64_12.dll. System CUDA version (13.2) is irrelevant — torch bundles its own.
- **Rule:** When using ctranslate2 + torch together, verify `torch.version.cuda` matches ctranslate2's CUDA requirement. Always check the actual DLL files in the venv's `torch/lib/` directory.

### whisperx.align() silently drops segments — always merge with raw
- **Mistake:** Used `aligned.get("segments", result.get("segments", []))` which only falls back if alignment returns nothing at all. In reality, whisperx.align() (wav2vec2) drops individual segments it can't align — the rest come through fine, so the fallback never triggers.
- **Fix:** Merge aligned segments with raw transcription by text matching. For each raw segment, use the aligned version if available, otherwise keep the raw version. Log warnings for dropped segments.
- **Rule:** whisperx alignment is lossy. ALWAYS merge aligned output with raw transcription segments to prevent silent data loss. Never trust alignment output as complete.

### Whisper word tokens need text-guided merging — use segment text as ground truth
- **Mistake (round 1):** Used whisper's raw word-level tokens directly. Whisper tokenizes at subword level: "I'm" becomes ["I", "'m"]. In 1-word segment mode, these appeared as separate segments.
- **Mistake (round 2):** Added `mergeWordTokens()` with apostrophe-only heuristic. This only caught contractions but missed ALL other subword splits: "raiders" → ["ra","iders"], "Bioscanner" → ["bios","c","anner"], "Reagents" → ["reag","ents"], "Sentinel" → ["sent","inel"].
- **Fix:** Use the segment's `.text` field (which has correct whole words from whisper's sentence-level output) as ground truth. Split `.text` into real words, then consume tokens greedily to match each real word by concatenation.
- **Rule:** Whisper segments have TWO word sources: `.text` (correct sentence) and `.words` (subword tokens with timestamps). ALWAYS use `.text` to guide token merging. The approach: split text into words, then for each word, consume tokens until the concatenation matches. This handles contractions, compound words, and any subword splitting pattern.

### Transcript and Edit Subtitles are independent views — don't couple their data
- **Mistake:** TranscriptTab read from `editSegments` (which changes with segment mode). Switching Edit Subtitles to "1 Word" mode also broke the transcript into 1-word fragments, destroying readability.
- **Fix:** TranscriptTab reads from `originalSegments` (sentence-level, never modified by segment mode). Only text edits carry over (they update both).
- **Rule:** The Transcript is a reading view — it always shows well-formatted paragraphs from the original sentence segments. Edit Subtitles controls how subtitles are *displayed/chunked* on screen. These are separate concerns with separate data sources.

### Don't add redundant visual indicators
- **Mistake:** Added green highlight for the active word in Edit Subtitles when purple highlight already served the same purpose in the Transcript tab.
- **Fix:** Use the same purple (`bg-primary/20 text-primary`) for active word across both tabs.
- **Rule:** Before adding a new visual indicator color, check if an existing indicator already communicates the same information. One consistent color for one concept.

### Slider range should be local to the context, not global
- **Mistake:** Time adjustment slider ranged from 0 to full video duration. For a 30-second video with a 0.5s subtitle segment, the slider was nearly useless — the segment occupied < 2% of the track.
- **Fix:** Slider range is now ±5s around the segment, clamped to neighbor segment boundaries (no overlap allowed).
- **Rule:** Range sliders must be scoped to the relevant context. For segment timing, use neighboring boundaries as limits, not the full duration.

### Text must be readable — minimum sizes on dark backgrounds
- **Mistake:** Used `text-[10px]` and `text-[9px]` for timecodes and labels. User said they could barely read things on screen.
- **Fix:** Bumped to `text-xs` (12px) minimum for timecodes, `text-sm` (14px) for segment body text.
- **Rule:** Minimum readable text on a dark background: 12px for labels/metadata, 14px for body content. Never go below 11px for anything a user needs to read.

### Left panel default width must be generous — don't squish content
- **Mistake:** Left panel `defaultSize={25}` (25% of horizontal space). On initial load, the transcript/edit subtitles text was squished into a narrow column, forcing heavy line wrapping and making it hard to read.
- **Fix:** Increase `defaultSize` to ~35% so the left panel starts at a comfortable reading width. The preview panel has a 9:16 video that doesn't need as much horizontal room.
- **Rule:** Text-heavy panels (transcript, subtitles) need enough default width to display at least ~8-10 words per line. A narrow default forces the user to manually resize every time they open the editor.

### NEVER use fallbacks that produce substandard results — fail visibly instead
- **Pattern:** Adding "fallback" code paths that output placeholder/degraded content when the real implementation fails or isn't ready. Examples: fake sine-wave waveforms when FFmpeg extraction fails, even-distribution word timestamps when alignment data is bad, placeholder text when API calls fail.
- **Why it's bad:** Fallbacks MASK the real problem. The user sees something that looks "working" but is actually wrong/unusable. Then debugging becomes harder because the fallback triggers silently. The user wastes time trying to fix something that shouldn't have been shown at all.
- **Rule:** NEVER write fallback code that produces fake/degraded output. If real data isn't available, show NOTHING — an empty state, a loading spinner, or an error message. The user would rather see "No data" than see wrong data that looks real. If a feature can't produce the correct result, it should fail visibly so the root cause gets fixed immediately.
- **Concrete examples of what NOT to do:**
  - Fake waveforms when real audio data isn't available
  - Even-distribution word timestamps when alignment fails (just show segment-level, no word highlighting)
  - Placeholder images when thumbnail generation fails
  - Default/random values when a computation returns null

---

### Lesson: Always verify which component is ACTUALLY rendering

**Mistake:** Modified `BrandDrawer.js` and assumed it was being used, but `EditorLayout.js` imports `RightPanelNew.js` (not `RightZone.js`), which has its own inline `BrandKitPanel`. My changes never appeared in the app.

**Why it happened:** Trusted the `RightZone.js` import path without tracing the ACTUAL import chain from `EditorLayout.js`. Two parallel implementations existed.

**Rule:** Before modifying any component, trace the import chain from the entry point (`EditorLayout.js`) to verify the component is actually mounted. `grep` for the import in the layout file, not just in any file.

---

## Effect Presets Must Be Panel-Scoped

### Applying an effect preset should only change the target panel's store
- **Mistake:** applyEffectPreset() always modified BOTH subtitle and caption stores, so clicking a preset in the Text (caption) panel also changed subtitles.
- **Why:** The function was designed without considering that it would be called from two independent panels.
- **Rule:** Any shared utility that modifies stores must accept a target/scope parameter. Never assume 'apply to everything' is the right default.

## Per-Word Effects for Karaoke Highlight

### Text-shadow must be per-word, not per-container, when karaoke highlighting is active
- **Mistake:** Glow was applied at the parent div level, so the active (highlighted) word had its color changed but kept the same glow color as non-active words.
- **Rule:** When words can have independent visual states (karaoke), all text-shadow effects must be per-span, not per-container. The active word's glow should match highlightColor.

## Never Dual-Purpose Store State for UI Visibility

### Store state must not control both feature logic AND UI visibility
- **Mistake:** `punctOn` in the subtitle store controlled both "show the punctuation dropdown" AND "strip punctuation in the preview." Closing the dropdown toggled the store value, re-enabling all punctuation marks in the preview.
- **Why:** Reused a store boolean for dropdown open/close instead of using local component state.
- **Rule:** UI visibility (dropdown open, panel expanded) must ALWAYS use local `useState`. Store state must ONLY control feature behavior (what gets stripped, what gets shown). If a single boolean serves two purposes, it WILL break one of them.

## Timeline Split Operations

### Always handle null/undefined endSec in time comparisons
- **Mistake:** `splitCaptionAtPlayhead` compared `time < s.endSec - 0.05` but endSec was null for legacy full-duration captions. `null - 0.05 = NaN`, so the find() never matched.
- **Rule:** Any time comparison involving endSec MUST resolve null to Infinity (or actual duration). Never assume endSec is always a number.

### Split operations must use playhead time, not just word boundaries
- **Mistake:** `splitSegment()` required `activeSegId` and split at word boundaries. Users pressing S expected split at playhead position regardless of selection.
- **Rule:** Split functions must accept a time parameter and auto-find the segment containing that time. Don't require the user to first select a segment before splitting.

### Merged/simplified track views must not break interactions
- **Mistake:** When zoomed out, subtitle track merged all segments into one bar with `onResize={() => {}}` — an empty handler that made resize impossible.
- **Rule:** Never replace interactive segments with non-functional merged views. Always render actual segments. If they're too small to see, that's a zoom UX issue, not a reason to remove functionality.

### Right-click on timeline must not move playhead
- **Mistake:** Right-click events could propagate to the scroll container's `onPointerDown` handler, which triggered seeking despite the button check, due to event ordering.
- **Rule:** All track rows must `stopPropagation()` on `onPointerDown` for right-click (button === 2) AND on `onContextMenu` to prevent seek events from reaching the scroll container.
