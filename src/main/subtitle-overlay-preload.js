/**
 * Subtitle Overlay Preload — isolated bridge for the offscreen frame-capture window.
 *
 * Runs in a Node-enabled preload context with contextIsolation: true on the window.
 * Loads the pure-CJS style engine + word finder used by the editor preview and
 * exposes them to the overlay page via contextBridge. No fs / child_process / os
 * access is exposed — the overlay page gets only the two deterministic render
 * helpers it needs.
 *
 * Paired with src/main/subtitle-overlay-renderer.js which constructs the window
 * and public/subtitle-overlay/overlay-renderer.js which consumes window.overlayAPI.
 */

const { contextBridge } = require("electron");
const path = require("path");

const styleEngine = require(path.join(
  __dirname,
  "..",
  "renderer",
  "editor",
  "utils",
  "subtitleStyleEngine.js"
));
const wordFinder = require(path.join(
  __dirname,
  "..",
  "renderer",
  "editor",
  "utils",
  "findActiveWord.js"
));

contextBridge.exposeInMainWorld("overlayAPI", {
  styleEngine: {
    buildSubtitleStyle: (style, scale) =>
      styleEngine.buildSubtitleStyle(style, scale),
    buildSubtitleShadows: (style, scale) =>
      styleEngine.buildSubtitleShadows(style, scale),
    buildCaptionStyle: (style, scale) =>
      styleEngine.buildCaptionStyle(style, scale),
    stripPunctuation: (text, removals) =>
      styleEngine.stripPunctuation(text, removals),
  },
  wordFinder: {
    findActiveWord: (segments, index, time) =>
      wordFinder.findActiveWord(segments, index, time),
    buildGlobalWordIndex: (segments) =>
      wordFinder.buildGlobalWordIndex(segments),
  },
});
