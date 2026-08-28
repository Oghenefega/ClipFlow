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
