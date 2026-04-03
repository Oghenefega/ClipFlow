/**
 * Subtitle Overlay Renderer — DOM-based frame renderer
 *
 * Runs inside an offscreen BrowserWindow with nodeIntegration: true.
 * The main process injects window.__STYLE_ENGINE_PATH__ before loading,
 * which points to the shared subtitleStyleEngine.js — same code the editor
 * preview uses. This guarantees pixel-identical rendering.
 *
 * The main process calls window.__seekTo__(timestamp) to update the display,
 * then captures the page as a transparent PNG.
 */

// ── Load style engine from path injected by main process ──
let styleEngine = null;

function loadStyleEngine() {
  const enginePath = window.__STYLE_ENGINE_PATH__;
  if (!enginePath) {
    console.error("[OverlayRenderer] No style engine path provided");
    return;
  }
  styleEngine = require(enginePath);
}

// ── State ──
let config = null;
let subtitleSegments = [];
let captionSegments = [];
let subtitleStyle = {};
let captionStyleConfig = {};
let clipStartTime = 0;
let clipEndTime = 0;

// Scale factor: injected by main process based on source video width / 1080
// Falls back to 1.0 if not set
function getScaleFactor() {
  return window.__SCALE_FACTOR__ || 1.0;
}
const CHAR_LIMIT = 16;

// DOM elements
const canvas = document.getElementById("canvas");
let subOverlay = null;
let capOverlay = null;

// ── Font loading ──
function loadFonts() {
  const path = require("path");
  const fontWeights = [
    { weight: 300, file: "LatinaEssential-Light.otf" },
    { weight: 300, file: "LatinaEssential-LightIt.otf", style: "italic" },
    { weight: 500, file: "LatinaEssential-Medium.otf" },
    { weight: 500, file: "LatinaEssential-MediumIt.otf", style: "italic" },
    { weight: 700, file: "LatinaEssential-Bold.otf" },
    { weight: 700, file: "LatinaEssential-BoldIt.otf", style: "italic" },
    { weight: 900, file: "LatinaEssential-Heavy.otf" },
    { weight: 900, file: "LatinaEssential-HeavyIt.otf", style: "italic" },
  ];

  // Font files are in src/fonts/ during dev, build/fonts/ after build
  // The main process injects __FONTS_PATH__ to resolve this
  const fontsDir = window.__FONTS_PATH__ || path.join(__dirname, "../../src/fonts");

  const promises = fontWeights.map(({ weight, file, style: fontStyle }) => {
    const fontPath = path.join(fontsDir, file);
    const url = `url('file:///${fontPath.replace(/\\/g, "/")}')`;
    const font = new FontFace("Latina Essential", url, {
      weight: String(weight),
      style: fontStyle || "normal",
    });
    return font.load().then((f) => document.fonts.add(f)).catch((e) => {
      console.warn("[OverlayRenderer] Font load failed:", file, e.message);
    });
  });

  return Promise.all(promises);
}

