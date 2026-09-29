# React switch: design, touchpoints and edge cases (#474)

Status: **design draft (s279, 2026-09-29), not approved.** For Fega and Wick to decide the open questions in section 6 before any build.

## 1. What it is

Next to a game in every recording picker there is a **Reacting** switch. Turned on, the recording is labelled with that game's **reaction entry** instead of the game.

- A reaction entry is an ordinary content type (`entryType: "content"`) with one new field, `reactsTo: "<game tag>"`.
- The first time the switch is used for a game, the entry is created automatically.
- Every later use reuses it.
- Named shows (100T Valorant Reacts) are content types linked the same way.
- Content types that aren't about a game (Just Chatting, Robot Olympics Reacts) are unchanged.

Why a separate entry and not a flag on the recording? A reaction really does differ from gameplay in each thing Corva keys on the entry:

| Keyed on the entry | Gameplay | Reaction |
|---|---|---|
| Detection context | game knowledge + play-style profile (`ai-pipeline.js:795`, `ai-prompt.js:91`) | "CONTENT CONTEXT" built from the entry's note (`ai-pipeline.js:804-805`, `ai-prompt.js:90-98`) |
| Day / Pt counter | per tag (`RenameView.js:665-702`) | its own sequence |
| Learning (feedback rows) | per tag (`feedback.js:270`, `:285`) | kept separate, so gameplay taste doesn't train reaction picks |
| Reject reasons | gameplay chips | adds "Reaction added nothing" (`rejectReasons.js:116`, `:221`) |
| YouTube description and tags | per name (`App.js:718`) | its own |

A flag on the recording would have to thread through all five. Reusing the content-type model means the switch is mostly a better way to *pick* an entry, plus one link field.

## 2. Build pieces (v1)

1. **Link field.** Add `reactsTo` (game tag) to gamesDb entries, with a store migration. Link the existing entries once: GTA6 Reacts → `GTA6`, Rocket League Reacts → `RL`. Ask Fega about 100T Valorant Reacts → `Val`, since it's a named show.
2. **Switch in the pickers.**
   - Rename tab: the per-session picker (`RenameView.js:1872`) and the bulk "Set Game" menu (`:2154-2170`). Both write through `setGameForRows` (`:805-815`).
   - Recordings drop modal (`UploadView.js:948-964`).
   - Clip retag menu in Projects (`ProjectsView.js:904-910`).
   - Split markers in the scrubber (`ThumbnailScrubber.js:46-59`), so one recording can be gameplay then reaction.
   - Leave alone: the Queue import modal (flat list by name, `ImportReviewModal.js:165-170`) and the editor's title-steer select (`RightPanelNew.js:855`). Reaction entries already appear there by name.
3. **Auto-create.** Must replicate `handleNewGame` (`App.js:710-746`) for content:
   - `dayCount: 0`, no research, no art fetch.
   - Name `<Game> Reacts`; inherit hashtag and colour (see Q2).
   - A starter note: "I react to <game> content: news, trailers, esports and clips."
   - A YouTube description seeded from **the game's own** description and tags, with a reaction first line and "reaction" tags added. Don't use `ytDescriptionTemplate.js`, which is gameplay-flavoured.
   - A free tag, `<TAG>-R`. Nothing checks uniqueness today (`modals.js:83`, `handleNewGame`), so auto-create must check both tag and name case-insensitively.
4. **AI context uses the link.**
   - Detection: for a linked entry, CONTENT CONTEXT = the entry's own note **plus** the game's `aiContextAuto`, framed as "the game being watched". Don't copy `aiContextAuto` onto the reaction entry: `gameContext = aiContextAuto || aiContextUser` (`ai-pipeline.js:804-805`) would then drop the reaction note entirely.
   - Titles and captions (`main.js:4236-4263`, `useAIStore.js:86-96`): feed the linked game's knowledge as "Game Knowledge". Relabel the entry's note from "Play Style" to "What this content is" for content entries.
   - Never read or write the game's play-style profile or feedback for reaction clips. This is #336's rule.
5. **Game art.** A linked reaction entry shows its game's art (`game-art.js:23-28` is keyed by the name slug, so pass the game's name). Today content entries show none.
6. **Prerequisites** (filed separately, fix first):
   - #476: filename parsers reject `-` in tags, so `GTA6-R`/`RL-R` files are invisible to reconcile.
   - #477: manual Tracker logs store the hashtag, so reactions resolve to their game.
   - #475: tag edits orphan history. A linked game's tag edit must carry `reactsTo` along with it.

## 3. How detection fits

