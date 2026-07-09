// Renders the weekly recap card to a PNG blob for sharing — hand-drawn on an
// offscreen canvas so the exported image matches the in-app recap card design.
import tiktokIcon from "../assets/platforms/tiktok.svg";
import youtubeIcon from "../assets/platforms/youtube.png";
import instagramIcon from "../assets/platforms/instagram.png";
import facebookIcon from "../assets/platforms/facebook.png";

const PLATFORM_ICON_SRC = { tiktok: tiktokIcon, youtube: youtubeIcon, instagram: instagramIcon, facebook: facebookIcon };
const PLATFORM_LABEL = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };
const PLATFORM_ORDER = ["tiktok", "youtube", "instagram", "facebook"];

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
};
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

const roundRectPath = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

/**
 * Draws the shareable weekly recap card to an offscreen canvas as a 1080×1920
 * portrait story image (full-res, no supersampling needed) and resolves with
 * a PNG Blob. Mirrors the in-app recap card's dark-theme palette.
 */
export async function renderRecapPng({ game, gameColor, clips, platformsUsed, perPlatform, streak, rankName, rankColor, weekLabel }) {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* fonts best-effort */ }
  }

  const SCALE = 1;
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = "#111218";
  roundRectPath(ctx, 0, 0, W, H, 32);
  ctx.fill();

  // Clip to rounded rect for washes
  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, 32);
  ctx.clip();

  // Wash A: linear 115deg
  const gradA = ctx.createLinearGradient(0, 0, W * Math.cos((115 * Math.PI) / 180), H * Math.sin((115 * Math.PI) / 180));
  gradA.addColorStop(0, rgba(gameColor, 0.22));
  gradA.addColorStop(0.5, rgba(gameColor, 0.04));
  gradA.addColorStop(1, "rgba(17,18,24,0)");
  ctx.fillStyle = gradA;
  ctx.fillRect(0, 0, W, H);

  // Wash B: radial at bottom-right
  const gradB = ctx.createRadialGradient(W * 0.92, H, 0, W * 0.92, H, W * 0.75);
  gradB.addColorStop(0, rgba(gameColor, 0.16));
  gradB.addColorStop(1, "rgba(17,18,24,0)");
  ctx.fillStyle = gradB;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Border
  ctx.save();
  roundRectPath(ctx, 0.5, 0.5, W - 1, H - 1, 32);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Story-safe margins so platform UI chrome doesn't cover content
  const padX = 72, padTop = 90, padBottom = 90;
  const contentW = W - padX * 2;
  ctx.textBaseline = "alphabetic";

  // Layout flows top-to-bottom off a running cursor so a long headline never
  // collides with the sections below it.
  let cursorY = padTop;

  // 1. Eyebrow
  const eyebrowFont = 26;
  ctx.font = `700 ${eyebrowFont}px 'DM Sans', sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.34)";
  const eyebrowBaseline = cursorY + eyebrowFont * 0.8;
  drawTracked(ctx, "WEEKLY RECAP · SHAREABLE", padX, eyebrowBaseline, 3.2);
  cursorY = eyebrowBaseline + 58;

  // 2. Headline — "I posted <N clips> to <M platforms> this week"
  const clipWord = clips === 1 ? "clip" : "clips";
  const platWord = platformsUsed === 1 ? "platform" : "platforms";
  const headlineFont = 78;
  const headlineLineHeight = 94;
  ctx.font = `700 ${headlineFont}px 'DM Sans', sans-serif`;
  const parts = [
    { t: "I posted ", color: "#edeef2" },
    { t: `${clips} ${clipWord}`, color: gameColor },
    { t: " to ", color: "#edeef2" },
    { t: `${platformsUsed} ${platWord}`, color: gameColor },
    { t: " this week", color: "#edeef2" },
  ];
  let hx = padX;
  let hy = cursorY + headlineFont * 0.82;
  for (const part of parts) {
    const words = part.t.split(" ");
    for (let i = 0; i < words.length; i++) {
      const word = words[i] + (i < words.length - 1 ? " " : "");
      if (!word) continue;
      const wWidth = ctx.measureText(word).width;
      if (hx + wWidth > padX + contentW && hx > padX) { hx = padX; hy += headlineLineHeight; }
      ctx.fillStyle = part.color;
      ctx.fillText(word, hx, hy);
      hx += wWidth;
    }
  }
  cursorY = hy + 70;

  // 3. Platform cells — 2x2 grid
  const gridGap = 28;
  const cellW = (contentW - gridGap) / 2;
  const cellH = 224;
  const gridTop = cursorY;
  for (let i = 0; i < PLATFORM_ORDER.length; i++) {
    const key = PLATFORM_ORDER[i];
    const col = i % 2, row = Math.floor(i / 2);
    const x = padX + col * (cellW + gridGap);
    const y = gridTop + row * (cellH + gridGap);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRectPath(ctx, x, y, cellW, cellH, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, x + 0.75, y + 0.75, cellW - 1.5, cellH - 1.5, 20);
    ctx.stroke();

    let iconDrawn = false;
    try {
      const img = await loadImage(PLATFORM_ICON_SRC[key]);
      ctx.drawImage(img, x + 32, y + 30, 34, 34);
      iconDrawn = true;
    } catch (e) { /* fall back to text-only label below */ }

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "600 24px 'DM Sans', sans-serif";
    ctx.fillText(PLATFORM_LABEL[key], x + (iconDrawn ? 78 : 32), y + 54);

    ctx.fillStyle = "#edeef2";
    ctx.font = "700 88px 'JetBrains Mono', monospace";
    ctx.fillText(String(perPlatform[key] || 0), x + 32, y + cellH - 42);
  }
  cursorY = gridTop + cellH * 2 + gridGap + 72;

  // 4. Streak / rank / game pills — wraps to a new row if it would overflow
  const pillFont = 30;
  const pillH = 72;
  const pillGapX = 20, pillGapY = 20;
  ctx.font = `600 ${pillFont}px 'DM Sans', sans-serif`;
  const pills = [
    { text: `${streak}-week streak`, dot: "#8b5cf6" },
    { text: rankName, dot: rankColor },
    { text: game, dot: gameColor },
  ];
  let px = padX, py = cursorY;
  for (const pill of pills) {
    const textW = ctx.measureText(pill.text).width;
    const pillW = textW + 76;
    if (px + pillW > padX + contentW && px > padX) { px = padX; py += pillH + pillGapY; }
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRectPath(ctx, px, py, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, px + 0.75, py + 0.75, pillW - 1.5, pillH - 1.5, pillH / 2);
    ctx.stroke();
    // dot (glowing per ui-standards.md)
    ctx.save();
    ctx.shadowColor = pill.dot;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.fillStyle = pill.dot;
    ctx.arc(px + 34, py + pillH / 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // text
    ctx.fillStyle = "#edeef2";
    ctx.fillText(pill.text, px + 56, py + pillH / 2 + pillFont * 0.32);
    px += pillW + pillGapX;
  }
  cursorY = py + pillH + 80;

  // 5. Flowve mark, anchored bottom-center (brand watermark)
  const markSize = 54;
  ctx.font = "600 30px 'DM Sans', sans-serif";
  const markLabel = "Flowve";
  const markLabelW = ctx.measureText(markLabel).width;
  const markGap = 20;
  const markX = (W - (markSize + markGap + markLabelW)) / 2;
  const markY = H - padBottom - markSize;
  const fGrad = ctx.createLinearGradient(markX, markY, markX + markSize, markY + markSize);
  fGrad.addColorStop(0, "#a78bfa");
  fGrad.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = fGrad;
  roundRectPath(ctx, markX, markY, markSize, markSize, 16);
  ctx.fill();
  ctx.strokeStyle = "#0a0b10";
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  const lx = markX + 11, ly = markY + 16, lw = markSize - 22;
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + lw, ly); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx, ly + 11); ctx.lineTo(lx + lw * 0.65, ly + 11); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx, ly + 22); ctx.lineTo(lx + lw * 0.4, ly + 22); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 30px 'DM Sans', sans-serif";
  ctx.fillText(markLabel, markX + markSize + markGap, markY + markSize - 12);

  // Week label, centered just above the brand mark
  if (weekLabel) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = "500 22px 'DM Sans', sans-serif";
    const lw2 = ctx.measureText(weekLabel).width;
    ctx.fillText(weekLabel, (W - lw2) / 2, markY - 28);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

// Draws text with manual letter-spacing (canvas has no native tracking support).
function drawTracked(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

/**
 * Triggers a browser download of `blob` as `filename` via a temporary anchor.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Attempts to copy a PNG blob to the OS clipboard. Returns true on success, false otherwise.
 */
export async function copyBlobToClipboard(blob) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch (e) {
    return false;
  }
}
