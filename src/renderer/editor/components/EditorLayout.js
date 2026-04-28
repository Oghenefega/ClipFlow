import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "../../../components/ui/resizable";
import { Separator } from "../../../components/ui/separator";
import LeftPanelNew from "./LeftPanelNew";
import RightPanelNew from "./RightPanelNew";
import PreviewPanelNew from "./PreviewPanelNew";
import TimelinePanelNew from "./TimelinePanelNew";
import useEditorStore from "../stores/useEditorStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import usePlaybackStore from "../stores/usePlaybackStore";
import useLayoutStore from "../stores/useLayoutStore";
import useCaptionStore from "../stores/useCaptionStore";
import {
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronDown,
  Play,
  Pause,
  Clock,
  Check,
  Send,
  Mic,
  Loader2,
  PanelBottomOpen,
  Bug,
  ThumbsUp,
  ThumbsDown,
  Download,
  FolderOpen,
  X,
} from "lucide-react";
import { Slider } from "../../../components/ui/slider";
import { Button } from "../../../components/ui/button";
import { visibleSubtitleSegments } from "../models/timeMapping";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";


// ── Timeline track definitions ──
const TRACKS = [
  { id: "cap", label: "Caption", icon: "T", color: "hsl(263 70% 58%)" },
  { id: "sub", label: "Subtitle", icon: null, color: "hsl(220 50% 72%)" },
  { id: "audio", label: "Audio", icon: null, color: "hsl(200 40% 50%)" },
];

