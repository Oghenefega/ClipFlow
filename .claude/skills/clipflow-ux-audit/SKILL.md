---
name: clipflow-ux-audit
description: >-
  Systematic UX evaluation of ClipFlow's UI using Nielsen heuristics and accessibility checks.
  Use when: UX audit, is this usable, improve user experience, confusing UI, user flow,
  accessibility, pre-launch review, or evaluating a screenshot of ClipFlow.
---

# ClipFlow UX Audit

> **Core Insight:** Users don't read manuals. If it's not obvious, it's broken.

## The Loop

```
1. IDENTIFY    → Which view/flow is being audited? (screenshot or code)
2. HEURISTICS  → Score against Nielsen's 10, focused on ClipFlow patterns
3. ACCESSIBILITY → Check the Big 4 (keyboard, contrast, not-color-only, screen reader)
4. FLOWS       → Trace happy path AND error paths through the feature
5. REPORT      → Prioritized findings: Critical > Important > Suggestions
6. FIX         → File:line references with concrete code changes
```

---

## Nielsen's 10 Heuristics — ClipFlow Application

| # | Heuristic | ClipFlow Question |
|---|-----------|-------------------|
| 1 | **Visibility** | Does user know what's processing? (render progress, transcription status, upload state) |
| 2 | **Real World** | Creator-friendly language? ("Clip" not "Segment", "Caption" not "TextOverlay") |
| 3 | **Control** | Can user undo subtitle edits? Cancel a render? Go back from any view? |
| 4 | **Consistency** | Same button styles, same interaction patterns across all views? |
| 5 | **Error Prevention** | Can user accidentally delete a project? Overwrite a render? Schedule to wrong date? |
| 6 | **Recognition** | Are actions visible or hidden in menus? Can user find features without memorizing? |
| 7 | **Flexibility** | Keyboard shortcuts for frequent actions? Bulk operations on queue items? |
| 8 | **Minimal** | Is visual clutter removed? Progressive disclosure for advanced settings? |
| 9 | **Error Help** | Do error messages explain what went wrong AND how to fix it? |
| 10 | **Documentation** | Tooltips on icon buttons? First-use guidance for complex features? |

---

## ClipFlow View-by-View Checklist

### Dashboard / Projects View
- [ ] Project status is immediately clear (clips count, pending actions)
- [ ] Creating a new project is obvious (visible button, not buried)
- [ ] Switching projects doesn't lose unsaved work without warning
- [ ] Empty state guides user on what to do first

### Watcher / Rename View
- [ ] New recordings appear promptly with clear indication
- [ ] Rename preview shows before/after clearly
- [ ] Batch selection is intuitive (checkbox + select all)
- [ ] "Nothing to rename" state is helpful, not empty

### Editor View
- [ ] Video preview loads quickly with visible progress
- [ ] Subtitle editing feedback is immediate (changes reflect in preview)
- [ ] Timeline is navigable (click to seek, scroll to zoom)
- [ ] Panel layout is clear — user knows which panel does what
- [ ] Unsaved changes are indicated (dirty state visible)
- [ ] Tab switching (Transcript / Edit Subtitles / Captions) is discoverable

### Queue / Scheduling View
- [ ] Scheduled vs unscheduled clips are visually distinct
- [ ] Date/time picker is intuitive (not a raw text input)
- [ ] Platform targets are clear (which platforms, which accounts)
- [ ] Render status is visible (pending, rendering, done, failed)

### Settings View
- [ ] Settings are grouped logically (not a flat list)
- [ ] Changes take effect immediately or "Save" is prominent
- [ ] Path selectors work (folder picker, not manual text entry)
- [ ] Dangerous settings are separated or have confirmation

### Render Pipeline
- [ ] Progress is visible (percentage, time estimate, or at minimum a spinner)
- [ ] User can cancel a render in progress
- [ ] Failure shows what went wrong (not just "render failed")
- [ ] Success is confirmed with path to output file

---

## Accessibility — The Big 4

### 1. Keyboard Navigation
- [ ] All interactive elements reachable via Tab
- [ ] Focus order is logical (left to right, top to bottom)
- [ ] Focus indicator is visible (outline or highlight on dark backgrounds)
- [ ] No keyboard traps (can always Tab out of modals, panels)
- [ ] Escape closes modals and popups
- [ ] Enter activates focused buttons

**ClipFlow-specific:**
- [ ] Subtitle list navigable with arrow keys
- [ ] Timeline seekable with keyboard
- [ ] Editor tabs switchable with keyboard

