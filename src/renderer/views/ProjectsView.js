import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import * as Sentry from "@sentry/electron/renderer";
import posthog from "posthog-js";
import T from "../styles/theme";
import { Card, Badge, PageHeader, TabBar, InfoBanner, ViralBar, Checkbox, GamePill, toFileUrl } from "../components/shared";
import TestChip from "../components/TestChip";
import { resolvePreviewSegments } from "../editor/utils/buildPreviewSubtitles";
import { SubtitleOverlay, CaptionOverlay } from "../editor/components/PreviewOverlays";
import { sourceToTimeline, timelineToSource, getTimelineDuration } from "../editor/models/timeMapping";

// Error boundary for clip preview — prevents bad clip data from crashing the whole app
class ClipPreviewBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("[ClipPreview] Render error:", error, info?.componentStack);
    Sentry.captureException(error, { contexts: { react: { componentStack: info?.componentStack } } });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: "100%", aspectRatio: "9/16", borderRadius: T.radius.sm,
          background: "rgba(255,0,0,0.05)", border: "1px solid rgba(255,100,100,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 8, padding: 16,
        }}>
          <span style={{ fontSize: 12, color: "#ff6b6b", fontWeight: 600 }}>Preview error</span>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

// --- Launch-pad helpers (Projects list redesign) ---
// Clips still awaiting a review decision (status "none") — drives "N to review",
// the pip strip, and the "Most to review" sort.
const clipsPending = (p) => (p.clips || []).filter((c) => !c.status || c.status === "none").length;

// Recording date parsed from the project name ("2026-01-23 ..."); falls back to
// createdAt. Local parts only — never toISOString.
const projectDateKey = (p) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.name || "");
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return p.createdAt ? String(p.createdAt) : "";
};
const fmtProjectDate = (p) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.name || "");
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : (p.createdAt ? new Date(p.createdAt) : null);
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const PROJECT_SORTS = [
  { id: "recent", label: "Most recent" },
  { id: "oldest", label: "Oldest first" },
  { id: "review", label: "Most to review" },
  { id: "name", label: "Name (A-Z)" },
];

// Pill used by the status + game filter rows.
function FilterChip({ active, onClick, dot, count, children }) {
  return (
    <span onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600,
      color: active ? T.text : T.textSecondary,
      background: active ? T.accentDim : T.surface,
      border: `1px solid ${active ? T.accentBorder : T.border}`,
      padding: "6px 12px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
    }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />}
      {children}
      {count != null && <span style={{ color: active ? T.accentLight : T.textTertiary, fontWeight: 700, fontSize: 11 }}>{count}</span>}
    </span>
  );
}

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

// Default template fallback (matches BUILTIN_TEMPLATE from templateUtils)
const FALLBACK_TEMPLATE = {
  subtitle: {
    fontFamily: "Latina Essential", fontWeight: 900, fontSize: 52, italic: true, bold: true, subColor: "#ffffff",
    strokeOn: true, strokeWidth: 7, strokeColor: "#000000", strokeOpacity: 100, strokeBlur: 0,
    glowOn: false, shadowOn: false, bgOn: false, yPercent: 80,
    highlightColor: "#4cce8a", animateOn: false, animateScale: 1.2, animateGrowFrom: 0.8, animateSpeed: 0.2,
    segmentMode: "3word", punctuationRemove: false,
  },
  caption: {
    fontFamily: "Latina Essential", fontWeight: 900, fontSize: 30, color: "#ffffff",
    bold: true, italic: true, lineSpacing: 1.3,
    strokeOn: false, glowOn: false, shadowOn: false, bgOn: false, yPercent: 15, widthPercent: 90,
  },
};

// ============ CLIP VIDEO PLAYER ============
// Module-level ref: only one preview video plays at a time
let _activeVideoRef = null;

