---
name: clipflow-ui-debug
description: Use when fixing ANY UI/CSS bug, layout issue, or visual problem in ClipFlow. Triggers on screenshots of broken UI, CSS sizing problems, Tailwind class issues, dark theme bugs, Radix/shadcn component issues, or any visual regression. MUST be used before proposing any CSS fix.
---

# ClipFlow UI Debug Skill

You are fixing a UI bug in ClipFlow, an Electron + React desktop app with Tailwind CSS 3 + shadcn/ui on a dark theme.

## MANDATORY: Screenshot Analysis Protocol

When the user sends a screenshot of a UI bug, you MUST follow this exact sequence:

1. **STOP and study the screenshot for 10 seconds.** Describe what you see wrong in concrete visual terms (e.g., "the input is stretching to fill the full container width" NOT "the input has too much padding").
2. **Ask: what CSS property causes THIS exact visual behavior?** Map the visual symptom to the correct CSS property:
   - Element fills container width → `flex-1`, `flex-grow`, `width: 100%`, `flex: 1 1 0%`
   - Element overflows container → `overflow` not set, missing `min-w-0` on flex child
   - Element is too tall/short → `h-*` or `min-h-*`, NOT padding
   - Element has wrong spacing → margin/gap, NOT padding (unless internal)
   - Text is unreadable → `text-*` size class, NOT opacity
3. **If a fix doesn't work on the first try, the diagnosis is WRONG.** Do NOT tweak the same property. Re-examine the screenshot. Re-diagnose from scratch with a different property.
4. **Mentally simulate the fix before applying.** Will changing this property actually address what the screenshot shows?

## Layout Debugging Checklist

Before touching `padding` or `margin`, always check these first:
- [ ] Is `flex-1` or `flex-grow` forcing the element to stretch?
- [ ] Is `w-full` or `width: 100%` making it fill its container?
- [ ] Are ResizablePanel `defaultSize` values adding up to 100%? (They MUST sum to 100)
- [ ] Is `min-w-0` missing on a flex child that should shrink?
- [ ] Is `overflow: hidden` on the outer container?

## Dark Theme Rules

- Background: `#0a0b10` (app), `#111218` (cards/surfaces)
- All Radix portal-rendered content (Popover, Dialog, Select) renders OUTSIDE the `dark` class ancestor
- Fix: Add `className="dark"` directly on every `PopoverContent`, `DialogContent`, `SelectContent`
- Also hardcode dark HSL values: `bg-[hsl(240_6%_10%)] border-[hsl(240_4%_20%)]`

## Radix/shadcn Component Rules

- NEVER nest PopoverTrigger inside TooltipTrigger (or vice versa) — they conflict on click events. Pick one.
- shadcn Slider renders ONE thumb by default. For dual-thumb (range), modify slider.tsx to render N thumbs from `value` array length.
- shadcn components are minimal wrappers. Always check the component source before assuming a feature works.

## Text Readability Standards

- Minimum 12px (`text-xs`) for labels, metadata, timecodes
- Minimum 14px (`text-sm`) for body content, segment text
- NEVER go below 11px for anything the user needs to read
- On dark backgrounds, use `text-foreground/90` not `text-foreground/50` for body text

## Visual Indicator Standards

- Indicator dots: minimum 7-8px with `boxShadow` glow (e.g., `0 0 6px 2px ${color}88`)
- Toggle states: Green = on, gray/red = off. Never green for both states.
- One color per concept. Don't add a new highlight color if an existing one communicates the same info.
- Active word highlight: `bg-primary/20 text-primary font-semibold` — consistent across all tabs.

## Scrollbar Overflow Pattern

```
Outer container: overflow: hidden + borderRadius
Inner container: overflow-y: auto
```
Any container with `borderRadius` + scrollable content needs this pattern.

## Common Traps

- `flex-1` makes elements stretch to fill — this is a LAYOUT issue, not a PADDING issue
- ResizablePanel sizes must sum to 100% — if they don't, the library normalizes proportionally and your intended sizes are wrong
- Dropdowns with >20 options are bad UX — split into grouped sections
- Don't add UI controls that duplicate existing ones — check first, merge if overlap exists

## Distilled Lessons (gaps)

