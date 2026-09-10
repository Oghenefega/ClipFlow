/**
 * #397/#398: the pure maths behind the Analytics tab — medians, buckets,
 * posting slots, window deltas from daily snapshots, and the plain-English
 * insight rules. No React, no Electron, so jest pins the rules and the tab
 * just renders what comes out.
 *
 * CJS on purpose (same as trackerRow.js): the main-process test suite
 * require()s it; the renderer imports named bindings and Vite interops.
 *
 * Every clip passed in is the shape analytics:get returns, plus `duration`
 * (seconds, from the project) joined in the renderer.
 */

const PLATFORMS = ["youtube", "facebook", "instagram", "tiktok"];
const PLATFORM_LABEL = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };

/** Middle value; 0 for an empty list. Medians so one runaway clip cannot drag a group. */
function median(values) {
  const a = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

/** Clips that have at least one fetched view count — the only ones that can be ranked. */
function withViews(clips) {
  return (clips || []).filter((c) => c && c.fetchedAt && Number.isFinite(c.total));
}

const LENGTH_BUCKETS = ["under 20s", "20–35s", "35–55s", "55s+"];
function lengthBucket(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 20) return LENGTH_BUCKETS[0];
  if (seconds < 35) return LENGTH_BUCKETS[1];
  if (seconds < 55) return LENGTH_BUCKETS[2];
  return LENGTH_BUCKETS[3];
}

/** A title "shouts" when it carries a word of four or more capitals (hashtags ignored). */
function titleShouts(title) {
  return /\b[A-Z]{4,}\b/.test(String(title || "").replace(/#\w+/g, ""));
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_BANDS = [
  { key: "8a", label: "8–10 AM", from: 8 },
  { key: "10a", label: "10 AM–12", from: 10 },
  { key: "12p", label: "12–2 PM", from: 12 },
  { key: "2p", label: "2–4 PM", from: 14 },
  { key: "4p", label: "4–6 PM", from: 16 },
  { key: "6p", label: "6–8 PM", from: 18 },
  { key: "8p", label: "8–10 PM", from: 20 },
  { key: "10p", label: "10 PM+", from: 22 },
];

/** Tracker `time` is verbatim ("1:30 PM", "13:05"); returns the 24 h hour or null. */
function parseHour(time) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(time || ""));
  if (!m) return null;
  let h = Number(m[1]);
  const ap = (m[3] || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h >= 0 && h < 24 ? h : null;
}

/** {day: "Tue", band: "2p"} for a clip's local publish date + time, or null. */
function postingSlot(date, time) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hour = parseHour(time);
  if (hour == null) return null;
  const band = [...HOUR_BANDS].reverse().find((b) => hour >= b.from) || HOUR_BANDS[0];
  return { day: DAYS[(d.getDay() + 6) % 7], band: band.key };
}

/** Median views per (day, band) cell; `best` = the three strongest cells with ≥ minClips. */
function slotGrid(clips, minClips = 2) {
  const cells = new Map();
  for (const c of withViews(clips)) {
    const s = postingSlot(c.date, c.time);
    if (!s) continue;
    const k = `${s.day}|${s.band}`;
    (cells.get(k) || cells.set(k, []).get(k)).push(c.total);
  }
  const grid = [];
  for (const band of HOUR_BANDS) {
    for (const day of DAYS) {
      const a = cells.get(`${day}|${band.key}`) || [];
      grid.push({ day, band: band.key, bandLabel: band.label, n: a.length, median: median(a) });
    }
  }
  const best = grid.filter((g) => g.n >= minClips).sort((a, b) => b.median - a.median).slice(0, 3);
  return { grid, best, max: Math.max(0, ...grid.map((g) => g.median)) };
}

/** Group clips by `key(c)`; each group carries its clip count and median total. Sorted by median. */
function rollup(clips, key) {
  const groups = new Map();
  for (const c of withViews(clips)) {
    const k = key(c);
    if (k == null) continue;
    (groups.get(k) || groups.set(k, []).get(k)).push(c);
  }
  return [...groups.entries()]
    .map(([k, cs]) => ({ key: k, n: cs.length, median: median(cs.map((c) => c.total)), clips: cs }))
    .sort((a, b) => b.median - a.median);
}

/** Views summed per platform across the clips, plus each platform's share of the total. */
function platformTotals(clips) {
  const out = {};
  let total = 0;
  for (const p of PLATFORMS) out[p] = { views: 0, clips: 0 };
  for (const c of clips || []) {
    for (const p of PLATFORMS) {
      const v = c?.views?.[p];
      if (Number.isFinite(v)) { out[p].views += v; out[p].clips++; total += v; }
    }
  }
  for (const p of PLATFORMS) out[p].share = total > 0 ? out[p].views / total : 0;
  return { total, platforms: out };
}

// ---- #398: snapshot maths -------------------------------------------------

/** Total at the last snapshot on or before `day` (YYYY-MM-DD), or null if none. */
function totalAtOrBefore(history, day) {
  let v = null;
  for (const [d, t] of history || []) {
    if (d <= day) v = t; else break;
  }
  return v;
}

/**
 * Views gained by these clips between `startDay` (inclusive) and `endDay`
 * (inclusive). A clip with no snapshot before the start counts from zero —
 * right for a clip published inside the window, and the best we can do for
 * one published before snapshots began.
 */
function viewsGained(clips, startDay, endDay) {
  let gained = 0;
  for (const c of clips || []) {
    const end = totalAtOrBefore(c.history, endDay);
    if (end == null) continue;
    const dayBefore = totalAtOrBefore(c.history, prevDay(startDay));
    gained += end - (dayBefore ?? 0);
  }
  return gained;
}

function pad2(n) { return String(n).padStart(2, "0"); }
function dayKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function shiftDay(day, delta) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}
function prevDay(day) { return shiftDay(day, -1); }