### 2. Color Contrast
- [ ] Text meets 4.5:1 ratio minimum against background
- [ ] UI components (buttons, inputs, borders) meet 3:1 ratio
- [ ] Placeholder text is readable (not too faint)
- [ ] Focus states have sufficient contrast

**ClipFlow-specific (dark theme):**
- [ ] Muted/secondary text readable on dark backgrounds
- [ ] Active vs inactive tab distinction doesn't rely solely on subtle shade
- [ ] Selected subtitle in list is clearly distinguishable
- [ ] Disabled buttons look disabled but text is still legible

### 3. Not Color-Only
- [ ] Error states have icon AND color change (not just red border)
- [ ] Status indicators use icons/labels (not just green/red dots)
- [ ] Selected items have visual indicator beyond highlight color

**ClipFlow-specific:**
- [ ] Render status uses labels ("Done", "Failed") not just color
- [ ] Platform connection status uses icons, not just green/gray
- [ ] Dirty/unsaved state has text or icon indicator, not just color

### 4. Screen Reader Basics
- [ ] Icon buttons have aria-label (close, settings, delete icons)
- [ ] Form inputs have associated labels
- [ ] Images/thumbnails have alt text
- [ ] Headings create logical outline
- [ ] Dynamic status updates use aria-live regions

---

## User Flow Analysis

For each flow, trace BOTH paths:

### Happy Path
```
User wants to → takes action → gets feedback → reaches goal
```

### Error/Edge Paths
```
User wants to → action fails → sees error → knows how to fix → recovers
User wants to → hits edge case → system handles gracefully → user not confused
```

### Critical Flows to Audit

| Flow | Happy Path | Error Paths to Check |
|------|-----------|---------------------|
| Import video | Drop file → appears in watcher | Wrong format, too large, path with spaces |
| Edit subtitles | Click word → edit → see preview update | Empty subtitle, overlapping times, very long text |
| Render clip | Click render → progress → done | FFmpeg fails, disk full, output path invalid |
| Schedule post | Pick platform → set time → confirm | OAuth expired, past date selected, no caption |
| Switch projects | Click project → editor loads | Unsaved changes in current, missing video file |

---

## Output Template

```markdown
# UX Audit: [View/Flow Name]

## Summary
**Score:** X/10 | **Critical:** N | **Important:** N | **Suggestions:** N

## Critical Issues (Must Fix)
### 1. [Title]
**Heuristic:** #N - [Name]
**Location:** `file:line`
**Problem:** [What's wrong]
**Impact:** [How it affects users]
**Fix:** [Specific code change]

## Important Issues (Should Fix)
[Same format]

## Suggestions (Polish)
- [ ] [Item with file:line if applicable]

## Heuristic Scores
| Heuristic | Score | Notes |
|-----------|-------|-------|
| 1. Visibility | X/10 | |
| 2. Real World | X/10 | |
| 3. Control | X/10 | |
| 4. Consistency | X/10 | |
| 5. Error Prevention | X/10 | |
| 6. Recognition | X/10 | |
| 7. Flexibility | X/10 | |
| 8. Minimal Design | X/10 | |
| 9. Error Help | X/10 | |
| 10. Documentation | X/10 | |

## Accessibility
- Keyboard: PASS / FAIL
- Contrast: PASS / FAIL
- Not color-only: PASS / FAIL
- Screen reader: PASS / FAIL
```

---

## Severity Ratings

| Level | Meaning | Action |
|-------|---------|--------|
| **Critical** | Blocks task completion or causes data loss | Fix before release |
| **Important** | Significant confusion, workaround exists | Fix soon |
| **Suggestion** | Polish, minor friction | Fix when convenient |

---

## Anti-Patterns

| Don't | Do |
|-------|-----|
| "It's intuitive" | Test with fresh eyes — pretend you've never seen ClipFlow |
| Ignore error paths | Audit what happens when things go wrong |
| Skip accessibility | Check the Big 4 minimum |
| Vague issues ("UI is confusing") | Specific `file:line` + concrete fix |
| Treat all issues equally | Prioritize by user impact |
| Audit everything at once | Focus on one view or flow per audit |

---

## Quick Scan (5 min)

For fast assessments when reviewing a screenshot or a single view:

```markdown
| Area | Status | Notes |
|------|--------|-------|
| Clarity | G/Y/R | Can user immediately understand what to do? |
| Feedback | G/Y/R | Does the UI respond to actions? |
| Errors | G/Y/R | Are error states handled? |
| Accessibility | G/Y/R | Keyboard + contrast OK? |
| Consistency | G/Y/R | Matches other ClipFlow views? |
```
