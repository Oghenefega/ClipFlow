const path = require("path");
const fs = require("fs");
const ffmpeg = require("./ffmpeg");
const { uniquePath } = require("./projects");

// Asset library for SFX / music / pictures placed on clips (session 134).
// Files imported through the app are COPIED into {libraryRoot}/.clipflow/assets/files/
// so clips never break when the original moves. Sounds living in the user's
// watched audio folders (Settings) are linked in place instead — they get an
// index entry on first scan (source: "folder") so favorites and lane overrides
// persist. A curated library on a syncing drive must never be copied: the copy
// forks, and the stale side is the one the app then uses (#208).

const AUDIO_EXTS = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

// Audio with no explicit music/sfx hint splits on duration: a one-shot is
// seconds long, a music bed is not. Folder names can't do this job — measured
// against a real library whose ROOT folder is named "Sound FX" and holds 500
// songs. Duration got 103 of 105 sampled files right (#208).
const MUSIC_MIN_SECONDS = 60;

// Watched folders are walked recursively. The cap is loop insurance — a Windows
// junction inside a synced drive can point back up its own tree.
const MAX_SCAN_DEPTH = 10;

function getAssetsRoot(libraryRoot) {
  return path.join(libraryRoot, ".clipflow", "assets");
}

function getFilesDir(assetsRoot) {
  return path.join(assetsRoot, "files");
}

function indexPath(assetsRoot) {
  return path.join(assetsRoot, "assets.json");
}

function loadIndex(assetsRoot) {
  try {
    const data = JSON.parse(fs.readFileSync(indexPath(assetsRoot), "utf8"));
    return Array.isArray(data.assets) ? data.assets : [];
  } catch (_) {
    return [];
  }
}

function saveIndex(assetsRoot, assets) {
  fs.mkdirSync(assetsRoot, { recursive: true });
  fs.writeFileSync(indexPath(assetsRoot), JSON.stringify({ assets }, null, 2));
}