/** Every distinct snapshot day across the clips, sorted. */
function snapshotDays(clips) {
  const s = new Set();
  for (const c of clips || []) for (const [d] of c.history || []) s.add(d);
  return [...s].sort();
}

/**
 * "Up 38% on the previous 30 days" — or null until there is a snapshot from
 * before the current window, which is what makes the previous window measurable.
 * @param {Array} allClips every clip (not window-filtered — the previous window needs its own clips)
 * @param {number} days window length
 * @param {string} today YYYY-MM-DD local
 */
function windowDelta(allClips, days, today) {
  if (!days) return null;
  const start = shiftDay(today, -(days - 1));
  const prevStart = shiftDay(start, -days);
  const first = snapshotDays(allClips)[0];
  if (!first || first >= start) return null; // no baseline before the window yet
  // Clips published in this window count only towards cur; clips from the
  // previous window count in full towards prev; older clips add their growth to both.
  const cur = viewsGained(allClips.filter((c) => c.date <= today), start, today);
  const prev = viewsGained(allClips.filter((c) => c.date < start), prevStart, prevDay(start));
  if (prev <= 0) return null;
  return { current: cur, previous: prev, pct: Math.round(((cur - prev) / prev) * 100), since: first, days };
}

/**
 * Daily totals across clips for the growth line: one point per snapshot day
 * in the last `days`, carrying each clip's last known count forward. Empty
 * until two snapshot days exist.
 */
function dailyTotals(clips, days, today) {
  const allDays = snapshotDays(clips);
  if (allDays.length < 2) return [];
  const start = days ? shiftDay(today, -(days - 1)) : allDays[0];
  const points = [];
  for (const day of allDays) {
    if (day < start || day > today) continue;
    let total = 0;
    for (const c of clips || []) total += totalAtOrBefore(c.history, day) ?? 0;
    points.push({ day, total });
  }
  return points;
}

/** For one clip: its total at first snapshot, after 2 days, after 7 days, and now. */
function clipMilestones(clip) {
  const h = clip?.history || [];
  if (h.length === 0) return null;
  const published = clip.date;
  const at = (n) => totalAtOrBefore(h, shiftDay(published, n));
  return { day2: at(2), day7: at(7), now: h[h.length - 1][1], firstDay: h[0][0], lastDay: h[h.length - 1][0] };
}

// ---- Insight rules ---------------------------------------------------------

const fmtK = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n || 0)));
const MIN_CLIPS = 8; // a rule only speaks with at least this many ranked clips
const MIN_GROUP = 5;

/**
 * Plain-English cards. Each: {key, label, parts: [{text, bold?}], why}.
 * Deterministic — the same clips always produce the same sentences.
 * @param {Array} clips window-filtered, with `duration` and `gameName` joined
 * @param {{delta?: object|null}} [extras]
 */
