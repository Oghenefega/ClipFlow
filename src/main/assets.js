const path = require("path");
const fs = require("fs");
const ffmpeg = require("./ffmpeg");
const { uniquePath } = require("./projects");

// Asset library for SFX / music / pictures placed on clips (session 134).
// Files imported through the app are COPIED into {libraryRoot}/.clipflow/assets/files/
// so clips never break when the original moves. Sounds living in the user's
// "Sound Effects Folder" (Settings) are linked in place instead — they get an
// index entry on first scan (source: "folder") so favorites persist, and the
// entry is pruned when the file disappears from the folder.

const AUDIO_EXTS = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

// Audio with no explicit music/sfx hint splits on duration: a one-shot is
// seconds long, a music bed is not.
const MUSIC_MIN_SECONDS = 60;

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

/**
 * List all assets: index entries plus a fresh scan of the SFX folder.
 * New folder files are absorbed into the index (probed once); folder entries
 * whose file vanished are pruned; library entries whose file vanished are
 * kept but flagged `missing` (the user may restore a moved drive).
 * Returns entries with a computed absolute `path` field.
 */
async function listAssets(assetsRoot, sfxFolder) {
  let assets = loadIndex(assetsRoot);
  let dirty = false;

  // Prune folder entries that left the folder (or the folder setting changed)
  const folderOk = sfxFolder && fs.existsSync(sfxFolder);
  const folderNorm = folderOk ? path.resolve(sfxFolder).toLowerCase() : null;
  const before = assets.length;
  assets = assets.filter((a) => {
    if (a.source !== "folder") return true;
    return folderOk && path.resolve(path.dirname(a.path)).toLowerCase() === folderNorm && fs.existsSync(a.path);
  });
  if (assets.length !== before) dirty = true;

  // Absorb new audio files from the SFX folder
  if (folderOk) {
    const known = new Set(assets.filter((a) => a.source === "folder").map((a) => a.path.toLowerCase()));
    for (const name of fs.readdirSync(sfxFolder)) {
      const ext = path.extname(name).toLowerCase();
      if (classifyExt(ext) !== "audio") continue;
      const full = path.join(path.resolve(sfxFolder), name);
      if (known.has(full.toLowerCase())) continue;
      let st;
      try { st = fs.statSync(full); } catch (_) { continue; }
      if (!st.isFile()) continue;
      assets.push({
        id: generateAssetId(),
        type: "sfx",
        name: path.basename(name, ext),
        path: full,
        source: "folder",
        durationSec: await probeDurationSafe(full),
        sizeBytes: st.size,
        favorite: false,
        addedAt: new Date().toISOString(),
      });
      dirty = true;
    }
  }

  if (dirty) saveIndex(assetsRoot, assets);

  return assets.map((a) => {
    const abs = resolvePath(assetsRoot, a);
    return { ...a, path: abs, missing: !fs.existsSync(abs) };
  });
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
 * are refused — the SFX folder belongs to the user; removing the entry would
 * just re-absorb the file on the next scan.
 */
function deleteAsset(assetsRoot, assetId) {
  const assets = loadIndex(assetsRoot);
  const entry = assets.find((a) => a.id === assetId);
  if (!entry) throw new Error("Asset not found");
  if (entry.source === "folder") throw new Error("Remove this file from your Sound Effects folder instead");
  try {
    fs.unlinkSync(resolvePath(assetsRoot, entry));
  } catch (_) { /* already gone */ }
  saveIndex(assetsRoot, assets.filter((a) => a.id !== assetId));
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
  importAssets,
  deleteAsset,
  toggleFavorite,
};
