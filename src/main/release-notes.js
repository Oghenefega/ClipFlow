// #330: user-facing What's New entries, NEWEST FIRST. Shown once on the first
// launch after an update (see whatsnew:get in main.js). These are read by
// customers — write them in plain product language (what changed for THEM),
// never commit-speak. CHANGELOG.md stays the dev-audience record; this file is
// the curated subset worth announcing.
//
// The "unreleased" entry collects the current batch between cuts. The release
// loop (clipflow-update-launcher skill) renames it to the real version and
// stamps the date at cut time — "unreleased" itself is never shown to users.
//
// Shape: { version, date: "YYYY-MM-DD", added: [], changed: [], fixed: [] }.
// Omit any empty section.
module.exports = [
  {
    version: "0.4.0-alpha.17",
    date: "2026-09-01",
    added: [
      "A clip's layout can now change at a cut. Once a clip has a cut in it, the Layout panel offers \"This section / This clip\": pick \"This section\" and whatever you set up, apply from your saved layouts, or detect goes to just the part of the clip the playhead is in — so a clip can play wide before a cut and punched-in after it. The switch happens exactly at the cut, in the preview and in the rendered video, and a small badge on the timeline marks any section that has its own layout. You can also switch a single section's layout off (\"No layout for this section\"); it then shows the whole picture letterboxed so the video never changes size mid-clip. Splitting or trimming a section keeps its layout, and \"Apply to all clips in this project\" clears section layouts along with the rest.",
    ],
  },
  {
    version: "0.4.0-alpha.16",
    date: "2026-09-01",
    added: [
      "Layouts are now per clip. Applying a layout in the editor changes only the clip you're in — the rest of the project keeps its own look. The Layout panel shows whether the clip uses its own layout (\"This clip only\") or the project's (\"All clips\"), and a new \"Apply to all clips in this project\" button does what applying used to do. You can also switch a single clip's layout off entirely — handy when one clip needs a totally different framing, like a reaction to a vertical video.",
      "\"Detect layout\" now studies the clip you have open instead of sampling the whole recording, so the boxes it proposes come from that clip's actual footage.",
    ],
    fixed: [
      "A new clip that reuses a title you've already published no longer vanishes from the Queue and pretends it went out. It shows up and publishes like any other clip.",
      "Two clips in the same project with the same title no longer overwrite each other's Shorts thumbnail when you use the editor's screenshot button.",
    ],
  },
  {
    version: "0.4.0-alpha.15",
    date: "2026-08-31",
    added: [
      "Each game can now carry its own tag line for TikTok, Instagram and Facebook. Type it once on the new \"Game tags\" row in the Queue's captions panel — say #vct #100thieves #100T — and every clip of that game gets those tags added on all three platforms automatically. No more pasting the same hashtags into caption after caption.",
    ],
    changed: [
      "The Queue tab got a layout pass: the Captions & Descriptions panel is wider, the stat cards and clip rows are tighter, and the page scrolls a lot less. Scheduled clips also stopped showing their date twice — one column now shows the date, or a status pill when something is actually happening (publishing, failed, published, not rendered).",
      "Everything in the captions panel is click-to-edit now: click straight into the description, the tags, a platform template, or the game tag line, and clicking away saves it — a small \"Saved ✓\" confirms. Escape backs out without saving. The Edit buttons are gone, and the copy button sits next to the description where you'd look for it.",
      "The automatic game hashtag in TikTok, Instagram and Facebook captions is now the game's full hashtag (like #100thieves) instead of its short code (like #1oot). The per-game YouTube Title box is gone from the panel — it never did anything; clips always publish under their own titles.",
      "The render progress popup now just shows the percentage under the bar instead of technical play-by-play like \"Rendering subtitle frame 391/392\".",
    ],
    fixed: [
      "AI captions no longer come back with a stray \" / \" in them. The slash was never meant to be text — it was how the AI was shown where a caption's line break goes, and it started typing it out literally. Captions now arrive with real line breaks, and the suggestion card shows them stacked the way they'll appear on the video.",
      "The three captions are no longer just the three titles reworded. Only the first card is deliberately shared between a title and a caption — the strongest line shouldn't be wasted on one surface — but cards two and three are now their own ideas, so a generation gives you five distinct angles instead of three.",
    ],
  },
  {
    version: "0.4.0-alpha.14",
    date: "2026-08-30",
    added: [
      "Settings has a new About section. It shows the version you're on, a \"Check for updates\" button so you no longer have to restart Corva to find out if there's a new one, and a \"View release history\" button that re-opens everything past updates changed — including this screen's older entries — any time you want to look back.",
      "Four new themes join the picker: Graphite (neutral grey with steel-blue highlights), Forest (dark green with an emerald glow), Amethyst (dark purple through and through), and Paper (a soft warm light theme for anyone who found Daylight's white too bright).",
    ],
    fixed: [
      "Buttons across the editor have their rounded corners back. The theme update accidentally dropped the one setting that controlled corner roundness, which quietly squared off the save button, the queue button, play/pause and about eighty other spots.",
    ],
  },
  {
    version: "0.4.0-alpha.13",
    date: "2026-08-30",
    changed: [
      "The game dropdown in the editor's AI panel now only steers the titles it writes. Picking a different game there used to quietly re-file the clip under that game — it would change banners in the Queue and publish with that game's tags. Now it just tells the AI what to write about, and nothing else moves. To actually change what a clip is filed under, use the tag pill on the clip in the Projects tab, where you can see it happen.",
      "Clip detection now reads a content type's description. Content types (like Just Chatting or a watch-party show) have a field in Settings → Games → Edit → AI Context — now called \"About This Content\" — and what you write there reaches the AI that picks your clips, so it knows it's watching a Valorant match or GTA 6 footage instead of guessing from your voice alone. Games are unchanged; this was already how their researched knowledge worked.",
    ],
  },
  {
    version: "0.4.0-alpha.12",
    date: "2026-08-30",
    changed: [
      "YouTube tags are now edited as tags, not as one long line of text. Clicking the tag box used to flatten everything into \"tag one, tag two, tag three\", so getting rid of one meant hunting for it mid-sentence and holding backspace. Now each tag stays its own block with a small ✕ on it — one click removes it. Type a word and press comma or Enter to add one, paste a whole comma-separated list and it splits itself up, and backspace on an empty box takes the last one off. There is also a \"Clear all\" button for starting a set from scratch. If you change your mind, Escape (on a clip) or Cancel (in Captions & Descriptions) puts the list back exactly as it was. This applies both to a single clip’s tags on the Queue and to a game’s default list in Captions & Descriptions.",
    ],
  },
  {
    version: "0.4.0-alpha.11",
    date: "2026-08-29",
    fixed: [
      "A batch of colour touches that quietly went missing when themes arrived are back: the yellow and red warning banners have their tint again, the update banner has its purple wash, and the Tracker's auto-posted dots glow like they used to.",
    ],
  },
  {
    version: "0.4.0-alpha.10",
    date: "2026-08-28",
    added: [
      "Corva can now keep publishing while you stream. Turn on \"Keep publishing while I stream\" in Settings → Publishing, and closing Corva tucks it into the system tray instead of quitting — your scheduled clips still go out on time, on their own. The window closes for real, so Corva stops holding onto memory and your graphics card while you play. Right-click the tray icon to bring it back, or to quit properly. Leave the setting off and closing Corva quits it, exactly like before.",
      "Corva has themes. Settings has a new Appearance section with four of them: Midnight (the look you already had, still the default), Daylight for bright rooms, Neon Rose (dark, hot pink) and Blush (light pink). Pick one and the whole app repaints instantly — including the editor — and it stays that way next time you open Corva.",
    ],
    changed: [
      "Scheduled clips no longer need the Queue open to publish. The posting schedule used to run inside the app window, so a clip could only go out while Corva was open and on screen — and a minimised window risked being slowed down by Windows. It now runs in the background instead, which also means a clip whose time passed while Corva was closed goes out as soon as you next open it.",
      "A scheduled post that fails now reaches you no matter what. The Windows notification works even with the window closed, clicking it brings Corva back, and the red \"needs retry\" banner is waiting for you when it opens — including for failures that happened mid-stream.",
      "Settings is a real desktop page now, not a phone one. The six stacked dropdowns are gone — sections live in a list down the left side, one click each, and the section you're in stays on screen while you scroll. Nothing moved out of Settings; it's only laid out differently.",
      "Settings has a search box. Type \"youtube\" and you get both the account connection and the API keys, from two different sections, with a button that takes you straight to either one.",
      "The old \"Files & Folders\" group was carrying a third of Settings on its own, so the three processing settings inside it — Video Splitting, Pipeline Quality and Recording Layout — now have their own Pipeline section. \"Content Library\" is now \"Games\" and \"Tools & Credentials\" is now \"Tools & Keys\".",
    ],
  },
  {
    version: "0.4.0-alpha.9",
    date: "2026-08-28",
    added: [
      "What's New — after every update, Corva now opens with a quick summary of what changed, so you're never left guessing what an update did.",
    ],
    changed: [
      "Captions & Descriptions moved out of the bottom of the Queue and into a panel beside your clips. It follows whatever clip you've selected and shows only that game's set — pick a Rocket League clip and Rocket League's description is already there. Every other game sits behind one \"Other games\" button.",
      "The Queue reads properly now instead of as a wall of text. Each platform block wears its own colour — YouTube red, TikTok cyan, Instagram pink, Facebook blue — clip titles are bigger and bolder, and field labels are clearly labels instead of blending into their values.",
      "The startup splash now stays up for a couple of seconds and grows gently instead of pulsing, so fast launches don't flash it away.",
    ],
    fixed: [
      "The Tracker now records the exact time you posted a clip. It used to round your post to the nearest slot in your weekly schedule — a 2:45 PM post showed up as 2:30 PM.",
    ],
  },
];
