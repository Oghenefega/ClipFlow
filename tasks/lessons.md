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

### When a fix doesn't work, change the approach entirely
- **Mistake:** Tried to tweak the field-based source video heuristic when it failed.
- **Rule:** If a heuristic fails once, the underlying assumption is wrong. Don't patch it — rethink the approach from scratch (which led to the duration-based solution).
