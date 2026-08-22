// #284: the ONE starter YouTube description generator. Both entry points — adding
// a game (App.js handleNewGame) and "Regenerate from Template" (CaptionsView) —
// call this, so the two can never drift apart again.
//
// Deliberately generic: a blurb line, a keyword line and two hashtags. No channel
// name, no social links, no affiliate links, no stream schedule. This is a
// scaffold the user makes theirs in Captions & Descriptions — it is not a
// finished description, and it must never assert anything about whoever is
// running the app.
export function buildStarterYtDescription(gameName, hashtag) {
  return `The best ${gameName} moments from my streams

${hashtag} shorts, ${hashtag} funny moments, ${hashtag} gameplay, funny gaming shorts, gaming shorts, funny gaming moments, stream highlights, gaming content

#${hashtag} #gamingshorts`;
}
