---
name: clipflow-ui-debug
description: Use when fixing ANY UI/CSS bug, layout issue, or visual problem in ClipFlow. Triggers on screenshots of broken UI, CSS sizing problems, Tailwind class issues, dark theme bugs, Radix/shadcn component issues, or any visual regression. MUST be used before proposing any CSS fix.
---

# ClipFlow UI Debug Skill

You are fixing a UI bug in ClipFlow, an Electron + React desktop app: main views use inline styles from the `T` theme object, the editor uses Tailwind + shadcn/ui, and every surface must work in both dark and light themes.

## Screenshot Analysis

When the user sends a screenshot of a UI bug, first describe what is wrong in concrete visual terms ("the input stretches to fill the container width", not "the input has too much padding"), then map that symptom to the property that produces it:
   - Element fills container width → `flex-1`, `flex-grow`, `width: 100%`, `flex: 1 1 0%`
   - Element overflows container → `overflow` not set, missing `min-w-0` on flex child
   - Element is too tall/short → `h-*` or `min-h-*`, NOT padding
   - Element has wrong spacing → margin/gap, NOT padding (unless internal)
   - Text is unreadable → `text-*` size class, NOT opacity

If the first fix doesn't change what the screenshot shows, the diagnosis is wrong: re-diagnose with a different property instead of tweaking the same one again.

## Layout Debugging Checklist

Before touching `padding` or `margin`, always check these first:
- [ ] Is `flex-1` or `flex-grow` forcing the element to stretch?
- [ ] Is `w-full` or `width: 100%` making it fill its container?
- [ ] Are ResizablePanel `defaultSize` values adding up to 100%? (They MUST sum to 100)
- [ ] Is `min-w-0` missing on a flex child that should shrink?
- [ ] Is `overflow: hidden` on the outer container?

## Theme Rules

- The theme is `[data-theme]` on `<html>` (palettes in `src/renderer/styles/themes.css`); Radix portals inherit it through `<body>`, so portal content needs no extra class.
- Use semantic classes (`bg-popover`, `border-border`) or `T` tokens — never a `dark` class or hardcoded neutral HSL, which break the light themes.
- Check any colour change in a light theme as well as a dark one.

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

- **JS-measured, JS-set pixel widths must be OUT of flow (#215, session 139).** `canvas.style.width = wrap.clientWidth` is safe only in a container whose width is imposed from outside. Radix's ScrollArea wraps viewport children in `min-width:100%; display:table`, and a table box is sized by its CONTENT — so the painted width became a floor on the row width, and the ~130px of buttons the hovered row adds widened the shared box, which made every other row measure wider, repaint wider, and widen it again (~138px per hover pass, unbounded; waveforms visibly "zooming"). Put any JS-sized canvas at `absolute inset-0` inside a `relative overflow-hidden` parent so it cannot feed its own measurement. Separately, when rows must be clamped to the panel instead of sizing to content, flip that injected wrapper with `[&_[data-radix-scroll-area-viewport]>div]:!block` **on that ScrollArea only** — never in `ui/scroll-area.tsx`, which every panel shares. Symptom to recognise: content wider than the viewport with no horizontal scrollbar (only a vertical ScrollBar is rendered), so overflowing controls are invisible rather than reachable.

- **Never compose an alpha by string-appending a hex suffix to a `T` colour (session 220).** `` `${T.green}33` `` was valid 8-digit hex before #328; since then every `T` value is a `var(--x)` string, so the result is invalid CSS and the browser drops the WHOLE declaration silently — no error, no fallback, the tint/border/glow just vanishes (18 sites shipped broken in alpha.10 this way). Use the `Dim`/`Border` tokens for washes and borders, or `color-mix(in srgb, ${T.x} N%, transparent)` for an exact alpha. After any token migration or before shipping theme-adjacent work, grep the concat classes: `\$\{T\.\w+\}[0-9a-fA-F]{2}` and `T\.\w+\s*\+\s*"`. (Game colours from gamesDb are literal hex — `${color}33` on THOSE is still fine.)

- **Label or content? Style for what it is (#364, session 242).** Free text the user is meant to READ BACK (a rejection note, a reason) gets its own full-width row, wraps, and is never truncated — an ellipsis on the one element whose job is to be read defeats the feature, and a hover `title` is no substitute. Free text the user TYPES gets a wrapping textarea that grows with the content (`field-sizing: content`, Enter to save), never a single-line `<input>` that scrolls the start of the sentence out of view. Chips are for labels; a sentence is content.

- **A `fixed` menu inside a z-indexed ancestor is trapped in that stacking context, so portal it to `<body>` (s273, #459).** The editor top bar is `relative z-10`. The Re-transcribe menu (`fixed z-[100]`) inside it drew UNDER the preview's Fit control, while every DOM check (menu exists, items clickable via `.click()`) passed. Only the screenshot showed it. Use `createPortal(…, document.body)` (the CropDialog pattern); theme variables live on `<html>`, so `bg-popover` still resolves. Verify with `document.elementFromPoint` on the first row plus a screenshot, never by existence.
  Same fix for a `fixed` element inside a TRANSFORMED ancestor (s277, #469): a `transform` (even a 1px hover lift) makes that ancestor the containing block for `fixed` children, so viewport coordinates land relative to the card and its `overflow:hidden` clips them. The Tracker's game picker opened at x = −789. Portal it.

- **Many-at-a-glance screens are sized from the window, not fixed widths (s277, #467).** A grid or panel whose job is showing a lot at once fits the usual item count into the VISIBLE height (tile width from pane width × height), and a side panel's preview grows to the panel's height. Before showing a mock or build, screenshot at Fega's 2000×1125 AND 1280×860 and look for empty regions, not just overflow. Fega: empty space "makes it look like Corva isn't finding a lot of clips".
- **Resizing an element keeps its visual treatment exactly (s277, #466).** Making the Tracker calendar fill the window was not permission to restyle its cards. Adding a thumbnail hid the corner glow and flattened the look ("a huge let down"). Keep gradient, border, colour and type unless asked. Put the old and new element side by side in a screenshot before shipping. Glows sized in px shrink on wider cards, so size them in % of the card.
