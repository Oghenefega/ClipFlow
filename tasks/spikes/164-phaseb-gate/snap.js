// Phase B gate — world classification + border snap + proposal + scoring.
// Usage: node snap.js <v1|v2|v3>
const fs = require('fs');
const { PNG } = require('pngjs');

const v = process.argv[2];
const det = JSON.parse(fs.readFileSync(`detections-${v}.json`, 'utf8'));
const results = det.results;
const N = results.length;

// ---------- temporal maps at ds2 (same as postprocess) ----------
let W, H, dsW, dsH, sum, sumsq, minG;
for (const r of results) {
  const png = PNG.sync.read(fs.readFileSync('.' + r.frame));
  if (!sum) {
    W = png.width; H = png.height; dsW = W >> 1; dsH = H >> 1;
    sum = new Float64Array(dsW * dsH); sumsq = new Float64Array(dsW * dsH);
    minG = new Float32Array(dsW * dsH).fill(1e9);
  }
  const g = new Float32Array(dsW * dsH);
  for (let y = 0; y < dsH; y++) {
    for (let x = 0; x < dsW; x++) {
      // 2x2 box average so thin (1-2px) lines survive the downsample
      let acc = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = ((y * 2 + dy) * W + (x * 2 + dx)) * 4;
        acc += 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
      }
      g[y * dsW + x] = acc / 4;
    }
  }
  for (let y = 1; y < dsH - 1; y++) {
    for (let x = 1; x < dsW - 1; x++) {
      const k = y * dsW + x, v0 = g[k];
      sum[k] += v0; sumsq[k] += v0 * v0;
      const m = Math.abs(g[k + 1] - g[k - 1]) + Math.abs(g[k + dsW] - g[k - dsW]);
      if (m < minG[k]) minG[k] = m;
    }
  }
}
const V = new Float32Array(dsW * dsH);
for (let k = 0; k < dsW * dsH; k++) V[k] = Math.sqrt(Math.max(0, sumsq[k] / N - (sum[k] / N) ** 2));

// ---------- consensus face (same rule as postprocess) ----------
const diag = Math.hypot(W, H);
const clusters = [];
results.forEach((r, fi) => {
  for (const d of r.detections) {
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    let best = null, bestDist = Infinity;
    for (const c of clusters) {
      const dist = Math.hypot(cx - c.cx, cy - c.cy);
      const sizeRatio = Math.max(d.w / c.w, c.w / d.w);
      if (dist < 0.04 * diag && sizeRatio < 1.6 && dist < bestDist) { best = c; bestDist = dist; }
    }
    if (best) {
      best.members.push({ fi, ...d });
      const n = best.members.length;
      best.cx += (cx - best.cx) / n; best.cy += (cy - best.cy) / n; best.w += (d.w - best.w) / n;
    } else clusters.push({ cx, cy, w: d.w, members: [{ fi, ...d }] });
  }
});
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const scored = clusters.map((c) => ({
  frames: new Set(c.members.map((m) => m.fi)).size,
  meanScore: c.members.reduce((a, m) => a + m.score, 0) / c.members.length,
  spread: Math.sqrt(c.members.reduce((a, m) => a + (m.x + m.w / 2 - c.cx) ** 2 + (m.y + m.h / 2 - c.cy) ** 2, 0) / c.members.length),
  box: { x: median(c.members.map((m) => m.x)), y: median(c.members.map((m) => m.y)), w: median(c.members.map((m) => m.w)), h: median(c.members.map((m) => m.h)) },
})).sort((a, b) => b.frames - a.frames || b.meanScore - a.meanScore);
const cands = scored.filter((c) => c.frames >= Math.ceil(N * 0.75) && c.spread < 0.02 * diag);
if (!cands.length) {
  console.log('NO STATIC FACE — clean no-proposal');
  fs.writeFileSync(`proposal-${v}.json`, JSON.stringify({ world: 'none', reason: 'no stable face cluster' }));
  process.exit(0);
}
const face = cands[0].box; // full-res
const fds = { x: face.x >> 1, y: face.y >> 1, w: face.w >> 1, h: face.h >> 1 }; // ds coords