function buildInsights(clips, extras = {}) {
  const ranked = withViews(clips);
  const out = [];
  if (ranked.length < MIN_CLIPS) return out;
  const B = (text) => ({ text, bold: true });
  const T = (text) => ({ text });

  // 1. Which platform carries the views, and by how much per clip.
  {
    const { total, platforms } = platformTotals(ranked);
    const top = PLATFORMS.filter((p) => platforms[p].clips > 0).sort((a, b) => platforms[b].views - platforms[a].views);
    if (total > 0 && top.length >= 2) {
      const [a, b] = top;
      const ratios = ranked.filter((c) => c.views[a] > 0 && c.views[b] > 0).map((c) => c.views[a] / c.views[b]);
      const r = median(ratios.map((x) => Math.round(x * 10))) / 10;
      const parts = [B(`${PLATFORM_LABEL[a]} is ${Math.round(platforms[a].share * 100)}% of your views.`)];
      if (ratios.length >= MIN_GROUP && r >= 1.2) parts.push(T(` The same clip gets about ${r.toFixed(1)}× more plays there than on ${PLATFORM_LABEL[b]}.`));
      else parts.push(T(` ${PLATFORM_LABEL[b]} is close behind per clip.`));
      out.push({ key: "platform", label: "What's carrying you", parts, why: "Per-platform totals over this window." });
    }
  }

  // 2. Title patterns: shouting, then who wrote it.
  {
    const shout = ranked.filter((c) => titleShouts(c.title));
    const calm = ranked.filter((c) => !titleShouts(c.title));
    const parts = [];
    if (shout.length >= MIN_GROUP && calm.length >= MIN_GROUP) {
      const ms = median(shout.map((c) => c.total)), mc = median(calm.map((c) => c.total));
      const win = ms >= mc;
      parts.push(B(win ? "SHOUTING works:" : "Calm titles win:"));
      parts.push(T(` titles ${win ? "with" : "without"} an all-caps word (${(win ? shout : calm).length} clips) hold a median of ${fmtK(win ? ms : mc)} vs ${fmtK(win ? mc : ms)} ${win ? "without" : "with"} (${(win ? calm : shout).length}).`));
    }
    const self = ranked.filter((c) => c.titleSource === "self");
    const ai = ranked.filter((c) => c.titleSource === "ai" || c.titleSource === "ai_edited");
    let why = "Pattern found in your own titles.";
    if (self.length >= MIN_GROUP && ai.length >= MIN_GROUP) {
      const s = median(self.map((c) => c.total)), a = median(ai.map((c) => c.total));
      const close = Math.abs(s - a) / Math.max(s, a, 1) < 0.15;
      why = `Hand-written vs AI titles: ${fmtK(s)} vs ${fmtK(a)} median${close ? " — close." : s > a ? " — yours win." : " — the generator wins."}`;
      if (parts.length === 0) parts.push(B(close ? "Your titles and the generator's are neck and neck" : s > a ? "Your own titles win" : "The generator's titles win"), T(` at a median of ${fmtK(Math.max(s, a))} vs ${fmtK(Math.min(s, a))}.`));
    }
    if (parts.length > 0) out.push({ key: "titles", label: "Titles", parts, why });
  }

  // 3. Length bucket with the best median.
  {
    const groups = rollup(ranked, (c) => lengthBucket(c.duration)).filter((g) => g.n >= MIN_GROUP);
    if (groups.length >= 2) {
      const best = groups[0], worst = groups[groups.length - 1];
      out.push({
        key: "length", label: "Length",
        parts: [B(`${best.key} is your sweet spot`), T(` at a median of ${fmtK(best.median)} views across ${best.n} clips. ${worst.key} trails at ${fmtK(worst.median)}.`)],
        why: "Length is the cut-down timeline, not the raw recording span.",
      });
    }
  }

  // 4. What to repeat: the game owning the top five, and the strongest posting slot.
  {
    const top5 = [...ranked].sort((a, b) => b.total - a.total).slice(0, 5);
    const byGame = rollup(top5, (c) => c.gameName || c.game || null).sort((a, b) => b.n - a.n)[0];
    const parts = [];
    if (byGame && byGame.n >= 2) parts.push(B(byGame.key), T(` owns ${byGame.n} of your top 5 this window.`));
    const { best } = slotGrid(ranked, 3);
    if (best[0]) parts.push(T(`${parts.length ? " " : ""}Your best posting slot is ${best[0].day} ${best[0].bandLabel} (median ${fmtK(best[0].median)}).`));
    if (parts.length > 0) out.push({ key: "repeat", label: "Do more of", star: true, parts, why: "Repeat what already worked before trying new formats." });
  }

  // 5. Momentum from snapshots, once there is a previous window to compare.
  if (extras.delta && extras.delta.previous > 0) {
    const d = extras.delta;
    const up = d.pct >= 0;
    out.push({
      key: "momentum", label: "Momentum",
      parts: [B(`Views are ${up ? "up" : "down"} ${Math.abs(d.pct)}%`), T(` on the previous ${d.days} days: ${fmtK(d.current)} gained vs ${fmtK(d.previous)}.`)],
      why: `From daily snapshots kept since ${d.since}.`,
    });
  }

  return out;
}

module.exports = {
  PLATFORMS,
  PLATFORM_LABEL,
  LENGTH_BUCKETS,
  DAYS,
  HOUR_BANDS,
  median,
  withViews,
  lengthBucket,
  titleShouts,
  parseHour,
  postingSlot,
  slotGrid,
  rollup,
  platformTotals,
  totalAtOrBefore,
  viewsGained,
  windowDelta,
  dailyTotals,
  clipMilestones,
  snapshotDays,
  shiftDay,
  buildInsights,
  fmtK,
};
