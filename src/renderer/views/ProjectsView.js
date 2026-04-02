import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import posthog from "posthog-js";
import T from "../styles/theme";
import { Card, Badge, PageHeader, TabBar, InfoBanner, ViralBar, Checkbox } from "../components/shared";
import { buildPreviewSegments, findActiveWord, stripPunct } from "../editor/utils/buildPreviewSubtitles";

// Pure helper — determine project game color
const getGameColor = (p, gamesDb) => {
  if (p.gameColor) return p.gameColor;
  const g = gamesDb.find((x) => x.name === p.game);
  return g ? g.color : T.accent;
};

// Pure helper — determine project status
const getProjectStatus = (p) => {
  if (p.status === "processing") return "processing";
  if (p.status === "error") return "error";
  if (p.clips && p.clips.length > 0) {
    const allReviewed = p.clips.filter((c) => c.status === "none").length === 0;
    return allReviewed ? "done" : "ready";
  }
  return "ready";
};

// Pure helper — extract transcript segments for a clip from project transcription
const getClipTranscriptSegments = (clip, project) => {
  if (!project?.transcription?.segments) return [];
  return project.transcription.segments
    .filter((s) => s.start >= (clip.startTime || 0) && s.end <= (clip.endTime || 0))
    .map((s) => ({
      start: s.start,
      end: s.end,
      text: (s.text || "").trim(),
    }));
};

