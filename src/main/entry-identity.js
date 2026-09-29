/**
 * #475: change a game or content type's name, tag or type, and carry its
 * history with it.
 *
 * The main process moves what lives on disk and in the database: file_metadata
 * and the other tag-keyed tables, game_profiles.json, project.json and
 * assets.json tags, and the art file. Settings keys the renderer owns and
 * persists (gamesDb, ytDescriptions, trackerData, …) are rewritten there by
 * src/shared/entryIdentity.js — writing them here would be overwritten by the
 * renderer's next save.
 *
 * Recording files and project names are never touched: the files may be linked
 * from an editor (Resolve), and feedback.video_id is the project name.
 */
const path = require("path");
const fs = require("fs");
const { writeFileAtomicSync } = require("./atomic-write");
const { describe, mapTag } = require("../shared/entryIdentity");

const lc = (s) => String(s || "").toLowerCase();

function scalar(db, sql, params) {
  const r = db.exec(sql, params);
  return r.length ? r[0].values[0][0] : 0;
}

function rows(db, sql, params) {
  const r = db.exec(sql, params);
  if (!r.length) return [];
  const cols = r[0].columns;
  return r[0].values.map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
}

function projectFiles(libraryRoot) {
  const root = path.join(libraryRoot, ".clipflow", "projects");
  if (!libraryRoot || !fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("proj_"))
    .map((d) => path.join(root, d.name, "project.json"))
    .filter((p) => fs.existsSync(p));
}

/** Rewrite one project object in place; returns the number of fields changed. */
function rewriteProject(proj, change, flags) {
  let n = 0;
  const set = (obj, key, val) => { if (obj[key] !== val) { obj[key] = val; n++; } };
  if (flags.nameChanged && proj.game === change.oldName) set(proj, "game", change.newName);
  if (flags.tagChanged) set(proj, "gameTag", mapTag(proj.gameTag, change.oldTag, change.newTag));
  for (const clip of proj.clips || []) {
    if (flags.tagChanged && clip.gameTag !== undefined) set(clip, "gameTag", mapTag(clip.gameTag, change.oldTag, change.newTag));
    if (flags.nameChanged && clip.gameName === change.oldName) set(clip, "gameName", change.newName);
  }
  return n;
}