- **Exe detection** needs the game in the foreground (`game-detect.js:112-123`). A browser reaction never matches, so the row falls back to the last-renamed game or the main game (`RenameView.js:435-438`, `:654-661`).
- **The Gemini sniffer** only proposes games (`main.js:1760`), and it re-tags an untouched row on a high-confidence match (`RenameView.js:494`). Its prompt asks it to return unknown for "a video being watched" (`game-detect.js:168`), but nothing enforces that. So a full-screen Rocket League trailer can come back as the Rocket League *game*.
- **v1:** manual. The row says Rocket League, and you flip Reacting.
- **v2 (deferred):** the sniffer also answers "playing or watching?" and pre-flips the switch when the answer is watching. It needs its own accuracy check before it's trusted, the same way the game sniff was.

## 4. Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | Game has two linked reaction entries (a default bucket + a named show) | The switch uses the default. A small arrow on the switch lists the others. One entry per game is marked default (Q3). |
| 2 | Auto-create finds an unlinked entry with a similar name ("GTA6 Reacts" vs "GTA 6 Reacts") | Offer "Use GTA6 Reacts?" before creating. Never make a silent duplicate. |
| 3 | The tag `<TAG>-R` is taken | Try `<TAG>-R2`, and so on. Show the tag in the confirm toast. |
| 4 | Game tag near the reconcile cap (8 characters) | `SCoG-R` is 6 characters, fine. Raise the cap in #476 to cover the longest tag plus 2. |
| 5 | Reacting to a game not in the library (e.g. an unannounced sequel) | The switch can't help. Use a content type, and make that path easy (#337: add from the Rename tab). Don't add a hidden "game" entry just to hang a reaction off it. |
| 6 | A roundup covering several games | A general content type (Just Chatting or a news show). Out of scope. |
| 7 | One recording: plays, then reacts | Split markers get the switch (piece 2). Each part gets its own entry and Day. |
| 8 | Gameplay and a reaction on the same day | Independent Day counters: `RL Day21 Pt1` and `RL-R Day1 Pt1`. Nothing collides. |
| 9 | Last-renamed default after a reaction | The next row would default to the reaction entry. Q4 decides whether it should fall back to the game. |
| 10 | Retagging a clip from gameplay to reaction in Projects | Retag writes `gameTag` (`ProjectsView.js:910`). Its feedback rows keep the old tag. Decide whether a retag moves the clip's learning rows (Q5). |
| 11 | The game is renamed, retagged or deleted | Link by tag. #475's migration updates `reactsTo`. If the game is deleted, the reaction entry stays as a plain content type with the link dropped. |
| 12 | The game is set inactive | `active` isn't filtered in pickers today (Rename, Upload, Projects), so the switch still works. Fine as is. |
| 13 | The reaction entry is edited in Settings | It's an ordinary content type: note, description and colour are editable. Show "Reacts to: Rocket League" read-only, with an Unlink option. |
| 14 | Fresh customer install, no games yet | No switch to show. The first game added gets it automatically. |
| 15 | A new reaction entry has no learning | Accepted for v1. Later idea: reaction-style lessons shared across all reaction entries ("reaction added nothing" patterns aren't game-specific). Needs a detection-science check before shipping (#231 rules). |
| 16 | Title voice examples | Matched by tag, hashtag or name (`main.js:4248-4252`). A shared hashtag lets gameplay titles steer reaction titles and the other way round. Match by tag only for linked entries. |
| 17 | Hashtag resolution in `captionResolve.js:36-39` | Auto-posted clips carry the tag and resolve correctly. Only legacy title-hashtag fallbacks (`:24`) hit the collision, so it's acceptable. #477 fixes the Tracker side. |
| 18 | Main/variety share in the Tracker | Do reactions to the main game count as main? (Q6) |
| 19 | Settings list | Show linked reaction entries nested under their game in Content Types, so the list doesn't turn into a wall of "X Reacts". |

## 5. Not in v1

- Sniffer "watching vs playing" (section 3, v2).
- Shared reaction learning (edge case 15).
- A switch in the Queue import modal and the editor's title-steer select.

## 6. Open questions (Fega / Wick)

1. **Which reaction entries link to a game?** GTA6 Reacts → GTA 6 and Rocket League Reacts → Rocket League are clear. 100T Valorant Reacts → Valorant?
2. **Colour.** Same colour as the game plus a small "React" badge (reads as "still Rocket League"), or its own colour (as the existing ones have)?
3. **One default per game?** One default reaction bucket per game, with named shows as extras behind the arrow?
4. **Next-row default after a reaction.** Stay on the reaction, or go back to the game?
5. **Retag learning.** When a clip is retagged between gameplay and reaction, should its approve/reject history move with it?
6. **Main-game share.** In the Tracker, do reactions to your main game count toward the main-game share?
