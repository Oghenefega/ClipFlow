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
} from "lucide-react";
import { Slider } from "../../../components/ui/slider";
import { Button } from "../../../components/ui/button";
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
function Topbar({ onBack }) {
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
  const [hashtagWarning, setHashtagWarning] = useState(false);
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
  }, [handleSave]);

  const onSendToQueue = useCallback(async () => {
    // Warn if title has no hashtag
    if (!clipTitle || !clipTitle.includes("#")) {
      setHashtagWarning(true);
      return;
    }
    await handleSave();
    setLastSaved(Date.now());
    if (clip && project) {
      window.clipflow?.projectUpdateClip(project.id, clip.id, {
        status: "approved",
        renderStatus: "pending",
      });
    }
  }, [handleSave, clipTitle, clip, project]);

  const onConfirmQueue = useCallback(async () => {
    setHashtagWarning(false);
    await handleSave();
    setLastSaved(Date.now());
    if (clip && project) {
      window.clipflow?.projectUpdateClip(project.id, clip.id, {
        status: "approved",
        renderStatus: "pending",
      });
    }
  }, [handleSave, clip, project]);

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
        // Reload subtitle segments from the new transcription
        useSubtitleStore.getState().initSegments(updatedProject, updatedClip);
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

      {/* Center: Editable clip title — absolutely centered on the full topbar */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: navOpen ? 60 : 5 }}>
        <div className="pointer-events-auto relative">
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
            className="bg-secondary/60 border border-border rounded-md px-3 py-1.5 text-sm font-medium text-foreground text-center outline-none focus:ring-1 focus:ring-primary/50"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              width: `${Math.max(200, Math.min(600, clipTitle.length * 8.5 + 40))}px`,
            }}
          />
        ) : (
          <div className="flex items-center gap-0 rounded-md hover:bg-secondary/40 transition-colors">
            {/* Title text — click to edit */}
            <span
              className="text-sm font-medium text-foreground cursor-text px-3 py-1.5"
              onClick={(e) => {
                e.stopPropagation();
                setEditingTitle(true);
              }}
            >
              {clipTitle || "Untitled Clip"}
            </span>
            {/* Chevron — click to open clip navigator */}
            <button
              ref={navChevronRef}
              className="flex items-center px-1.5 py-1.5 rounded-r-md hover:bg-secondary/80 transition-colors"
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

      {/* Spacer to push right buttons to edge */}
      <div className="flex-1" />

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
          className="h-8 px-4 text-white hover:opacity-90 text-xs font-semibold shadow-md border-0"
          style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7, #c084fc)" }}
          onClick={onSave}
        >
          <Check className="h-3.5 w-3.5 mr-1.5" />
          Save
        </Button>
        <Button
          size="sm"
          className="h-8 px-4 text-white hover:opacity-90 text-xs font-semibold shadow-md border-0"
          style={{ background: "linear-gradient(135deg, #15803d, #22c55e, #4ade80)" }}
          onClick={onSendToQueue}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Queue
        </Button>

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
export default function EditorLayout({ onBack, gamesDb, anthropicApiKey }) {
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

  return (
    <div className="dark flex flex-col h-full w-full overflow-hidden bg-background text-foreground"
      style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      {/* Top toolbar */}
      <Topbar onBack={onBack} />

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