function artFile(artDir, slugFn, name) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const p = path.join(artDir, slugFn(name) + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readProfiles(profilesPath) {
  try { return JSON.parse(fs.readFileSync(profilesPath, "utf-8")); } catch (_) { return {}; }
}

function assetsIndexPath(libraryRoot) {
  return path.join(libraryRoot, ".clipflow", "assets", "assets.json");
}

/**
 * Count everything a change would move, without writing.
 * ctx: { db, libraryRoot, profilesPath, artDir, slug }
 */
function preview(ctx, change) {
  const flags = describe(change);
  const { db } = ctx;
  const t = change.oldTag;
  const counts = { recordings: 0, feedback: 0, labels: 0, reposts: 0, titleRounds: 0, projects: 0, clips: 0, assets: 0, profile: false, art: false };
  if (flags.tagChanged || flags.typeChanged) {
    counts.recordings = scalar(db, "SELECT count(*) FROM file_metadata WHERE tag = ?", [t]);
  }
  if (flags.tagChanged) {
    counts.feedback = scalar(db, "SELECT count(*) FROM feedback WHERE game_tag = ?", [t]);
    counts.labels = scalar(db, "SELECT count(*) FROM custom_labels WHERE tag = ?", [t]);
    counts.reposts = scalar(db, "SELECT count(*) FROM reposts WHERE lower(game) = ?", [lc(t)]);
    counts.profile = Object.prototype.hasOwnProperty.call(readProfiles(ctx.profilesPath), t);
  }
  if (flags.tagChanged || flags.nameChanged) {
    // Same matching as apply: tag rows case-insensitively, name rows exactly.
    counts.titleRounds = scalar(db,
      "SELECT count(*) FROM title_caption_rounds WHERE (? AND lower(game) = ?) OR (? AND game = ?)",
      [flags.tagChanged ? 1 : 0, lc(t), flags.nameChanged ? 1 : 0, change.oldName]);
    for (const file of projectFiles(ctx.libraryRoot)) {
      let proj;
      try { proj = JSON.parse(fs.readFileSync(file, "utf-8")); } catch (_) { continue; }
      const probe = JSON.parse(JSON.stringify(proj));
      if (rewriteProject(probe, change, flags) > 0) {
        counts.projects++;
        counts.clips += (proj.clips || []).filter((c) =>
          (flags.tagChanged && lc(c.gameTag) === lc(t)) || (flags.nameChanged && c.gameName === change.oldName)).length;
      }
    }
    if (flags.tagChanged) {
      try {
        const idx = JSON.parse(fs.readFileSync(assetsIndexPath(ctx.libraryRoot), "utf8"));
        counts.assets = (idx.assets || []).filter((a) => lc(a.gameTag) === lc(t)).length;
      } catch (_) { /* no media library yet */ }
    }
    if (flags.nameChanged) counts.art = !!artFile(ctx.artDir, ctx.slug, change.oldName);
  }
  return { flags, counts };
}

/**
 * Refuse a change that would collide with another entry or run under a job.
 * gamesDb is the list as it is before the change.
 */
function refusal(gamesDb, change, busyTags = []) {
  const others = (gamesDb || []).filter((g) => g.name !== change.oldName);
  if (change.newName && others.some((g) => lc(g.name) === lc(change.newName))) return `Another entry is already called "${change.newName}".`;
  if (change.newTag && others.some((g) => lc(g.tag) === lc(change.newTag))) return `Another entry already uses the tag ${change.newTag}.`;
  if (busyTags.some((b) => lc(b) === lc(change.oldTag))) return "Clips for this entry are being generated or rendered. Try again when that finishes.";
  return null;
}

/**
 * Apply a change. Backs up first, then moves each store and returns what moved.
 * ctx: { db, saveDb, dbPath, settingsPath, profilesPath, artDir, slug, libraryRoot, backupDir }
 */
function apply(ctx, change) {
  const flags = describe(change);
  const { db } = ctx;
  const oldT = change.oldTag;
  const newT = change.newTag || oldT;
  const moved = { recordings: 0, feedback: 0, labels: 0, reposts: 0, titleRounds: 0, snapshots: 0, projects: 0, assets: 0, profile: false, art: false, backupDir: ctx.backupDir };

  // 1. Backup — the database is flushed first so the copy is current.
  fs.mkdirSync(ctx.backupDir, { recursive: true });
  ctx.saveDb();
  for (const f of [ctx.dbPath, ctx.settingsPath, ctx.profilesPath]) {
    if (f && fs.existsSync(f)) fs.copyFileSync(f, path.join(ctx.backupDir, path.basename(f)));
  }

  // 2. Database, in one transaction.
  db.run("BEGIN");
  try {
    if (flags.tagChanged || flags.typeChanged) {
      // Snapshots first, while file_metadata still carries the old tag — Undo
      // writes a snapshot back, and must not bring the old tag or type with it.
      for (const r of rows(db, "SELECT h.id, h.metadata_snapshot FROM rename_history h WHERE h.metadata_snapshot IS NOT NULL AND h.file_metadata_id IN (SELECT id FROM file_metadata WHERE tag = ?)", [oldT])) {
        let snap;
        try { snap = JSON.parse(r.metadata_snapshot); } catch (_) { continue; }
        if (!snap || snap.tag !== oldT) continue;
        snap.tag = newT;
        if (flags.typeChanged && "entry_type" in snap) snap.entry_type = change.newType;
        db.run("UPDATE rename_history SET metadata_snapshot = ? WHERE id = ?", [JSON.stringify(snap), r.id]);
        moved.snapshots++;
      }
    }
    if (flags.tagChanged) {
      moved.recordings = scalar(db, "SELECT count(*) FROM file_metadata WHERE tag = ?", [oldT]);
      db.run("UPDATE file_metadata SET tag = ?, updated_at = datetime('now') WHERE tag = ?", [newT, oldT]);
      moved.feedback = scalar(db, "SELECT count(*) FROM feedback WHERE game_tag = ?", [oldT]);
      db.run("UPDATE feedback SET game_tag = ? WHERE game_tag = ?", [newT, oldT]);
      // custom_labels is UNIQUE(tag, label): fold a label the new tag already
      // has into it (use counts summed), then move the rest.
      for (const r of rows(db, "SELECT o.id AS oldId, o.use_count AS oldCount, n.id AS newId FROM custom_labels o JOIN custom_labels n ON n.label = o.label AND n.tag = ? WHERE o.tag = ?", [newT, oldT])) {
        db.run("UPDATE custom_labels SET use_count = use_count + ? WHERE id = ?", [r.oldCount, r.newId]);
        db.run("DELETE FROM custom_labels WHERE id = ?", [r.oldId]);
        moved.labels++;
      }
      moved.labels += scalar(db, "SELECT count(*) FROM custom_labels WHERE tag = ?", [oldT]);
      db.run("UPDATE custom_labels SET tag = ? WHERE tag = ?", [newT, oldT]);
      moved.reposts = scalar(db, "SELECT count(*) FROM reposts WHERE lower(game) = ?", [lc(oldT)]);
      db.run("UPDATE reposts SET game = ? WHERE lower(game) = ?", [lc(newT), lc(oldT)]);
      moved.titleRounds += scalar(db, "SELECT count(*) FROM title_caption_rounds WHERE lower(game) = ?", [lc(oldT)]);
      db.run("UPDATE title_caption_rounds SET game = ? WHERE lower(game) = ?", [lc(newT), lc(oldT)]);
    }
    if (flags.nameChanged) {
      moved.titleRounds += scalar(db, "SELECT count(*) FROM title_caption_rounds WHERE game = ?", [change.oldName]);
      db.run("UPDATE title_caption_rounds SET game = ? WHERE game = ?", [change.newName, change.oldName]);
    }
    if (flags.typeChanged) {
      db.run("UPDATE file_metadata SET entry_type = ? WHERE tag = ?", [change.newType, newT]);
      if (!flags.tagChanged) moved.recordings = scalar(db, "SELECT count(*) FROM file_metadata WHERE tag = ?", [newT]);
    }
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
  ctx.saveDb();

  // Steps 3-5 touch files that can be locked or on a synced drive. The
  // database has already moved, so a failure here must not stop the rest (or
  // the renderer's settings rewrite): each step records what didn't move.
  const problems = [];
  const step = (label, fn) => {
    try { fn(); } catch (err) { problems.push(`${label}: ${err.message}`); }
  };

  // 3. Detection profile — the key is the tag; the record also names the game.
  if (flags.tagChanged || flags.nameChanged) {
    step("detection profile", () => {
      const profiles = readProfiles(ctx.profilesPath);
      const prof = profiles[oldT];
      if (!prof) return;
      delete profiles[oldT];
      profiles[newT] = { ...prof, gameTag: newT, gameName: flags.nameChanged ? change.newName : prof.gameName };
      fs.mkdirSync(path.dirname(ctx.profilesPath), { recursive: true });
      fs.writeFileSync(ctx.profilesPath, JSON.stringify(profiles, null, 2), "utf-8");
      moved.profile = true;
    });
  }

  // 4. Project files (one at a time, so a locked file skips only itself) and the media library.
  if (flags.tagChanged || flags.nameChanged) {
    for (const file of projectFiles(ctx.libraryRoot)) {
      let proj;
      try { proj = JSON.parse(fs.readFileSync(file, "utf-8")); } catch (_) { continue; }
      if (rewriteProject(proj, change, flags) > 0) {
        step(`project ${path.basename(path.dirname(file))}`, () => {
          writeFileAtomicSync(file, JSON.stringify(proj, null, 2));
          moved.projects++;
        });
      }
    }
  }
  if (flags.tagChanged && ctx.libraryRoot && fs.existsSync(assetsIndexPath(ctx.libraryRoot))) {
    step("media library", () => {
      const idxPath = assetsIndexPath(ctx.libraryRoot);
      const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      let n = 0;
      for (const a of idx.assets || []) {
        const next = mapTag(a.gameTag, oldT, newT);
        if (next !== a.gameTag) { a.gameTag = next; n++; }
      }
      if (n) { fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2)); moved.assets = n; }
    });
  }

  // 5. Art is stored under the name.
  if (flags.nameChanged) {
    step("game art", () => {
      const from = artFile(ctx.artDir, ctx.slug, change.oldName);
      if (!from) return;
      const to = path.join(ctx.artDir, ctx.slug(change.newName) + path.extname(from));
      if (from !== to) { fs.renameSync(from, to); moved.art = true; }
    });
  }

  moved.problems = problems;
  return { flags, moved };
}

module.exports = { preview, refusal, apply };
