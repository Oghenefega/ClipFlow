// #291: the ONE set of YouTube tag rules. Both editors — the per-game list in
// Captions & Descriptions and the per-clip override on the Queue's YouTube card —
// import from here so they can never disagree about what a tag list is or when
// it's too long.

// YouTube budgets the whole tag list at 500 characters: the tags themselves, the
// commas between them, and two extra for any tag containing a space (the API
// quotes those). Counted so an editor can block a save the upload would reject
// at the end of a render.
export const TAGS_MAX = 500;

// Comma-separated text -> clean list. Trims, drops blanks, drops case-insensitive
// duplicates while keeping the first spelling the user typed.
export const parseTags = (raw) => {
  const seen = new Set();
  return (raw || "").split(",").map((t) => t.trim()).filter((t) => {
    const key = t.toLowerCase();
    if (!t || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const tagsLength = (tags) =>
  (tags || []).reduce((n, t) => n + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, (tags || []).length - 1);

// The round-trip format: what a copy button puts on the clipboard and what both
// editors parse back.
export const tagsToText = (tags) => (tags || []).join(", ");
