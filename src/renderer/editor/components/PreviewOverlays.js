/**
 * PreviewOverlays — Shared subtitle + caption overlay rendering
 *
 * Single rendering path used by BOTH the Editor (PreviewPanelNew) and
 * the Projects tab (ClipVideoPlayer replacement). This ensures visual
 * changes made in the editor are always reflected in the Projects preview.
 *
 * Zero store dependencies. All data passed via props.
 */

import React, { useMemo, useRef, useCallback } from "react";
import {
  buildSubtitleStyle,
  buildSubtitleShadows,
  buildCaptionStyle,
  stripPunctuation,
} from "../utils/subtitleStyleEngine";

// ── Character-limit line chunking ──
// Groups words into display lines until each line exceeds ~16 chars.
// Long words get fewer per line, short words pack more densely.
const CHAR_LIMIT = 16;

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

// ── Build flat word index for word-driven timing ──
// Word-driven approach: find the active WORD first across ALL segments,
// then display its containing segment. This ensures words appear exactly
// when spoken, not delayed by segment boundaries.
function buildGlobalWordIndex(segments) {
  const index = [];
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (seg.words && seg.words.length > 0) {
      for (let wi = 0; wi < seg.words.length; wi++) {
        index.push({ segIdx: si, wordIdx: wi, word: seg.words[wi] });
      }
    }
  }
  return index;
}

// ── Find active segment + word using word-driven lookup ──
function findActiveSegAndWord(segments, globalWordIndex, adjustedTime) {
  if (!segments || segments.length === 0) return { seg: null, wordIdx: -1 };

  if (globalWordIndex.length > 0) {
    // Find the most recent word that has started
    let bestGlobal = -1;
    for (let i = 0; i < globalWordIndex.length; i++) {
      if (adjustedTime >= globalWordIndex[i].word.start) bestGlobal = i;
      else break; // sorted by time
    }

    if (bestGlobal >= 0) {
      const entry = globalWordIndex[bestGlobal];
      const seg = segments[entry.segIdx];
      // Must be within segment boundaries AND not too far past the word
      if (adjustedTime >= seg.startSec && adjustedTime < seg.endSec &&
          adjustedTime <= entry.word.end + 1.5) {
        return { seg, wordIdx: entry.wordIdx };
      }
    }

    // Before any word: check if we're close to the first word (< 0.15s)
    if (bestGlobal < 0 && globalWordIndex.length > 0) {
      const firstWord = globalWordIndex[0];
      const seg = segments[firstWord.segIdx];
      if (adjustedTime >= firstWord.word.start - 0.15 &&
          adjustedTime >= seg.startSec && adjustedTime < seg.endSec) {
        return { seg, wordIdx: firstWord.wordIdx };
      }
    }
  }

  // Fallback for segments without word-level data: use segment boundaries
  const seg = segments.find(
    (s) => adjustedTime >= s.startSec && adjustedTime < s.endSec
  ) || null;
  return { seg, wordIdx: -1 };
}


// ════════════════════════════════════════════════════════════
// SubtitleOverlay
// ════════════════════════════════════════════════════════════
//
// Renders subtitle text with word-level karaoke highlighting,
// character-limit line chunking, and per-word animation.
//
// Props:
//   segments       — subtitle segments [{text, startSec, endSec, words: [{word, start, end}]}]
//   currentTime    — current playback time (seconds)
//   syncOffset     — timing adjustment (seconds, default 0)
//   subtitleStyle  — config object, same shape as clip.subtitleStyle
//   scaleFactor    — containerWidth / 1080
//   karaokeActive  — enable word highlighting (default: auto from segmentMode)

