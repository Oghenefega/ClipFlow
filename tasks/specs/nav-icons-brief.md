# Corva nav icons: generate a colourful set in ChatGPT (brief for Wick)

**Asked by:** Fega, 2026-10-02 (dev session 284, issue #485, the Rename and Projects layout revamp).
**Owner:** Wick runs the generation and gets Fega's pick. A dev session then cuts the images into the app.
**Why:** Corva's bottom tab bar uses thin grey line icons. Fega wants it to feel exciting for creators: "custom very good looking colorful icons, minimal but good looking". The bar keeps its current place at the bottom of the window.

## How to run ChatGPT

Fega's other agents already drive ChatGPT in his Chrome. The method is written up in the vault skill
`.claude/skills/thumbnail-build/SKILL.md` (steps 1 and 2) and `references/chrome-snippets.md`:
- Claude in Chrome tools, with ChatGPT already logged in on his Chrome.
- `scripts/receiver.py` saves renders straight to disk, because ChatGPT downloads don't work otherwise.
- Send in parallel chats **2 seconds apart**. Sends that land together get his ChatGPT rate-limited.

If any of that is unclear, ask Nero how Mushu and Lucius have been doing it. Fega does not want to copy prompts by hand.

## The eight icons

They appear in the bar in this order. Each line gives what the tab does, then a suggested picture. The pictures are suggestions only; clear and simple matters more.

| # | Tab | What it does | Suggested picture |
|---|---|---|---|
| 1 | Rename | New stream recordings land here to get their proper names | a pencil, or a pencil over a file |
| 2 | Recordings | The library of named recordings, where clips get generated | a film strip, or a record button |
| 3 | Projects | Each recording's generated clips, to watch and keep or reject | a folder with a play triangle |
| 4 | Editor | Edits one clip: subtitles, captions, cuts | a clapperboard, or scissors |
| 5 | Queue | Kept clips waiting to be scheduled and posted | stacked cards, or a paper plane |
| 6 | Tracker | Calendar of what posted when | a calendar |
| 7 | Analytics | Views per clip across platforms | a rising chart |
| 8 | Settings | App settings | a gear |

## Style direction

- **One family.** The eight must look like a set: same tile shape, same lighting, same glyph weight. Generate them **all on one sheet in one image**; separate generations drift apart.
- **Tile + glyph.** Each icon is a rounded-square tile (squircle) filled with a soft gradient in its own colour. On it sits one bold, simple glyph in white or a very light tint, with a subtle top highlight and a gentle inner glow. Think premium app icon, not clip art.
- **Colour.** Each tab gets its own hue, and the eight hues should feel like one palette, not a rainbow of primaries. Corva's accent is violet `#8b5cf6`; the app background is near-black `#0a0b10`. Clip state colours already used in the app: cyan `#22d3ee` (published), green `#34d399` (kept), amber `#fbbf24` (scheduled), orange `#f97316` (queued), red `#f87171` (rejected). Avoid Rename and Projects landing on the same hue.
- **Minimal.** Each icon is shown at about **26 to 32 px**. Bold shapes, at most 2 to 3 elements per glyph, no thin lines, no tiny details, **no text or letters**, no brand logos.
- **Mood references.** Fega's Pinterest picks: dark glassy UI with soft light, small coloured tiles with bright glyphs (a "Choose offer type" card with green icon tiles), and a sidebar with a glowing pink active marker. Generic SaaS line icons or flat emoji are the wrong direction.

## Prompt to start from (sheet, round 1)

> A cohesive set of 8 app navigation icons on one sheet, arranged in a 4 by 2 grid with generous even spacing, on a plain near-black background (#0a0b10). Each icon is a rounded-square tile (iOS-style squircle) filled with a soft, rich gradient in its own colour, with one bold, minimal white glyph centred on it, a subtle glossy highlight along the top edge and a gentle inner glow. Premium, modern, playful but clean, designed for a dark desktop app for gaming content creators. All 8 share the exact same tile shape, size, lighting, corner radius and glyph stroke weight. Glyphs, in order: 1 a pencil, 2 a film strip, 3 a folder with a small play triangle, 4 a clapperboard, 5 a paper plane, 6 a calendar, 7 a rising line chart, 8 a gear. Tile colours, in order, forming one harmonious palette: violet, electric blue, magenta-pink, amber, cyan, coral red, emerald green, slate lavender. Bold simple shapes that stay readable at 28 pixels. No text, no letters, no logos, no shadows outside the tiles, no extra decoration.

Run it in **3 chats** for 3 takes. In the other two chats, vary only the finish:
- **(b)** "matte, softer gradient, no gloss"
- **(c)** "the glyph is a light tint of the tile colour instead of white, slightly 3D"

## Process

1. **Round 1:** 3 sheets as above. Show Fega the three side by side in one review picture and ask which finish he likes, or which icons from which sheet.
2. **Round 2:** regenerate one final sheet in the chosen finish. Fix any weak glyph by editing that sheet ("keep everything identical, change only icon 5 to …") rather than generating a new one.
3. **Transparent cut:** ask ChatGPT for the final sheet with a **transparent background** (PNG). If it refuses, the dark background is fine: the dev session will cut the tiles out.
4. **Legibility check before calling it done:** shrink the sheet so each tile is 28 px and look at it. If a glyph turns to mush at that size, simplify it.

## Deliver

- Save all round-1 sheets and the final sheet to `C:/Users/IAmAbsolute/Desktop/ClipFlow/tasks/mocks/ui-revamp/icons/`, named `ChR icons r1 a.png`, `ChR icons r1 b.png`, `ChR icons r1 c.png` and `icons final.png`.
- Write Fega's pick and any notes in the same folder as `README.md`. If he chose individual icons from different sheets, record which icon came from which sheet.
- Then tell Fega the icons are ready for the dev session. The dev side (cutting each tile out, sizing at 1× and 2×, dimming inactive tabs, the active state) is not part of this brief.

## Out of scope

Changing the bar's layout, adding or removing tabs, and the app logo. The Crescent mark work in `Brand/` is a separate thread.