// ---------- helpers on ds maps ----------
const rowMeanV = (y, x0, x1) => { let s = 0; for (let x = x0; x < x1; x++) s += V[y * dsW + x]; return s / (x1 - x0); };
const colMeanV = (x, y0, y1) => { let s = 0; for (let y = y0; y < y1; y++) s += V[y * dsW + x]; return s / (y1 - y0); };
const rowMeanP = (y, x0, x1) => { let s = 0; for (let x = x0; x < x1; x++) s += minG[y * dsW + x]; return s / (x1 - x0); };
const colMeanP = (x, y0, y1) => { let s = 0; for (let y = y0; y < y1; y++) s += minG[y * dsW + x]; return s / (y1 - y0); };

// ---------- 1) stacked-band check (rows, then cols) ----------
function bandCheck(axis) {
  // profile along axis (rows: y → mean V of full row)
  const len = axis === 'rows' ? dsH : dsW;
  const prof = new Float32Array(len);
  for (let i = 8; i < len - 8; i++) {
    prof[i] = axis === 'rows' ? rowMeanV(i, 8, dsW - 8) : colMeanV(i, 8, dsH - 8);
  }
  const facePos = axis === 'rows' ? fds.y + fds.h / 2 : fds.x + fds.w / 2;
  // quiet run around face: expand while profile < 2.5x the local quiet level
  let i0 = Math.round(facePos), quiet = prof[i0];
  let a = i0, b = i0;
  while (a > 8 && prof[a - 1] < quiet * 2.5 + 3) { a--; quiet = Math.min(quiet, prof[a]); }
  while (b < len - 9 && prof[b + 1] < quiet * 2.5 + 3) { b++; quiet = Math.min(quiet, prof[b]); }
  if (a > 12 && b < len - 13) return null; // quiet region is an island, not a band from an edge
  // loud side mean
  const rest = [];
  for (let i = 8; i < len - 8; i++) if (i < a || i > b) rest.push(prof[i]);
  if (!rest.length) return null;
  const quietMean = (() => { let s = 0, n = 0; for (let i = Math.max(8, a); i <= Math.min(len - 9, b); i++) { s += prof[i]; n++; } return s / n; })();
  const loudMean = rest.reduce((s, x) => s + x, 0) / rest.length;
  if (loudMean < quietMean * 2.5) return null;
  // boundary = biggest step within ±24 of the run end that faces the loud side
  const refine = (approx) => {
    let bestPos = approx, bestDelta = 0;
    for (let i = Math.max(12, approx - 24); i <= Math.min(len - 13, approx + 24); i++) {
      let lo = 0, hi = 0;
      for (let k = 1; k <= 8; k++) { lo += prof[i - k]; hi += prof[i + k]; }
      const d = Math.abs(hi - lo) / 8;
      if (d > bestDelta) { bestDelta = d; bestPos = i; }
    }
    return bestPos + 1; // boundary sits between lo and hi windows
  };
  const bnd = a <= 12 ? refine(b) : refine(a); // which end of the run is interior
  return { axis, quietFrom: a <= 12 ? 0 : bnd, quietTo: a <= 12 ? bnd : len, quietMean: +quietMean.toFixed(1), loudMean: +loudMean.toFixed(1) };
}

