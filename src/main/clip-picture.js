/**
 * #454: a clip's picture (`clip.thumbnailPath`).
 *
 * The picture is the frame picked in the Queue (`clip.youtubeThumbnailTime`, seconds;
 * unset = the first frame), cut from the rendered file. Every screen shows it, and the
 * same moment is the cover on YouTube, TikTok and Instagram (#450, #455). Two writers
 * cut it — a render finishing and a new pick — and both go through here, so they name,
 * check and retire pictures the same way.
 */
const fs = require("fs");
const path = require("path");

const PICTURE_SUFFIX = "_renderthumb.jpg";

// Keep the moment inside the file: a seek at or past the end decodes nothing, and a
// re-trimmed render can be shorter than it was when the frame was picked. Same rule
// as the YouTube cut at publish time (youtube-publish.js setThumbnailFromFrame).
function clampPickTime(time, duration) {
  let t = Number.isFinite(time) && time > 0 ? time : 0;
  if (duration > 0) t = Math.min(t, Math.max(0, duration - 0.1));
  return t;
}

// #455: the picked moment as whole milliseconds for a platform's cover field (TikTok
// video_cover_timestamp_ms, Instagram thumb_offset), or null with no pick. Both platforms
// default to the first frame, so nothing is sent for one.
function pickCoverMs(time, duration) {
  const t = clampPickTime(time, duration);
  return t > 0 ? Math.round(t * 1000) : null;
}

// A new name per cut (#446): Chromium keeps the first image it loaded for a file URL
// for the whole session, so writing over one name left every screen on the old frame.
// Id-keyed, so a retitle never has to move it (projects.js renameThumbnailTo).
async function cutPicture({ videoPath, clipsDir, clipId, time, cut, now = Date.now }) {
  fs.mkdirSync(clipsDir, { recursive: true });
  const out = path.join(clipsDir, `${clipId}_${now()}${PICTURE_SUFFIX}`);
  await cut(videoPath, out, time);
  // ffmpeg can exit 0 without writing a frame (a seek past the end).
  let size = 0;
  try { size = fs.statSync(out).size; } catch (_) { /* not written */ }
  if (!(size > 0)) {
    try { fs.rmSync(out, { force: true }); } catch (_) { /* nothing to remove */ }
    throw new Error(`no frame was written at ${time}s`);
  }
  return out;
}

// Delete a superseded picture, but only one this code wrote (id-keyed, in the clip's
// own folder) and only when no clip in the project still points at it. A duplicated
// clip shares its parent's picture, and deleting it on the parent's re-render left the
// copy blank. `project` is the project as saved AFTER the update; without it, keep the file.
function retirePicture(prevPath, { newPath, clipsDir, project }) {
  if (!prevPath || prevPath === newPath || !project) return false;
  if (!prevPath.endsWith(PICTURE_SUFFIX) || path.dirname(prevPath) !== clipsDir) return false;
  if ((project.clips || []).some((c) => c.thumbnailPath === prevPath)) return false;
  try {
    fs.rmSync(prevPath, { force: true });
    return true;
  } catch (_) {
    return false; // EBUSY etc.: an orphan picture is harmless, a failed save is not
  }
}

module.exports = { PICTURE_SUFFIX, clampPickTime, pickCoverMs, cutPicture, retirePicture };