// ── Helper: format relative time for "last saved" ──
function formatLastSaved(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Helper: format duration mm:ss ──
function fmtDuration(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Clip Navigator Dropdown ──
function ClipNavigator({ clips, currentClipId, onSelect, onClose, chevronRef }) {
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      // Ignore clicks on the chevron button (it handles its own toggle)
      if (chevronRef?.current && chevronRef.current.contains(e.target)) return;
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, chevronRef]);

  if (!clips || clips.length === 0) {
    return (
      <div
        ref={dropdownRef}
        className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-[360px] rounded-lg border bg-popover shadow-xl z-50 p-4"
      >
        <p className="text-xs text-muted-foreground text-center">No clips in this project</p>
      </div>
    );
  }

  // Derive duration from startTime/endTime if no explicit duration field
  const getDuration = (c) => c.duration || ((c.endTime && c.startTime != null) ? (c.endTime - c.startTime) : 0);

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 rounded-lg border bg-popover shadow-xl z-50 overflow-hidden"
      style={{ width: Math.min(clips.length * 120 + 32, 640) }}
    >
      <div className="px-3 py-2 border-b">
        <span className="text-[11px] font-medium text-muted-foreground">
          Project Clips ({clips.length})
        </span>
      </div>
      <div
        className="overflow-y-auto overflow-x-hidden"
        style={{ maxHeight: "min(420px, calc(100vh - 120px))" }}
      >
        <div className="p-3 flex flex-wrap gap-2">
          {clips.map((c) => {
            const isActive = c.id === currentClipId;
            const dur = getDuration(c);
            const isRejected = c.status === "rejected";
            const isApproved = c.status === "approved" || c.status === "ready";
            const isQueued = c.status === "queued" || c.status === "scheduled";
            const isPosted = c.status === "posted" || c.status === "published";
            // Status-based border glow
            const statusBorder = isActive
              ? "border-primary ring-1 ring-primary/40 bg-primary/5"
              : isRejected
                ? "border-red-500/30 bg-card opacity-45"
                : isPosted
                  ? "border-emerald-400/50 ring-1 ring-emerald-400/20 bg-card hover:bg-secondary/40"
                  : isQueued
                    ? "border-cyan-400/40 ring-1 ring-cyan-400/15 bg-card hover:bg-secondary/40"
                    : isApproved
                      ? "border-emerald-400/40 bg-card hover:bg-secondary/40"
                      : "border-border/60 hover:border-muted-foreground/40 bg-card hover:bg-secondary/40";
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`
                  group flex flex-col rounded-lg overflow-hidden border transition-all cursor-pointer
                  w-[108px] shrink-0
                  ${statusBorder}
                `}
              >
                {/* Thumbnail — portrait 9:16 ratio for vertical gaming clips */}
                <div
                  className="w-full bg-muted/30 flex items-center justify-center overflow-hidden relative"
                  style={{ aspectRatio: "9 / 16" }}
                >
                  {c.thumbnailPath ? (
                    <img
                      src={`file://${c.thumbnailPath.replace(/\\/g, "/")}`}
                      alt=""
                      className="w-full h-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <Play className="h-5 w-5 text-muted-foreground/30" />
                  )}
                  {/* Duration badge */}
                  {dur > 0 && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono bg-black/70 text-white px-1 rounded">
                      {fmtDuration(dur)}
                    </span>
                  )}
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                  {/* Status badge — top right corner */}
                  {isPosted && (
                    <span className="absolute top-1 right-1 text-[8px] font-bold bg-emerald-500/90 text-white px-1 py-0.5 rounded">✓ Posted</span>
                  )}
                  {isQueued && (
                    <span className="absolute top-1 right-1 text-[8px] font-bold bg-cyan-500/90 text-white px-1 py-0.5 rounded">Queued</span>
                  )}
                  {isApproved && !isActive && (
                    <span className="absolute top-1 right-1 text-[8px] font-bold bg-emerald-500/70 text-white px-1 py-0.5 rounded">✓</span>
                  )}
                </div>
                {/* Title */}
                <div className="px-1.5 py-1.5">
                  <span className={`text-[10px] leading-tight line-clamp-2 ${
                    isActive ? "text-primary font-medium"
                    : isRejected ? "text-muted-foreground/60"
                    : "text-foreground"
                  }`}>
                    {c.title || "Untitled"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Topbar ──
function Topbar({ onBack, requireHashtagInTitle = true, onClipRendered }) {
  const clipTitle = useEditorStore((s) => s.clipTitle);
  const editingTitle = useEditorStore((s) => s.editingTitle);
  const dirty = useEditorStore((s) => s.dirty);
  const project = useEditorStore((s) => s.project);
  const clip = useEditorStore((s) => s.clip);
  const setClipTitle = useEditorStore((s) => s.setClipTitle);
  const setEditingTitle = useEditorStore((s) => s.setEditingTitle);
  const handleSave = useEditorStore((s) => s.handleSave);
  const markDirty = useEditorStore((s) => s.markDirty);

  const undo = useSubtitleStore((s) => s.undo);
  const redo = useSubtitleStore((s) => s.redo);
  const undoStack = useSubtitleStore((s) => s._undoStack);
  const redoStack = useSubtitleStore((s) => s._redoStack);

  const [navOpen, setNavOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [hashtagWarning, setHashtagWarning] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [renderDetail, setRenderDetail] = useState("");
  const [lastRender, setLastRender] = useState(null); // { path, addedToQueue } — success notification
  const [retranscribing, setRetranscribing] = useState(false);
  const [retranscribeStage, setRetranscribeStage] = useState("");
  const [, forceUpdate] = useState(0);
  const titleInputRef = useRef(null);
  const navChevronRef = useRef(null);

  // Update "last saved" display periodically
  useEffect(() => {
    if (!lastSaved) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 10000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  // Focus title input when editing starts
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const onSave = useCallback(async () => {
    await handleSave();
    setLastSaved(Date.now());
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1200);
  }, [handleSave]);

  // Core render logic: save → (optionally approve) → render → done.
  // When `addToQueue` is true (Queue button), the clip is marked `status: "approved"`
  // so it surfaces in the Queue tab for scheduling. When false (Render button), the
  // clip's status is left alone — the user just wants an exported MP4 without
  // committing to the publish flow.
  const doRender = useCallback(async (addToQueue) => {
    if (!clip || !project || rendering) return;
    await handleSave();
    setLastSaved(Date.now());

    // Pre-render project update. Only flip status when adding to queue; otherwise
    // just track rendering state so the UI shows the right indicator.
    await window.clipflow?.projectUpdateClip(project.id, clip.id, {
      ...(addToQueue ? { status: "approved" } : {}),
      renderStatus: "rendering",
    });

    // Start render with progress tracking
    setRendering(true);
    setRenderPct(0);
    setRenderDetail("Starting render...");

    const onProgress = (p) => {
      setRenderPct(p.pct || 0);
      setRenderDetail(p.detail || "Rendering...");
    };
    window.clipflow?.onRenderProgress?.(onProgress);

    try {
      // Build render-ready clip with current subtitle/caption data from stores
      // (handleSave persists to disk but doesn't update the clip object in Zustand)
      const subState = useSubtitleStore.getState();
      const capState = useCaptionStore.getState();
      const layState = useLayoutStore.getState();
      const editorState = useEditorStore.getState();

      // Map subtitles from source-absolute to timeline time for the overlay renderer.
      // The renderer operates in timeline time (0-based), so we convert source coords
      // to timeline coords and remap field names for findActiveWord compatibility.
      const nleSegs = editorState.nleSegments || [];
      const rawEditSegments = subState.editSegments || [];
      let timelineSubs;
      if (nleSegs.length > 0) {
        const mapped = visibleSubtitleSegments(rawEditSegments, nleSegs);
        timelineSubs = mapped.map((seg) => ({
          ...seg,
          startSec: seg.timelineStartSec,
          endSec: seg.timelineEndSec,
          words: (seg.words || []).map((w) => ({
            ...w,
            start: w.timelineStart !== undefined ? w.timelineStart : w.start,
            end: w.timelineEnd !== undefined ? w.timelineEnd : w.end,
          })),
        }));
      } else {
        timelineSubs = rawEditSegments;
      }

      const renderClip = {
        ...clip,
        subtitles: timelineSubs,
        nleSegments: nleSegs,
      };
      // Full subtitle style — every property the overlay renderer needs
      // Includes both store names (subFontFamily) and engine names (fontFamily)
      const fullSubtitleStyle = {
        fontSize: subState.fontSize,
        fontFamily: subState.subFontFamily, subFontFamily: subState.subFontFamily,
        fontWeight: subState.subFontWeight, subFontWeight: subState.subFontWeight,
        bold: subState.subBold, subBold: subState.subBold,
        italic: subState.subItalic, subItalic: subState.subItalic,
        underline: subState.subUnderline, subUnderline: subState.subUnderline,
        subColor: subState.subColor, subMode: subState.subMode,
        highlightColor: subState.highlightColor, showSubs: subState.showSubs,
        segmentMode: subState.segmentMode, syncOffset: subState.syncOffset,
        strokeOn: subState.strokeOn, strokeWidth: subState.strokeWidth,
        strokeColor: subState.strokeColor, strokeOpacity: subState.strokeOpacity,
        strokeBlur: subState.strokeBlur, strokeOffsetX: subState.strokeOffsetX, strokeOffsetY: subState.strokeOffsetY,
        shadowOn: subState.shadowOn, shadowColor: subState.shadowColor,
        shadowOpacity: subState.shadowOpacity, shadowBlur: subState.shadowBlur,
        shadowOffsetX: subState.shadowOffsetX, shadowOffsetY: subState.shadowOffsetY,
        glowOn: subState.glowOn, glowColor: subState.glowColor,
        glowOpacity: subState.glowOpacity, glowIntensity: subState.glowIntensity,
        glowBlur: subState.glowBlur, glowBlend: subState.glowBlend,
        glowOffsetX: subState.glowOffsetX, glowOffsetY: subState.glowOffsetY,
        bgOn: subState.bgOn, bgColor: subState.bgColor, bgOpacity: subState.bgOpacity,
        bgPaddingX: subState.bgPaddingX, bgPaddingY: subState.bgPaddingY, bgRadius: subState.bgRadius,
        effectOrder: subState.effectOrder,
        animateOn: subState.animateOn, animateScale: subState.animateScale,
        animateGrowFrom: subState.animateGrowFrom, animateSpeed: subState.animateSpeed,
        punctuationRemove: subState.punctuationRemove,
        yPercent: layState.subYPercent ?? 80,
      };
      // Full caption style
      const fullCaptionStyle = {
        fontFamily: capState.captionFontFamily, fontWeight: capState.captionFontWeight,
        fontSize: capState.captionFontSize, bold: capState.captionBold,
        italic: capState.captionItalic, underline: capState.captionUnderline,
        color: capState.captionColor, lineSpacing: capState.captionLineSpacing,
        strokeOn: capState.captionStrokeOn, strokeColor: capState.captionStrokeColor,
        strokeWidth: capState.captionStrokeWidth, strokeOpacity: capState.captionStrokeOpacity,
        strokeBlur: capState.captionStrokeBlur, strokeOffsetX: capState.captionStrokeOffsetX, strokeOffsetY: capState.captionStrokeOffsetY,
        shadowOn: capState.captionShadowOn, shadowColor: capState.captionShadowColor,
        shadowOpacity: capState.captionShadowOpacity, shadowBlur: capState.captionShadowBlur,
        shadowOffsetX: capState.captionShadowOffsetX, shadowOffsetY: capState.captionShadowOffsetY,
        glowOn: capState.captionGlowOn, glowColor: capState.captionGlowColor,
        glowOpacity: capState.captionGlowOpacity, glowIntensity: capState.captionGlowIntensity,
        glowBlur: capState.captionGlowBlur, glowBlend: capState.captionGlowBlend,
        glowOffsetX: capState.captionGlowOffsetX, glowOffsetY: capState.captionGlowOffsetY,
        bgOn: capState.captionBgOn, bgColor: capState.captionBgColor, bgOpacity: capState.captionBgOpacity,
        bgPaddingX: capState.captionBgPaddingX, bgPaddingY: capState.captionBgPaddingY, bgRadius: capState.captionBgRadius,
        effectOrder: capState.captionEffectOrder,
        yPercent: layState.capYPercent ?? 15,
        widthPercent: layState.capWidthPercent ?? 90,
      };
      // JSON round-trip to strip any non-serializable data (functions, proxies)
      // before sending over IPC — Electron's structured clone rejects them
      const safeClip = JSON.parse(JSON.stringify(renderClip));
      const safeProject = JSON.parse(JSON.stringify(project));
      const safeOptions = JSON.parse(JSON.stringify({
        subtitleStyle: fullSubtitleStyle,
        captionStyle: fullCaptionStyle,
        captionSegments: capState.captionSegments || [],
      }));
      const result = await window.clipflow.renderClip(safeClip, safeProject, null, safeOptions);
      if (result?.error) {
        console.error("[Render] Failed:", result.error);
        await window.clipflow?.projectUpdateClip(project.id, clip.id, { renderStatus: "failed" });
      } else {
        setRenderPct(100);
        setRenderDetail("Done!");
        // Surface success notification with path + open-folder action
        setLastRender({ path: result.path || null, addedToQueue: !!addToQueue });
        // Refresh project in App.js state so Queue tab picks up the rendered clip
        if (onClipRendered) onClipRendered(project.id);
      }
    } catch (err) {
      console.error("[Render] Error:", err);
      await window.clipflow?.projectUpdateClip(project.id, clip.id, { renderStatus: "failed" });
    } finally {
      window.clipflow?.removeRenderProgressListener?.();
      setTimeout(() => {
        setRendering(false);
        setRenderPct(0);
        setRenderDetail("");
      }, 1500);
    }
  }, [handleSave, clip, project, rendering, onClipRendered]);

  // Auto-dismiss the render success notification after 6s
  useEffect(() => {
    if (!lastRender) return;
    const t = setTimeout(() => setLastRender(null), 6000);
    return () => clearTimeout(t);
  }, [lastRender]);

  const onSendToQueue = useCallback(async () => {
    // Hashtag gate is bypassed when the clip already has a first-class gameTag
    // (#71 — default titles are now "Clip N" with no hashtag).
    const hasGameTag = !!(clip?.gameTag || project?.gameTag);
    if (requireHashtagInTitle && !hasGameTag && (!clipTitle || !clipTitle.includes("#"))) {
      setHashtagWarning(true);
      return;
    }
    doRender(true);
  }, [requireHashtagInTitle, clipTitle, doRender, clip, project]);

  const onConfirmQueue = useCallback(async () => {
    setHashtagWarning(false);
    doRender(true);
  }, [doRender]);

  // Render-only — export MP4 without marking the clip approved or adding to queue.
  // No hashtag check: hashtags are only relevant when publishing, not when stashing.
  const onRenderOnly = useCallback(() => {
    doRender(false);
  }, [doRender]);

  // Subtitle debug report — logs clip subtitle data for diagnosis
  // Initialize debugStatus from clip's persisted subtitleRating
  const [debugStatus, setDebugStatus] = useState(() => clip?.subtitleRating || null); // "good" | "bad" | null
  const [debugNoteOpen, setDebugNoteOpen] = useState(false); // false | "good" | "bad"
  const [debugNote, setDebugNote] = useState("");
  const [debugChecks, setDebugChecks] = useState({});
  const debugNoteRef = useRef(null);
  const debugSubmittingRef = useRef(false); // guard against multiple rapid submissions

  // Sync debugStatus when clip changes (e.g., navigating between clips)
  useEffect(() => {
    setDebugStatus(clip?.subtitleRating || null);
  }, [clip?.id, clip?.subtitleRating]);

  const BAD_CHECKS = [
    { id: "too_slow", label: "Subtitles too slow" },
    { id: "too_fast", label: "Subtitles too fast / ahead of speech" },
    { id: "start_before_speech", label: "Subtitles start before speech" },
    { id: "no_pause_respect", label: "Doesn't respect pauses / silence" },
    { id: "bad_grouping", label: "Segments badly grouped" },
    { id: "words_missing", label: "Words missing / cut off" },
    { id: "timing_drift", label: "Timing drifts mid-clip" },
    { id: "shows_future_words", label: "Shows words before I say them" },
    { id: "duplicate_phrases", label: "Duplicate / repeated phrases" },
  ];
  const GOOD_CHECKS = [
    { id: "on_time", label: "On time" },
    { id: "in_sync", label: "In sync" },
    { id: "well_grouped", label: "Segments well grouped" },
    { id: "respects_pauses", label: "Respects pauses / silence" },
    { id: "accurate_words", label: "Words are accurate" },
  ];

  const submitDebugReport = useCallback(async (rating, note, checks) => {
    if (!clip || !project) return;
    // Guard: prevent multiple rapid submissions
    if (debugSubmittingRef.current) return;
    debugSubmittingRef.current = true;

    try {
      const editSegments = useSubtitleStore.getState().editSegments;

      const checkedItems = Object.entries(checks || {}).filter(([, v]) => v).map(([k]) => k);

      const report = {
        rating,
        note: note || "",
        checks: checkedItems,
        clipId: clip?.id,
        clipTitle: clip.title || "Untitled",
        projectId: project.id,
        projectName: project.name || "",
        clipStartTime: clip.startTime,
        clipEndTime: clip.endTime,
        clipDuration: clip.endTime - clip.startTime,
        clipFilePath: clip.filePath,
        hasClipTranscription: !!clip.transcription?.segments?.length,
        hasClipSubtitles: !!(clip.subtitles?.sub1?.length > 0),
        subtitleSource: clip.transcription?.segments?.length ? "clip-transcription"
          : clip.subtitles?.sub1?.length > 0 ? "clip-subtitles" : "project-transcription",
        rawSubtitles: clip.subtitles?.sub1?.slice(0, 5)?.map(s => ({
          start: s.start, end: s.end, text: s.text,
          wordCount: s.words?.length || 0,
          firstWord: s.words?.[0] ? { word: s.words[0].word, start: s.words[0].start, end: s.words[0].end } : null,
          lastWord: s.words?.[s.words.length - 1] ? { word: s.words[s.words.length - 1].word, start: s.words[s.words.length - 1].start, end: s.words[s.words.length - 1].end } : null,
        })) || [],
        editSegments: editSegments.slice(0, 8).map(s => ({
          id: s.id, startSec: s.startSec, endSec: s.endSec, text: s.text,
          wordCount: s.words?.length || 0,
          words: s.words?.slice(0, 10)?.map(w => ({ word: w.word, start: w.start, end: w.end })) || [],
        })),
        totalEditSegments: editSegments.length,
      };

      await window.clipflow?.debugLogSubtitle?.(report);

      // Persist rating on the clip so it survives navigation
      await window.clipflow?.projectUpdateClip?.(project.id, clip.id, { subtitleRating: rating });
      // Update local clip object so the UI stays in sync
      useEditorStore.setState((s) => ({
        clip: s.clip ? { ...s.clip, subtitleRating: rating } : s.clip,
      }));

      setDebugStatus(rating);
    } finally {
      debugSubmittingRef.current = false;
    }
  }, [clip, project]);

  const onDebugReport = useCallback((rating) => {
    setDebugNote("");
    setDebugChecks({});
    setDebugNoteOpen(rating); // "good" or "bad"
    setTimeout(() => debugNoteRef.current?.focus(), 50);
  }, []);

  const onDebugNoteSubmit = useCallback(() => {
    const rating = debugNoteOpen;
    setDebugNoteOpen(false);
    submitDebugReport(rating, debugNote, debugChecks);
  }, [debugNote, debugChecks, debugNoteOpen, submitDebugReport]);

  const onRetranscribe = useCallback(async () => {
    if (!clip || !project || retranscribing) return;
    setRetranscribing(true);
    setRetranscribeStage("Starting...");

    // Listen for progress
    const progressHandler = (data) => {
      const labels = { extracting: "Extracting audio...", transcribing: "Transcribing...", saving: "Saving...", done: "Done!" };
      setRetranscribeStage(labels[data.stage] || data.stage);
    };
    window.clipflow?.onRetranscribeProgress?.(progressHandler);

    try {
      const result = await window.clipflow.retranscribeClip(project.id, clip.id);
      if (result?.error) {
        console.error("Re-transcribe failed:", result.error);
        setRetranscribeStage("Failed");
        setTimeout(() => { setRetranscribing(false); setRetranscribeStage(""); }, 2000);
      } else {
        // Update clip data in editor store WITHOUT full reinit
        // (initFromContext is too heavy — it resets waveform, playback, templates, undo stack)
        const updatedClip = { ...clip, transcription: result.transcription };
        const updatedProject = { ...project, clips: project.clips.map(c => c.id === clip.id ? updatedClip : c) };
        useEditorStore.setState({ project: updatedProject, clip: updatedClip });
        // Reload subtitle segments from the new transcription. initSegments only
        // sets originalSegments — we explicitly rebuild editSegments here to
        // preserve the user's current mode rather than reset to default.
        const currentMode = useSubtitleStore.getState().segmentMode || "3word";
        useSubtitleStore.getState().initSegments(updatedProject, updatedClip);
        useSubtitleStore.getState().setSegmentMode(currentMode);
        setRetranscribeStage("Done!");
        setTimeout(() => { setRetranscribing(false); setRetranscribeStage(""); }, 1500);
      }
    } catch (err) {
      console.error("Re-transcribe error:", err);
      setRetranscribeStage("Failed");
      setTimeout(() => { setRetranscribing(false); setRetranscribeStage(""); }, 2000);
    } finally {
      window.clipflow?.removeRetranscribeProgressListener?.();
    }
  }, [clip, project, retranscribing]);

  const onTitleKeyDown = (e) => {
    if (e.key === "Enter") {
      setEditingTitle(false);
      markDirty();
    }
    if (e.key === "Escape") {
      setEditingTitle(false);
    }
  };

  const onBackClick = () => {
    if (dirty) {
      handleSave().then(() => onBack?.());
    } else {
      onBack?.();
    }
  };

  const clips = project?.clips || [];

  const handleClipSelect = (clipId) => {
    setNavOpen(false);
    // Save current clip first, then switch
    if (dirty) handleSave();
    // Trigger navigation to new clip — dispatch through editorContext change
    // For now, we can use the IPC to load the new clip inline
    const newClip = clips.find((c) => c.id === clipId);
    if (newClip && newClip.id !== clip?.id) {
      useEditorStore.getState().initFromContext(
        { projectId: project.id, clipId: newClip.id },
        [project]
      );
    }
  };

  return (
    <div className="h-12 min-h-[48px] flex items-center px-3 border-b bg-card select-none relative">
      {/* Left: ClipFlow logo/back + Undo/Redo + Last saved */}
      <div className="flex items-center gap-1 z-10">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={onBackClick}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Back to Projects</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className={`h-8 w-8 ${undoStack.length > 0 ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed"}`}
                onClick={() => { undo(); markDirty(); }}
                disabled={undoStack.length === 0}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className={`h-8 w-8 ${redoStack.length > 0 ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed"}`}
                onClick={() => { redo(); markDirty(); }}
                disabled={redoStack.length === 0}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Last saved indicator */}
        {lastSaved && (
          <>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="text-[10px]">{formatLastSaved(lastSaved)}</span>
            </div>
          </>
        )}
      </div>

      {/* Center: Editable clip title — flex-1 fills remaining space, text centered */}
      <div className="flex-1 flex items-center justify-center min-w-0 mx-3 relative" style={{ zIndex: navOpen ? 60 : 5 }}>
        <div className="relative max-w-full min-w-0">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={clipTitle}
            onChange={(e) => setClipTitle(e.target.value)}
            onKeyDown={onTitleKeyDown}
            onBlur={() => {
              setEditingTitle(false);
              markDirty();
            }}
            className="bg-secondary/60 border border-border rounded-md px-3 py-1.5 text-sm font-medium text-foreground text-center outline-none focus:ring-1 focus:ring-primary/50 max-w-full"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              width: `${Math.max(200, Math.min(600, clipTitle.length * 8.5 + 40))}px`,
            }}
          />
        ) : (
          <div className="flex items-center gap-0 rounded-md hover:bg-secondary/40 transition-colors max-w-full min-w-0">
            {/* Title text — click to edit, truncated with ellipsis */}
            <span
              className="text-sm font-medium text-foreground cursor-text px-3 py-1.5 truncate min-w-0"
              onClick={(e) => {
                e.stopPropagation();
                setEditingTitle(true);
              }}
              title={clipTitle || "Untitled Clip"}
            >
              {clipTitle || "Untitled Clip"}
            </span>
            {/* Chevron — click to open clip navigator */}
            <button
              ref={navChevronRef}
              className="flex-shrink-0 flex items-center px-1.5 py-1.5 rounded-r-md hover:bg-secondary/80 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setNavOpen(!navOpen);
              }}
            >
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${navOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        )}

        {/* Dirty indicator dot — positioned above the title center */}
        {dirty && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-yellow-400" />
        )}

        {/* Clip navigator dropdown */}
        {navOpen && !editingTitle && (
          <ClipNavigator
            clips={clips}
            currentClipId={clip?.id}
            onSelect={handleClipSelect}
            onClose={() => setNavOpen(false)}
            chevronRef={navChevronRef}
          />
        )}
        </div>
      </div>

      {/* Right: Debug + Re-transcribe + Save + Queue buttons */}
      <div className="relative flex items-center gap-2 z-10">
        {/* Subtitle debug report buttons */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-2 text-xs ${debugStatus === "good" ? "text-green-400 bg-green-400/10 border border-green-400/30" : "text-muted-foreground/50 hover:text-green-400"}`}
                onClick={() => onDebugReport("good")}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Subs look good — log for reference</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-2 text-xs ${debugStatus === "bad" ? "text-red-400 bg-red-400/10 border border-red-400/30" : "text-muted-foreground/50 hover:text-red-400"}`}
                onClick={() => onDebugReport("bad")}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Subs are bugged — log with note</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Debug note input popover */}
        {debugNoteOpen && (
          <div className="absolute top-full right-0 mt-1 bg-[#1a1b26] border border-[#2a2b3a] rounded-lg shadow-xl p-3 z-50" style={{ width: 340 }}>
            <p className="text-xs text-muted-foreground mb-2">
              {debugNoteOpen === "good" ? "What's good about the subtitles?" : "What's wrong with the subtitles?"}
            </p>

            {/* Checkbox options */}
            <div className="flex flex-col gap-1.5 mb-2.5">
              {(debugNoteOpen === "bad" ? BAD_CHECKS : GOOD_CHECKS).map((check) => (
                <label
                  key={check.id}
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => setDebugChecks((prev) => ({ ...prev, [check.id]: !prev[check.id] }))}
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    debugChecks[check.id]
                      ? debugNoteOpen === "bad" ? "bg-red-500/30 border-red-500/60" : "bg-green-500/30 border-green-500/60"
                      : "border-[#2a2b3a] group-hover:border-[#3a3b4a]"
                  }`}>
                    {debugChecks[check.id] && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="text-[11px] text-muted-foreground group-hover:text-foreground select-none">{check.label}</span>
                </label>
              ))}
            </div>

            {/* Auto-expanding textarea for notes */}
            <textarea
              ref={debugNoteRef}
              value={debugNote}
              onChange={(e) => {
                setDebugNote(e.target.value);
                // Auto-expand: reset height then set to scrollHeight
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onDebugNoteSubmit(); } if (e.key === "Escape") setDebugNoteOpen(false); }}
              placeholder={debugNoteOpen === "bad" ? "Additional notes (optional)..." : "Any extra comments (optional)..."}
              rows={1}
              className="w-full min-h-[32px] px-3 py-2 text-xs bg-[#0a0b10] border border-[#2a2b3a] rounded-md text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500 resize-none overflow-hidden"
            />
            <div className="flex gap-2 mt-2 justify-end">
              <Button variant="ghost" size="sm" className="h-7 px-3 text-xs text-muted-foreground" onClick={() => setDebugNoteOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                className={`h-7 px-3 text-xs border-0 ${
                  debugNoteOpen === "bad"
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                }`}
                onClick={onDebugNoteSubmit}
              >
                {debugNoteOpen === "bad" ? "Log Bug" : "Log Good"}
              </Button>
            </div>
          </div>
        )}

        <Separator orientation="vertical" className="h-5" />

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-3 text-xs font-medium ${retranscribing ? "text-yellow-400" : "text-muted-foreground hover:text-foreground"}`}
                onClick={onRetranscribe}
                disabled={retranscribing}
              >
                {retranscribing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Mic className="h-3.5 w-3.5 mr-1.5" />
                )}
                {retranscribing ? retranscribeStage : "Re-transcribe"}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Re-run transcription on this clip</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-5" />

        <Button
          size="sm"
          className={`h-8 px-4 text-white hover:opacity-90 text-xs font-semibold shadow-md border-0 transition-all duration-300 ${saveFlash ? "ring-2 ring-green-400/60 scale-105" : ""}`}
          style={{ background: saveFlash ? "linear-gradient(135deg, #15803d, #22c55e)" : "linear-gradient(135deg, #7c3aed, #a855f7, #c084fc)" }}
          onClick={onSave}
        >
          <Check className="h-3.5 w-3.5 mr-1.5" />
          {saveFlash ? "Saved!" : "Save"}
        </Button>
        {rendering ? (
          <div className="h-8 px-4 flex items-center gap-2 rounded-md text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #854d0e, #ca8a04, #eab308)", minWidth: 120 }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <div className="flex flex-col leading-none">
              <span>{renderPct}%</span>
            </div>
            <div className="w-16 h-1.5 bg-black/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${renderPct}%` }} />
            </div>
          </div>
        ) : (
          <>
            {/* Render — export MP4 without adding to upload queue */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs font-semibold border-border/60 hover:bg-secondary/60"
              onClick={onRenderOnly}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Render
            </Button>

            {/* Queue — render AND mark the clip approved so it surfaces in the Queue tab */}
            <Button
              size="sm"
              className="h-8 px-4 text-white hover:opacity-90 text-xs font-semibold shadow-md border-0"
              style={{ background: "linear-gradient(135deg, #15803d, #22c55e, #4ade80)" }}
              onClick={onSendToQueue}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Queue
            </Button>
          </>
        )}

        {/* Render-success notification — auto-dismisses after 6s */}
        {lastRender && (
          <div className="absolute top-full right-0 mt-2 w-[340px] rounded-lg border border-emerald-500/40 bg-popover shadow-xl z-50 p-3">
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="h-2.5 w-2.5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {lastRender.addedToQueue ? "Rendered & queued" : "Rendered"}
                </p>
                {lastRender.path && (
                  <p
                    className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate"
                    title={lastRender.path}
                  >
                    {lastRender.path}
                  </p>
                )}
              </div>
              <button
                className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
                onClick={() => setLastRender(null)}
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {lastRender.path && (
              <div className="flex items-center justify-end mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => window.clipflow?.revealInFolder?.(lastRender.path)}
                >
                  <FolderOpen className="h-3 w-3 mr-1.5" />
                  Show in folder
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Hashtag warning popup */}
        {hashtagWarning && (
          <div className="absolute top-full right-0 mt-2 w-[280px] rounded-lg border border-yellow-500/40 bg-popover shadow-xl z-50 p-3">
            <div className="flex items-start gap-2 mb-2.5">
              <span className="text-yellow-400 text-base leading-none mt-0.5">⚠</span>
              <div>
                <p className="text-xs font-medium text-foreground">No hashtag in title</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  This clip's title doesn't contain a hashtag. Queue anyway?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setHashtagWarning(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 bg-yellow-500 text-black hover:bg-yellow-400 text-xs font-medium"
                onClick={onConfirmQueue}
              >
                Queue anyway
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mini Player Bar (shown when timeline is collapsed) ──
function MiniPlayerBar({ onShowTimeline }) {
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration = usePlaybackStore((s) => s.duration);
  const playing = usePlaybackStore((s) => s.playing);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const seekTo = usePlaybackStore((s) => s.seekTo);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="shrink-0 flex items-center h-9 px-3 gap-2 select-none"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#131419" }}
    >
      {/* Play/Pause */}
      <Button variant="ghost" size="icon" className="h-6 w-6 text-foreground shrink-0" onClick={togglePlay}>
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>

      {/* Current time */}
      <span className="text-[11px] font-mono text-foreground tabular-nums shrink-0 w-[52px] text-right">
        {fmtDuration(currentTime)}
      </span>

      {/* Scrub bar */}
      <div className="flex-1 mx-1">
        <Slider
          value={[progressPct]}
          min={0} max={100} step={0.1}
          onValueChange={([v]) => {
            const t = (v / 100) * duration;
            seekTo(Math.max(0, Math.min(duration, t)));
          }}
          className="flex-1"
        />
      </div>

      {/* Duration */}
      <span className="text-[11px] font-mono text-muted-foreground tabular-nums shrink-0 w-[52px]">
        {fmtDuration(duration)}
      </span>

      {/* Show Timeline button */}
      <button
        className="flex items-center gap-1 ml-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors shrink-0"
        onClick={onShowTimeline}
      >
        <PanelBottomOpen className="h-3 w-3" />
        <span>Timeline</span>
        <span className="text-muted-foreground/50 text-[9px] ml-0.5">Ctrl+.</span>
      </button>
    </div>
  );
}

// ── Main Layout Shell ──
export default function EditorLayout({ onBack, gamesDb, anthropicApiKey, requireHashtagInTitle = true, onClipRendered }) {
  const tlCollapsed = useLayoutStore((s) => s.tlCollapsed);

  // Global undo/redo keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Skip if user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        const store = useSubtitleStore.getState();
        if (store._undoStack.length > 0) {
          store.undo();
          useEditorStore.getState().markDirty();
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "Z") || (e.shiftKey && e.key === "z"))) {
        e.preventDefault();
        const store = useSubtitleStore.getState();
        if (store._redoStack.length > 0) {
          store.redo();
          useEditorStore.getState().markDirty();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Autosave: subscribe to all persistable editor stores, debounced save on changes. ──
  // Goal: renderer crashes (see #35) no longer wipe unsaved edits. Every store mutation
  // schedules a save 800ms out; rapid edits coalesce into one IPC. Window blur flushes
  // immediately. Cleanup on unmount also flushes.
  //
  // Subscriptions fire on EVERY state change — including transient UI state like
  // activeSegId, _undoStack, etc. That's wasteful but harmless: scheduleAutosave
  // only schedules (cheap), and _doSilentSave reads the same data regardless of trigger.
  // Filtering would require per-key selectors which add complexity for marginal gain.
  useEffect(() => {
    const schedule = () => useEditorStore.getState().scheduleAutosave();
    const unsubSub = useSubtitleStore.subscribe(schedule);
    const unsubCap = useCaptionStore.subscribe(schedule);
    const unsubLayout = useLayoutStore.subscribe(schedule);
    // Editor store: skip if the only change was autosave internals (no internals in state
    // anymore — timer lives in module closure — but keep for belt-and-braces future-proofing).
    const unsubEditor = useEditorStore.subscribe(schedule);

    // Window blur: user alt-tabbed away or clicked another app. Flush any pending save.
    const onBlur = () => useEditorStore.getState().flushAutosave();
    window.addEventListener("blur", onBlur);

    return () => {
      unsubSub();
      unsubCap();
      unsubLayout();
      unsubEditor();
      window.removeEventListener("blur", onBlur);
      // Final flush on editor unmount (e.g., navigating away from editor view).
      useEditorStore.getState().flushAutosave();
    };
  }, []);

  return (
    <div className="dark flex flex-col h-full w-full overflow-hidden bg-background text-foreground"
      style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      {/* Top toolbar */}
      <Topbar onBack={onBack} requireHashtagInTitle={requireHashtagInTitle} onClipRendered={onClipRendered} />

      {/* Body + Timeline — timeline fully collapses/expands */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Upper body — takes all space when timeline collapsed */}
        <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
          {/* Left panel + Center preview: horizontal resizable split */}
          <ResizablePanelGroup direction="horizontal">
            {/* Left panel */}
            <ResizablePanel defaultSize={50} minSize={28} maxSize={70}>
              <LeftPanelNew />
            </ResizablePanel>

            <ResizableHandle />

            {/* Center preview */}
            <ResizablePanel defaultSize={50}>
              <PreviewPanelNew />
            </ResizablePanel>
          </ResizablePanelGroup>

          {/* Right icon rail + drawer (not in resizable — fixed width) */}
          <RightPanelNew gamesDb={gamesDb} anthropicApiKey={anthropicApiKey} />
        </div>

        {/* Mini player bar — visible when timeline collapsed */}
        {tlCollapsed && <MiniPlayerBar onShowTimeline={() => useLayoutStore.getState().toggleTlCollapse()} />}

        {/* Timeline — fully collapses to 0 when hidden */}
        {!tlCollapsed && (
          <div
            className="shrink-0"
            style={{
              height: 234,
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <TimelinePanelNew />
          </div>
        )}
      </div>
    </div>
  );
}