function generateAssetId() {
  return `asset_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function classifyExt(ext) {
  if (AUDIO_EXTS.includes(ext)) return "audio";
  if (IMAGE_EXTS.includes(ext)) return "image";
  return null;
}

/** Absolute file path for an index entry. */
function resolvePath(assetsRoot, entry) {
  return entry.source === "folder" ? entry.path : path.join(getFilesDir(assetsRoot), entry.fileName);
}

async function probeDurationSafe(filePath) {
  try {
    const info = await ffmpeg.probe(filePath);
    return Number.isFinite(info.duration) && info.duration > 0 ? info.duration : null;
  } catch (_) {
    return null;
  }
}

/** The music/SFX lane a duration implies. Unprobeable files land in SFX. */
function classifyByDuration(durationSec) {
  return durationSec != null && durationSec >= MUSIC_MIN_SECONDS ? "music" : "sfx";
}

/** Every audio file under `root`, recursive, with the stat each one needs. */
function walkAudioFiles(root) {
  const out = [];
  const visit = (dir, depth) => {
    if (depth > MAX_SCAN_DEPTH) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // .clipflow holds ClipFlow's OWN copied assets — indexing them as folder
        // entries would list every uploaded file twice if a watched folder ever
        // sits above the project library.
        if (e.name !== ".clipflow") visit(full, depth + 1);
        continue;
      }
      if (classifyExt(path.extname(e.name).toLowerCase()) !== "audio") continue;
      let st;
      try { st = fs.statSync(full); } catch (_) { continue; }
      out.push({ path: full, sizeBytes: st.size, mtimeMs: st.mtimeMs });
    }
  };
  visit(root, 0);
  return out;
}

/**
 * Watched-folder settings → resolved paths. `onlyEnabled` drops the ones toggled
 * off, which decides what gets SCANNED and LISTED; the full set decides what the
 * index keeps, so toggling a folder off doesn't throw away its favorites.
 */
function watchedRoots(folders, onlyEnabled) {
  return (Array.isArray(folders) ? folders : [])
    .filter((f) => f && f.path && (!onlyEnabled || f.enabled !== false))
    .map((f) => path.resolve(f.path));
}

// Folder names that say nothing on their own. A group headed "Music" or "SFX"
// reads as a contradiction inside the opposite lane's tab, so these borrow their
// parent's name. Every other folder keeps its own — in a real library that name
// is the useful part ("Troll - Derpy - Funny"), and prefixing them all would
// push it off the right edge of a narrow panel.
const VAGUE_FOLDER_NAMES = new Set(["music", "sfx", "effects", "sound effects", "sounds", "sound", "audio"]);

/** The label the Audio panel heads this folder's tracks with. */
function groupLabel(dir) {
  const name = path.basename(dir);
  if (!VAGUE_FOLDER_NAMES.has(name.toLowerCase())) return name;
  const parent = path.basename(path.dirname(dir));
  return parent && parent !== name ? `${parent} › ${name}` : name;
}

/** Is `file` inside `dir`? Both absolute. */
function isUnder(file, dir) {
  const a = file.toLowerCase();
  const b = dir.toLowerCase();
  return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
}

/**
 * List all assets: index entries plus a fresh recursive scan of every watched
 * audio folder. New files are absorbed with no duration yet — probing 760 files
 * takes over a minute, so `backfillDurations` fills them in behind the panel and
 * an unprobed file shows in neither lane rather than the wrong one.
 *
 * Nothing linked is ever pruned for being absent. A folder that won't read is
 * OFFLINE (drive unplugged, sync moved it) and its tracks are flagged, not
 * dropped — dropping them silently emptied the panel and broke clips that were
 * already using them. A file gone from a folder that reads fine is MISSING.
 * Only removing the folder from Settings removes its tracks (#208).
 *
 * Returns entries with a computed absolute `path`, plus `offline`, `missing` and
 * the `group` (parent folder name) the panel lists them under.
 */
async function listAssets(assetsRoot, folders) {
  let assets = loadIndex(assetsRoot);
  let dirty = false;

  const configured = watchedRoots(folders, false);
  const roots = watchedRoots(folders, true);
  const scanned = new Map(); // reachable root -> [{ path, sizeBytes, mtimeMs }]
  for (const root of roots) {
    let ok = false;
    try { ok = fs.statSync(root).isDirectory(); } catch (_) { /* offline */ }
    if (ok) scanned.set(root, walkAudioFiles(root));
  }
  const reachableRoots = [...scanned.keys()];
  const onDisk = new Map(); // lowercased path -> stat, for every file found
  for (const files of scanned.values()) for (const f of files) onDisk.set(f.path.toLowerCase(), f);

  // Folder entries survive everything except the user removing their folder
  // from Settings. Toggling one off is not removing it — checked against every
  // configured folder, enabled or not, so a toggle keeps favorites and lanes.
  const before = assets.length;
  assets = assets.filter((a) => a.source !== "folder" || configured.some((r) => isUnder(a.path, r)));
  if (assets.length !== before) dirty = true;

  // A file the sync replaced under the same name gets re-probed and re-classified.
  for (const a of assets) {
    if (a.source !== "folder") continue;
    const st = onDisk.get(a.path.toLowerCase());
    if (!st || (st.sizeBytes === a.sizeBytes && st.mtimeMs === a.mtimeMs)) continue;
    a.sizeBytes = st.sizeBytes;
    a.mtimeMs = st.mtimeMs;
    a.durationSec = null;
    if (!a.typeLocked) a.type = null;
    dirty = true;
  }

  // Absorb files that aren't in the index yet.
  const known = new Set(assets.filter((a) => a.source === "folder").map((a) => a.path.toLowerCase()));
  for (const [root, files] of scanned) {
    for (const f of files) {
      if (known.has(f.path.toLowerCase())) continue;
      known.add(f.path.toLowerCase());
      assets.push({
        id: generateAssetId(),
        type: null, // filled in by backfillDurations
        name: path.basename(f.path, path.extname(f.path)),
        path: f.path,
        source: "folder",
        watchRoot: root,
        durationSec: null,
        sizeBytes: f.sizeBytes,
        mtimeMs: f.mtimeMs,
        favorite: false,
        addedAt: new Date().toISOString(),
      });
      dirty = true;
    }
  }

  if (dirty) saveIndex(assetsRoot, assets);

  return assets.flatMap((a) => {
    const abs = resolvePath(assetsRoot, a);
    if (a.source !== "folder") {
      return [{ ...a, path: abs, offline: false, missing: !fs.existsSync(abs), group: "Uploads", groupPath: getFilesDir(assetsRoot) }];
    }
    // A folder toggled off leaves the panel but keeps its index entries.
    if (!roots.some((r) => isUnder(abs, r))) return [];
    const offline = !reachableRoots.some((r) => isUnder(abs, r));
    const dir = path.dirname(abs);
    return [{
      ...a,
      path: abs,
      offline,
      missing: !offline && !onDisk.has(abs.toLowerCase()),
      group: groupLabel(dir),
      groupPath: dir,
    }];
  });
}

// One duration pass at a time — `assets:list` fires on every panel open.
let scanRunning = false;

/**
 * Probe every folder entry that has no duration yet and assign its lane. A cold
 * 760-file library is ~1.3 minutes at ~99ms a file; the panel stays usable
 * throughout and is instant on every later open, because the index entry IS the
 * cache and only a changed size/mtime clears it.
 *
 * Saves in batches of 10, re-reading the index each time so a concurrent import
 * isn't clobbered. A file that won't probe records duration 0 rather than null,
 * so it lands in SFX instead of being retried on every open forever.
 */
async function backfillDurations(assetsRoot, onProgress) {
  if (scanRunning) return;
  scanRunning = true;
  try {
    const todo = loadIndex(assetsRoot).filter((a) => a.source === "folder" && a.durationSec == null);
    if (!todo.length) return;

    const probed = new Map(); // id -> durationSec
    let done = 0;
    const flush = () => {
      const disk = loadIndex(assetsRoot);
      for (const a of disk) {
        if (!probed.has(a.id)) continue;
        a.durationSec = probed.get(a.id);
        if (!a.typeLocked) a.type = classifyByDuration(a.durationSec);
      }
      saveIndex(assetsRoot, disk);
      probed.clear();
    };

    for (const entry of todo) {
      done++;
      // A file that went away mid-pass (the drive dropped) stays unprobed.
      // Recording a 0 here would pin a whole offline library into the SFX lane
      // permanently, since 0 reads as "probed" on the next run.
      if (fs.existsSync(entry.path)) {
        probed.set(entry.id, (await probeDurationSafe(entry.path)) ?? 0);
      }
      if (probed.size >= 10 || done === todo.length) {
        if (probed.size) flush();
        if (onProgress) onProgress({ done, total: todo.length });
      }
    }
  } finally {
    scanRunning = false;
  }
}

/**
 * Pin a track to the Music or SFX lane by hand. `typeLocked` makes it survive
 * every later rescan — the duration rule is ~98% right, and this is the escape
 * hatch for the rest.
 */
function setAssetType(assetsRoot, assetId, type) {
  if (type !== "music" && type !== "sfx") throw new Error("Type must be music or sfx");
  const assets = loadIndex(assetsRoot);
  const entry = assets.find((a) => a.id === assetId);
  if (!entry) throw new Error("Asset not found");
  entry.type = type;
  entry.typeLocked = true;
  saveIndex(assetsRoot, assets);
  return type;
}

/**
 * The level this sound should open at every time it's placed (#210). A library
 * one-shot is mastered to whatever the pack author felt like, so the per-kind
 * defaults (0.4 music / 0.6 SFX) are right on average and wrong on every
 * cinematic boom — which meant re-tuning the same sound on every clip.
 *
 * Pass null to clear it and fall back to the per-kind default. Placements
 * already on a clip are never touched: they carry their own `volume`.
 */
function setAssetDefaultVolume(assetsRoot, assetId, volume) {
  const assets = loadIndex(assetsRoot);
  const entry = assets.find((a) => a.id === assetId);
  if (!entry) throw new Error("Asset not found");
  if (volume == null) {
    delete entry.defaultVolume;
  } else {
    if (typeof volume !== "number" || !Number.isFinite(volume)) throw new Error("Volume must be a number");
    entry.defaultVolume = Math.max(0, Math.min(1, volume));
  }
  saveIndex(assetsRoot, assets);
  return entry.defaultVolume ?? null;
}

// ── Mood tags (#212) ──
// Epidemic Sound's own mood vocabulary, supplied by Fega. Most of the library IS
// Epidemic, so this is the wording he already reads next to these tracks — no
// reason to invent a parallel taxonomy he'd have to translate in his head.
const MOODS = [
  "Angry", "Busy & Frantic", "Changing Tempo", "Chasing", "Dark", "Dreamy",
  "Eccentric", "Elegant", "Epic", "Euphoric", "Fear", "Floating", "Funny",
  "Glamorous", "Happy", "Heavy & Ponderous", "Hopeful", "Laid Back", "Marching",
  "Mysterious", "Peaceful", "Quirky", "Relaxing", "Restless", "Romantic",
  "Running", "Sad", "Scary", "Sentimental", "Sexy", "Smooth", "Sneaking",
  "Suspense", "Weird",
];

/**
 * Keyword → moods, matched against a track's IMMEDIATE parent folder name only.
 *
 * Deliberately not the whole path: Fega's mood folders sit under a parent called
 * "Game Music - Jazz", so matching the full path would stamp Smooth onto all ~150
 * tracks beneath it. The measured coverage (≈151 tracks confidently tagged, ≈490
 * left) is based on immediate-folder names, and this keeps it honest.
 */
const FOLDER_MOOD_HINTS = [
  [/\bchill\b/i, ["Laid Back", "Relaxing"]],
  [/\blowkey\b/i, ["Laid Back"]],
  [/\bupbeat\b/i, ["Happy"]],
  [/\bhappy\b/i, ["Happy"]],
  [/\bepic\b|final battle|world ending/i, ["Epic"]],
  [/\bintense\b/i, ["Restless"]],
  [/\btroll\b|\bderpy\b|\bfunny\b|\bmeme\b/i, ["Funny", "Quirky"]],
  [/\bgloomy\b|\bsad\b|\bdepressed\b/i, ["Sad"]],
  [/\bdark\b/i, ["Dark"]],
  [/suspense/i, ["Suspense"]],
  [/\bsneak/i, ["Sneaking"]],
  [/myster/i, ["Mysterious"]],
  [/\bangelic\b|\bredeemed\b/i, ["Hopeful"]],
  [/\bhype\b|hype tracks/i, ["Euphoric"]],
  [/\bclassical\b/i, ["Elegant"]],
  [/\bscary\b|\bhorror\b/i, ["Scary"]],
  [/\bromantic\b|\blove\b/i, ["Romantic"]],
  [/\bpeaceful\b|\bcalm\b/i, ["Peaceful"]],
  [/\bdreamy\b/i, ["Dreamy"]],
];

/** Moods implied by the folder a file sits directly in. May be empty. */
function moodsFromFolder(dir) {
  const name = path.basename(dir || "");
  const out = new Set();
  for (const [re, moods] of FOLDER_MOOD_HINTS) {
    if (re.test(name)) moods.forEach((m) => out.add(m));
  }
  return [...out];
}

/** Replace a track's tags. Free text is allowed alongside the preset moods. */
function setAssetTags(assetsRoot, assetId, tags) {
  if (!Array.isArray(tags)) throw new Error("Tags must be a list");
  const clean = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 24);
  const assets = loadIndex(assetsRoot);
  const entry = assets.find((a) => a.id === assetId);
  if (!entry) throw new Error("Asset not found");
  entry.tags = clean;
  saveIndex(assetsRoot, assets);
  return clean;
}

/** Add one mood to many tracks at once — the bulk path (#212). */
function addAssetTagToMany(assetsRoot, assetIds, tag) {
  const t = String(tag || "").trim();
  if (!t) throw new Error("No tag given");
  const ids = new Set(assetIds || []);
  const assets = loadIndex(assetsRoot);
  let changed = 0;
  for (const a of assets) {
    if (!ids.has(a.id)) continue;
    const tags = Array.isArray(a.tags) ? a.tags : [];
    if (tags.includes(t)) continue;
    a.tags = [...tags, t].slice(0, 24);
    changed++;
  }
  if (changed) saveIndex(assetsRoot, assets);
  return changed;
}

/**
 * One-time pass turning folder names into starting tags. Non-destructive: a track
 * that already has tags is skipped entirely, so a hand-set tag is never
 * overwritten, and `tagsSeeded` on the index means it can't run twice.
 */
function seedTagsFromFolders(assetsRoot) {
  const assets = loadIndex(assetsRoot);
  let tagged = 0;
  for (const a of assets) {
    if (a.source !== "folder") continue;
    if (Array.isArray(a.tags) && a.tags.length > 0) continue;
    const moods = moodsFromFolder(path.dirname(a.path || ""));
    if (!moods.length) continue;
    a.tags = moods;
    a.tagsSeeded = true;
    tagged++;
  }
  if (tagged) saveIndex(assetsRoot, assets);
  return { tagged, total: assets.length };
}

/** Stamp "I used this" — drives the Recent filter (#212). */
function markAssetUsed(assetsRoot, assetId, whenISO) {
  const assets = loadIndex(assetsRoot);
  const entry = assets.find((a) => a.id === assetId);
  if (!entry) return null;
  entry.lastUsedAt = whenISO || new Date().toISOString();
  entry.useCount = (entry.useCount || 0) + 1;
  saveIndex(assetsRoot, assets);
  return entry.lastUsedAt;
}

/**
 * Seed `lastUsedAt` from clips already saved, so Recent is useful the first time
 * it's opened rather than empty — the complaint was about sounds used in a PRIOR
 * clip. Placements persist on the clip as `sfx` and carry both `path` and
 * `assetId`; match on path FIRST because `assetId` is generated at scan time, so a
 * rebuilt index invalidates old ids while the file path stays stable.
 *
 * `listProjects` is injected rather than required, to keep assets.js free of a
 * dependency on the project store.
 */
function backfillLastUsed(assetsRoot, projects) {
  const assets = loadIndex(assetsRoot);
  const byPath = new Map();
  const byId = new Map();
  for (const a of assets) {
    if (a.path) byPath.set(String(a.path).toLowerCase(), a);
    byId.set(a.id, a);
  }

  const newest = new Map(); // asset -> ISO string
  const counts = new Map();
  for (const proj of projects || []) {
    for (const clip of proj.clips || []) {
      const when = clip.updatedAt || clip.createdAt || proj.updatedAt || proj.createdAt;
      for (const p of clip.sfx || []) {
        const hit = (p.path && byPath.get(String(p.path).toLowerCase())) || byId.get(p.assetId);
        if (!hit) continue;
        counts.set(hit, (counts.get(hit) || 0) + 1);
        if (when && (!newest.get(hit) || when > newest.get(hit))) newest.set(hit, when);
      }
    }
  }

  let stamped = 0;
  for (const [entry, when] of newest) {
    // Never move a real use backwards — a sound placed since this shipped wins.
    if (entry.lastUsedAt && entry.lastUsedAt >= when) continue;
    entry.lastUsedAt = when;
    entry.useCount = Math.max(entry.useCount || 0, counts.get(entry) || 1);
    stamped++;
  }
  if (stamped) saveIndex(assetsRoot, assets);
  return { stamped, matched: newest.size };
}

/**
 * Import files into the library (copy + index). `typeHint` is "music"/"sfx"
 * when the import came from that sub-tab, null to infer. Images always
 * become type "image". Returns { imported, skipped: [{ file, reason }] }.
 */
async function importAssets(assetsRoot, filePaths, typeHint) {
  const filesDir = getFilesDir(assetsRoot);
  fs.mkdirSync(filesDir, { recursive: true });
  const assets = loadIndex(assetsRoot);
  const imported = [];
  const skipped = [];

  for (const src of filePaths || []) {
    const ext = path.extname(src).toLowerCase();
    const kind = classifyExt(ext);
    if (!kind) {
      const reason = ext === ".gif" ? "GIFs come later" : /\.(mp4|mov|mkv|webm|avi|3gp)$/.test(ext) ? "Videos aren't supported yet" : "Unsupported type";
      skipped.push({ file: path.basename(src), reason });
      continue;
    }
    try {
      const base = path.basename(src, ext);
      const dest = uniquePath(filesDir, base, ext);
      fs.copyFileSync(src, dest);
      const durationSec = kind === "audio" ? await probeDurationSafe(dest) : null;
      const type = kind === "image" ? "image"
        : (typeHint === "music" || typeHint === "sfx") ? typeHint
        : (durationSec != null && durationSec >= MUSIC_MIN_SECONDS) ? "music" : "sfx";
      const entry = {
        id: generateAssetId(),
        type,
        name: base,
        fileName: path.basename(dest),
        source: "library",
        durationSec,
        sizeBytes: fs.statSync(dest).size,
        favorite: false,
        addedAt: new Date().toISOString(),
      };
      assets.push(entry);
      imported.push({ ...entry, path: dest });
    } catch (err) {
      skipped.push({ file: path.basename(src), reason: err.message });
    }
  }

  saveIndex(assetsRoot, assets);
  return { imported, skipped };
}

/**
 * Delete a library asset (index entry + copied file). Folder-sourced entries
 * are refused — a watched folder belongs to the user; removing the entry would
 * just re-absorb the file on the next scan.
 */
function deleteAsset(assetsRoot, assetId) {
  const assets = loadIndex(assetsRoot);
  const entry = assets.find((a) => a.id === assetId);
  if (!entry) throw new Error("Asset not found");
  if (entry.source === "folder") throw new Error("This file lives in a watched folder — delete it there, or un-watch the folder in Settings");
  try {
    fs.unlinkSync(resolvePath(assetsRoot, entry));
  } catch (_) { /* already gone */ }
  saveIndex(assetsRoot, assets.filter((a) => a.id !== assetId));
}

/**
 * Waveform peaks for a sound file, so the timeline can draw its shape (#202b —
 * Fega aligns sounds by eye against the waveform). Cached per file under
 * {assetsRoot}/peaks/ and invalidated on mtime/size, same rule as the project
 * waveform cache. Sound files are short, so one extraction is cheap.
 */
async function getPeaks(assetsRoot, filePath) {
  let st;
  try { st = fs.statSync(filePath); } catch (_) { return { peaks: [], error: "File not found" }; }

  const peaksDir = path.join(assetsRoot, "peaks");
  const key = require("crypto").createHash("sha1").update(filePath.toLowerCase()).digest("hex").slice(0, 16);
  const cachePath = path.join(peaksDir, `${key}.json`);

  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (cached.mtimeMs === st.mtimeMs && cached.sizeBytes === st.size && Array.isArray(cached.peaks) && cached.peaks.length > 0) {
      return { peaks: cached.peaks, cached: true };
    }
  } catch (_) { /* miss — extract below */ }

  const dur = await probeDurationSafe(filePath);
  const peakCount = Math.max(200, Math.min(4000, Math.round((dur || 4) * 50)));
  const result = await ffmpeg.extractWaveformPeaks(filePath, peakCount, 0);
  if (!result?.peaks?.length) return { peaks: [], error: result?.error || "No audio found" };

  try {
    fs.mkdirSync(peaksDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ peaks: result.peaks, mtimeMs: st.mtimeMs, sizeBytes: st.size }));
  } catch (_) { /* cache write is best-effort */ }

  return { peaks: result.peaks, cached: false };
}

function toggleFavorite(assetsRoot, assetId) {
  const assets = loadIndex(assetsRoot);
  const entry = assets.find((a) => a.id === assetId);
  if (!entry) throw new Error("Asset not found");
  entry.favorite = !entry.favorite;
  saveIndex(assetsRoot, assets);
  return entry.favorite;
}

module.exports = {
  getAssetsRoot,
  listAssets,
  backfillDurations,
  setAssetType,
  setAssetDefaultVolume,
  MOODS,
  setAssetTags,
  addAssetTagToMany,
  seedTagsFromFolders,
  markAssetUsed,
  backfillLastUsed,
  importAssets,
  deleteAsset,
  toggleFavorite,
  getPeaks,
};
