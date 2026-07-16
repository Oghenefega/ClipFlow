// ClipFlow #164 Phase B — B1 detection engine (hidden-window page script).
//
// Runs inside build/detect.html in a dedicated hidden BrowserWindow
// (src/main/reframe-detect.js). Plain classic script served as a static
// asset — Vite's publicDir copies it verbatim, so nothing here is bundled
// and the renderer ESM-only rule doesn't apply. The MediaPipe ESM bundle
// is dynamic-imported from a blob URL built out of preload-read bytes
// (file:// pages can't static-import local modules; proven by probe +
// session-106 gate).
//
// Detection algorithm is a 1:1 port of tasks/spikes/164-phaseb-gate/snap.js
// (+ the consensus containment dedupe from postprocess.js). Constants are
// gate-final — do NOT re-derive (see the spike README scorecard).
// The minG map is deliberately omitted: it only fed snapDir(), which the
// gate superseded. NEW vs the gate: native-res edge refinement (overlay
// world only) — see refineEdges().
//
// Output (reported to main): { world: 'stacked'|'overlay'|'nocam'|'none',
//   camRect, gameRect, confidence, faceBox, frame, ... } in source pixels.

(async () => {
  const api = window.reframeDetectAPI;
  const log = (m) => console.log(m);

  const FRAME_COUNT = 8;
  const MIN_DETECTION_CONFIDENCE = 0.35;

  const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

  function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / (a.w * a.h + b.w * b.h - inter);
  }

  function dedupe(dets) {
    dets.sort((a, b) => b.score - a.score);
    const keep = [];
    for (const d of dets) if (!keep.some((k) => iou(k, d) > 0.45)) keep.push(d);
    return keep;
  }

  let video = null;
  let detector = null;
  try {
    const job = await api.getJob();
    if (!job || !job.sourceFile) throw new Error("no detection job");

    // ---------- MediaPipe init from vendored local bytes (zero network) ----------
    const blobUrl = (bytes, type) => URL.createObjectURL(new Blob([bytes], { type }));
    const mod = await import(blobUrl(api.readAsset("vision_bundle.mjs"), "text/javascript"));
    const fileset = {
      wasmLoaderPath: blobUrl(api.readAsset("vision_wasm_internal.js"), "text/javascript"),
      wasmBinaryPath: blobUrl(api.readAsset("vision_wasm_internal.wasm"), "application/wasm"),
    };
    detector = await mod.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: new Uint8Array(api.readAsset("blaze_face_short_range.tflite")) },
      runningMode: "IMAGE",
      minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
    });
    log("detector ready");

    // ---------- open the source video ----------
    video = document.createElement("video");
    video.muted = true;
    video.src = "file:///" + encodeURI(job.sourceFile.replace(/\\/g, "/"));
    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = () => rej(new Error("source video failed to load"));
    });
    const W = video.videoWidth, H = video.videoHeight;
    const duration = video.duration;
    if (!W || !H || !isFinite(duration) || duration <= 0) throw new Error("bad video metadata");
    log(`source ${W}x${H} dur ${duration.toFixed(1)}s`);

    const seekTo = (t) =>
      new Promise((res, rej) => {
        video.onseeked = res;
        video.onerror = () => rej(new Error("seek failed @ " + t.toFixed(1)));
        video.currentTime = t;
      });

    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = W;
    frameCanvas.height = H;
    const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
    const tileCanvas = document.createElement("canvas");

    // ---------- pass A: temporal maps at ds2 + tiled detection per frame ----------
    // (spike snap.js lines 11-42, minus minG; 2x2 box average is load-bearing —
    // point sampling aliases thin cam borders away)
    const dsW = W >> 1, dsH = H >> 1;
    const sum = new Float64Array(dsW * dsH);
    const sumsq = new Float64Array(dsW * dsH);

    const grids = Math.min(W, H) < 1200 ? [2, 4, 6] : [2, 4];
    const timestamps = [];
    for (let i = 0; i < FRAME_COUNT; i++) timestamps.push(duration * (0.1 + (0.8 * i) / (FRAME_COUNT - 1)));

    function detectTile(sx, sy, sw, sh) {
      tileCanvas.width = sw;
      tileCanvas.height = sh;
      const tctx = tileCanvas.getContext("2d");
      tctx.drawImage(frameCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      const out = detector.detect(tileCanvas);
      return out.detections.map((d) => ({
        x: d.boundingBox.originX + sx,
        y: d.boundingBox.originY + sy,
        w: d.boundingBox.width,
        h: d.boundingBox.height,
        score: d.categories[0] ? d.categories[0].score : 0,
      }));
    }

    const results = [];
    const g = new Float32Array(dsW * dsH);
    for (let fi = 0; fi < FRAME_COUNT; fi++) {
      await seekTo(timestamps[fi]);
      frameCtx.drawImage(video, 0, 0);

      // temporal accumulation (interior-only sums, exactly like the spike)
      const px = frameCtx.getImageData(0, 0, W, H).data;
      for (let y = 0; y < dsH; y++) {
        for (let x = 0; x < dsW; x++) {
          let acc = 0;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) {
              const i = ((y * 2 + dy) * W + (x * 2 + dx)) * 4;
              acc += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            }
          g[y * dsW + x] = acc / 4;
        }
      }
      for (let y = 1; y < dsH - 1; y++) {
        for (let x = 1; x < dsW - 1; x++) {
          const k = y * dsW + x, v0 = g[k];
          sum[k] += v0;
          sumsq[k] += v0 * v0;
        }
      }

      // detection: full-frame pass + overlapping tile grids (half-tile stride)
      const dets = detectTile(0, 0, W, H);
      for (const gr of grids) {
        const tw = Math.floor(W / gr), th = Math.floor(H / gr);
        for (let ty = 0; ty + th <= H + th / 2; ty += Math.floor(th / 2)) {
          for (let tx = 0; tx + tw <= W + tw / 2; tx += Math.floor(tw / 2)) {
            const sx = Math.min(tx, W - tw), sy = Math.min(ty, H - th);
            dets.push(...detectTile(sx, sy, tw, th));
            if (sx === W - tw) break;
          }
          if (Math.min(ty, H - th) === H - th) break;
        }
      }
      const kept = dedupe(dets).map((d) => ({
        x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.w), h: Math.round(d.h),
        score: +d.score.toFixed(3),
      }));
      results.push({ detections: kept });
      log(`frame ${fi} @${timestamps[fi].toFixed(1)}s: ${kept.length} face(s) ${JSON.stringify(kept.slice(0, 3))}`);
    }

    // ---------- consensus face cluster (snap.js + postprocess containment dedupe) ----------
    const N = results.length;
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
          best.cx += (cx - best.cx) / n;
          best.cy += (cy - best.cy) / n;
          best.w += (d.w - best.w) / n;
        } else clusters.push({ cx, cy, w: d.w, members: [{ fi, ...d }] });
      }
    });
    const scored = clusters
      .map((c) => ({
        frames: new Set(c.members.map((m) => m.fi)).size,
        meanScore: c.members.reduce((a, m) => a + m.score, 0) / c.members.length,
        spread: Math.sqrt(
          c.members.reduce((a, m) => a + (m.x + m.w / 2 - c.cx) ** 2 + (m.y + m.h / 2 - c.cy) ** 2, 0) / c.members.length
        ),
        box: {
          x: median(c.members.map((m) => m.x)),
          y: median(c.members.map((m) => m.y)),
          w: median(c.members.map((m) => m.w)),
          h: median(c.members.map((m) => m.h)),
        },
      }))
      .sort((a, b) => b.frames - a.frames || b.meanScore - a.meanScore);
    let cands = scored.filter((c) => c.frames >= Math.ceil(N * 0.75) && c.spread < 0.02 * diag);
    const contained = (a, b) => {
      const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
      const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
      return (Math.max(0, x2 - x1) * Math.max(0, y2 - y1)) / (a.w * a.h) > 0.8;
    };
    cands = cands.filter((c) => !cands.some((o) => o !== c && o.meanScore >= c.meanScore && contained(c.box, o.box)));
    log(`clusters ${clusters.length}, top: ${JSON.stringify(scored.slice(0, 3).map((s) => ({ f: s.frames, sc: +s.meanScore.toFixed(2) })))}`);

    if (!cands.length) {
      // 'nocam' = confident there is no static face (strongest cluster spans
      // ≤1 frame); anything murkier is a refusal ('none') — manual stays the path.
      const maxFrames = scored.length ? scored[0].frames : 0;
      api.reportResult(
        maxFrames <= 1
          ? { world: "nocam", camRect: null, gameRect: null, confidence: null, faceBox: null, frame: { w: W, h: H }, reason: `no static face (max cluster in ${maxFrames}/${N} frames)` }
          : { world: "none", camRect: null, gameRect: null, confidence: null, faceBox: null, frame: { w: W, h: H }, reason: "no stable face cluster" }
      );
      return;
    }
    const face = cands[0].box; // full-res px
    const confidence = +cands[0].meanScore.toFixed(3);
    const fds = { x: face.x >> 1, y: face.y >> 1, w: face.w >> 1, h: face.h >> 1 }; // ds coords

    // ---------- temporal variance map ----------
    const V = new Float32Array(dsW * dsH);
    for (let k = 0; k < dsW * dsH; k++) V[k] = Math.sqrt(Math.max(0, sumsq[k] / N - (sum[k] / N) ** 2));

    const rowMeanV = (y, x0, x1) => { let s = 0; for (let x = x0; x < x1; x++) s += V[y * dsW + x]; return s / (x1 - x0); };
    const colMeanV = (x, y0, y1) => { let s = 0; for (let y = y0; y < y1; y++) s += V[y * dsW + x]; return s / (y1 - y0); };

    // ---------- 1) stacked-band check (snap.js bandCheck, verbatim) ----------
    function bandCheck(axis) {
      const len = axis === "rows" ? dsH : dsW;
      const prof = new Float32Array(len);
      for (let i = 8; i < len - 8; i++) {
        prof[i] = axis === "rows" ? rowMeanV(i, 8, dsW - 8) : colMeanV(i, 8, dsH - 8);
      }
      const facePos = axis === "rows" ? fds.y + fds.h / 2 : fds.x + fds.w / 2;
      let i0 = Math.round(facePos), quiet = prof[i0];
      let a = i0, b = i0;
      while (a > 8 && prof[a - 1] < quiet * 2.5 + 3) { a--; quiet = Math.min(quiet, prof[a]); }
      while (b < len - 9 && prof[b + 1] < quiet * 2.5 + 3) { b++; quiet = Math.min(quiet, prof[b]); }
      if (a > 12 && b < len - 13) return null; // quiet island, not an edge-anchored band
      const rest = [];
      for (let i = 8; i < len - 8; i++) if (i < a || i > b) rest.push(prof[i]);
      if (!rest.length) return null;
      const quietMean = (() => { let s = 0, n = 0; for (let i = Math.max(8, a); i <= Math.min(len - 9, b); i++) { s += prof[i]; n++; } return s / n; })();
      const loudMean = rest.reduce((s, x) => s + x, 0) / rest.length;
      if (loudMean < quietMean * 2.5) return null;
      const refine = (approx) => {
        let bestPos = approx, bestDelta = 0;
        for (let i = Math.max(12, approx - 24); i <= Math.min(len - 13, approx + 24); i++) {
          let lo = 0, hi = 0;
          for (let k = 1; k <= 8; k++) { lo += prof[i - k]; hi += prof[i + k]; }
          const d = Math.abs(hi - lo) / 8;
          if (d > bestDelta) { bestDelta = d; bestPos = i; }
        }
        return bestPos + 1;
      };
      const bnd = a <= 12 ? refine(b) : refine(a);
      return { axis, quietFrom: a <= 12 ? 0 : bnd, quietTo: a <= 12 ? bnd : len, quietMean: +quietMean.toFixed(1), loudMean: +loudMean.toFixed(1) };
    }

    // ---------- 2) overlay: connected sharp/quiet region of the mean image ----------
    // (snap.js meanSharpRegion, verbatim incl. refusal caps)
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
      const med = vals[vals.length >> 1];
      const theta = Math.max(10, 6 * med);
      const vSamp = [];
      for (let y = 4; y < dsH - 4; y += 4) for (let x = 4; x < dsW - 4; x += 4) vSamp.push(V[y * dsW + x]);
      vSamp.sort((a, b) => a - b);
      const medV = vSamp[vSamp.length >> 1];
      const qTheta = Math.min(10, Math.max(6, 0.2 * medV));
      log(`sharpness: median ${med.toFixed(2)} theta ${theta.toFixed(2)} | medV ${medV.toFixed(1)} qTheta ${qTheta.toFixed(1)}`);
      const mask = new Uint8Array(dsW * dsH);
      for (let k = 0; k < S.length; k++) if (S[k] > theta || V[k] < qTheta) mask[k] = 1;
      const dil = new Uint8Array(dsW * dsH);
      for (let y = 1; y < dsH - 1; y++) {
        for (let x = 1; x < dsW - 1; x++) {
          let on = 0;
          for (let dy = -1; dy <= 1 && !on; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (mask[(y + dy) * dsW + (x + dx)]) { on = 1; break; }
            }
          dil[y * dsW + x] = on;
        }
      }
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
        comp[k] = 1;
        area++;
        const x = k % dsW, y = (k / dsW) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0) stack.push(k - 1);
        if (x < dsW - 1) stack.push(k + 1);
        if (y > 0) stack.push(k - dsW);
        if (y < dsH - 1) stack.push(k + dsW);
      }
      if (!area) return null;
      let bx0 = minX, bx1 = maxX, by0 = minY, by1 = maxY;
      const rowOcc = (y) => { let s = 0; for (let x = bx0; x <= bx1; x++) s += comp[y * dsW + x]; return s / (bx1 - bx0 + 1); };
      const colOcc = (x) => { let s = 0; for (let y = by0; y <= by1; y++) s += comp[y * dsW + x]; return s / (by1 - by0 + 1); };
      for (let pass = 0; pass < 3; pass++) {
        while (by1 > by0 && rowOcc(by0) < 0.12) by0++;
        while (by1 > by0 && rowOcc(by1) < 0.12) by1--;
        while (bx1 > bx0 && colOcc(bx0) < 0.12) bx0++;
        while (bx1 > bx0 && colOcc(bx1) < 0.12) bx1--;
      }
      const rect = {
        x: Math.max(0, (bx0 + 1) * 2),
        y: Math.max(0, (by0 + 1) * 2),
        w: (bx1 - 1) * 2 - Math.max(0, bx0 + 1) * 2 + 2,
        h: (by1 - 1) * 2 - Math.max(0, by0 + 1) * 2 + 2,
      };
      const areaFrac = area / (dsW * dsH);
      log(`sharp component: area ${(100 * areaFrac).toFixed(1)}% rect ${JSON.stringify(rect)}`);
      if (areaFrac > 0.5) return null; // runaway region — refuse, never propose nonsense
      if (rect.w * rect.h > 0.6 * W * H) return null;
      return rect;
    }

    // ---------- 3) NEW vs gate: native-res edge refinement (overlay only) ----------
    // The ds2 flood+trim systematically shaves soft (borderless) cam edges —
    // v3's right edge came back ~54px short at the gate. At native res the cam
    // boundary is still a clean temporal-activity step: median |Δluma| between
    // two far-apart frames is ~0 on the static cam side and loud on the game
    // side. Each edge re-searches ±REFINE_RANGE px and only moves on a decisive
    // step (loud ≥ max(2×quiet, quiet+8)); otherwise the coarse edge stands.
    // Stacked bands skip this — their variance boundaries gated at 0-2px.
    const REFINE_RANGE = 60;
    const REFINE_WIN = 12;
    async function refineEdges(rect) {
      const lumaStrip = (sx, sy, sw, sh) => {
        // returns luma Float32Array of the strip (row-major sw x sh)
        const data = frameCtx.getImageData(sx, sy, sw, sh).data;
        const out = new Float32Array(sw * sh);
        for (let i = 0, p = 0; i < out.length; i++, p += 4) {
          out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        }
        return out;
      };
      // grab strips around all four edges for two far-apart frames
      const edges = {
        left: { pos: rect.x, vertical: true },
        right: { pos: rect.x + rect.w, vertical: true },
        top: { pos: rect.y, vertical: false },
        bottom: { pos: rect.y + rect.h, vertical: false },
      };
      const spanY0 = Math.round(rect.y + 0.1 * rect.h), spanY1 = Math.round(rect.y + 0.9 * rect.h);
      const spanX0 = Math.round(rect.x + 0.1 * rect.w), spanX1 = Math.round(rect.x + 0.9 * rect.w);
      for (const e of Object.values(edges)) {
        if (e.vertical) {
          e.lo = Math.max(0, e.pos - REFINE_RANGE);
          e.hi = Math.min(W, e.pos + REFINE_RANGE);
          e.s0 = spanY0; e.s1 = spanY1;
        } else {
          e.lo = Math.max(0, e.pos - REFINE_RANGE);
          e.hi = Math.min(H, e.pos + REFINE_RANGE);
          e.s0 = spanX0; e.s1 = spanX1;
        }
      }
      const strips = [{}, {}];
      for (let s = 0; s < 2; s++) {
        await seekTo(timestamps[s === 0 ? 2 : 5]);
        frameCtx.drawImage(video, 0, 0);
        for (const [name, e] of Object.entries(edges)) {
          if (e.hi - e.lo < REFINE_WIN * 2 + 2 || e.s1 - e.s0 < 8) { strips[s][name] = null; continue; }
          strips[s][name] = e.vertical
            ? lumaStrip(e.lo, e.s0, e.hi - e.lo, e.s1 - e.s0)
            : lumaStrip(e.s0, e.lo, e.s1 - e.s0, e.hi - e.lo);
        }
      }
      // per-edge: profile of median |Δluma| per line parallel to the edge
      const refined = { ...rect };
      for (const [name, e] of Object.entries(edges)) {
        const A = strips[0][name], B = strips[1][name];
        if (!A || !B) continue;
        const lines = e.hi - e.lo;
        const span = e.s1 - e.s0;
        const P = new Float32Array(lines);
        const samples = [];
        for (let li = 0; li < lines; li++) {
          samples.length = 0;
          for (let t = 0; t < span; t += 2) {
            const idx = e.vertical ? t * lines + li : li * span + t;
            samples.push(Math.abs(A[idx] - B[idx]));
          }
          P[li] = median(samples);
        }
        // inside direction: left/top edges have the cam at increasing index;
        // right/bottom at decreasing index
        const insideUp = name === "left" || name === "top";
        // Two-part rule (v3 left/top edges, session 107): the long windows
        // (WIN=12) qualify a quiet-inside/loud-outside candidate, but the
        // WINNER is the sharpest short-range step — a hard cam boundary jumps
        // quiet→loud across ~2 lines (grad ≥ ~17 on the gate footage), while
        // a feathered edge ramps ~1-2 per line and must not win argmax.
        let bestGrad = 0, bestPos = -1;
        for (let p = REFINE_WIN; p <= lines - REFINE_WIN - 1; p++) {
          let inMean = 0, outMean = 0;
          for (let k = 0; k < REFINE_WIN; k++) {
            if (insideUp) { inMean += P[p + k]; outMean += P[p - 1 - k]; }
            else { inMean += P[p - k]; outMean += P[p + 1 + k]; }
          }
          inMean /= REFINE_WIN;
          outMean /= REFINE_WIN;
          if (outMean < Math.max(2 * inMean, inMean + 8)) continue;
          let inShort = 0, outShort = 0;
          for (let k = 0; k < 3; k++) {
            if (insideUp) { inShort += P[p + k]; outShort += P[p - 1 - k]; }
            else { inShort += P[p - k]; outShort += P[p + 1 + k]; }
          }
          const grad = (outShort - inShort) / 3;
          if (grad > bestGrad) { bestGrad = grad; bestPos = p; }
        }
        if (bestPos < 0 || bestGrad < 6) { log(`refine ${name}: no decisive step, keeping ${e.pos}`); continue; }
        const abs = e.lo + bestPos + (insideUp ? 0 : 1);
        log(`refine ${name}: ${e.pos} -> ${abs} (grad ${bestGrad.toFixed(1)})`);
        if (name === "left") { refined.w += refined.x - abs; refined.x = abs; }
        else if (name === "right") refined.w = abs - refined.x;
        else if (name === "top") { refined.h += refined.y - abs; refined.y = abs; }
        else refined.h = abs - refined.y;
      }
      return refined;
    }

    // ---------- run world classification + proposal ----------
    let proposal;
    const bandR = bandCheck("rows");
    const bandC = bandR ? null : bandCheck("cols");
    const band = bandR || bandC;
    if (band) {
      const b0 = band.quietFrom * 2, b1 = band.quietTo * 2;
      const cam = band.axis === "rows"
        ? { x: 0, y: b0, w: W, h: Math.min(b1, H) - b0 }
        : { x: b0, y: 0, w: Math.min(b1, W) - b0, h: H };
      const game = band.axis === "rows"
        ? (b0 === 0 ? { x: 0, y: cam.y + cam.h, w: W, h: H - (cam.y + cam.h) } : { x: 0, y: 0, w: W, h: b0 })
        : (b0 === 0 ? { x: cam.x + cam.w, y: 0, w: W - (cam.x + cam.w), h: H } : { x: 0, y: 0, w: b0, h: H });
      proposal = { world: "stacked", axis: band.axis, camRect: cam, gameRect: game, band };
    } else {
      const coarse = meanSharpRegion();
      if (!coarse) {
        proposal = { world: "none", camRect: null, gameRect: null, reason: "overlay region segmentation failed (clean no-proposal)" };
      } else {
        const cam = await refineEdges(coarse);
        proposal = { world: "overlay", camRect: cam, gameRect: { x: 0, y: 0, w: W, h: H }, coarseRect: coarse };
      }
    }
    proposal.faceBox = face;
    proposal.confidence = confidence;
    proposal.frame = { w: W, h: H };
    log("proposal " + JSON.stringify(proposal));
    api.reportResult(proposal);
  } catch (e) {
    api.reportError(String((e && e.stack) || e));
  } finally {
    // every hidden <video> gets torn down (Chromium DOMDataStore crash memory)
    if (video) {
      try { video.removeAttribute("src"); video.load(); } catch (_) {}
    }
    if (detector) {
      try { detector.close(); } catch (_) {}
    }
  }
})();
