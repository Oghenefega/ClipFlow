import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "../../../components/ui/resizable";
import { Separator } from "../../../components/ui/separator";
import { ScrollArea } from "../../../components/ui/scroll-area";
import LeftPanelNew from "./LeftPanelNew";
import RightPanelNew from "./RightPanelNew";
import PreviewPanelNew from "./PreviewPanelNew";
import TimelinePanelNew from "./TimelinePanelNew";
import useEditorStore from "../stores/useEditorStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import {
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronDown,
  Play,
  Clock,
  Check,
  Send,
} from "lucide-react";
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

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 rounded-lg border bg-popover shadow-xl z-50 overflow-hidden"
      style={{ width: Math.min(clips.length * 152 + 24, 640) }}
    >
      <div className="px-3 py-2 border-b">
        <span className="text-[11px] font-medium text-muted-foreground">
          Project Clips ({clips.length})
        </span>
      </div>
      <ScrollArea className="max-h-[280px]">
        <div className="p-3 flex flex-wrap gap-2">
          {clips.map((c) => {
            const isActive = c.id === currentClipId;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`
                  group flex flex-col rounded-lg overflow-hidden border transition-all cursor-pointer
                  w-[140px] shrink-0
                  ${isActive
                    ? "border-primary ring-1 ring-primary/40 bg-primary/5"
                    : "border-border/60 hover:border-muted-foreground/40 bg-card hover:bg-secondary/40"
                  }
                `}
              >
                {/* Thumbnail */}
                <div
                  className="w-full aspect-video bg-muted/30 flex items-center justify-center overflow-hidden relative"
                >
                  {c.thumbnailPath ? (
                    <img
                      src={`file://${c.thumbnailPath.replace(/\\/g, "/")}`}
                      alt=""
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <Play className="h-5 w-5 text-muted-foreground/30" />
                  )}
                  {/* Duration badge */}
                  {c.duration && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono bg-black/70 text-white px-1 rounded">
                      {fmtDuration(c.duration)}
                    </span>
                  )}
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </div>
                {/* Title */}
                <div className="px-2 py-1.5">
                  <span className={`text-[11px] leading-tight line-clamp-2 ${isActive ? "text-primary font-medium" : "text-foreground"}`}>
                    {c.title || "Untitled"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
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
    <div className="h-12 min-h-[48px] flex items-center px-3 border-b bg-card select-none">
      {/* Left: ClipFlow logo/back + Undo/Redo + Last saved */}
      <div className="flex items-center gap-1">
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

      {/* Center: Editable clip title + clip navigator dropdown */}
      <div className="flex-1 flex items-center justify-center relative">
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

        {/* Dirty indicator dot */}
        {dirty && (
          <div className="absolute -top-0 right-[calc(50%-180px)] w-1.5 h-1.5 rounded-full bg-yellow-400" />
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

      {/* Right: Save + Queue buttons */}
      <div className="relative flex items-center gap-2">
        <Button
          size="sm"
          className="h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
          onClick={onSave}
        >
          <Check className="h-3.5 w-3.5 mr-1.5" />
          Save
        </Button>
        <Button
          size="sm"
          className="h-8 px-4 bg-green-600 text-white hover:bg-green-500 text-xs font-medium"
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

// ── Main Layout Shell ──
export default function EditorLayout({ onBack, gamesDb, anthropicApiKey }) {
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

      {/* Body + Timeline: vertical resizable split */}
      <ResizablePanelGroup direction="vertical" className="flex-1">
        {/* Upper body */}
        <ResizablePanel defaultSize={72} minSize={40}>
          <div className="flex h-full">
            {/* Left panel + Center preview: horizontal resizable split */}
            <ResizablePanelGroup direction="horizontal">
              {/* Left panel */}
              <ResizablePanel defaultSize={25} minSize={14} maxSize={60}>
                <LeftPanelNew />
              </ResizablePanel>

              <ResizableHandle />

              {/* Center preview */}
              <ResizablePanel defaultSize={78}>
                <PreviewPanelNew />
              </ResizablePanel>
            </ResizablePanelGroup>

            {/* Right icon rail + drawer (not in resizable — fixed width) */}
            <RightPanelNew gamesDb={gamesDb} anthropicApiKey={anthropicApiKey} />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Timeline */}
        <ResizablePanel defaultSize={28} minSize={8} maxSize={50}>
          <TimelinePanelNew />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
