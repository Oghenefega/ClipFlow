import React, { useRef, useState, useEffect, useCallback } from "react";
import T from "../../styles/theme";
import usePlaybackStore from "../stores/usePlaybackStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useLayoutStore from "../stores/useLayoutStore";
import useEditorStore from "../stores/useEditorStore";
import { BD } from "../utils/constants";

export default function PreviewPanel() {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(338);

  // ── Store selectors ──
  const playing = usePlaybackStore((s) => s.playing);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);
  const setCurrentTime = usePlaybackStore((s) => s.setCurrentTime);
  const tlSpeed = usePlaybackStore((s) => s.tlSpeed);

  const clip = useEditorStore((s) => s.clip);
  const clipTitle = useEditorStore((s) => s.clipTitle);

  const zoom = useLayoutStore((s) => s.zoom);
  const setZoom = useLayoutStore((s) => s.setZoom);

  const editSegments = useSubtitleStore((s) => s.editSegments);
  const showSubs = useSubtitleStore((s) => s.showSubs);
  const subMode = useSubtitleStore((s) => s.subMode);
  const fontSize = useSubtitleStore((s) => s.fontSize);
  const strokeOn = useSubtitleStore((s) => s.strokeOn);
  const strokeWidth = useSubtitleStore((s) => s.strokeWidth);
  const shadowOn = useSubtitleStore((s) => s.shadowOn);
  const shadowBlur = useSubtitleStore((s) => s.shadowBlur);
  const bgOn = useSubtitleStore((s) => s.bgOn);
  const bgOpacity = useSubtitleStore((s) => s.bgOpacity);
  const highlightColor = useSubtitleStore((s) => s.highlightColor);
  const subFontFamily = useSubtitleStore((s) => s.subFontFamily);
  const lineMode = useSubtitleStore((s) => s.lineMode);
  const syncOffset = useSubtitleStore((s) => s.syncOffset);

  const captionText = useCaptionStore((s) => s.captionText);
  const captionFontFamily = useCaptionStore((s) => s.captionFontFamily);
  const captionFontSize = useCaptionStore((s) => s.captionFontSize);
  const captionColor = useCaptionStore((s) => s.captionColor);
  const captionBold = useCaptionStore((s) => s.captionBold);
  const captionItalic = useCaptionStore((s) => s.captionItalic);
  const captionUnderline = useCaptionStore((s) => s.captionUnderline);

  // ── Derived ──
  const clipDuration = clip ? ((clip.endTime || 0) - (clip.startTime || 0)) : 0;
  const videoSrc = clip?.filePath ? `file://${clip.filePath.replace(/\\/g, "/")}` : null;
  const pxScale = containerWidth / 338;

  // ── Track container width for proportional scaling ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Init video ref in playback store ──
  useEffect(() => {
    usePlaybackStore.getState().initVideoRef(videoRef);
  }, []);

  // ── Video time update ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleEnded = () => setPlaying(false);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [clip?.id]);

  // ── Play/Pause sync ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [playing]);

  // ── Speed sync ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = tlSpeed === "2x" ? 2 : 1;
  }, [tlSpeed]);

  // ── Wheel zoom ──
  const handlePreviewWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    setZoom(Math.max(50, Math.min(300, zoom + delta)));
  }, [zoom, setZoom]);

  // ── Active subtitle ──
  const adjustedPlayTime = currentTime - syncOffset;
  const activeSubtitle = editSegments.find((s) => s.startSec !== undefined && adjustedPlayTime >= s.startSec && adjustedPlayTime <= s.endSec);

  return (
    <div
      onWheel={handlePreviewWheel}
      style={{
        flex: 1, background: T.bg, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", overflow: "hidden", minWidth: 0,
      }}
    >
      {/* 9:16 preview */}
      <div ref={containerRef} style={{
        height: "100%", aspectRatio: "9/16", maxHeight: 600, maxWidth: 338,
        background: "#000", borderRadius: 6, position: "relative", overflow: "hidden",
        boxShadow: `0 0 0 1px ${BD}, 0 20px 60px rgba(0,0,0,0.7)`, flexShrink: 0,
        transform: `scale(${zoom / 100})`, transformOrigin: "center center",
        transition: "transform 0.1s ease-out",
      }}>
        {/* Video element */}
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            onClick={() => setPlaying(!playing)}
            style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
            preload="auto"
            muted={false}
          />
        ) : (
          <>
            <div style={{ width: "100%", height: "62%", background: "linear-gradient(180deg, #1a1a2e, #16213e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: T.textTertiary, fontSize: 13 }}>{clip ? "Loading video..." : "No clip loaded"}</span>
            </div>
            <div style={{ width: "100%", height: "38%", background: "linear-gradient(180deg, #0d0d0d, #1a1a1a)", borderTop: "1px solid #222" }} />
          </>
        )}

        {/* Subtitle overlay */}
        {showSubs && activeSubtitle && (() => {
          const words = activeSubtitle.text.split(/\s+/);
          const segDur = activeSubtitle.endSec - activeSubtitle.startSec;
          const adjustedTime = currentTime - syncOffset;
          const elapsed = adjustedTime - activeSubtitle.startSec;
          const progress = segDur > 0 ? Math.max(0, Math.min(1, elapsed / segDur)) : 0;

          // Use word-level timestamps when available, fall back to even-split
          let activeWordIdx;
          if (activeSubtitle.words && activeSubtitle.words.length > 0) {
            activeWordIdx = activeSubtitle.words.findIndex(
              (w) => adjustedTime >= w.start && adjustedTime < w.end
            );
            if (activeWordIdx < 0) {
              // Between words or past last — find nearest word whose start <= adjustedTime
              for (let i = activeSubtitle.words.length - 1; i >= 0; i--) {
                if (activeSubtitle.words[i].start <= adjustedTime) { activeWordIdx = i; break; }
              }
              if (activeWordIdx < 0) activeWordIdx = 0;
            }
            activeWordIdx = Math.min(activeWordIdx, words.length - 1);
          } else {
            activeWordIdx = Math.min(Math.floor(progress * words.length), words.length - 1);
          }

          const shadows = [];
          if (strokeOn) {
            const sw = Math.max(1, strokeWidth * 0.3 * pxScale);
            shadows.push(`-${sw}px -${sw}px 0 #000`, `${sw}px -${sw}px 0 #000`, `-${sw}px ${sw}px 0 #000`, `${sw}px ${sw}px 0 #000`);
          }
          shadows.push(shadowOn ? `0 ${2 * pxScale}px ${shadowBlur * pxScale}px rgba(0,0,0,0.9)` : `0 ${2 * pxScale}px ${8 * pxScale}px rgba(0,0,0,0.9)`);
          const subTextShadow = shadows.join(", ");

          // For 1L mode: show fixed 3-word chunks, highlight moves within each chunk
          const CHUNK = 3;
          const chunkIndex = Math.floor(activeWordIdx / CHUNK);
          const chunkStart = chunkIndex * CHUNK;
          const chunkEnd = Math.min(words.length, chunkStart + CHUNK);

          const visibleWords = lineMode === "1L"
            ? words.slice(chunkStart, chunkEnd)
            : words;
          const visibleOffset = lineMode === "1L" ? chunkStart : 0;

          return (
            <div style={{
              position: "absolute", bottom: "40%", left: 0, right: 0, textAlign: "center",
              padding: bgOn ? `${4 * pxScale}px ${14 * pxScale}px` : `0 ${14 * pxScale}px`, pointerEvents: "none",
              background: bgOn ? `rgba(0,0,0,${bgOpacity / 100})` : "transparent",
              borderRadius: bgOn ? 4 : 0,
            }}>
              <div style={{
                fontSize: Math.max(6, fontSize * 0.27 * pxScale), fontWeight: 800, lineHeight: 1.3,
                textShadow: subTextShadow, fontFamily: `'${subFontFamily}', sans-serif`,
              }}>
                {subMode === "word" ? (
                  <span style={{ color: highlightColor }}>{words[activeWordIdx] || ""}</span>
                ) : subMode === "karaoke" ? (
                  visibleWords.map((w, i) => (
                    <span key={i + visibleOffset} style={{ color: (i + visibleOffset) === activeWordIdx ? highlightColor : "#fff" }}>
                      {w}{i < visibleWords.length - 1 ? " " : ""}
                    </span>
                  ))
                ) : (
                  lineMode === "1L" ? (
                    visibleWords.map((w, i) => (
                      <span key={i + visibleOffset} style={{ color: "#fff" }}>
                        {w}{i < visibleWords.length - 1 ? " " : ""}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#fff" }}>{activeSubtitle.text}</span>
                  )
                )}
              </div>
            </div>
          );
        })()}

        {/* Caption overlay */}
        {captionText && (
          <div style={{ position: "absolute", bottom: videoSrc ? "12%" : "9%", left: 0, right: 0, textAlign: "center", padding: `0 ${10 * pxScale}px`, pointerEvents: "none" }}>
            <div style={{
              fontSize: Math.max(6, captionFontSize * pxScale), fontWeight: captionBold ? 800 : 400,
              fontStyle: captionItalic ? "italic" : "normal",
              textDecoration: captionUnderline ? "underline" : "none",
              color: captionColor, fontFamily: `'${captionFontFamily}', sans-serif`,
              textShadow: `0 ${2 * pxScale}px ${6 * pxScale}px rgba(0,0,0,0.95)`, lineHeight: 1.3,
            }}>
              {captionText}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