// Format seconds to mm:ss
const fmtTime = (sec) => {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Format seconds to [MM:SS] timestamp
const fmtTimestamp = (sec) => {
  if (!sec || isNaN(sec)) return "[00:00]";
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `[${m}:${s}]`;
};

// ============ TEMPLATE → CSS STYLE HELPERS ============
// Convert hex + opacity → rgba string
function _hexToRgba(hex, opacity) {
  const c = (hex || "#000000").replace("#", "").padEnd(6, "0");
  const r = parseInt(c.slice(0, 2), 16) || 0;
  const g = parseInt(c.slice(2, 4), 16) || 0;
  const b = parseInt(c.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${opacity / 100})`;
}

// Build stroke text-shadow (ring of shadows around text)
function _buildStroke(width, color, opacity, blur = 0, offX = 0, offY = 0) {
  if (width <= 0) return "";
  const rgba = _hexToRgba(color, opacity);
  const shadows = [];
  const steps = Math.max(16, Math.round(width * 6));
  for (let i = 0; i < steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const x = (Math.cos(angle) * width + offX).toFixed(1);
    const y = (Math.sin(angle) * width + offY).toFixed(1);
    shadows.push(`${x}px ${y}px ${blur}px ${rgba}`);
  }
  return shadows.join(", ");
}

// Build glow text-shadow
function _buildGlow(color, opacity, intensity, blur, blend, offX = 0, offY = 0) {
  const layers = [];
  const layerCount = Math.max(1, Math.round(intensity / 25));
  for (let i = 0; i < layerCount; i++) {
    const layerBlur = blur * (0.5 + i * 0.5);
    const layerOpacity = opacity * (1 - i * 0.15) * (blend / 100);
    layers.push(`${offX}px ${offY}px ${layerBlur}px ${_hexToRgba(color, Math.max(5, layerOpacity))}`);
  }
  return layers.join(", ");
}

// Build all text-shadows from template style data
function _buildAllShadows(s, sf) {
  const parts = [];
  // Stroke
  if (s.strokeOn && s.strokeWidth > 0) {
    const w = Math.max(0.3, (s.strokeWidth || 2) * sf * 0.5);
    parts.push(_buildStroke(w, s.strokeColor || "#000", s.strokeOpacity ?? 100, (s.strokeBlur || 0) * sf * 0.3, (s.strokeOffsetX || 0) * sf * 0.5, (s.strokeOffsetY || 0) * sf * 0.5));
  }
  // Glow
  if (s.glowOn) {
    parts.push(_buildGlow(s.glowColor || "#fff", s.glowOpacity ?? 25, s.glowIntensity ?? 80, (s.glowBlur || 15) * sf * 0.4, s.glowBlend ?? 20, (s.glowOffsetX || 0) * sf * 0.5, (s.glowOffsetY || 0) * sf * 0.5));
  }
  // Shadow
  if (s.shadowOn) {
    parts.push(`${(s.shadowOffsetX || 4) * sf * 0.5}px ${(s.shadowOffsetY || 4) * sf * 0.5}px ${(s.shadowBlur || 8) * sf * 0.3}px ${_hexToRgba(s.shadowColor || "#000", s.shadowOpacity ?? 70)}`);
  }
  return parts.filter(Boolean).join(", ");
}

// Build CSS style object for subtitle overlay from template
function buildSubPreviewStyle(tpl, containerWidth) {
  const s = tpl?.subtitle || {};
  const sf = containerWidth / 1080; // scale relative to 1080p base
  const fontSize = Math.max(7, (s.fontSize || 52) * sf);
  const shadows = _buildAllShadows(s, sf);
  const style = {
    fontFamily: `'${s.fontFamily || "Latina Essential"}', sans-serif`,
    fontSize: `${fontSize}px`,
    fontWeight: s.fontWeight || (s.bold ? 700 : 400),
    fontStyle: s.italic ? "italic" : "normal",
    color: s.subColor || "#ffffff",
    textAlign: "center",
    lineHeight: 1.2,
    maxWidth: "95%",
    wordBreak: "break-word",
    textShadow: shadows || "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
    textDecoration: s.underline ? "underline" : "none",
  };
  if (s.bgOn) {
    style.background = _hexToRgba(s.bgColor || "#000", s.bgOpacity ?? 80);
    style.padding = `${Math.max(1, (s.bgPaddingY || 8) * sf)}px ${Math.max(2, (s.bgPaddingX || 12) * sf)}px`;
    style.borderRadius = `${Math.max(1, (s.bgRadius || 6) * sf)}px`;
  }
  return style;
}

// Build CSS style object for caption overlay from template
function buildCapPreviewStyle(tpl, containerWidth) {
  const c = tpl?.caption || {};
  const sf = containerWidth / 1080;
  const fontSize = Math.max(6, (c.fontSize || 30) * 2.4 * sf);
  const shadows = _buildAllShadows({
    strokeOn: c.strokeOn, strokeWidth: c.strokeWidth, strokeColor: c.strokeColor,
    strokeOpacity: c.strokeOpacity, strokeBlur: c.strokeBlur, strokeOffsetX: c.strokeOffsetX, strokeOffsetY: c.strokeOffsetY,
    glowOn: c.glowOn, glowColor: c.glowColor, glowOpacity: c.glowOpacity,
    glowIntensity: c.glowIntensity, glowBlur: c.glowBlur, glowBlend: c.glowBlend, glowOffsetX: c.glowOffsetX, glowOffsetY: c.glowOffsetY,
    shadowOn: c.shadowOn, shadowColor: c.shadowColor, shadowOpacity: c.shadowOpacity,
    shadowBlur: c.shadowBlur, shadowOffsetX: c.shadowOffsetX, shadowOffsetY: c.shadowOffsetY,
  }, sf);
  const style = {
    fontFamily: `'${c.fontFamily || "Latina Essential"}', sans-serif`,
    fontSize: `${fontSize}px`,
    fontWeight: c.fontWeight || (c.bold ? 700 : 400),
    fontStyle: c.italic ? "italic" : "normal",
    color: c.color || "#ffffff",
    textAlign: "center",
    lineHeight: c.lineSpacing || 1.3,
    maxWidth: "95%",
    wordBreak: "break-word",
    textShadow: shadows || `0 ${2 * sf}px ${8 * sf}px rgba(0,0,0,0.6)`,
    textDecoration: c.underline ? "underline" : "none",
  };
  if (c.bgOn) {
    style.background = _hexToRgba(c.bgColor || "#000", c.bgOpacity ?? 70);
    style.padding = `${Math.max(1, (c.bgPaddingY || 8) * sf)}px ${Math.max(2, (c.bgPaddingX || 12) * sf)}px`;
    style.borderRadius = `${Math.max(1, (c.bgRadius || 6) * sf)}px`;
  }
  return style;
}

// Default template fallback (matches BUILTIN_TEMPLATE from templateUtils)
const FALLBACK_TEMPLATE = {
  subtitle: {
    fontFamily: "Latina Essential", fontWeight: 900, fontSize: 52, italic: true, bold: true, subColor: "#ffffff",
    strokeOn: true, strokeWidth: 7, strokeColor: "#000000", strokeOpacity: 100, strokeBlur: 0,
    glowOn: false, shadowOn: false, bgOn: false, yPercent: 80,
  },
  caption: {
    fontFamily: "Latina Essential", fontWeight: 900, fontSize: 30, color: "#ffffff",
    bold: true, italic: true, lineSpacing: 1.3,
    strokeOn: false, glowOn: false, shadowOn: false, bgOn: false, yPercent: 15, widthPercent: 90,
  },
};

// ============ CLIP VIDEO PLAYER ============
function ClipVideoPlayer({ clip, template }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const duration = Math.round((clip.endTime || 0) - (clip.startTime || 0));
  const filePath = clip.filePath ? `file://${clip.filePath.replace(/\\/g, "/")}` : null;
  const thumbPath = clip.thumbnailPath ? `file://${clip.thumbnailPath.replace(/\\/g, "/")}` : null;

  const tpl = template || FALLBACK_TEMPLATE;
  const CONTAINER_W = 220;

  // Resolve effective template — per-clip saved style wins, merged with template defaults
  // for any missing fields (handles clips saved before new fields were added)
  const subTpl = useMemo(() => {
    const base = tpl?.subtitle || {};
    const saved = clip.subtitleStyle;
    if (!saved) return base;
    // Merge: saved fields win, but fall back to template for anything missing
    return { ...base, ...saved };
  }, [clip.subtitleStyle, tpl]);
  const capTplObj = useMemo(() => {
    const base = tpl?.caption || {};
    const saved = clip.captionStyle;
    if (!saved) return base;
    return { ...base, ...saved };
  }, [clip.captionStyle, tpl]);

  // Build display-ready subtitle segments (segmented + punctuation stripped)
  const microSegments = useMemo(() => {
    return buildPreviewSegments(clip.subtitles, { subtitle: subTpl });
  }, [clip.subtitles, subTpl]);

  // Caption segments from saved clip data
  const captions = useMemo(() => clip.captionSegments || [], [clip.captionSegments]);

  // Find active segment + word at current time
  const { seg: activeSeg, wordIdx: activeWordIdx } = useMemo(() => {
    if (!microSegments.length || !isPlaying) return { seg: null, wordIdx: -1 };
    return findActiveWord(microSegments, currentTime);
  }, [microSegments, currentTime, isPlaying]);

  // Find active caption at current time
  const activeCaption = useMemo(() => {
    if (!captions.length || !isPlaying) return null;
    return captions.find(s => currentTime >= s.startSec && currentTime <= (s.endSec || Infinity));
  }, [captions, currentTime, isPlaying]);

  // Pre-built base text style (font, stroke, shadow — NOT color, that's per-word)
  const subBaseStyle = useMemo(() => {
    return buildSubPreviewStyle({ subtitle: subTpl }, CONTAINER_W);
  }, [subTpl]);
  const capStyle = useMemo(() => {
    return buildCapPreviewStyle({ caption: capTplObj }, CONTAINER_W);
  }, [capTplObj]);

  // Karaoke/animation config from template
  const highlightColor = subTpl.highlightColor || "#39ff14";
  const normalColor = subTpl.subColor || "#ffffff";
  const animateOn = subTpl.animateOn || false;
  const animateScale = subTpl.animateScale || 1.2;
  const animateSpeed = animateOn ? (subTpl.animateSpeed || 0.1) : 0.1;

  // Build per-word shadow variants — active word gets glow swapped to highlightColor
  const subShadows = useMemo(() => {
    const sf = CONTAINER_W / 1080;
    const normal = _buildAllShadows(subTpl, sf);
    // Active word: swap glow color to highlightColor (matches editor behavior)
    const activeTpl = {
      ...subTpl,
      glowOn: subTpl.glowOn,
      glowColor: highlightColor,
    };
    const active = _buildAllShadows(activeTpl, sf);
    return {
      normal: normal || "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
      active: active || "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
    };
  }, [subTpl, highlightColor]);

  // Position percentages
  const subYPct = subTpl.yPercent ?? tpl?.subtitle?.yPercent ?? 80;
  const capYPct = capTplObj.yPercent ?? tpl?.caption?.yPercent ?? 15;

  // Time update handler
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTimeUpdate = () => { if (!isSeeking) setCurrentTime(vid.currentTime); };
    const onDurationChange = () => setVideoDuration(vid.duration || 0);
    const onLoadedMetadata = () => setVideoDuration(vid.duration || 0);
    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("durationchange", onDurationChange);
    vid.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      vid.removeEventListener("timeupdate", onTimeUpdate);
      vid.removeEventListener("durationchange", onDurationChange);
      vid.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [showVideo, isSeeking]);

  const togglePlay = useCallback((e) => {
    // Don't toggle when clicking the seek bar
    if (e.target.closest("[data-seekbar]")) return;
    if (!filePath) return;
    setShowVideo(true);
    setTimeout(() => {
      const vid = videoRef.current;
      if (!vid) return;
      if (vid.paused) {
        vid.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        vid.pause();
        setIsPlaying(false);
      }
    }, 50);
  }, [filePath]);

  const handleSeek = useCallback((e) => {
    const vid = videoRef.current;
    if (!vid || !videoDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    vid.currentTime = pct * videoDuration;
    setCurrentTime(pct * videoDuration);
  }, [videoDuration]);

  const progress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  return (
    <div style={{ width: 220, minWidth: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Video container — fit exactly to 9:16 content */}
      <div
        style={{
          width: 220, borderRadius: T.radius.md, overflow: "hidden",
          background: "#000", position: "relative",
          aspectRatio: "9 / 16", cursor: "pointer",
        }}
        onClick={togglePlay}
      >
        {showVideo && filePath ? (
          <video
            ref={videoRef}
            src={filePath}
            poster={thumbPath || undefined}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
          />
        ) : thumbPath ? (
          <img
            src={thumbPath}
            alt=""
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 32, opacity: 0.2 }}>🎬</span>
          </div>
        )}

        {/* Subtitle overlay — word-level karaoke during playback */}
        {isPlaying && activeSeg && (
          <div style={{
            position: "absolute", left: 4, right: 4,
            top: `${subYPct}%`, transform: "translateY(-50%)",
            display: "flex", justifyContent: "center", pointerEvents: "none",
          }}>
            <span style={{ ...subBaseStyle, color: undefined, display: "block", textAlign: "center" }}>
              {(activeSeg.words || []).map((w, i) => {
                const isActive = i === activeWordIdx;
                return (
                  <span key={i} style={{
                    color: isActive ? highlightColor : normalColor,
                    textShadow: isActive ? subShadows.active : subShadows.normal,
                    display: "inline-block",
                    transformOrigin: "center bottom",
                    verticalAlign: "baseline",
                    transition: `color ${animateSpeed}s, transform ${animateSpeed}s ease-out`,
                    transform: animateOn && isActive ? `scale(${animateScale})` : "scale(1)",
                  }}>
                    {w.word}{i < activeSeg.words.length - 1 ? "\u00A0" : ""}
                  </span>
                );
              })}
              {/* Fallback if no words array */}
              {(!activeSeg.words || activeSeg.words.length === 0) && activeSeg.text}
            </span>
          </div>
        )}

        {/* Caption overlay — only during playback */}
        {(() => {
          if (!isPlaying || !activeCaption) return null;
          const displayCap = activeCaption;
          return (
            <div style={{
              position: "absolute", left: 4, right: 4,
              top: `${capYPct}%`, transform: "translateY(-50%)",
              display: "flex", justifyContent: "center", pointerEvents: "none",
            }}>
              <span style={capStyle}>
                {displayCap.text || displayCap}
              </span>
            </div>
          );
        })()}

        {/* Play/pause overlay */}
        {!isPlaying && (
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.3)",
              transition: "opacity 0.2s",
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "rgba(255,255,255,0.9)", display: "flex",
              alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#000" style={{ marginLeft: 2 }}>
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          </div>
        )}

        {/* Duration badge */}
        <div style={{
          position: "absolute", bottom: 8, right: 8,
          background: "rgba(0,0,0,0.75)", borderRadius: 4,
          padding: "2px 6px", fontSize: 11, fontWeight: 700,
          fontFamily: T.mono, color: "#fff",
          backdropFilter: "blur(4px)",
        }}>
          {fmtTime(showVideo && videoDuration > 0 ? Math.floor(currentTime) : duration)}
        </div>
      </div>

      {/* Seek bar — below the video */}
      {showVideo && videoDuration > 0 && (
        <div
          data-seekbar="true"
          onClick={handleSeek}
          onMouseDown={(e) => {
            setIsSeeking(true);
            handleSeek(e);
            const onMove = (ev) => handleSeek(ev);
            const onUp = () => { setIsSeeking(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
          style={{
            width: "100%", height: 6, background: "rgba(255,255,255,0.1)",
            borderRadius: "0 0 4px 4px", cursor: "pointer", position: "relative",
            marginTop: -1,
          }}
        >
          <div style={{
            width: `${progress}%`, height: "100%",
            background: T.accent, borderRadius: "0 0 4px 4px",
            transition: isSeeking ? "none" : "width 0.1s linear",
          }} />
        </div>
      )}
    </div>
  );
}

// ============ SCORE DISPLAY ============
function ScoreDisplay({ score }) {
  if (!score || score <= 0) return null;
  const displayScore = (score / 10).toFixed(1);
  const numScore = parseFloat(displayScore);
  const color = numScore >= 8 ? T.green : numScore >= 6 ? T.yellow : T.red;

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
      <span style={{ fontSize: 28, fontWeight: 800, color, fontFamily: T.font, lineHeight: 1 }}>
        {displayScore}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: T.textTertiary }}>
        /10
      </span>
    </div>
  );
}