// ---------- 2) overlay: connected sharp region of the MEAN image ----------
// Game content averages to mush across frames spread over the session; the
// static cam overlay stays sharp in the mean. Cam rect = bounding box of the
// sharp connected component containing the face.
function meanSharpRegion() {
  const S = new Float32Array(dsW * dsH);
  const vals = [];
  for (let y = 1; y < dsH - 1; y++) {
    for (let x = 1; x < dsW - 1; x++) {
      const k = y * dsW + x;
      const m = (i) => sum[i] / N;
      S[k] = Math.abs(m(k + 1) - m(k - 1)) + Math.abs(m(k + dsW) - m(k - dsW));
      if ((y & 3) === 0 && (x & 3) === 0) vals.push(S[k]);
    }
  }
  vals.sort((a, b) => a - b);
  const med = vals[vals.length >> 1], p90 = vals[Math.floor(vals.length * 0.9)];
  const theta = Math.max(10, 6 * med);
  // quiet threshold from V distribution (game dominates the median)
  const vSamp = [];
  for (let y = 4; y < dsH - 4; y += 4) for (let x = 4; x < dsW - 4; x += 4) vSamp.push(V[y * dsW + x]);
  vSamp.sort((a, b) => a - b);
  const medV = vSamp[vSamp.length >> 1];
  // truly-static interiors sit at V 5-8 regardless of how busy the game is;
  // a relative threshold lets calm sky/HUD zones leak in and bridge regions
  const qTheta = Math.min(10, Math.max(6, 0.2 * medV));
  console.log(`sharpness: median ${med.toFixed(2)} p90 ${p90.toFixed(2)} theta ${theta.toFixed(2)} | medV ${medV.toFixed(1)} qTheta ${qTheta.toFixed(1)}`);
  // cam pixels are sharp-in-mean (static detail) OR temporally quiet (static smooth)
  const mask = new Uint8Array(dsW * dsH);
  for (let k = 0; k < S.length; k++) if (S[k] > theta || V[k] < qTheta) mask[k] = 1;
  // dilate r1 so the flood crosses the person's own high-motion body pixels;
  // the strict qTheta is what prevents sky/HUD bridging
  const dil = new Uint8Array(dsW * dsH);
  for (let y = 1; y < dsH - 1; y++) {
    for (let x = 1; x < dsW - 1; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (mask[(y + dy) * dsW + (x + dx)]) { on = 1; break; }
      }
      dil[y * dsW + x] = on;
    }
  }
  // flood from face box seeds
  const comp = new Uint8Array(dsW * dsH);
  const stack = [];
  for (let y = fds.y; y < fds.y + fds.h; y += 2) {
    for (let x = fds.x; x < fds.x + fds.w; x += 2) {
      if (dil[y * dsW + x]) stack.push(y * dsW + x);
    }
  }
  let minX = dsW, maxX = 0, minY = dsH, maxY = 0, area = 0;
  while (stack.length) {
    const k = stack.pop();
    if (!dil[k] || comp[k]) continue;
    comp[k] = 1; area++;
    const x = k % dsW, y = (k / dsW) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (x > 0) stack.push(k - 1);
    if (x < dsW - 1) stack.push(k + 1);
    if (y > 0) stack.push(k - dsW);
    if (y < dsH - 1) stack.push(k + dsW);
  }
  if (!area) return null;
  // occupancy trim: shave box edges whose rows/cols are sparsely covered
  // (tendrils from HUD bridges), then shrink 1px for dilation compensation
  let bx0 = minX, bx1 = maxX, by0 = minY, by1 = maxY;
  const rowOcc = (y) => { let s = 0; for (let x = bx0; x <= bx1; x++) s += comp[y * dsW + x]; return s / (bx1 - bx0 + 1); };
  const colOcc = (x) => { let s = 0; for (let y = by0; y <= by1; y++) s += comp[y * dsW + x]; return s / (by1 - by0 + 1); };
  for (let pass = 0; pass < 3; pass++) {
    while (by1 > by0 && rowOcc(by0) < 0.12) by0++;
    while (by1 > by0 && rowOcc(by1) < 0.12) by1--;
    while (bx1 > bx0 && colOcc(bx0) < 0.12) bx0++;
    while (bx1 > bx0 && colOcc(bx1) < 0.12) bx1--;
  }
  console.log(`trim: raw (${minX},${minY})-(${maxX},${maxY}) -> (${bx0},${by0})-(${bx1},${by1}) ds`);
  // +1/-1: undo the dilation's one-pixel growth at each edge
  const rect = {
    x: Math.max(0, (bx0 + 1) * 2), y: Math.max(0, (by0 + 1) * 2),
    w: (bx1 - 1) * 2 - Math.max(0, bx0 + 1) * 2 + 2,
    h: (by1 - 1) * 2 - Math.max(0, by0 + 1) * 2 + 2,
  };
  const areaFrac = area / (dsW * dsH);
  console.log(`sharp component: area ${(100 * areaFrac).toFixed(1)}% of frame, rect ${JSON.stringify(rect)}`);
  if (areaFrac > 0.5) return null; // runaway region — refuse rather than propose nonsense
  if (rect.w * rect.h > 0.6 * W * H) return null;
  return rect;
}