- **React synthetic `stopPropagation` does NOT stop native `window`/`document` listeners.** `onMouseDown={e => e.stopPropagation()}` only blocks other React handlers; a `window.addEventListener('mousedown')` still fires. Use a `data-*` attribute + `e.target.closest('[data-menu]')` check in the window handler instead.
- **`overflow: hidden` clips absolutely-positioned submenus** (e.g. a color picker at `left: 100%`). Use `overflow: visible`, or render the submenu outside the parent. Don't put `overflow: hidden` on a container whose children extend beyond its bounds.
- **Collapsed panels must leave the layout, not just hide.** `maxHeight: 0` inside a `ResizablePanelGroup` still reserves the panel's percentage. To actually release space, conditionally render / remove it from the flow.
- **Thumbnails match content aspect ratio.** Vertical gaming clips are 9:16 — use `aspect-ratio: 9/16` + `object-contain`, never a 16:9 `aspect-video` container (center-crops/zooms).
- **Large lists use native scrolling.** `overflow-y: auto` + `max-height`, NOT shadcn `ScrollArea` (no mouse-wheel support). Always test with the real item count, not 3-4 items.
- **Text-heavy left panel needs a generous default width (~35%),** not 25% — a narrow default squishes the transcript/subtitle reading column.
- **Scores show a scale** — `X/Y` or `X.X/10`, never a raw number with no context (`28` tells the user nothing).
- **Technical IDs/hashes go in detail/expanded views,** not list summaries.
- **A subtitle/caption VISUAL symptom can come from the animation layer, not the markup.** A highlighted word with `transform: scale()` (pop/grow) expands over its neighbor and can erase apparent spacing, fake clipping, or shift position — all WITHOUT changing layout. Before blaming CSS/markup/data for a visual subtitle bug, check the scale/grow animation (`animateScale`, `transform-origin`) and reproduce with the animation OFF to separate a real markup bug from a transform artifact. Both can coexist (#120: a genuine no-space markup bug AND the pop masking it — fix the markup, but know the pop is what the user sees).
- **Don't build small UI glyphs/icons from a system FONT — draw them as SVG.** A font glyph (e.g. `fontFamily:"Georgia"; fontStyle:italic` for an info "i") is at the mercy of font availability + the fallback chain, so it renders differently in a browser mockup vs the Claude preview vs the packaged Electron app — "looks right in the mockup" proves nothing. Use an inline `<svg>` path so it's pixel-identical everywhere; reserve `font-family` for real body/label text (only DM Sans + JetBrains Mono are reliably bundled). Verify glyph designs in the target Electron app, not just a browser mock. Timebox micro-polish: >2 mockup rounds on a tiny element → ship a sane default (#125/#126, session 70).
- **A custom tooltip must reproduce native `title` behaviour, not just its look:** a deliberate hover show-delay — ClipFlow uses **~1.5s** (Fega found the native-ish ~500ms too eager, session 67); set via `setTimeout`, cancelled on `mouseLeave` with a cleared ref — and default placement BELOW the anchor (flip above only when there's no room below). Render it fixed-position OUTSIDE the card so `overflow:hidden` can't clip it, and `pointerEvents:'none'` so it can't flicker. Replacing any native control means re-implementing its behavioural defaults, not just its styling (#122: shipped instant + above → Fega flagged both; then 500ms → 1.5s in session 67).
- **Hold every view to the legibility bar, not just "it renders" (session 79, Queue card pass).** Text the user must READ is ≥11–12px and never `textTertiary` (0.32-alpha) — that grey is for truly incidental hints only; use `textSecondary` (0.55) or the `labelStrong` (0.68) token for real section labels. An editable value must LOOK editable (bordered/tinted field + an explicit Edit affordance), placed near the top of its card, with its reset/cancel reachable without first discovering edit mode. Re-case identifiers for DISPLAY (`.toUpperCase()`) at the render site even when stored lowercase for logic, and keep casing consistent with how the same id appears on other tabs (game tag was lowercase in Queue, uppercase in Rename/Recordings). On a desktop app, use the window width — don't pin content to a narrow centered column (Queue was capped at 860px on a fullscreen window). And mock aesthetic-sensitive UI in HTML for Fega before writing React.
- **Hide pipeline internals from the publish/progress UI (session 79).** A per-platform publish status that echoed the raw upload `detail` ("Uploading chunk 1/8 … 8/8") read as noise — show a single clean "Processing…" for the whole publishing window instead. End users don't want the chunk/stage play-by-play (cf. #74).
- **All UI text is DM Sans — mono fonts are BANNED app-wide (session 101).** Fega hates mono digits (JetBrains Mono's dotted zero: "basic and uglyish"). `T.mono` and Tailwind `font-mono` deliberately resolve to DM Sans — the token names survive but render sans; never point them back at a mono stack or introduce a new mono font for timecodes/stats/filenames ([[feedback_dm_sans_only]]).
- **Clip/review cards: thumbnail = footage only; metadata in the content area; clickable actions next to the clip (session 89, Projects-tab redesign).** Don't overlay rating/score/status on the video thumbnail — it reads as clutter; the thumbnail shows footage plus at most a duration pill. Put READ-ONLY metadata where the current app already has it (score by the title, status as chips in the meta line). Put CLICKABLE actions (approve/reject, Open in Editor) ADJACENT to the clip/content, NEVER in a far-right column — on a wide desktop window the mouse-reach cost is real (Fega: "all the way to the right just to click it… bad changes"). For vertical 9:16 clips the preview must be big enough to actually watch even though that makes taller cards; whitespace beside a short transcript is an acceptable trade-off, not a defect (Fega confirmed). Mock in HTML and iterate with Fega before building ([[feedback_ui_density_aesthetic]]).