// Energy level badge colors
const ENERGY_COLORS = {
  HIGH: { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)", text: "#f87171", label: "HIGH" },
  MED: { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)", text: "#fbbf24", label: "MED" },
  LOW: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)", text: "#94a3b8", label: "LOW" },
};

// Format HH:MM:SS from seconds
const fmtHMS = (sec) => {
  if (!sec || isNaN(sec)) return "00:00:00";
  const h = Math.floor(sec / 3600).toString().padStart(2, "0");
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
};

// ============ APPROVE/REJECT BUTTONS (with feedback DB logging) ============
function ApproveRejectButtons({ clip, onUpdateClip, projectId, project }) {
  const ca = clip.status === "approved" || clip.status === "ready";
  const rej = clip.status === "rejected";

  const handleDecision = async (decision) => {
    const newStatus = (decision === "approved" && ca) || (decision === "rejected" && rej) ? "none" : decision;
    if (newStatus === "approved") posthog.capture("clipflow_clip_approved");
    if (newStatus === "rejected") posthog.capture("clipflow_clip_rejected");
    onUpdateClip(projectId, clip.id, newStatus);

    // Log to feedback DB (only when actually approving/rejecting, not toggling off)
    if (newStatus !== "none" && window.clipflow?.feedbackLog) {
      try {
        await window.clipflow.feedbackLog({
          videoId: project?.name || "",
          gameTag: project?.gameTag || "",
          clipStart: fmtHMS(clip.startTime),
          clipEnd: fmtHMS(clip.endTime),
          title: clip.title || "",
          transcriptSegment: (clip.subtitles?.sub1 || []).map((s) => s.text).join(" ").substring(0, 500),
          peakEnergy: (clip.confidence || clip.highlightScore / 100 || 0),
          hasFrame: !!clip.hasFrame,
          claudeReason: clip.highlightReason || "",
          peakQuote: clip.peakQuote || "",
          energyLevel: clip.energyLevel || "",
          confidence: clip.confidence || 0,
          decision: newStatus,
          userNote: "",
        });
      } catch (e) { /* non-critical */ }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Approve — checkmark */}
      <button
        onClick={() => handleDecision("approved")}
        title={ca ? "Remove approval" : "Approve clip"}
        style={{
          width: 36, height: 36, borderRadius: T.radius.sm,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: ca ? `1.5px solid ${T.green}` : `1px solid ${T.border}`,
          cursor: "pointer",
          background: ca ? T.greenDim : "rgba(255,255,255,0.03)",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => { if (!ca) { e.currentTarget.style.borderColor = T.green; e.currentTarget.style.background = T.greenDim; } }}
        onMouseLeave={(e) => { if (!ca) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; } }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ca ? T.green : T.textTertiary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      {/* Reject — X */}
      <button
        onClick={() => handleDecision("rejected")}
        title={rej ? "Remove rejection" : "Reject clip"}
        style={{
          width: 36, height: 36, borderRadius: T.radius.sm,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: rej ? `1.5px solid ${T.red}` : `1px solid ${T.border}`,
          cursor: "pointer",
          background: rej ? T.redDim : "rgba(255,255,255,0.03)",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => { if (!rej) { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.background = T.redDim; } }}
        onMouseLeave={(e) => { if (!rej) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; } }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={rej ? T.red : T.textTertiary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ============ CLIP ROW ============
function ClipRow({ clip, project, index, onUpdateClip, onEditClipTitle, onOpenInEditor, gamesDb, template }) {
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const ca = clip.status === "approved" || clip.status === "ready";
  const rej = clip.status === "rejected";
  const transcriptSegs = getClipTranscriptSegments(clip, project);

  return (
    <div
      style={{
        display: "flex", gap: 16,
        padding: 16, borderRadius: T.radius.lg,
        background: T.surface,
        border: `1px solid ${ca ? T.greenBorder : rej ? T.redBorder : T.border}`,
        opacity: rej ? 0.45 : 1,
        transition: "all 0.2s ease",
      }}
    >
      {/* Left: clip number + approve/reject stacked vertically + video player */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <span style={{ color: T.textTertiary, fontSize: 11, fontWeight: 700, fontFamily: T.mono }}>#{index + 1}</span>
        <ApproveRejectButtons clip={clip} onUpdateClip={onUpdateClip} projectId={project.id} project={project} />
      </div>

      {/* Video player — larger */}
      <ClipVideoPlayer clip={clip} template={template || FALLBACK_TEMPLATE} />

      {/* Right: details + transcript */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, overflow: "hidden" }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editId === clip.id ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { onEditClipTitle(project.id, clip.id, editText); setEditId(null); }
                    if (e.key === "Escape") setEditId(null);
                  }}
                  autoFocus
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${T.accentBorder}`, borderRadius: T.radius.sm,
                    padding: "6px 10px", color: T.text, fontSize: 14, fontWeight: 600,
                    fontFamily: T.font, outline: "none",
                  }}
                />
                <button
                  onClick={() => { onEditClipTitle(project.id, clip.id, editText); setEditId(null); }}
                  style={{ background: T.accent, border: "none", borderRadius: T.radius.sm, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}
                >Save</button>
              </div>
            ) : (
              <div
                onClick={() => { setEditId(clip.id); setEditText(clip.title || ""); }}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                <span style={{
                  color: T.text, fontSize: 15, fontWeight: 700, lineHeight: 1.4,
                  overflow: "hidden", textOverflow: "ellipsis",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}>
                  {clip.title || "Untitled Clip"}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
            )}
          </div>

          {/* Score */}
          <ScoreDisplay score={clip.highlightScore} />
        </div>

        {/* AI metadata + status badges row */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {/* Energy level badge */}
          {clip.energyLevel && ENERGY_COLORS[clip.energyLevel] && (
            <span
              title={`Audio Energy: ${clip.energyLevel} — How loud/intense the mic audio is during this clip`}
              style={{
                display: "inline-flex", padding: "2px 7px", borderRadius: 4,
                background: ENERGY_COLORS[clip.energyLevel].bg,
                border: `1px solid ${ENERGY_COLORS[clip.energyLevel].border}`,
                fontSize: 10, fontWeight: 700, color: ENERGY_COLORS[clip.energyLevel].text,
                fontFamily: T.mono, letterSpacing: "0.5px", cursor: "default",
              }}>
              {clip.energyLevel === "HIGH" ? "\uD83D\uDD25" : clip.energyLevel === "MED" ? "\u26A1" : "\uD83D\uDCA4"} {clip.energyLevel}
            </span>
          )}

          {/* Confidence score */}
          {clip.confidence > 0 && (
            <span
              title={`Claude's Confidence: ${(clip.confidence * 100).toFixed(0)}% — How confident the AI is that this clip will perform well`}
              style={{
                display: "inline-flex", padding: "2px 7px", borderRadius: 4,
                background: "rgba(139,92,246,0.1)", border: `1px solid rgba(139,92,246,0.25)`,
                fontSize: 10, fontWeight: 700, color: T.accentLight,
                fontFamily: T.mono, cursor: "default",
              }}>
              {(clip.confidence * 100).toFixed(0)}% conf
            </span>
          )}

          {/* Timestamp range */}
          <span style={{
            display: "inline-flex", padding: "2px 7px", borderRadius: 4,
            background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`,
            fontSize: 10, color: T.textTertiary, fontFamily: T.mono,
          }}>
            {fmtHMS(clip.startTime)} → {fmtHMS(clip.endTime)}
          </span>

          {ca && <Badge color={T.green}>Approved</Badge>}
          {clip.renderStatus === "rendered" && <Badge color={T.cyan}>Rendered</Badge>}
          {clip.renderStatus === "rendering" && <Badge color={T.yellow}>Rendering</Badge>}
        </div>

        {/* Claude's reason for picking this clip */}
        {clip.highlightReason && (
          <div style={{
            padding: "6px 10px", borderRadius: T.radius.sm,
            background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`,
            fontSize: 12, color: T.textSecondary, lineHeight: 1.5,
            fontStyle: "italic",
          }}>
            {clip.highlightReason}
          </div>
        )}

        {/* Peak quote */}
        {clip.peakQuote && (
          <div style={{
            padding: "6px 10px", borderRadius: T.radius.sm,
            background: "rgba(251,191,36,0.04)", border: `1px solid rgba(251,191,36,0.15)`,
            fontSize: 12, color: T.yellow, fontWeight: 600,
          }}>
            "{clip.peakQuote}"
          </div>
        )}

        {/* Transcript inline */}
        {transcriptSegs.length > 0 && (
          <div
            style={{
              flex: 1, overflow: "hidden", display: "flex", flexDirection: "column",
            }}
          >
            <div
              style={{
                overflowY: "auto", maxHeight: 160,
                padding: "8px 10px", borderRadius: T.radius.sm,
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${T.border}`,
              }}
            >
              {transcriptSegs.map((seg, i) => (
                <div key={i} style={{ marginBottom: i < transcriptSegs.length - 1 ? 6 : 0 }}>
                  <span style={{
                    color: T.accent, fontSize: 11, fontWeight: 600,
                    fontFamily: T.mono, marginRight: 6,
                  }}>
                    {fmtTimestamp(seg.start)}
                  </span>
                  <span style={{ color: T.textSecondary, fontSize: 12.5, lineHeight: 1.5 }}>
                    {seg.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!rej && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {onOpenInEditor && (
              <button
                onClick={() => onOpenInEditor(project.id, clip.id)}
                style={{
                  padding: "6px 14px", borderRadius: T.radius.sm,
                  border: `1px solid ${T.accentBorder}`,
                  background: T.accentDim, color: T.accentLight,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                  display: "flex", alignItems: "center", gap: 5,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.accentDim; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                Open in Editor
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ PROJECT LIST ============
const FOLDER_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

const SORT_MODES = ["created", "name-asc", "name-desc"];
const SORT_LABELS = { created: "Created", "name-asc": "A–Z", "name-desc": "Z–A" };

function sortFolders(folders, mode) {
  if (mode === "name-asc") return [...folders].sort((a, b) => a.name.localeCompare(b.name));
  if (mode === "name-desc") return [...folders].sort((a, b) => b.name.localeCompare(a.name));
  return folders; // "created" — array order from store
}

export function ProjectsListView({
  localProjects = [], projectFolders = [], activeFolder, onSelectFolder,
  onFoldersChanged, onSelect, onDeleteProjects, mainGame, gamesDb = [],
}) {
  const [selected, setSelected] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [folderSortMode, setFolderSortMode] = useState("created");

  // --- Folder CRUD state (Phase 3) ---
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [contextMenu, setContextMenu] = useState(null); // { x, y, folderId }
  const [colorPickerFolderId, setColorPickerFolderId] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(null); // folder object for confirmation dialog
  const [undoAction, setUndoAction] = useState(null); // { message, undo: fn, timer }
  // --- Project context menu state (Phase 4) ---
  const [projectContextMenu, setProjectContextMenu] = useState(null); // { x, y, projectId }
  const [moveFolderDropdown, setMoveFolderDropdown] = useState(false); // floating action bar dropdown

  // Load sort mode from store on mount
  useEffect(() => {
    window.clipflow?.storeGet?.("folderSortMode").then((m) => {
      if (m) setFolderSortMode(m);
    });
  }, []);

  // Close context menus on mousedown outside — check if click is inside a menu via data-menu attr
  useEffect(() => {
    const handler = (e) => {
      if (e.target.closest?.("[data-menu]")) return; // click inside a menu, don't close
      setContextMenu(null);
      setColorPickerFolderId(null);
      setProjectContextMenu(null);
      setMoveFolderDropdown(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  // --- Filter projects by active folder ---
  const activeFolderObj = activeFolder ? projectFolders.find((f) => f.id === activeFolder) : null;
  const visibleProjects = activeFolder && activeFolderObj
    ? localProjects.filter((p) => activeFolderObj.projectIds.includes(p.id))
    : localProjects;

  // Sort: processing first, then ready, then done, then error — within same status by date (newest first)
  const sorted = [...visibleProjects].sort((a, b) => {
    const order = { processing: 0, ready: 1, done: 2, error: 3 };
    const sa = order[getProjectStatus(a)] ?? 1;
    const sb = order[getProjectStatus(b)] ?? 1;
    if (sa !== sb) return sa - sb;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // --- Selection helpers (operate on visible/filtered projects) ---
  const toggle = (id) => {
    setSelected((p) => ({ ...p, [id]: !p[id] }));
    setConfirmDelete(false);
  };

  const selectAll = () => {
    const allSel = visibleProjects.length > 0 && visibleProjects.every((p) => selected[p.id]);
    setSelected((prev) => {
      const next = { ...prev };
      visibleProjects.forEach((p) => { next[p.id] = !allSel; });
      return next;
    });
    setConfirmDelete(false);
  };

  const selCount = Object.values(selected).filter(Boolean).length;
  const processingCount = visibleProjects.filter((p) => p.status === "processing").length;
  const readyCount = visibleProjects.filter((p) => getProjectStatus(p) === "ready").length;

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (ids.length > 0 && onDeleteProjects) {
      onDeleteProjects(ids);
    }
    setSelected({});
    setConfirmDelete(false);
  };

  const handleSingleDelete = (e, projectId) => {
    e.stopPropagation();
    if (onDeleteProjects) onDeleteProjects([projectId]);
  };

  // --- Folder CRUD helpers ---
  const cycleSortMode = async () => {
    const idx = SORT_MODES.indexOf(folderSortMode);
    const next = SORT_MODES[(idx + 1) % SORT_MODES.length];
    setFolderSortMode(next);
    await window.clipflow.storeSet("folderSortMode", next);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) { setCreatingFolder(false); setNewFolderName(""); return; }
    try {
      await window.clipflow.folderCreate({ name });
      onFoldersChanged();
    } catch (_) { /* IPC error */ }
    setNewFolderName("");
    setCreatingFolder(false);
  };

  const handleRenameFolder = async (folderId) => {
    const name = renameFolderName.trim();
    if (!name) { setRenamingFolderId(null); return; }
    try {
      await window.clipflow.folderUpdate(folderId, { name });
      onFoldersChanged();
    } catch (_) { /* IPC error */ }
    setRenamingFolderId(null);
  };

  const handleColorChange = async (folderId, color) => {
    await window.clipflow.folderUpdate(folderId, { color });
    setColorPickerFolderId(null);
    setContextMenu(null);
    onFoldersChanged();
  };

  const showDeleteConfirm = (folder) => {
    setDeletingFolder(folder);
    setContextMenu(null);
  };

  const confirmFolderDelete = async () => {
    if (!deletingFolder) return;
    const folder = deletingFolder;
    const result = await window.clipflow.folderDelete(folder.id);
    setDeletingFolder(null);
    if (activeFolder === folder.id) onSelectFolder(null);
    onFoldersChanged();
    // Undo toast
    if (result?.success) {
      const timer = setTimeout(() => setUndoAction(null), 5000);
      setUndoAction({
        message: `Folder "${folder.name}" deleted.`,
        timer,
        undo: async () => {
          clearTimeout(timer);
          const res = await window.clipflow.folderCreate({ name: folder.name, color: folder.color });
          if (res?.success && folder.projectIds?.length > 0) {
            await window.clipflow.folderAddProjects(res.folder.id, folder.projectIds);
          }
          setUndoAction(null);
          onFoldersChanged();
        },
      });
    }
  };

  // --- Move projects to folder ---
  const handleMoveProjects = async (targetFolderId, projectIds) => {
    // Capture previous state for undo
    const prevState = projectIds.map((pid) => {
      const f = projectFolders.find((f) => f.projectIds.includes(pid));
      return { projectId: pid, folderId: f ? f.id : null };
    });
    await window.clipflow.folderAddProjects(targetFolderId, projectIds);
    onFoldersChanged();
    setSelected({});
    setMoveFolderDropdown(false);
    setProjectContextMenu(null);
    // Undo toast
    const targetName = targetFolderId
      ? projectFolders.find((f) => f.id === targetFolderId)?.name || "folder"
      : "All Projects";
    const timer = setTimeout(() => setUndoAction(null), 5000);
    setUndoAction({
      message: `${projectIds.length} project${projectIds.length !== 1 ? "s" : ""} moved to "${targetName}".`,
      timer,
      undo: async () => {
        clearTimeout(timer);
        // Restore each project to its original folder
        for (const { projectId, folderId } of prevState) {
          await window.clipflow.folderAddProjects(folderId, [projectId]);
        }
        setUndoAction(null);
        onFoldersChanged();
      },
    });
  };

  const handleRemoveFromFolder = async (projectId) => {
    await window.clipflow.folderAddProjects(null, [projectId]);
    setProjectContextMenu(null);
    onFoldersChanged();
  };

  // --- Sorted folders for sidebar ---
  const sortedFolders = sortFolders(projectFolders, folderSortMode);

  // --- Empty state (no projects at all) ---
  if (localProjects.length === 0) {
    return (
      <div>
        <PageHeader title="Projects" subtitle="Review generated clips" />
        <Card style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎬</div>
          <div style={{ color: T.textSecondary, fontSize: 15, fontWeight: 600 }}>No projects yet</div>
          <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>Projects will appear here once clips are generated.</div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${localProjects.length} project${localProjects.length !== 1 ? "s" : ""}${processingCount > 0 ? ` · ${processingCount} processing` : ""}${readyCount > 0 ? ` · ${readyCount} to review` : ""}`}
      />

      <div style={{ display: "flex", gap: 0, marginTop: 16 }}>
        {/* ── Sidebar: Folder Panel ── */}
        <div style={{
          width: 160, flexShrink: 0, background: "rgba(8,9,14,0.6)",
          borderRadius: `${T.radius.md} 0 0 ${T.radius.md}`,
          border: `1px solid ${T.border}`, borderRight: "none",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Sidebar header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 12px 8px", borderBottom: `1px solid ${T.border}`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Folders</span>
            <button
              onClick={cycleSortMode}
              title={`Sort: ${SORT_LABELS[folderSortMode]}`}
              style={{
                background: "none", border: "none", color: T.textTertiary,
                fontSize: 11, cursor: "pointer", fontFamily: T.mono, padding: "2px 4px",
                borderRadius: 3,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.textTertiary; }}
            >{SORT_LABELS[folderSortMode]}</button>
          </div>

          {/* Folder list (scrollable) */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {/* All Projects */}
            <div
              onClick={() => onSelectFolder(null)}
              style={{
                padding: "8px 12px", cursor: "pointer",
                background: activeFolder === null ? T.accentDim : "transparent",
                borderLeft: activeFolder === null ? `2px solid ${T.accent}` : "2px solid transparent",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
              onMouseEnter={(e) => { if (activeFolder !== null) e.currentTarget.style.background = T.surfaceHover; }}
              onMouseLeave={(e) => { if (activeFolder !== null) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 13, fontWeight: activeFolder === null ? 700 : 500, color: activeFolder === null ? T.text : T.textSecondary }}>
                All Projects
              </span>
              <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textTertiary }}>{localProjects.length}</span>
            </div>

            {/* Folder entries */}
            {sortedFolders.map((f) => {
              const count = f.projectIds.filter((pid) => localProjects.some((p) => p.id === pid)).length;
              const isActive = activeFolder === f.id;
              const isRenaming = renamingFolderId === f.id;

              return (
                <div
                  key={f.id}
                  onClick={() => { if (!isRenaming) onSelectFolder(f.id); }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, folderId: f.id });
                  }}
                  style={{
                    padding: "8px 12px", cursor: "pointer",
                    background: isActive ? T.accentDim : "transparent",
                    borderLeft: isActive ? `2px solid ${T.accent}` : "2px solid transparent",
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = T.surfaceHover; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = isActive ? T.accentDim : "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden" }}>
                    {/* Color dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: f.color, boxShadow: `0 0 6px ${f.color}`,
                    }} />
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameFolderName}
                        onChange={(e) => setRenameFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameFolder(f.id);
                          if (e.key === "Escape") setRenamingFolderId(null);
                        }}
                        onBlur={() => handleRenameFolder(f.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          background: T.surface, border: `1px solid ${T.accentBorder}`,
                          borderRadius: 3, color: T.text, fontSize: 12, fontFamily: T.font,
                          padding: "2px 4px", width: "100%", outline: "none",
                        }}
                      />
                    ) : (
                      <span style={{
                        fontSize: 12, fontWeight: isActive ? 700 : 500,
                        color: isActive ? T.text : T.textSecondary,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>{f.name}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textTertiary, flexShrink: 0 }}>{count}</span>
                </div>
              );
            })}
          </div>

          {/* + New Folder button */}
          {creatingFolder ? (
            <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.border}` }}>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleCreateFolder(); }
                  if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                }}
                onBlur={handleCreateFolder}
                placeholder="Folder name"
                style={{
                  background: T.surface, border: `1px solid ${T.accentBorder}`,
                  borderRadius: 3, color: T.text, fontSize: 12, fontFamily: T.font,
                  padding: "4px 6px", width: "100%", outline: "none",
                }}
              />
            </div>
          ) : (
            <button
              onClick={() => setCreatingFolder(true)}
              style={{
                padding: "10px 12px", borderTop: `1px solid ${T.border}`,
                background: "none", border: "none", color: T.accent,
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                textAlign: "left", width: "100%",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >+ New Folder</button>
          )}
        </div>

        {/* ── Main Panel: Project List ── */}
        <div style={{
          flex: 1, background: T.surface,
          borderRadius: `0 ${T.radius.md} ${T.radius.md} 0`,
          border: `1px solid ${T.border}`,
          padding: "0 16px 16px",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Header row: select all */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {selCount > 0 && (
                <span style={{ color: T.accent, fontSize: 13, fontWeight: 700 }}>
                  {selCount} selected
                </span>
              )}
            </div>
            <button
              onClick={selectAll}
              style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: 0 }}
            >
              {visibleProjects.length > 0 && visibleProjects.every((p) => selected[p.id]) ? "Deselect All" : "Select All"}
            </button>
          </div>

          {/* Project list (scrollable) */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {visibleProjects.length === 0 && activeFolder ? (
              /* Empty folder state */
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ color: T.textTertiary, fontSize: 14, fontWeight: 500 }}>No projects in this folder</div>
                <div style={{ color: T.textMuted, fontSize: 12, marginTop: 8 }}>
                  Select projects from All Projects and use "Move to Folder" to add them.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sorted.map((p) => {
                  const st = getProjectStatus(p);
                  const pColor = getGameColor(p, gamesDb);
                  const clipCount = p.clips ? p.clips.length : (p.clipCount || 0);
                  const isSel = !!selected[p.id];

                  return (
                    <div
                      key={p.id}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProjectContextMenu({ x: e.clientX, y: e.clientY, projectId: p.id });
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "14px 16px", borderRadius: T.radius.md,
                        background: isSel ? T.accentDim : "rgba(255,255,255,0.02)",
                        border: `1px solid ${isSel ? T.accentBorder : st === "done" ? T.greenBorder : st === "error" ? T.redBorder : T.border}`,
                        opacity: st === "processing" ? 0.7 : st === "error" ? 0.5 : 1,
                        cursor: "pointer",
                      }}
                    >
                      {/* Checkbox */}
                      <div onClick={(e) => { e.stopPropagation(); toggle(p.id); }}>
                        <Checkbox checked={isSel} size={18} />
                      </div>

                      {/* Main content — click to open */}
                      <div
                        onClick={() => (st === "ready" || st === "done") && onSelect(p)}
                        style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, overflow: "hidden" }}
                      >
                        <div style={{
                          width: 38, height: 38, borderRadius: T.radius.sm,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 18, flexShrink: 0,
                          background: st === "done" ? T.greenDim : st === "error" ? T.redDim : `${pColor}18`,
                        }}>
                          {st === "done" ? "✅" : st === "error" ? "❌" : st === "processing" ? "⏳" : "🎬"}
                        </div>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: T.text, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {p.name}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                            {p.gameTag && p.gameTag !== "?" && (
                              <span style={{
                                display: "inline-flex", padding: "1px 5px",
                                background: `${pColor}18`, border: `1px solid ${pColor}44`,
                                borderRadius: 4, fontSize: 9, fontWeight: 700, color: pColor,
                                fontFamily: T.mono,
                              }}>{p.gameTag}</span>
                            )}
                            <span style={{ color: T.textTertiary, fontSize: 12 }}>
                              {st === "processing" ? (
                                <span>Processing{p.progress ? <span style={{ fontFamily: T.mono, color: T.yellow }}> {p.progress}%</span> : "..."}</span>
                              ) : st === "error" ? (
                                <span style={{ color: T.red }}>{p.error || "Failed"}</span>
                              ) : (
                                <><span style={{ fontFamily: T.mono }}>{clipCount}</span> clip{clipCount !== 1 ? "s" : ""}</>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status badge */}
                      <Badge color={st === "done" ? T.green : st === "processing" ? T.yellow : st === "error" ? T.red : T.accent}>
                        {st === "done" ? "Done" : st === "processing" ? "Processing" : st === "error" ? "Error" : "Review"}
                      </Badge>

                      {/* Delete icon */}
                      <span
                        onClick={(e) => handleSingleDelete(e, p.id)}
                        title="Delete project"
                        style={{
                          color: T.textMuted, fontSize: 16, cursor: "pointer", padding: "4px 6px",
                          borderRadius: 4, flexShrink: 0, lineHeight: 1,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redDim; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = "transparent"; }}
                      >🗑</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Floating Action Bar (when projects selected) ── */}
      {selCount > 0 && (
        <div style={{
          marginTop: 12, display: "flex", gap: 10, alignItems: "center", justifyContent: "center",
          padding: "12px 20px", borderRadius: T.radius.md,
          background: T.surface, border: `1px solid ${T.border}`,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
        }}>
          <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>{selCount} selected</span>

          {/* Move to Folder dropdown */}
          <div style={{ position: "relative" }}>
            <button
              data-menu
              onClick={(e) => { e.stopPropagation(); setMoveFolderDropdown(!moveFolderDropdown); }}
              style={{
                padding: "8px 14px", borderRadius: T.radius.sm,
                background: T.accentDim, border: `1px solid ${T.accentBorder}`,
                color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
              }}
            >Move to Folder ▾</button>
            {moveFolderDropdown && (
              <div
                data-menu
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", bottom: "100%", left: 0, marginBottom: 4,
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: T.radius.sm, minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  zIndex: 100, overflow: "hidden",
                }}
              >
                {projectFolders.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => {
                      const ids = Object.keys(selected).filter((id) => selected[id]);
                      handleMoveProjects(f.id, ids);
                    }}
                    style={{
                      padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                      fontSize: 12, color: T.textSecondary,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: f.color, boxShadow: `0 0 6px ${f.color}` }} />
                    <span>{f.name}</span>
                  </div>
                ))}
                {activeFolder && (
                  <div
                    onClick={() => {
                      const ids = Object.keys(selected).filter((id) => selected[id]);
                      handleMoveProjects(null, ids);
                    }}
                    style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: 12, color: T.textTertiary,
                      borderTop: projectFolders.length > 0 ? `1px solid ${T.border}` : "none",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >Remove from Folder</div>
                )}
                <div
                  onClick={async () => {
                    const ids = Object.keys(selected).filter((id) => selected[id]);
                    setMoveFolderDropdown(false);
                    try {
                      const res = await window.clipflow.folderCreate({ name: "New Folder" });
                      if (res?.success && ids.length > 0) {
                        await window.clipflow.folderAddProjects(res.folder.id, ids);
                      }
                      onFoldersChanged();
                      setSelected({});
                    } catch (_) { /* IPC error */ }
                  }}
                  style={{
                    padding: "8px 12px", cursor: "pointer", fontSize: 12, color: T.accent,
                    fontWeight: 600, borderTop: `1px solid ${T.border}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >+ New Folder...</div>
              </div>
            )}
          </div>

          <button
            onClick={handleDelete}
            style={{
              padding: "8px 14px", borderRadius: T.radius.sm,
              background: confirmDelete ? T.red : T.redDim,
              color: confirmDelete ? "#fff" : T.red,
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
              border: `1px solid ${confirmDelete ? T.red : "rgba(248,113,113,0.25)"}`,
            }}
          >
            {confirmDelete ? `Confirm Delete ${selCount}?` : `Delete (${selCount})`}
          </button>
          {confirmDelete && (
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                padding: "8px 14px", borderRadius: T.radius.sm,
                border: `1px solid ${T.border}`, background: "transparent",
                color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
              }}
            >Cancel</button>
          )}
        </div>
      )}

      {/* ── Folder Context Menu ── */}
      {contextMenu && (
        <div
          data-menu
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: contextMenu.x, top: contextMenu.y,
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: T.radius.sm, minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 200,
          }}
        >
          <div
            onClick={() => {
              const f = projectFolders.find((f) => f.id === contextMenu.folderId);
              if (f) { setRenamingFolderId(f.id); setRenameFolderName(f.name); }
              setContextMenu(null);
            }}
            style={{ padding: "8px 14px", cursor: "pointer", fontSize: 12, color: T.textSecondary }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >Rename</div>
          <div
            onClick={(e) => {
              e.stopPropagation();
              setColorPickerFolderId(contextMenu.folderId);
            }}
            style={{ padding: "8px 14px", cursor: "pointer", fontSize: 12, color: T.textSecondary, position: "relative" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Change Color
            {colorPickerFolderId === contextMenu.folderId && (
              <div
                data-menu
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", left: "100%", top: 0,
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: T.radius.sm, padding: 8,
                  display: "flex", gap: 6, flexWrap: "wrap", width: 100,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 201,
                }}
              >
                {FOLDER_COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => handleColorChange(contextMenu.folderId, c)}
                    style={{
                      width: 16, height: 16, borderRadius: "50%", background: c,
                      cursor: "pointer", boxShadow: `0 0 6px ${c}`,
                      border: projectFolders.find((f) => f.id === contextMenu.folderId)?.color === c ? "2px solid white" : "2px solid transparent",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <div style={{ height: 1, background: T.border, margin: "2px 0" }} />
          <div
            onClick={() => {
              const f = projectFolders.find((f) => f.id === contextMenu.folderId);
              if (f) showDeleteConfirm(f);
            }}
            style={{ padding: "8px 14px", cursor: "pointer", fontSize: 12, color: T.red }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.redDim; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >Delete Folder</div>
        </div>
      )}

      {/* ── Project Context Menu ── */}
      {projectContextMenu && (
        <div
          data-menu
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: projectContextMenu.x, top: projectContextMenu.y,
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: T.radius.sm, minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 200,
          }}
        >
          {/* Move to folder submenu */}
          {projectFolders.map((f) => (
            <div
              key={f.id}
              onClick={() => handleMoveProjects(f.id, [projectContextMenu.projectId])}
              style={{
                padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                fontSize: 12, color: T.textSecondary,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: f.color, boxShadow: `0 0 6px ${f.color}` }} />
              Move to {f.name}
            </div>
          ))}
          {/* Remove from folder (only if in a folder) */}
          {projectFolders.some((f) => f.projectIds.includes(projectContextMenu.projectId)) && (
            <>
              <div style={{ height: 1, background: T.border, margin: "2px 0" }} />
              <div
                onClick={() => handleRemoveFromFolder(projectContextMenu.projectId)}
                style={{ padding: "8px 14px", cursor: "pointer", fontSize: 12, color: T.textTertiary }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >Remove from Folder</div>
            </>
          )}
          <div style={{ height: 1, background: T.border, margin: "2px 0" }} />
          <div
            onClick={(e) => { handleSingleDelete(e, projectContextMenu.projectId); setProjectContextMenu(null); }}
            style={{ padding: "8px 14px", cursor: "pointer", fontSize: 12, color: T.red }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.redDim; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >Delete Project</div>
        </div>
      )}

      {/* ── Delete Folder Confirmation Dialog ── */}
      {deletingFolder && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
        }}
          onClick={() => setDeletingFolder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radius.lg, padding: "24px 28px",
              maxWidth: 380, width: "100%", boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 12 }}>
              Delete "{deletingFolder.name}"?
            </div>
            <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>
              This will remove the folder only.
              Your {deletingFolder.projectIds.length} project{deletingFolder.projectIds.length !== 1 ? "s" : ""} will
              still be available in All Projects.
            </div>
            <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 8 }}>
              No project files will be deleted.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setDeletingFolder(null)}
                style={{
                  padding: "8px 16px", borderRadius: T.radius.sm,
                  background: "transparent", border: `1px solid ${T.border}`,
                  color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                }}
              >Cancel</button>
              <button
                onClick={confirmFolderDelete}
                style={{
                  padding: "8px 16px", borderRadius: T.radius.sm,
                  background: T.red, border: "none",
                  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
                }}
              >Delete Folder</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Undo Toast ── */}
      {undoAction && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.radius.md, padding: "10px 18px",
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 400,
        }}>
          <span style={{ color: T.textSecondary, fontSize: 13 }}>{undoAction.message}</span>
          <button
            onClick={undoAction.undo}
            style={{
              background: "none", border: "none", color: T.accent,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
            }}
          >Undo</button>
        </div>
      )}
    </div>
  );
}

