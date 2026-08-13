const path = require("path");
const fs = require("fs");
const { app } = require("electron");

// Official Steam poster art for the Projects-tab tiles, fetched once per game
// and cached on disk. Art files are keyed by slugified game name (the stable
// identity everywhere in this codebase) — no gamesDb schema change.
//
// Same path rule as game-profiles.js (#80): packaged or dev profile uses
// userData, source-running prod keeps the legacy repo path.
const DATA_DIR =
  app.isPackaged || process.env.CLIPFLOW_PROFILE === "dev"
    ? path.join(app.getPath("userData"), "data")
    : path.join(__dirname, "..", "..", "data");
const ART_DIR = path.join(DATA_DIR, "game-art");

const EXTS = [".jpg", ".jpeg", ".png", ".webp"];

// Steam's store search hides delisted games (Rocket League went Epic-only in
// 2020) but their CDN art stays up — known appids bridge the gap.
const DELISTED_APPIDS = { "rocket league": 252950 };

const slug = (name) =>
  String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function artPathFor(name) {
  for (const ext of EXTS) {
    const p = path.join(ART_DIR, slug(name) + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function fetchWithTimeout(url, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAppId(name) {
  const known = DELISTED_APPIDS[String(name || "").toLowerCase().trim()];
  if (known) return known;
  const res = await fetchWithTimeout(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const items = (data?.items || []).filter((i) => i.type === "app");
  if (!items.length) return null;
  // Prefer an exact name match (search also returns DLC/soundtracks/sequels).
  const clean = (s) => String(s).toLowerCase().replace(/[®™]/g, "").trim();
  const exact = items.find((i) => clean(i.name) === clean(name));
  return (exact || items[0]).id;
}

// The library capsule (600x900 poster) lives at a content-hashed URL that only
// GetItems exposes; older apps also have a fixed-path legacy mirror.
async function libraryCapsuleUrl(appid) {
  const input = encodeURIComponent(
    JSON.stringify({
      ids: [{ appid }],
      context: { language: "english", country_code: "US" },
      data_request: { include_assets: true },
    })
  );
  try {
    const res = await fetchWithTimeout(
      `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${input}`
    );
    if (res.ok) {
      const data = await res.json();
      const assets = data?.response?.store_items?.[0]?.assets;
      if (assets?.library_capsule && assets.asset_url_format) {
        return (
          "https://shared.akamai.steamstatic.com/store_item_assets/" +
          assets.asset_url_format.replace("${FILENAME}", assets.library_capsule)
        );
      }
    }
  } catch {
    // fall through to the legacy mirror
  }
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
}

function clearArt(name) {
  for (const ext of EXTS) {
    const p = path.join(ART_DIR, slug(name) + ext);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

async function fetchSteamArt(name) {
  try {
    const appid = await resolveAppId(name);
    if (!appid) return { ok: false, reason: "not-found" };
    const url = await libraryCapsuleUrl(appid);
    const res = await fetchWithTimeout(url, 15000);
    if (!res.ok) return { ok: false, reason: "no-art" };
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(ART_DIR, { recursive: true });
    clearArt(name);
    const dest = path.join(ART_DIR, slug(name) + ".jpg");
    fs.writeFileSync(dest, buf);
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, reason: "network", error: err.message };
  }
}

function setArtFromFile(name, srcPath) {
  try {
    const ext = path.extname(srcPath).toLowerCase();
    if (!EXTS.includes(ext)) return { ok: false, reason: "bad-type" };
    fs.mkdirSync(ART_DIR, { recursive: true });
    clearArt(name);
    const dest = path.join(ART_DIR, slug(name) + ext);
    fs.copyFileSync(srcPath, dest);
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, reason: "copy-failed", error: err.message };
  }
}

// { [name]: { path, v } } for every game that has cached art. v is the file
// mtime so the renderer can cache-bust <img> after an art swap on the same path.
function listArt(games) {
  const map = {};
  for (const g of games || []) {
    const p = artPathFor(g.name);
    if (p) {
      let v = 0;
      try { v = Math.round(fs.statSync(p).mtimeMs); } catch { /* keep 0 */ }
      map[g.name] = { path: p, v };
    }
  }
  return map;
}

// Boot sweep: fetch art for real, active games that have none. Fails soft per
// game (offline / not on Steam just leaves the letter tile). Returns whether
// anything new landed.
async function fetchMissing(games) {
  let changed = false;
  for (const g of games || []) {
    if (g.entryType === "content" || g.active === false) continue;
    if (artPathFor(g.name)) continue;
    const r = await fetchSteamArt(g.name);
    if (r.ok) changed = true;
  }
  return changed;
}

module.exports = { artPathFor, listArt, fetchSteamArt, setArtFromFile, clearArt, fetchMissing };
