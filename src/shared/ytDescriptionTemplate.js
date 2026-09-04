// #284: the ONE starter YouTube description generator. Every entry point — adding
// a game (App.js handleNewGame), "Regenerate" / "Create one from the template"
// (CaptionsView) and the main process's one-shot backfill for entries that
// arrived without one (#287, yt-description-backfill.js) — calls this, so they
// can never drift apart.
//
// CJS `module.exports` so the main process can require() it; the renderer imports
// it as a named ESM binding (Vite handles the interop, same as captionResolve).
//
// Deliberately generic: a blurb line, a keyword line and two hashtags. No channel
// name, no social links, no affiliate links, no stream schedule. This is a
// scaffold the user makes theirs in Captions & Descriptions — it is not a
// finished description, and it must never assert anything about whoever is
// running the app.
function buildStarterYtDescription(gameName, hashtag) {
  return `The best ${gameName} moments from my streams

${hashtag} shorts, ${hashtag} funny moments, ${hashtag} gameplay, funny gaming shorts, gaming shorts, funny gaming moments, stream highlights, gaming content

#${hashtag} #gamingshorts`;
}

module.exports = { buildStarterYtDescription };