// ── Character-limit chunking (same algorithm as PreviewPanelNew) ──
function buildCharChunks(words) {
  const chunks = [];
  let current = [];
  let currentLen = 0;
  for (const w of words) {
    const wordLen = w.word ? w.word.length : 0;
    if (current.length > 0 && currentLen + wordLen + 1 > CHAR_LIMIT) {
      chunks.push(current);
      current = [w];
      currentLen = wordLen;
    } else {
      current.push(w);
      currentLen += (current.length > 1 ? 1 : 0) + wordLen;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// ── Find active segment and word at a given time ──
function findActiveWord(segments, currentTime) {
  if (!segments || segments.length === 0) return { seg: null, wordIdx: -1 };

  for (const seg of segments) {
    const start = seg.startSec ?? seg.start ?? 0;
    const end = seg.endSec ?? seg.end ?? 0;
    if (currentTime >= start && currentTime <= end) {
      const words = seg.words || [];
      if (words.length === 0) return { seg, wordIdx: -1 };

      let bestIdx = -1;
      for (let i = 0; i < words.length; i++) {
        const wStart = words[i].start ?? words[i].startSec ?? 0;
        if (currentTime >= wStart) bestIdx = i;
        else break;
      }

      if (bestIdx < 0 && words.length > 0) {
        const firstStart = words[0].start ?? words[0].startSec ?? 0;
        if (currentTime >= firstStart - 0.15) bestIdx = 0;
      }

      return { seg, wordIdx: bestIdx >= 0 ? bestIdx : 0 };
    }
  }

  return { seg: null, wordIdx: -1 };
}

// ── Create overlay container ──
function createOverlay(yPercent, widthPercent) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.style.top = `${yPercent}%`;

  const inner = document.createElement("div");
  inner.className = "overlay-inner";
  if (widthPercent) inner.style.maxWidth = `${widthPercent}%`;
  overlay.appendChild(inner);

  canvas.appendChild(overlay);
  return { overlay, inner };
}

// ── Apply CSS styles from object to element ──
// The style engine returns values already formatted for CSS (e.g. "52px", "center")
// Numbers like fontWeight (700) and lineHeight (1.3) should be assigned as-is
function applyStyles(el, styles) {
  for (const [key, value] of Object.entries(styles)) {
    if (value !== undefined && value !== null) {
      el.style[key] = String(value);
    }
  }
}

// ── Render subtitle at timestamp ──
function renderSubtitle(currentTime) {
  if (!subOverlay || !styleEngine) return;
  const inner = subOverlay.inner;
  inner.innerHTML = "";

  const s = subtitleStyle;
  const { seg: currentSeg, wordIdx: currentWordIdx } = findActiveWord(subtitleSegments, currentTime);
  if (!currentSeg) return;

  const showSubs = s.showSubs !== false;
  if (!showSubs) return;

  const words = currentSeg.words || [];
  const segmentMode = s.segmentMode || "3word";
  const isSingleWord = segmentMode === "1word";
  const animateOn = s.animateOn || false;
  const animateScale = s.animateScale || 1.2;
  const speed = animateOn ? (s.animateSpeed || 0.2) : 0.1;
  const highlightColor = s.highlightColor || "#4cce8a";
  const subColor = s.subColor || "#ffffff";
  const karaokeActive = (s.subMode || "karaoke") === "karaoke";
  const punctuationRemove = s.punctuationRemove || {};

  // Build text style using the shared engine
  const textStyle = styleEngine.buildSubtitleStyle(s, getScaleFactor());
  // Build text shadows (normal + active variants)
  const shadows = styleEngine.buildSubtitleShadows(s, getScaleFactor());

  if (words.length > 0) {
    const chunks = buildCharChunks(words);
    const activeIdx = currentWordIdx >= 0 ? currentWordIdx : 0;

    // Find which chunk contains the active word
    let cumulative = 0;
    let chunkIdx = 0;
    for (let c = 0; c < chunks.length; c++) {
      if (activeIdx < cumulative + chunks[c].length) {
        chunkIdx = c;
        break;
      }
      cumulative += chunks[c].length;
    }
    const visibleWords = chunks[chunkIdx] || chunks[0];
    let visibleOffset = 0;
    for (let c = 0; c < chunkIdx; c++) visibleOffset += chunks[c].length;

    // Create the text container
    const textDiv = document.createElement("div");
    applyStyles(textDiv, textStyle);
    textDiv.style.display = "block";

    // Render each word
    visibleWords.forEach((w, i) => {
      const globalIdx = i + visibleOffset;
      const isActive = karaokeActive && globalIdx === currentWordIdx;
      const wordShadow = isActive ? shadows.active : shadows.normal;

      const span = document.createElement("span");
      span.style.color = isActive ? highlightColor : subColor;
      if (wordShadow) span.style.textShadow = wordShadow;
      span.style.display = "inline-block";
      span.style.transformOrigin = "center bottom";
      span.style.verticalAlign = "baseline";

      if (animateOn) {
        if (isSingleWord) {
          // For frame capture, show the final state (scale 1)
          span.style.transform = "scale(1)";
        } else if (isActive) {
          span.style.transform = `scale(${animateScale})`;
        } else {
          span.style.transform = "scale(1)";
        }
      }

      const wordText = styleEngine.stripPunctuation(w.word || "", punctuationRemove);
      span.textContent = wordText + (i < visibleWords.length - 1 ? " " : "");
      textDiv.appendChild(span);
    });

    inner.appendChild(textDiv);
  } else {
    // Fallback: no word-level data
    const textDiv = document.createElement("div");
    applyStyles(textDiv, textStyle);
    textDiv.style.display = "block";
    if (shadows.normal) textDiv.style.textShadow = shadows.normal;
    textDiv.textContent = currentSeg.text || "";
    inner.appendChild(textDiv);
  }
}

// ── Render caption at timestamp ──
function renderCaption(currentTime) {
  if (!capOverlay || !styleEngine) return;
  const inner = capOverlay.inner;
  inner.innerHTML = "";

  const activeSegs = captionSegments.filter(
    (seg) => seg.text && currentTime >= seg.startSec && currentTime <= (seg.endSec ?? Infinity)
  );

  if (activeSegs.length === 0) return;

  const capStyle = styleEngine.buildCaptionStyle(captionStyleConfig, getScaleFactor());

  for (const seg of activeSegs) {
    const textDiv = document.createElement("div");
    applyStyles(textDiv, capStyle);
    textDiv.textContent = seg.text;
    inner.appendChild(textDiv);
  }
}

// ── Public API (called by main process via executeJavaScript) ──

window.__seekTo__ = function (timestamp) {
  renderSubtitle(timestamp);
  renderCaption(timestamp);
};

window.__initOverlay__ = function () {
  // Load style engine now that the path has been injected
  if (!styleEngine) loadStyleEngine();

  config = window.__OVERLAY_CONFIG__;
  if (!config) return;

  subtitleSegments = config.subtitleSegments || [];
  captionSegments = config.captionSegments || [];
  subtitleStyle = config.subtitleStyle || {};
  captionStyleConfig = config.captionStyle || {};
  clipStartTime = config.clipStartTime || 0;
  clipEndTime = config.clipEndTime || 0;

  // Clear canvas
  canvas.innerHTML = "";
  subOverlay = null;
  capOverlay = null;

  // Create overlays
  const subY = subtitleStyle.yPercent ?? 80;
  const capY = captionStyleConfig.yPercent ?? 15;
  const capWidth = captionStyleConfig.widthPercent ?? 90;

  // Caption overlay (rendered first — higher on screen)
  if (captionSegments.length > 0) {
    capOverlay = createOverlay(capY, capWidth);
  }

  // Subtitle overlay
  if (subtitleSegments.length > 0) {
    subOverlay = createOverlay(subY);
  }
};

// Load fonts on startup
loadFonts().then(() => {
  if (window.__OVERLAY_CONFIG__ && !config) {
    window.__initOverlay__();
  }
});