// Map a source-absolute timestamp onto a clip's NLE timeline (deleted spans skipped).
// Mirrors usePlaybackStore.mapSourceTime, but the Projects preview <video> plays the SOURCE
// file directly, so vid.currentTime is already source-absolute (no clipFileOffset). Returns
// { timelineTime, needsSeek, seekTo, atEnd }; timelineTime is -1 while parked in a deleted
// gap, signalling the caller to freeze the playhead until the seek lands. #113
function mapPreviewSourceTime(sourceAbs, nle) {
  const mapped = sourceToTimeline(sourceAbs, nle);
  if (mapped.found) {
    const seg = nle[mapped.segmentIndex];
    if (sourceAbs >= seg.sourceEnd - 0.02) {
      const next = nle[mapped.segmentIndex + 1];
      if (next) return { timelineTime: mapped.timelineTime, needsSeek: true, seekTo: next.sourceStart, atEnd: false };
      return { timelineTime: getTimelineDuration(nle), needsSeek: false, seekTo: 0, atEnd: true };
    }
    return { timelineTime: mapped.timelineTime, needsSeek: false, seekTo: 0, atEnd: false };
  }
  // In a deleted gap — seek forward into the next surviving segment, if any.
  for (let i = 0; i < nle.length; i++) {
    if (nle[i].sourceStart > sourceAbs) {
      return { timelineTime: -1, needsSeek: true, seekTo: nle[i].sourceStart, atEnd: false };
    }
  }
  return { timelineTime: getTimelineDuration(nle), needsSeek: false, seekTo: 0, atEnd: true };
}