// (kept for reference/diagnostics — superseded by meanSharpRegion)
function snapDir(dir, rect) {
  // rect in ds coords; returns snapped edge pos (ds) + diag
  const seg = dir === 'left' || dir === 'right' ? [rect.y, rect.y + rect.h] : [rect.x, rect.x + rect.w];
  const [s0, s1] = seg;
  const along = (p) => (dir === 'left' || dir === 'right' ? colMeanP(p, s0, s1) : rowMeanP(p, s0, s1));
  const vSide = (p, off) => {
    const q0 = p + off * 3, q1 = p + off * 11; // strip 3..11 px away on that side
    const lo = Math.min(q0, q1), hi = Math.max(q0, q1);
    let s = 0, n = 0;
    for (let q = lo; q <= hi; q++) {
      if (q < 1 || q >= (dir === 'left' || dir === 'right' ? dsW - 1 : dsH - 1)) continue;
      s += dir === 'left' || dir === 'right' ? colMeanV(q, s0, s1) : rowMeanV(q, s0, s1);
      n++;
    }
    return n ? s / n : 0;
  };
  const start = { left: rect.x, right: rect.x + rect.w, up: rect.y, down: rect.y + rect.h }[dir];
  const step = dir === 'left' || dir === 'up' ? -1 : 1;
  const limit = dir === 'left' || dir === 'up' ? 2 : (dir === 'right' ? dsW - 3 : dsH - 3);
  const tried = [];
  for (let p = start; step < 0 ? p >= limit : p <= limit; p += step) {
    const P = along(p);
    if (P < 3) continue;
    const Vin = vSide(p, -step), Vout = vSide(p, step);
    const ok = Vout >= Math.max(2 * Vin, Vin + 8);
    tried.push({ pos: p * 2, P: +P.toFixed(1), Vin: +Vin.toFixed(1), Vout: +Vout.toFixed(1), ok });
    if (ok) return { pos: p, tried };
  }
  return { pos: step < 0 ? 0 : (dir === 'right' ? dsW - 1 : dsH - 1), tried, frameEdge: true };
}

// ---------- run ----------
let proposal;
const bandR = bandCheck('rows');
const bandC = bandR ? null : bandCheck('cols');
const band = bandR || bandC;
if (band) {
  const b0 = band.quietFrom * 2, b1 = band.quietTo * 2;
  const cam = band.axis === 'rows'
    ? { x: 0, y: b0, w: W, h: Math.min(b1, H) - b0 }
    : { x: b0, y: 0, w: Math.min(b1, W) - b0, h: H };
  // game = loudest complement band (rest of the frame on the loud side)
  const game = band.axis === 'rows'
    ? (b0 === 0 ? { x: 0, y: cam.y + cam.h, w: W, h: H - (cam.y + cam.h) } : { x: 0, y: 0, w: W, h: b0 })
    : (b0 === 0 ? { x: cam.x + cam.w, y: 0, w: W - (cam.x + cam.w), h: H } : { x: 0, y: 0, w: b0, h: H });
  proposal = { world: 'stacked', axis: band.axis, camRect: cam, gameRect: game, band };
} else {
  const cam = meanSharpRegion();
  if (!cam) {
    proposal = { world: 'none', reason: 'overlay region segmentation failed (clean no-proposal)' };
  } else {
    proposal = { world: 'overlay', camRect: cam, gameRect: { x: 0, y: 0, w: W, h: H } };
  }
}
proposal.face = face;
proposal.frame = { W, H };
console.log(JSON.stringify(proposal, null, 1));
fs.writeFileSync(`proposal-${v}.json`, JSON.stringify(proposal, null, 1));

// ---------- scoring vs answer key ----------
const KEYS = {
  v1: { cam: { x: 0, y: 0, w: 2560, h: 1440 }, game: { x: 144, y: 1433, w: 2273, h: 1447 } },
  m240: { cam: { x: 24, y: 921, w: 240, h: 135 } },
  m320: { cam: { x: 24, y: 24, w: 320, h: 180 } },
  m480: { cam: { x: 1416, y: 786, w: 480, h: 270 } },
};
if (KEYS[v] && proposal.camRect) {
  const k = KEYS[v];
  const e = (a, b) => [Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.x + a.w - b.x - b.w), Math.abs(a.y + a.h - b.y - b.h)];
  const camErr = e(proposal.camRect, k.cam);
  console.log(`SCORE cam edge errors L/T/R/B px: ${camErr.join('/')}  (max ${Math.max(...camErr)}px = ${(100 * Math.max(...camErr) / Math.max(W, H)).toFixed(2)}% of frame)`);
  console.log(`game: world=${proposal.world} (truth: stacked band below cam; taste insets excluded from scoring)`);
}
