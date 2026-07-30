/**
 * audioPeaks.js — waveform peaks for sound FILES, shared by the timeline blocks
 * and the Audio panel rows (#211).
 *
 * Peaks come from `assets:peaks`, which caches them on disk per file. This module
 * is the in-memory layer on top: one fetch per path per session, shared by every
 * consumer (the same sound placed five times draws five waveforms from one
 * extraction), plus the concurrency cap the panel needs.
 *
 * The cap is the whole reason this is centralised. Each extraction is an FFmpeg
 * decode, and Fega's library is 761 files / 12.6 GB — asking for all of them at
 * once would stall the panel and hammer the drive. Rows request lazily as they
 * scroll into view; a placed timeline block jumps the queue, because it's already
 * on screen and visibly missing its shape.
 */

const MAX_CONCURRENT = 3;

const cache = new Map();   // path -> number[] (peaks) | null (tried and failed)
const pending = new Map(); // path -> Promise<number[]|null>
const waiting = [];        // [{ path, priority, run }] — queued behind the cap
let active = 0;

/** Peaks already in memory, or null. Never triggers a fetch. */
export function getCachedPeaks(path) {
  return cache.get(path) ?? null;
}

export function hasTriedPeaks(path) {
  return cache.has(path);
}

function pump() {
  while (active < MAX_CONCURRENT && waiting.length > 0) {
    // Priority requests first; otherwise FIFO, so the rows nearest the top of
    // the viewport (queued first) win.
    let i = waiting.findIndex((w) => w.priority);
    if (i < 0) i = 0;
    const next = waiting.splice(i, 1)[0];
    active++;
    next.run();
  }
}

/**
 * Fetch peaks for a file, de-duped and capped. Resolves null when the file has
 * no readable audio — cached as null so it isn't retried on every scroll.
 */
export function requestPeaks(path, { priority = false } = {}) {
  if (!path) return Promise.resolve(null);
  if (cache.has(path)) return Promise.resolve(cache.get(path));
  if (pending.has(path)) return pending.get(path);

  const p = new Promise((resolve) => {
    const run = () => {
      const req = window.clipflow?.assetsPeaks?.(path);
      const settle = (peaks) => {
        cache.set(path, peaks);
        pending.delete(path);
        active--;
        resolve(peaks);
        pump();
      };
      (req && typeof req.then === "function" ? req : Promise.resolve(null))
        .then((r) => settle(r?.peaks?.length ? r.peaks : null))
        .catch(() => settle(null));
    };
    waiting.push({ path, priority, run });
  });

  pending.set(path, p);
  pump();
  return p;
}

/**
 * Draw a filled symmetrical waveform. `from`/`to` are fractions of the FILE, so a
 * timeline block can show just the window it plays while the library row shows the
 * whole thing.
 *
 * Amplitudes are normalised against the WHOLE file (not the window) so a quiet
 * tail still reads as quiet, and gamma-corrected because raw linear peaks make
 * everything but the transient look like silence.
 */
export function drawPeaks(canvas, peaks, { width, height, color, from = 0, to = 1, gamma = 0.65, ampRatio = 0.42 }) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!peaks || peaks.length === 0) return;

  const lo = Math.floor(Math.max(0, Math.min(1, from)) * peaks.length);
  const hi = Math.max(lo + 1, Math.ceil(Math.max(0, Math.min(1, to)) * peaks.length));
  const win = peaks.slice(lo, hi);

  let maxPeak = 0.01;
  for (let i = 0; i < peaks.length; i++) if (peaks[i] > maxPeak) maxPeak = peaks[i];

  const centerY = h / 2;
  const maxAmp = h * ampRatio;
  const points = Math.max(1, Math.min(win.length, Math.floor(w)));
  const per = win.length / points;
  const ampAt = (i) => {
    let m = 0;
    for (let j = Math.floor(i * per); j < Math.min(Math.floor((i + 1) * per) + 1, win.length); j++) {
      if (win[j] > m) m = win[j];
    }
    return Math.max(0.5, Math.pow(m / maxPeak, gamma) * maxAmp);
  };

  ctx.beginPath();
  ctx.moveTo(0, centerY);
  for (let i = 0; i < points; i++) ctx.lineTo((i / points) * w, centerY - ampAt(i));
  for (let i = points - 1; i >= 0; i--) ctx.lineTo((i / points) * w, centerY + ampAt(i));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
