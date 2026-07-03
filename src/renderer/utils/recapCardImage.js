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
 * Draws the shareable weekly recap card to an offscreen canvas at 2x scale and
 * resolves with a PNG Blob. Mirrors the in-app recap card's layout and colors.
 */
export async function renderRecapPng({ game, gameColor, clips, platformsUsed, perPlatform, streak, rankName, rankColor, weekLabel }) {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* fonts best-effort */ }
  }

  const SCALE = 2;
  const W = 880, H = 360;
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = "#111218";
  roundRectPath(ctx, 0, 0, W, H, 14);
  ctx.fill();

  // Clip to rounded rect for washes
  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, 14);
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
  roundRectPath(ctx, 0.5, 0.5, W - 1, H - 1, 14);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const padX = 28, padTop = 26;

  // Eyebrow
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.font = "600 10px 'DM Sans', sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.save();
  ctx.font = "700 10px 'DM Sans', sans-serif";
  drawTracked(ctx, "WEEKLY RECAP · SHAREABLE", padX, padTop + 10, 1.4);
  ctx.restore();

  // Headline — "I posted <N clips> to <M platforms> this week"
  const clipWord = clips === 1 ? "clip" : "clips";
  const platWord = platformsUsed === 1 ? "platform" : "platforms";
  const headlineY = padTop + 44;
  ctx.font = "700 25px 'DM Sans', sans-serif";
  let cx = padX;
  const parts = [
    { t: "I posted ", color: "#edeef2" },
    { t: `${clips} ${clipWord}`, color: gameColor },
    { t: " to ", color: "#edeef2" },
    { t: `${platformsUsed} ${platWord}`, color: gameColor },
    { t: " this week", color: "#edeef2" },
  ];
  const maxW = 480;
  cx = padX;
  let cy = headlineY;
  for (const part of parts) {
    const words = part.t.split(" ");
    for (let i = 0; i < words.length; i++) {
      const word = words[i] + (i < words.length - 1 ? " " : "");
      const wWidth = ctx.measureText(word).width;
      if (cx + wWidth > padX + maxW && cx > padX) { cx = padX; cy += 32; }
      ctx.fillStyle = part.color;
      ctx.fillText(word, cx, cy);
      cx += wWidth;
    }
  }

  // Flowve mark, top-right
  const markSize = 16, markX = W - padX - markSize - 60, markY = padTop;
  const fGrad = ctx.createLinearGradient(markX, markY, markX + markSize, markY + markSize);
  fGrad.addColorStop(0, "#a78bfa");
  fGrad.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = fGrad;
  roundRectPath(ctx, markX, markY, markSize, markSize, 5);
  ctx.fill();
  ctx.strokeStyle = "#0a0b10";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  const lx = markX + 3.5, ly = markY + 5, lw = markSize - 7;
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + lw, ly); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx, ly + 3.5); ctx.lineTo(lx + lw * 0.65, ly + 3.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx, ly + 7); ctx.lineTo(lx + lw * 0.4, ly + 7); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 11px 'DM Sans', sans-serif";
  ctx.fillText("Flowve", markX + markSize + 7, markY + markSize - 3);

  // Platform cells
  const cellY = 130, cellH = 68, gap = 10;
  const cellW = (W - padX * 2 - gap * 3) / 4;
  for (let i = 0; i < PLATFORM_ORDER.length; i++) {
    const key = PLATFORM_ORDER[i];
    const x = padX + i * (cellW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRectPath(ctx, x, cellY, cellW, cellH, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 0.5, cellY + 0.5, cellW - 1, cellH - 1, 10);
    ctx.stroke();

    let iconDrawn = false;
    try {
      const img = await loadImage(PLATFORM_ICON_SRC[key]);
      ctx.drawImage(img, x + 14, cellY + 12, 14, 14);
      iconDrawn = true;
    } catch (e) { /* fall back to text-only label below */ }

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "600 10px 'DM Sans', sans-serif";
    ctx.fillText(PLATFORM_LABEL[key], x + (iconDrawn ? 32 : 14), cellY + 22);

    ctx.fillStyle = "#edeef2";
    ctx.font = "700 21px 'JetBrains Mono', monospace";
    ctx.fillText(String(perPlatform[key] || 0), x + 14, cellY + 50);
  }

  // Bottom pills
  const pillY = cellY + cellH + 26;
  const pills = [
    { text: `${streak}-week streak`, dot: "#8b5cf6" },
    { text: rankName, dot: rankColor },
    { text: game, dot: gameColor },
  ];
  let px = padX;
  ctx.font = "600 11px 'DM Sans', sans-serif";
  for (const pill of pills) {
    const textW = ctx.measureText(pill.text).width;
    const pillW = textW + 34;
    const pillH = 26;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRectPath(ctx, px, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    roundRectPath(ctx, px + 0.5, pillY + 0.5, pillW - 1, pillH - 1, pillH / 2);
    ctx.stroke();
    // dot
    ctx.beginPath();
    ctx.fillStyle = pill.dot;
    ctx.arc(px + 15, pillY + pillH / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // text
    ctx.fillStyle = "#edeef2";
    ctx.fillText(pill.text, px + 26, pillY + pillH / 2 + 4);
    px += pillW + 9;
  }

  // Week label, bottom-right small
  if (weekLabel) {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.font = "500 10px 'DM Sans', sans-serif";
    const lw2 = ctx.measureText(weekLabel).width;
    ctx.fillText(weekLabel, W - padX - lw2, pillY + 18);
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