// ============ (GenerationPanel + GameDropdown removed — AI generation now lives in EditorView) ============

// ============ CLIP BROWSER ============
export function ClipBrowser({ project, onBack, onUpdateClip, onTranscript, onEditClipTitle, onOpenInEditor, onBatchRender, gamesDb }) {
  const [filter, setFilter] = useState("all");
  const [batchRendering, setBatchRendering] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ pct: 0, detail: "" });

  // Load default template for styled preview overlays
  const [previewTemplate, setPreviewTemplate] = useState(FALLBACK_TEMPLATE);
  useEffect(() => {
    (async () => {
      try {
        const defaultId = await window.clipflow?.storeGet("defaultTemplateId");
        const saved = await window.clipflow?.storeGet("layoutTemplates");
        const builtInDeleted = await window.clipflow?.storeGet("builtInTemplateDeleted");
        const all = [
          ...(builtInDeleted ? [] : [FALLBACK_TEMPLATE]),
          ...(Array.isArray(saved) ? saved : []),
        ];
        const tpl = all.find(t => t.id === (defaultId || "fega-default")) || all[0] || FALLBACK_TEMPLATE;
        setPreviewTemplate(tpl);
      } catch { /* use fallback */ }
    })();
  }, []);

  const clips = project.clips || [];
  const isApproved = (c) => c.status === "approved" || c.status === "ready";
  const filtered = clips.filter((c) => filter === "approved" ? isApproved(c) : filter === "pending" ? c.status === "none" : true);
  const approved = clips.filter(isApproved).length;
  const pending = clips.filter((c) => c.status === "none").length;
  const rendered = clips.filter((c) => c.renderStatus === "rendered").length;
  const renderableApproved = clips.filter((c) => isApproved(c) && c.renderStatus !== "rendered").length;

  const [renderError, setRenderError] = useState(null);

  const handleBatchRender = async () => {
    if (batchRendering || renderableApproved === 0) return;
    setRenderError(null);
    setBatchRendering(true);
    setBatchProgress({ pct: 0, detail: "Starting batch render..." });
    const onProgress = (p) => setBatchProgress(p);
    window.clipflow?.onRenderProgress?.(onProgress);
    try {
      const clipsToRender = clips.filter((c) => isApproved(c) && c.renderStatus !== "rendered");
      const result = await window.clipflow.batchRender(clipsToRender, project, null, {});
      if (result?.error) {
        console.error("[BatchRender] Error:", result.error);
        setRenderError(result.error);
      } else if (result?.results) {
        const failed = result.results.filter((r) => !r.success);
        if (failed.length > 0) {
          setRenderError(`${failed.length} clip(s) failed to render`);
          console.error("[BatchRender] Failed clips:", failed);
        }
      }
    } catch (e) {
      console.error("[BatchRender] Exception:", e);
      setRenderError(e.message || "Render failed");
    }
    window.clipflow?.removeRenderProgressListener?.();
    setBatchRendering(false);
    if (onBatchRender) onBatchRender(project.id);
  };

  return (
    <div>
      <PageHeader title={project.name} subtitle={`${approved} approved · ${pending} pending${rendered > 0 ? ` · ${rendered} rendered` : ""}`} backAction={onBack}>
        {renderableApproved > 0 && (
          <button
            onClick={handleBatchRender}
            disabled={batchRendering}
            style={{
              padding: "6px 14px", borderRadius: 6, border: "none",
              background: batchRendering ? T.yellow : `linear-gradient(135deg, ${T.green}, #2dd4a8)`,
              color: batchRendering ? "#000" : "#fff", fontSize: 12, fontWeight: 700,
              cursor: batchRendering ? "default" : "pointer", fontFamily: T.font,
              whiteSpace: "nowrap",
            }}
          >
            {batchRendering ? `⏳ ${batchProgress.pct}%` : `Render All (${renderableApproved})`}
          </button>
        )}
        <span onClick={() => { navigator.clipboard.writeText(String(project.id)); }} title="Copy project ID" style={{ color: T.textTertiary, fontSize: 11, fontFamily: T.mono, cursor: "pointer", flexShrink: 0, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}` }}>#{project.id}</span>
      </PageHeader>

      <TabBar tabs={[{ id: "all", label: "All", count: clips.length }, { id: "pending", label: "Pending", count: pending }, { id: "approved", label: "Approved", count: approved }]} active={filter} onChange={setFilter} />

      {renderError && (
        <div style={{ margin: "12px 0 0", padding: "10px 14px", borderRadius: 8, background: "rgba(248,113,113,0.1)", border: `1px solid ${T.red}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: T.red, fontSize: 12, fontFamily: T.font }}>Render error: {renderError}</span>
          <button onClick={() => setRenderError(null)} style={{ background: "none", border: "none", color: T.textTertiary, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {filtered.map((clip, index) => (
          <ClipRow
            key={clip.id}
            clip={clip}
            project={project}
            index={clips.indexOf(clip)}
            onUpdateClip={onUpdateClip}
            onEditClipTitle={onEditClipTitle}
            onOpenInEditor={onOpenInEditor}
            gamesDb={gamesDb}
            template={previewTemplate}
          />
        ))}
        {filtered.length === 0 && (
          <Card style={{ padding: 40, textAlign: "center" }}>
            <div style={{ color: T.textTertiary, fontSize: 14 }}>No clips match this filter.</div>
          </Card>
        )}
      </div>
    </div>
  );
}
