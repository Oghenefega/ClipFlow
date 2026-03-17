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
import useEditorStore from "../stores/useEditorStore";
import {
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronDown,
  Play,
  ZoomIn,
  ZoomOut,
  PanelBottomClose,
  Scissors,
  Search,
  SlidersHorizontal,
  Music,
  Type,
  Clock,
  Settings,
  Check,
  Send,
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
function ClipNavigator({ clips, currentClipId, onSelect, onClose }) {
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

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

  const [navOpen, setNavOpen] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [, forceUpdate] = useState(0);
  const titleInputRef = useRef(null);
  const saveMenuRef = useRef(null);

  // Update "last saved" display periodically
  useEffect(() => {
    if (!lastSaved) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 10000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  // Close save menu on outside click
  useEffect(() => {
    if (!saveMenuOpen) return;
    const handler = (e) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target)) {
        setSaveMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [saveMenuOpen]);

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
    setSaveMenuOpen(false);
  }, [handleSave]);

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
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Undo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Redo</TooltipContent>
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
            className="bg-secondary/60 border border-border rounded-md px-3 py-1.5 text-sm font-medium text-foreground text-center max-w-[400px] w-auto min-w-[200px] outline-none focus:ring-1 focus:ring-primary/50"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          />
        ) : (
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-secondary transition-colors"
            onClick={() => setNavOpen(!navOpen)}
          >
            <span
              className="text-sm font-medium text-foreground truncate max-w-[300px] cursor-text"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTitle(true);
              }}
            >
              {clipTitle || "Untitled Clip"}
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${navOpen ? "rotate-180" : ""}`} />
          </button>
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
          />
        )}
      </div>

      {/* Right: Settings + Save with dropdown */}
      <div className="flex items-center gap-1.5">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Settings</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Save button group */}
        <div className="relative flex items-center" ref={saveMenuRef}>
          <Button
            size="sm"
            className="h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium rounded-r-none"
            onClick={onSave}
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Save
          </Button>
          <Button
            size="sm"
            className="h-8 w-6 px-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-l-none border-l border-primary-foreground/20"
            onClick={() => setSaveMenuOpen(!saveMenuOpen)}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${saveMenuOpen ? "rotate-180" : ""}`} />
          </Button>

          {/* Save dropdown menu */}
          {saveMenuOpen && (
            <div className="absolute top-full right-0 mt-1 w-[180px] rounded-lg border bg-popover shadow-xl z-50 overflow-hidden">
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
                onClick={onSave}
              >
                <Check className="h-3.5 w-3.5 text-primary" />
                Save changes
              </button>
              <Separator />
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
                onClick={() => {
                  setSaveMenuOpen(false);
                  // Save then mark as ready for publish queue
                  handleSave().then(() => {
                    if (clip && project) {
                      window.clipflow?.projectUpdateClip(project.id, clip.id, {
                        status: "approved",
                        renderStatus: "pending",
                      });
                    }
                  });
                }}
              >
                <Send className="h-3.5 w-3.5 text-green-400" />
                Send to publish queue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Left Panel (imported from LeftPanelNew) ──
// ── Center Preview (imported from PreviewPanelNew) ──

// ── Timeline ──
function TimelinePanel() {
  return (
    <div className="flex flex-col h-full bg-card select-none">
      {/* Controls bar */}
      <div className="h-10 min-h-[40px] flex items-center px-3 border-b gap-2">
        {/* Left: filter/text/search icons + zoom */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <Type className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <div className="flex items-center gap-1.5 w-[120px]">
            <ZoomOut className="h-3 w-3 text-muted-foreground shrink-0" />
            <Slider defaultValue={[50]} max={100} step={1} className="flex-1" />
            <ZoomIn className="h-3 w-3 text-muted-foreground shrink-0" />
          </div>
        </div>

        {/* Center: play + timecodes */}
        <div className="flex-1 flex items-center justify-center gap-3">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-foreground">
            <Play className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-foreground">00:05.0</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">00:16.7</span>
          </div>
        </div>

        {/* Right: hide/speed/split */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                  <PanelBottomClose className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Hide timeline</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground font-mono">
                  1x
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Speed</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                  <Scissors className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Split (S)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Time ruler */}
      <div className="h-6 min-h-[24px] border-b flex items-end px-2 relative overflow-hidden">
        {/* Ruler tick marks */}
        <div className="flex items-end gap-0 w-full h-full relative">
          {[...Array(22)].map((_, i) => (
            <div key={i} className="flex flex-col items-start" style={{ position: "absolute", left: `${(i / 21) * 100}%` }}>
              <span className="text-[9px] font-mono text-muted-foreground/60 leading-none mb-0.5">
                {i % 2 === 0 ? `${Math.floor(i * 0.8)}s` : ""}
              </span>
              <div
                className="bg-border"
                style={{ width: 1, height: i % 2 === 0 ? 8 : 4 }}
              />
            </div>
          ))}
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
            style={{ left: "30%" }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-primary rounded-sm rotate-45" />
          </div>
        </div>
      </div>

      {/* Tracks area */}
      <div className="flex-1 overflow-hidden">
        {TRACKS.map((track) => (
          <div key={track.id} className="h-10 flex items-center border-b border-border/50 px-2 gap-2">
            {/* Track label */}
            <div className="w-16 shrink-0 flex items-center gap-1.5">
              {track.icon && (
                <span className="text-[10px] font-bold w-4 h-4 rounded flex items-center justify-center"
                  style={{ background: track.color, color: "white" }}>
                  {track.icon}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground font-medium truncate">{track.label}</span>
            </div>

            {/* Track content placeholder */}
            <div className="flex-1 h-6 relative rounded overflow-hidden">
              {track.id === "cap" && (
                <div className="absolute inset-y-0 left-[5%] right-[40%] rounded"
                  style={{ background: `${track.color}22`, border: `1px solid ${track.color}44` }}>
                  <span className="text-[9px] px-1.5 leading-[24px] text-muted-foreground truncate">
                    Caption text here...
                  </span>
                </div>
              )}
              {track.id === "sub" && (
                <div className="absolute inset-y-0 left-[2%] right-[5%] rounded"
                  style={{ background: `${track.color}22`, border: `1px solid ${track.color}44` }}>
                  <span className="text-[9px] px-1.5 leading-[24px] text-muted-foreground truncate">
                    Subtitle segments
                  </span>
                </div>
              )}
              {track.id === "audio" && (
                /* Waveform placeholder */
                <div className="flex items-center h-full gap-px px-1">
                  {[...Array(80)].map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-full"
                      style={{
                        background: `${track.color}66`,
                        height: `${20 + Math.abs(Math.sin(i * 0.4)) * 70}%`,
                        minWidth: 1,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Add audio row */}
        <div className="h-8 flex items-center px-2">
          <button className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 transition-colors">
            <Music className="h-3 w-3" />
            Add audio
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Layout Shell ──
export default function EditorLayout({ onBack, gamesDb, anthropicApiKey }) {
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
              <ResizablePanel defaultSize={22} minSize={14} maxSize={35}>
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
          <TimelinePanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