function ClipVideoPlayer({ clip, project, template }) {
  const videoRef = useRef(null);
  const seekbarRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isBarHovered, setIsBarHovered] = useState(false);

  // Lazy-cut (#76): prefer project.sourceFile (single source of truth) and
  // bound playback to the clip's [startTime, endTime] range. Fall back to a
  // legacy clip MP4 for session-31-era projects where no source remains.
  const clipStart = clip.startTime || 0;
  const clipEnd = clip.endTime || 0;
  const sourceMode = !!project?.sourceFile;
  // #113: when the clip carries editor trims/cuts, play through the NLE segment list
  // (skip deleted spans) and report cut-compressed timeline time — the same domain the
  // saved subtitles and captions live in. Unedited/legacy clips keep raw-span playback.
  const nleSegments = clip.nleSegments;
  const useNle = sourceMode && Array.isArray(nleSegments) && nleSegments.length > 0;
  const playStart = useNle ? nleSegments[0].sourceStart : clipStart;
  const effDuration = useNle ? getTimelineDuration(nleSegments) : Math.max(0, clipEnd - clipStart);
  const duration = Math.round(effDuration);
  const videoFilePath = sourceMode
    ? `file://${project.sourceFile.replace(/\\/g, "/")}`
    : (clip.filePath ? `file://${clip.filePath.replace(/\\/g, "/")}` : null);
  const filePath = videoFilePath; // alias kept for the existing logic below
  const thumbPath = clip.thumbnailPath ? toFileUrl(clip.thumbnailPath) : null;

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
    return resolvePreviewSegments(clip, project, { subtitle: subTpl });
  }, [clip, project, subTpl]);

  // Caption segments from saved clip data
  const captions = useMemo(() => clip.captionSegments || [], [clip.captionSegments]);

  // Apply syncOffset if the clip was saved from the editor with a timing adjustment
  const syncOffset = clip.subtitleStyle?.syncOffset || 0;

  // Position percentages — saved clip values take priority (set in editor),
  // fall back to template defaults for clips that haven't been edited yet
  const subYPct = subTpl.yPercent ?? 80;
  const capYPct = capTplObj.yPercent ?? 15;

  const scaleFactor = CONTAINER_W / 1080;

  // Metadata + external pause handlers.
  // In sourceMode: <video> plays the full source recording. Effective duration
  // is the clip range, not the source duration; seek to clipStart on load.
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onDurationChange = () => {
      setVideoDuration(sourceMode ? effDuration : (vid.duration || 0));
    };
    const onLoadedMetadata = () => {
      if (sourceMode) {
        if (Math.abs(vid.currentTime - playStart) > 0.05) vid.currentTime = playStart;
        setVideoDuration(effDuration);
      } else {
        setVideoDuration(vid.duration || 0);
      }
    };
    const onExternalPause = () => setIsPlaying(false);
    vid.addEventListener("durationchange", onDurationChange);
    vid.addEventListener("loadedmetadata", onLoadedMetadata);
    vid.addEventListener("clipflow-paused", onExternalPause);
    return () => {
      vid.removeEventListener("durationchange", onDurationChange);
      vid.removeEventListener("loadedmetadata", onLoadedMetadata);
      vid.removeEventListener("clipflow-paused", onExternalPause);
    };
  }, [showVideo, sourceMode, playStart, effDuration]);

  // High-frequency time updates via rAF. In sourceMode, currentTime is reported
  // clip-relative (subtract clipStart). Bound at clipEnd: pause + snap back.
  useEffect(() => {
    if (!isPlaying) return;
    let rafId;
    const tick = () => {
      const vid = videoRef.current;
      if (vid && !isSeeking) {
        if (useNle) {
          // Walk the NLE timeline: skip deleted spans, report cut-compressed time.
          const result = mapPreviewSourceTime(vid.currentTime, nleSegments);
          if (result.atEnd) {
            vid.pause();
            vid.currentTime = playStart;
            setCurrentTime(0);
            setIsPlaying(false);
            return;
          }
          if (result.needsSeek && !vid.seeking &&
              Math.abs(vid.currentTime - result.seekTo) > 0.05) {
            vid.currentTime = result.seekTo;
          }
          if (result.timelineTime >= 0) setCurrentTime(result.timelineTime);
        } else if (sourceMode) {
          if (vid.currentTime >= clipEnd - 0.05) {
            vid.pause();
            vid.currentTime = clipStart;
            setCurrentTime(0);
            setIsPlaying(false);
            return;
          }
          setCurrentTime(Math.max(0, vid.currentTime - clipStart));
        } else {
          setCurrentTime(vid.currentTime);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isSeeking, useNle, nleSegments, playStart, sourceMode, clipStart, clipEnd]);

  // Abort video fetch on unmount — prevents Chromium renderer crash
  useEffect(() => {
    return () => {
      const vid = videoRef.current;
      if (vid) {
        vid.pause();
        vid.removeAttribute("src");
        vid.load();
      }
    };
  }, []);

  const togglePlay = useCallback((e) => {
    // Don't toggle when clicking the seek bar
    if (e.target.closest("[data-seekbar]")) return;
    if (!filePath) return;
    setShowVideo(true);
    setTimeout(() => {
      const vid = videoRef.current;
      if (!vid) return;
      if (vid.paused) {
        // Pause any other playing preview video first
        if (_activeVideoRef && _activeVideoRef !== vid && !_activeVideoRef.paused) {
          _activeVideoRef.pause();
          // Dispatch a custom event so the other player's React state updates
          _activeVideoRef.dispatchEvent(new Event("clipflow-paused"));
        }
        _activeVideoRef = vid;
        vid.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        vid.pause();
        setIsPlaying(false);
        if (_activeVideoRef === vid) _activeVideoRef = null;
      }
    }, 50);
  }, [filePath]);

  const handleSeek = useCallback((e) => {
    const vid = videoRef.current;
    const bar = seekbarRef.current;
    if (!vid || !videoDuration || !bar) return;
    // Use the seekbar ref instead of e.currentTarget — when this is called
    // from a window-level mousemove during drag, currentTarget is the window
    // (no getBoundingClientRect), which crashes the renderer.
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const rel = pct * videoDuration;
    if (useNle) {
      // videoDuration is timeline time → map the target back to a source position.
      const r = timelineToSource(rel, nleSegments);
      vid.currentTime = r.found ? r.sourceTime : playStart;
    } else {
      vid.currentTime = sourceMode ? (clipStart + rel) : rel;
    }
    setCurrentTime(rel);
  }, [videoDuration, useNle, nleSegments, playStart, sourceMode, clipStart]);

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

        {/* Subtitle overlay — shared renderer, word-level karaoke during playback */}
        {isPlaying && (
          <div style={{
            position: "absolute", left: 4, right: 4,
            top: `${subYPct}%`, transform: "translateY(-50%)",
            display: "flex", justifyContent: "center", pointerEvents: "none",
          }}>
            <SubtitleOverlay
              segments={microSegments}
              currentTime={currentTime}
              syncOffset={syncOffset}
              subtitleStyle={subTpl}
              scaleFactor={scaleFactor}
            />
          </div>
        )}

        {/* Caption overlay — shared renderer, only during playback */}
        {isPlaying && (
          <div style={{
            position: "absolute", left: 4, right: 4,
            top: `${capYPct}%`, transform: "translateY(-50%)",
            display: "flex", justifyContent: "center", pointerEvents: "none",
          }}>
            <CaptionOverlay
              segments={captions}
              currentTime={currentTime}
              syncOffset={syncOffset}
              captionStyle={capTplObj}
              scaleFactor={scaleFactor}
            />
          </div>
        )}

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

      {/* Seek bar — below the video. Rendered as a 12px hover-zone hugging the
          video card so the click target is comfortable, with a 4px visible track
          centered inside. No CSS transition on the fill — at 60fps rAF cadence,
          a transition causes perceptible lag and the bar appears to "stick"
          until the next big jump (#79). */}
      {showVideo && videoDuration > 0 && (
        <div
          ref={seekbarRef}
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
          onMouseEnter={() => setIsBarHovered(true)}
          onMouseLeave={() => setIsBarHovered(false)}
          style={{
            width: "100%", height: 12, cursor: "pointer", position: "relative",
            marginTop: -1, display: "flex", alignItems: "center",
          }}
        >
          {/* Track */}
          <div style={{
            width: "100%", height: (isBarHovered || isSeeking) ? 6 : 4,
            background: "rgba(255,255,255,0.12)",
            borderRadius: 999, overflow: "hidden",
            transition: "height 120ms ease",
          }}>
            {/* Fill — no width transition; rAF updates drive smoothness */}
            <div style={{
              width: `${progress}%`, height: "100%",
              background: `linear-gradient(90deg, ${T.accent} 0%, ${T.accentLight || T.accent} 100%)`,
              borderRadius: 999,
              boxShadow: `0 0 6px ${T.accent}66`,
            }} />
          </div>
          {/* Playhead knob — only when hovered/seeking */}
          {(isBarHovered || isSeeking) && (
            <div style={{
              position: "absolute",
              left: `calc(${progress}% - 6px)`,
              width: 12, height: 12,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: `0 0 8px ${T.accent}cc, 0 1px 4px rgba(0,0,0,0.4)`,
              pointerEvents: "none",
            }} />
          )}
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
      <span style={{ fontSize: 24, fontWeight: 800, color, fontFamily: T.font, lineHeight: 1 }}>
        {displayScore}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textTertiary }}>
        /10
      </span>
    </div>
  );
}

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
          // claudeReason / peakQuote dropped (#71) — Claude no longer narrates clips.
          energyLevel: clip.energyLevel || "",
          confidence: clip.confidence || 0,
          decision: newStatus,
          userNote: "",
        });
      } catch (e) { /* non-critical */ }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
      {/* Approve — checkmark */}
      <button
        onClick={() => handleDecision("approved")}
        title={ca ? "Remove approval" : "Approve clip"}
        style={{
          flex: 1, height: 40, borderRadius: T.radius.md,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: ca ? `1px solid ${T.greenBorder}` : `1px solid ${T.border}`,
          cursor: "pointer",
          background: ca ? T.greenDim : T.surfaceHover,
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => { if (!ca) { e.currentTarget.style.borderColor = T.green; e.currentTarget.style.background = T.greenDim; } }}
        onMouseLeave={(e) => { if (!ca) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surfaceHover; } }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ca ? T.green : T.textSecondary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      {/* Reject — X */}
      <button
        onClick={() => handleDecision("rejected")}
        title={rej ? "Remove rejection" : "Reject clip"}
        style={{
          flex: 1, height: 40, borderRadius: T.radius.md,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: rej ? `1px solid ${T.red}` : `1px solid ${T.border}`,
          cursor: "pointer",
          background: rej ? T.redDim : T.surfaceHover,
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => { if (!rej) { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.background = T.redDim; } }}
        onMouseLeave={(e) => { if (!rej) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surfaceHover; } }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={rej ? T.red : T.textSecondary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ============ CLIP ROW ============
function ClipRow({ clip, project, onUpdateClip, onEditClipTitle, onOpenInEditor, gamesDb, template }) {
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const ca = clip.status === "approved" || clip.status === "ready";
  const rej = clip.status === "rejected";

  // Transcript as flowing prose — join the clip-window segment texts, no [mm:ss] stamps.
  // Mirrors how the editor's TranscriptTab reads; the per-line timestamps were the
  // whole problem the redesign set out to fix.
  const transcriptText = useMemo(() => getClipTranscriptSegments(clip, project).map((s) => s.text).filter(Boolean).join(" "), [clip, project]);

  // Game tag for the badge: prefer clip's first-class field, fall back to the parent
  // project, then to legacy title-hashtag parsing for pre-#71 clips.
  const clipGameTag = (clip.gameTag || project.gameTag || (typeof clip.title === "string" ? (clip.title.match(/#(\w+)/)?.[1] || "") : "") || "").toUpperCase();
  const clipGameColor = project.gameColor || T.accent;

  // Calm metadata line — energy as colored text (amber HIGH so it never reads as a
  // reject signal), confidence + time as plain dot-separated prose instead of pills.
  const lvl = clip.energyLevel;
  const energyColor = lvl === "HIGH" ? "#fb923c" : lvl === "MED" ? T.yellow : T.textTertiary;
  const energyLabel = lvl ? lvl.charAt(0) + lvl.slice(1).toLowerCase() : "";
  const metaItems = [];
  if (energyLabel) metaItems.push(<span style={{ color: energyColor, fontWeight: 600 }}>{energyLabel} energy</span>);
  if (clip.confidence > 0) metaItems.push(<span style={{ color: T.textSecondary }}>{(clip.confidence * 100).toFixed(0)}% confidence</span>);
  metaItems.push(<span style={{ color: T.textTertiary }}>{fmtTime(clip.startTime)} → {fmtTime(clip.endTime)}</span>);

  const shadowCard = "0 1px 2px rgba(0,0,0,0.5), 0 14px 34px -16px rgba(0,0,0,0.7)";
  const shadowLift = `0 2px 4px rgba(0,0,0,0.5), 0 26px 60px -22px rgba(0,0,0,0.85), 0 0 0 1px ${T.accentBorder}`;

  return (
    <div
      style={{
        display: "flex", gap: 18, padding: 14,
        borderRadius: T.radius.xl,
        background: `linear-gradient(180deg, rgba(255,255,255,0.022), rgba(255,255,255,0)), ${T.surface}`,
        border: `1px solid ${T.border}`,
        boxShadow: shadowCard,
        opacity: rej ? 0.5 : 1,
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.borderHover;
        e.currentTarget.style.boxShadow = shadowLift;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.border;
        e.currentTarget.style.boxShadow = shadowCard;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Left: big watchable preview with approve/reject directly under it */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0, width: 220 }}>
        <ClipPreviewBoundary>
          <ClipVideoPlayer clip={clip} project={project} template={template || FALLBACK_TEMPLATE} />
        </ClipPreviewBoundary>
        <ApproveRejectButtons clip={clip} onUpdateClip={onUpdateClip} projectId={project.id} project={project} />
      </div>

      {/* Right: title + score, calm metadata, flowing transcript, open-in-editor */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Title + score */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
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
                    padding: "6px 10px", color: T.text, fontSize: 15, fontWeight: 600,
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
                style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 7 }}
              >
                <span style={{
                  color: T.text, fontSize: 18, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.015em",
                  overflow: "hidden", textOverflow: "ellipsis",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}>
                  {clip.title || "Untitled Clip"}
                </span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 5 }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>
            <ScoreDisplay score={clip.highlightScore} />
          </div>
        </div>

        {/* Calm metadata line: game / energy / confidence / time / status chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", fontSize: 12.5 }}>
          {clipGameTag && <GamePill tag={clipGameTag} color={clipGameColor} size="sm" />}
          {metaItems.map((node, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.textTertiary, display: "inline-block", flexShrink: 0 }} />}
              {node}
            </React.Fragment>
          ))}
          {clip.transcriptionFailed && (
            <span
              title={`Retranscription failed: ${clip.transcriptionError || "unknown error"}. Subtitles may be inaccurate. Use Re-transcribe in the editor to retry.`}
              style={{
                display: "inline-flex", padding: "2px 7px", borderRadius: 4,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                fontSize: 10, fontWeight: 700, color: "#ef4444",
                fontFamily: T.mono, cursor: "default",
              }}>
              ⚠ Subs failed
            </span>
          )}
          {ca && <Badge color={T.green}>Approved</Badge>}
          {rej && <Badge color={T.red}>Rejected</Badge>}
          {clip.renderStatus === "rendered" && <Badge color={T.cyan}>Rendered</Badge>}
          {clip.renderStatus === "rendering" && <Badge color={T.yellow}>Rendering</Badge>}
        </div>

        {/* Flowing transcript: reads like the editor, no [mm:ss] stamps */}
        {transcriptText && (
          <div style={{
            flex: 1,
            padding: "12px 14px", borderRadius: T.radius.md,
            background: "rgba(255,255,255,0.022)",
            fontSize: 13.5, lineHeight: 1.62, color: T.textSecondary,
            maxWidth: "68ch",
            display: "-webkit-box", WebkitLineClamp: 8, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {transcriptText}
          </div>
        )}

        {/* Primary action */}
        {onOpenInEditor && (
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <button
              onClick={() => onOpenInEditor(project.id, clip.id)}
              style={{
                padding: "10px 16px", borderRadius: T.radius.md,
                border: "1px solid transparent",
                background: T.accent, color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: `0 6px 18px -8px ${T.accent}cc`,
                transition: "all 0.16s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.accentLight; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.accent; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              Open in Editor
            </button>
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
  localProjects = [], setLocalProjects, projectFolders = [], activeFolder, onSelectFolder,
  onFoldersChanged, onSelect, onDeleteProjects, mainGame, gamesDb = [],
}) {
  // Toggle per-project test mode. Optimistic update on the local state, then
  // persist to disk via IPC. On failure, revert so the chip doesn't lie about
  // where outputs will actually route.
  const handleToggleTestMode = async (projectId, next) => {
    if (!setLocalProjects) return;
    setLocalProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, testMode: next } : p));
    try {
      const result = await window.clipflow?.projectUpdateTestMode?.(projectId, next);
      if (result?.error) throw new Error(result.error);
    } catch (e) {
      console.error("[ProjectsView] testMode toggle failed:", e.message);
      setLocalProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, testMode: !next } : p));
    }
  };
  const [selected, setSelected] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [folderSortMode, setFolderSortMode] = useState("created");
  const [projectSortMode, setProjectSortMode] = useState("recent"); // recent | oldest | review | name
  const [statusFilter, setStatusFilter] = useState("all"); // all | review | done
  const [gameFilter, setGameFilter] = useState("all"); // all | <gameTag>
  const [sortOpen, setSortOpen] = useState(false);

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

  // Load sort modes from store on mount
  useEffect(() => {
    window.clipflow?.storeGet?.("folderSortMode").then((m) => {
      if (m) setFolderSortMode(m);
    });
    window.clipflow?.storeGet?.("projectSortMode").then((m) => {
      if (m && PROJECT_SORTS.some((s) => s.id === m)) setProjectSortMode(m);
    });
  }, []);

  const changeProjectSort = async (next) => {
    setProjectSortMode(next);
    try { await window.clipflow?.storeSet?.("projectSortMode", next); } catch (e) {}
  };

  // Close context menus on mousedown outside — check if click is inside a menu via data-menu attr
  useEffect(() => {
    const handler = (e) => {
      if (e.target.closest?.("[data-menu]")) return; // click inside a menu, don't close
      setContextMenu(null);
      setColorPickerFolderId(null);
      setProjectContextMenu(null);
      setMoveFolderDropdown(false);
      setSortOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  // --- Games present (for the game filter chips) ---
  const games = [];
  const gameSeen = {};
  localProjects.forEach((p) => {
    const tag = p.gameTag;
    if (!tag || tag === "?") return;
    if (!gameSeen[tag]) { gameSeen[tag] = { tag, color: getGameColor(p, gamesDb), count: 0 }; games.push(gameSeen[tag]); }
    gameSeen[tag].count += 1;
  });

  // --- Filter projects by status + game (folders retired) ---
  const visibleProjects = localProjects.filter((p) => {
    if (statusFilter === "review" && getProjectStatus(p) !== "ready") return false;
    if (statusFilter === "done" && getProjectStatus(p) !== "done") return false;
    if (gameFilter !== "all" && p.gameTag !== gameFilter) return false;
    return true;
  });

  // Sort modes: "status" (processing → review → done → error), "date" (newest first),
  // "game" (grouped alphabetically by game name). Newest-first inside every group.
  const sorted = [...visibleProjects].sort((a, b) => {
    if (projectSortMode === "oldest") return projectDateKey(a).localeCompare(projectDateKey(b));
    if (projectSortMode === "review") return clipsPending(b) - clipsPending(a);
    if (projectSortMode === "name") return (a.name || "").localeCompare(b.name || "");
    return projectDateKey(b).localeCompare(projectDateKey(a)); // recent (default)
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
  const processingCount = localProjects.filter((p) => p.status === "processing").length;
  const readyCount = localProjects.filter((p) => getProjectStatus(p) === "ready").length;
  const doneCount = localProjects.filter((p) => getProjectStatus(p) === "done").length;

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
      <style>{`
        .pl-row { transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .pl-row.openable:hover { border-color: ${T.borderHover} !important; box-shadow: 0 2px 4px rgba(0,0,0,.5), 0 24px 56px -22px rgba(0,0,0,.85); transform: translateY(-1px); }
        .pl-chk { display: inline-flex; align-items: center; overflow: hidden; width: 0; opacity: 0; margin-left: -6px; transition: opacity .13s ease, width .13s ease, margin .13s ease; }
        .pl-row:hover .pl-chk, .pl-list.selecting .pl-chk, .pl-row.sel .pl-chk { width: 18px; opacity: 1; margin-left: 0; }
        .pl-open, .pl-trash { opacity: 0; transition: opacity .15s ease; }
        .pl-row:hover .pl-open, .pl-row:hover .pl-trash { opacity: 1; }
      `}</style>

      <PageHeader
        title="Projects"
        subtitle={`${localProjects.length} project${localProjects.length !== 1 ? "s" : ""}${processingCount > 0 ? ` · ${processingCount} processing` : ""}${readyCount > 0 ? ` · ${readyCount} to review` : ""}${doneCount > 0 ? ` · ${doneCount} done` : ""}`}
      >
        {/* Sort dropdown */}
        <div data-menu style={{ position: "relative" }}>
          <button
            onClick={(e) => { e.stopPropagation(); setSortOpen((o) => !o); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: T.textSecondary, background: T.surface, border: `1px solid ${sortOpen ? T.accentBorder : T.border}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontFamily: T.font }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
            Sort: <span style={{ color: T.text }}>{(PROJECT_SORTS.find((s) => s.id === projectSortMode) || PROJECT_SORTS[0]).label}</span>
            <span style={{ fontSize: 9, color: T.textMuted }}>{"▾"}</span>
          </button>
          {sortOpen && (
            <div data-menu style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 190, background: T.surface, border: `1px solid ${T.borderHover}`, borderRadius: T.radius.md, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", padding: 5, zIndex: 50 }}>
              {PROJECT_SORTS.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { changeProjectSort(s.id); setSortOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: T.radius.sm, fontSize: 12.5, cursor: "pointer", color: projectSortMode === s.id ? T.text : T.textSecondary, fontWeight: projectSortMode === s.id ? 600 : 500, background: projectSortMode === s.id ? T.surfaceHover : "transparent" }}
                  onMouseEnter={(e) => { if (projectSortMode !== s.id) e.currentTarget.style.background = T.surfaceHover; }}
                  onMouseLeave={(e) => { if (projectSortMode !== s.id) e.currentTarget.style.background = "transparent"; }}
                >
                  {s.label}
                  {projectSortMode === s.id && <span style={{ marginLeft: "auto", color: T.accentLight, fontSize: 12 }}>{"✓"}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </PageHeader>

      {/* Filter chips: status + game (replaces the folder sidebar + sort bar) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "2px 0 16px" }}>
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} count={localProjects.length}>All</FilterChip>
        <FilterChip active={statusFilter === "review"} onClick={() => setStatusFilter("review")} count={readyCount}>To review</FilterChip>
        <FilterChip active={statusFilter === "done"} onClick={() => setStatusFilter("done")} count={doneCount}>Done</FilterChip>
        {games.length > 0 && <span style={{ width: 1, height: 20, background: T.border, margin: "0 3px" }} />}
        {games.length > 0 && (
          <FilterChip active={gameFilter === "all"} onClick={() => setGameFilter("all")}>All games</FilterChip>
        )}
        {games.map((g) => (
          <FilterChip key={g.tag} active={gameFilter === g.tag} onClick={() => setGameFilter(g.tag)} dot={g.color} count={g.count}>{g.tag}</FilterChip>
        ))}
        {visibleProjects.length > 0 && (
          <button
            onClick={selectAll}
            style={{ marginLeft: "auto", background: "none", border: "none", color: T.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: "6px 4px" }}
          >{visibleProjects.every((p) => selected[p.id]) ? "Deselect all" : "Select all"}</button>
        )}
      </div>

      {/* Launch-pad list (full width) */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ color: T.textTertiary, fontSize: 14, fontWeight: 500 }}>No projects match this filter</div>
          <div style={{ color: T.textMuted, fontSize: 12, marginTop: 8 }}>Try a different game or status.</div>
        </div>
      ) : (
        <div className={selCount > 0 ? "pl-list selecting" : "pl-list"} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
          {sorted.map((p) => {
            const st = getProjectStatus(p);
            const pColor = getGameColor(p, gamesDb);
            const clips = p.clips || [];
            const clipCount = clips.length || p.clipCount || 0;
            const reviewed = clips.filter((c) => c.status && c.status !== "none").length;
            const rendered = clips.filter((c) => c.renderStatus === "rendered").length;
            const leftToReview = Math.max(0, clipCount - reviewed);
            const isSel = !!selected[p.id];
            const openable = st === "ready" || st === "done";
            const isTest = p.testMode === true || (p.tags || []).includes("test");
            const dateStr = fmtProjectDate(p);
            return (
              <div
                key={p.id}
                className={`pl-row${isSel ? " sel" : ""}${openable ? " openable" : ""}`}
                onClick={() => openable && onSelect(p)}
                style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 14,
                  padding: 13, borderRadius: T.radius.lg, overflow: "hidden",
                  cursor: openable ? "pointer" : "default",
                  background: isSel
                    ? T.accentDim
                    : `radial-gradient(90% 160% at 100% 0%, ${pColor}1f 0%, transparent 55%), linear-gradient(100deg, ${pColor}1a 0%, ${pColor}06 40%, rgba(255,255,255,0.02) 65%)`,
                  border: `1px solid ${isSel ? T.accentBorder : st === "error" ? T.redBorder : `${pColor}3d`}`,
                  opacity: st === "processing" ? 0.75 : st === "error" ? 0.6 : 1,
                }}
              >
                {/* hover-reveal checkbox */}
                <span className="pl-chk" onClick={(e) => { e.stopPropagation(); toggle(p.id); }}>
                  <Checkbox checked={isSel} size={18} />
                </span>

                {/* game-hue poster */}
                <div style={{ position: "relative", flexShrink: 0, width: 44, height: 58, borderRadius: 9, overflow: "hidden", display: "grid", placeItems: "center", background: `${pColor}18` }}>
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(150deg, ${pColor}, ${pColor}55 65%, ${pColor}22)`, opacity: openable ? 0.9 : 0.5 }} />
                  <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 50% 20%, transparent 40%, rgba(0,0,0,.5))" }} />
                  <span style={{ position: "relative", zIndex: 1, fontSize: 12, fontWeight: 800, color: "#fff", fontFamily: T.mono, letterSpacing: "0.5px", textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>
                    {p.gameTag && p.gameTag !== "?" ? p.gameTag : ""}
                  </span>
                </div>

                {/* main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.text, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.name}>{p.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 12, color: T.textSecondary, flexWrap: "wrap" }}>
                    {isTest && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", color: T.yellow, background: T.yellowDim, border: `1px solid ${T.yellowBorder}`, padding: "1px 6px", borderRadius: 5 }}>TEST</span>}
                    <span>{dateStr ? `${dateStr} · ` : ""}{clipCount} clip{clipCount !== 1 ? "s" : ""}</span>
                  </div>
                  {st === "processing" ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: T.yellow }}>Processing{p.progress ? ` ${p.progress}%` : "..."}</div>
                  ) : st === "error" ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: T.red }}>{p.error || "Failed"}</div>
                  ) : clipCount > 0 ? (
                    <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
                      {clips.slice(0, 40).map((c, i) => {
                        const cc = (c.status === "approved" || c.status === "ready") ? T.green : c.status === "rejected" ? "rgba(248,113,113,0.55)" : "rgba(255,255,255,0.09)";
                        return <span key={i} style={{ width: 14, height: 6, borderRadius: 2, background: cc }} />;
                      })}
                      <span style={{ marginLeft: 8, fontSize: 11, color: T.textSecondary, fontWeight: 600 }}>
                        {leftToReview > 0
                          ? <><b style={{ color: T.text }}>{leftToReview}</b> of {clipCount} left{rendered > 0 ? ` · ${rendered} rendered` : ""}</>
                          : <>all reviewed{rendered > 0 ? <> {"·"} <b style={{ color: T.text }}>{rendered}</b> rendered</> : ""}</>}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* status + open */}
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 9 }}>
                  <Badge color={st === "done" ? T.green : st === "processing" ? T.yellow : st === "error" ? T.red : T.accent}>
                    {st === "done" ? "Done" : st === "processing" ? "Processing" : st === "error" ? "Error" : "Review"}
                  </Badge>
                  {openable && (
                    <button
                      className="pl-open"
                      onClick={(e) => { e.stopPropagation(); onSelect(p); }}
                      style={{
                        fontFamily: T.font, fontSize: 12.5, fontWeight: 700, borderRadius: 9, padding: "7px 14px", cursor: "pointer",
                        color: st === "done" ? T.textSecondary : "#fff",
                        background: st === "done" ? T.surfaceHover : T.accent,
                        border: st === "done" ? `1px solid ${T.border}` : "none",
                        boxShadow: st === "done" ? "none" : "0 6px 16px -8px rgba(139,92,246,0.8)",
                      }}
                    >{st === "done" ? "Open" : "Review"}</button>
                  )}
                </div>

                {/* hover-reveal delete */}
                <span
                  className="pl-trash"
                  onClick={(e) => handleSingleDelete(e, p.id)}
                  title="Delete project"
                  style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 28, height: 28, color: T.textMuted, cursor: "pointer", borderRadius: 7 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redDim; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                </span>
              </div>
            );
          })}
        </div>
      )}


      {/* ── Floating Action Bar (when projects selected) ── */}
      {selCount > 0 && (
        <div style={{
          marginTop: 12, display: "flex", gap: 10, alignItems: "center", justifyContent: "center",
          padding: "12px 20px", borderRadius: T.radius.md,
          background: T.surface, border: `1px solid ${T.border}`,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
        }}>
          <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>{selCount} selected</span>

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

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        {filtered.map((clip) => (
          <ClipRow
            key={clip.id}
            clip={clip}
            project={project}
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
