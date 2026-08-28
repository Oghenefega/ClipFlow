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
    version: "unreleased",
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