export function SubtitleOverlay({
  segments = [],
  currentTime = 0,
  syncOffset = 0,
  subtitleStyle = {},
  scaleFactor = 1,
  karaokeActive: karaokeActiveProp,
}) {
  const adjustedTime = currentTime - (syncOffset || 0);
  const s = subtitleStyle || {};

  const segmentMode = s.segmentMode || "3word";
  const punctuationRemove = s.punctuationRemove || {};
  const highlightColor = s.highlightColor || "#4cce8a";
  const normalColor = s.subColor || "#ffffff";
  const animateOn = s.animateOn || false;
  const animateScale = s.animateScale || 1.2;
  const animateGrowFrom = s.animateGrowFrom || 0.8;
  const animateSpeed = animateOn ? (s.animateSpeed || 0.2) : 0.1;
  const isSingleWord = segmentMode === "1word";
  const karaokeActive = karaokeActiveProp !== undefined
    ? karaokeActiveProp
    : segmentMode !== "1word";

  // Compute base text style (no textShadow — applied per-word for karaoke)
  const textStyle = useMemo(() => {
    try {
      const style = buildSubtitleStyle(s, scaleFactor);
      delete style.textShadow;
      return style;
    } catch (err) {
      console.error("[SubtitleOverlay] textStyle error:", err);
      return { fontFamily: "'Latina Essential', sans-serif", fontSize: "12px", color: "#fff", textAlign: "center" };
    }
  }, [s, scaleFactor]);

  // Per-word shadow variants (normal + active/highlighted)
  const wordShadows = useMemo(() => {
    try {
      return buildSubtitleShadows(s, scaleFactor);
    } catch (err) {
      console.error("[SubtitleOverlay] wordShadows error:", err);
      const fallback = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000";
      return { normal: fallback, active: fallback };
    }
  }, [s, scaleFactor]);

  // Build word index (memoized on segments change)
  const globalWordIndex = useMemo(
    () => buildGlobalWordIndex(segments),
    [segments]
  );

  // Find active segment + word at current time
  const { seg: currentSeg, wordIdx: currentWordIdx } = useMemo(
    () => findActiveSegAndWord(segments, globalWordIndex, adjustedTime),
    [segments, globalWordIndex, adjustedTime]
  );

  // Strip punctuation helper
  const stripPunct = useCallback(
    (word) => stripPunctuation(word, punctuationRemove),
    [punctuationRemove]
  );

  // Track previous segment for single-word grow animation restart
  const prevSegKeyRef = useRef(null);
  const animKeyRef = useRef(0);

  if (!currentSeg) return null;

  const words = currentSeg.words || [];

  // Derive animation key from segment identity (restarts CSS animation on segment change)
  const segKey = currentSeg.id || `${currentSeg.startSec}-${currentSeg.endSec}`;
  if (isSingleWord && animateOn && prevSegKeyRef.current !== segKey) {
    prevSegKeyRef.current = segKey;
    animKeyRef.current += 1;
  }
  const animKey = animKeyRef.current;

  // Dynamic CSS for single-word grow animation
  const growKeyframes = animateOn
    ? `@keyframes subGrow { from { transform: scale(${animateGrowFrom}); transform-origin: center bottom; } to { transform: scale(1); transform-origin: center bottom; } }`
    : "";

  if (words.length > 0) {
    // Character-limit chunking — group words into display lines
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

    return (
      <>
        {growKeyframes && <style>{growKeyframes}</style>}
        <div style={{ ...textStyle, display: "block" }}>
          {visibleWords.map((w, i) => {
            const globalIdx = i + visibleOffset;
            const isActive = karaokeActive && globalIdx === currentWordIdx;

            const wordStyle = {
              color: isActive ? highlightColor : normalColor,
              textShadow: isActive ? wordShadows.active : wordShadows.normal,
              display: "inline-block",
              transformOrigin: "center bottom",
              verticalAlign: "baseline",
              transition: `color ${animateSpeed}s, transform ${animateSpeed}s ease-out`,
            };

            if (animateOn) {
              if (isSingleWord) {
                wordStyle.animation = `subGrow ${animateSpeed}s ease-out forwards`;
              } else if (isActive) {
                wordStyle.transform = `scale(${animateScale})`;
              } else {
                wordStyle.transform = "scale(1)";
              }
            }

            return (
              <span
                key={isSingleWord ? `sw-${animKey}-${globalIdx}` : globalIdx}
                style={wordStyle}
              >
                {stripPunct(w.word)}{i < visibleWords.length - 1 ? " " : ""}
              </span>
            );
          })}
        </div>
      </>
    );
  }

  // Fallback: no word-level data — use segment text with char-limit chunking
  if (!currentSeg.text) return null;
  const textWords = currentSeg.text.split(/\s+/);
  const chunks = buildCharChunks(textWords.map((w) => ({ word: w })));
  const segDuration = currentSeg.endSec - currentSeg.startSec;
  const progress = segDuration > 0
    ? (adjustedTime - currentSeg.startSec) / segDuration
    : 0;
  const chunkIdx = Math.min(
    Math.floor(progress * chunks.length),
    chunks.length - 1
  );
  const visibleText = (chunks[chunkIdx] || [])
    .map((w) => stripPunct(w.word))
    .join(" ");

  return (
    <div
      style={{
        ...textStyle,
        display: "block",
        textShadow: wordShadows.normal || undefined,
      }}
    >
      {visibleText}
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// CaptionOverlay
// ════════════════════════════════════════════════════════════
//
// Renders caption text at the current playback position.
//
// Props:
//   segments      — caption segments [{id, startSec, endSec, text}]
//   currentTime   — current playback time (seconds)
//   syncOffset    — timing adjustment (seconds, default 0)
//   captionStyle  — config object, same shape as clip.captionStyle
//   scaleFactor   — containerWidth / 1080

export function CaptionOverlay({
  segments = [],
  currentTime = 0,
  syncOffset = 0,
  captionStyle = {},
  scaleFactor = 1,
}) {
  const adjustedTime = currentTime - (syncOffset || 0);

  const textStyle = useMemo(() => {
    try {
      return buildCaptionStyle(captionStyle || {}, scaleFactor);
    } catch (err) {
      console.error("[CaptionOverlay] textStyle error:", err);
      return { fontFamily: "'Latina Essential', sans-serif", fontSize: "10px", color: "#fff", textAlign: "center" };
    }
  }, [captionStyle, scaleFactor]);

  // Find active caption at current time
  const activeCaption = useMemo(() => {
    if (!segments.length) return null;
    return segments.find(
      (s) => adjustedTime >= s.startSec && adjustedTime <= (s.endSec ?? Infinity)
    ) || null;
  }, [segments, adjustedTime]);

  if (!activeCaption) return null;

  return (
    <span style={textStyle}>
      {activeCaption.text || ""}
    </span>
  );
}
