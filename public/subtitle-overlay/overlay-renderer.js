/**
 * Subtitle Overlay Renderer — DOM-based frame renderer
 *
 * Runs inside an offscreen BrowserWindow with nodeIntegration: false and
 * contextIsolation: true. The attached preload (src/main/subtitle-overlay-preload.js)
 * exposes the shared subtitleStyleEngine.js + findActiveWord.js via
 * window.overlayAPI — same code the editor preview uses, which guarantees
 * pixel-identical rendering.
 *
 * The main process calls window.__seekTo__(timestamp) via executeJavaScript to
 * update the display, then captures the page as a transparent PNG.
 */

// ── Load shared modules from the preload-exposed bridge ──
let styleEngine = null;
let wordFinder = null;

function loadStyleEngine() {
  if (!window.overlayAPI || !window.overlayAPI.styleEngine) {
    console.error("[OverlayRenderer] window.overlayAPI.styleEngine not available");
    return;
  }
  styleEngine = window.overlayAPI.styleEngine;
}

function loadWordFinder() {
  if (!window.overlayAPI || !window.overlayAPI.wordFinder) {
    console.error("[OverlayRenderer] window.overlayAPI.wordFinder not available");
    return;
  }
  wordFinder = window.overlayAPI.wordFinder;
}

// ── State ──
let config = null;
let subtitleSegments = [];
let captionSegments = [];
let subtitleStyle = {};
let captionStyleConfig = {};
let clipStartTime = 0;
let clipEndTime = 0;
let syncOffset = 0;
let globalWordIndex = [];

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

  // Main process injects __FONTS_PATH__ as an absolute path (Windows backslashes).
  // Normalize to forward slashes for file:// URL composition.
  const fontsDir = (window.__FONTS_PATH__ || "").replace(/\\/g, "/");
  if (!fontsDir) {
    console.warn("[OverlayRenderer] __FONTS_PATH__ not set — font load will fail");
  }

  const promises = fontWeights.map(({ weight, file, style: fontStyle }) => {
    const url = `url('file:///${fontsDir}/${file}')`;
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

// ── Character-limit chunking (same algorithm as PreviewOverlays) ──
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
function renderSubtitle(timestamp) {
  if (!subOverlay || !styleEngine) return;
  const inner = subOverlay.inner;
  inner.innerHTML = "";

  // Apply syncOffset — matches what the editor preview does
  const currentTime = timestamp - (syncOffset || 0);

  const s = subtitleStyle;

  // Use shared findActiveWord (same algorithm as editor preview)
  const result = wordFinder
    ? wordFinder.findActiveWord(subtitleSegments, globalWordIndex, currentTime)
    : { seg: null, wordIdx: -1, wordProgress: 0 };

  const currentSeg = result.seg;
  const currentWordIdx = result.wordIdx;
  const wordProgress = result.wordProgress;

  if (!currentSeg) return;

  const showSubs = s.showSubs !== false;
  if (!showSubs) return;

  const words = currentSeg.words || [];
  const segmentMode = s.segmentMode || "3word";
  const highlightMode = s.highlightMode || "instant"; // "instant" (default) or "progressive"
  const isSingleWord = segmentMode === "1word";
  const animateOn = s.animateOn || false;
  const animateScale = s.animateScale || 1.2;
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

      // Progressive fill only when highlightMode is "progressive"
      const useProgressiveFill = highlightMode === "progressive" &&
        isActive && karaokeActive && wordProgress > 0 && wordProgress < 1;

      const wordText = styleEngine.stripPunctuation(w.word || "", punctuationRemove);
      const suffix = i < visibleWords.length - 1 ? " " : "";

      if (useProgressiveFill) {
        // Progressive fill: wrapper with base color + overlay with clip-path
        const wrapper = document.createElement("span");
        wrapper.style.display = "inline-block";
        wrapper.style.position = "relative";
        wrapper.style.transformOrigin = "center bottom";
        wrapper.style.verticalAlign = "baseline";

        // Base text (normal color)
        const base = document.createElement("span");
        base.style.color = subColor;
        if (shadows.normal) base.style.textShadow = shadows.normal;
        base.textContent = wordText + suffix;
        wrapper.appendChild(base);

        // Highlighted overlay with clip-path
        const overlay = document.createElement("span");
        overlay.style.position = "absolute";
        overlay.style.left = "0";
        overlay.style.top = "0";
        overlay.style.color = highlightColor;
        if (shadows.active) overlay.style.textShadow = shadows.active;
        overlay.style.clipPath = `inset(0 ${(100 - wordProgress * 100).toFixed(1)}% 0 0)`;
        overlay.textContent = wordText + suffix;
        wrapper.appendChild(overlay);

        if (animateOn && !isSingleWord) {
          wrapper.style.transform = `scale(${animateScale})`;
        }

        textDiv.appendChild(wrapper);
      } else {
        // Instant highlight (default): whole word gets color immediately
        const span = document.createElement("span");
        span.style.color = isActive ? highlightColor : subColor;
        const wordShadow = isActive ? shadows.active : shadows.normal;
        if (wordShadow) span.style.textShadow = wordShadow;
        span.style.display = "inline-block";
        span.style.transformOrigin = "center bottom";
        span.style.verticalAlign = "baseline";

        if (animateOn) {
          if (isSingleWord) {
            span.style.transform = "scale(1)";
          } else if (isActive) {
            span.style.transform = `scale(${animateScale})`;
          } else {
            span.style.transform = "scale(1)";
          }
        }

        span.textContent = wordText + suffix;
        textDiv.appendChild(span);
      }
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
function renderCaption(timestamp) {
  if (!capOverlay || !styleEngine) return;
  const inner = capOverlay.inner;
  inner.innerHTML = "";

  // Apply syncOffset to captions too
  const currentTime = timestamp - (syncOffset || 0);

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
  // Load shared modules now that preload bridge + injected paths are available.
  // Fonts must be loaded here (not at module-top) because __FONTS_PATH__ is
  // injected by the main process via executeJavaScript, which runs AFTER the
  // overlay page script's module-top code but BEFORE __initOverlay__ is called.
  if (!styleEngine) loadStyleEngine();
  if (!wordFinder) loadWordFinder();
  loadFonts(); // fire-and-forget — main process awaits document.fonts.ready

  config = window.__OVERLAY_CONFIG__;
  if (!config) return;

  subtitleSegments = config.subtitleSegments || [];
  captionSegments = config.captionSegments || [];
  subtitleStyle = config.subtitleStyle || {};
  captionStyleConfig = config.captionStyle || {};
  clipStartTime = config.clipStartTime || 0;
  clipEndTime = config.clipEndTime || 0;
  syncOffset = config.syncOffset || 0;

  // Build global word index once (shared algorithm)
  if (wordFinder) {
    globalWordIndex = wordFinder.buildGlobalWordIndex(subtitleSegments);
  }

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

// If the main process already injected config before this script ran
// (shouldn't happen with current ordering, but defensive), fire init now.
// Normal path: main calls window.__initOverlay__() via executeJavaScript,
// which loads fonts + modules + builds overlays.
if (window.__OVERLAY_CONFIG__ && !config) {
  window.__initOverlay__();
}
