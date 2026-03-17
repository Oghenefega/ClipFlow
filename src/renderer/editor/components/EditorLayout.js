import React from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "../../../components/ui/resizable";
import { Separator } from "../../../components/ui/separator";
import LeftPanelNew from "./LeftPanelNew";
import {
  Sparkles,
  Palette,
  Captions,
  Type,
  Music,
  Upload,
  ImagePlus,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronDown,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  PanelBottomClose,
  Scissors,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Slider } from "../../../components/ui/slider";
import { Button } from "../../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import { ScrollArea } from "../../../components/ui/scroll-area";

// ── Right rail icon definitions (matches Vizard sidebar order) ──
const RAIL_ICONS = [
  { id: "ai", icon: Sparkles, label: "AI Tools", group: 1 },
  { id: "brand", icon: Palette, label: "Brand Kit", group: 1 },
  { id: "subs", icon: Captions, label: "Subtitles", group: 2 },
  { id: "head", icon: Type, label: "Caption", group: 2 },
  { id: "audio", icon: Music, label: "Audio", group: 3 },
  { id: "media", icon: ImagePlus, label: "Media", group: 3 },
  { id: "upload", icon: Upload, label: "Upload", group: 3 },
];

// ── Timeline track definitions ──
const TRACKS = [
  { id: "cap", label: "Caption", icon: "T", color: "hsl(263 70% 58%)" },
  { id: "sub", label: "Subtitle", icon: null, color: "hsl(220 50% 72%)" },
  { id: "audio", label: "Audio", icon: null, color: "hsl(200 40% 50%)" },
];

// ── Topbar ──
function Topbar() {
  return (
    <div className="h-12 min-h-[48px] flex items-center px-3 border-b bg-card select-none">
      {/* Left: Back + Undo/Redo */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Center: Clip title */}
      <div className="flex-1 flex items-center justify-center">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-secondary transition-colors">
          <span className="text-sm font-medium text-foreground truncate max-w-[300px]">
            Untitled Clip
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Right: Save */}
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium">
          Save
        </Button>
      </div>
    </div>
  );
}

// ── Left Panel (imported from LeftPanelNew) ──

// ── Center Preview ──
function PreviewPanel() {
  return (
    <div className="flex flex-col h-full items-center justify-center" style={{ background: "hsl(240 8% 3%)" }}>
      {/* 9:16 video canvas */}
      <div className="relative flex items-center justify-center flex-1 w-full">
        <div
          className="rounded-lg border border-border/40 flex items-center justify-center overflow-hidden"
          style={{
            aspectRatio: "9 / 16",
            maxHeight: "calc(100% - 48px)",
            width: "auto",
            height: "100%",
            maxWidth: "100%",
            background: "hsl(240 6% 6%)",
          }}
        >
          {/* Placeholder video area */}
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Play className="h-10 w-10 opacity-30" />
            <span className="text-xs opacity-50">Video Preview</span>
          </div>

          {/* Subtitle overlay placeholder */}
          <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 px-3 py-1.5 rounded" style={{ background: "rgba(0,0,0,0.6)" }}>
            <span className="text-sm font-semibold text-white whitespace-nowrap">
              subtitle preview area
            </span>
          </div>
        </div>
      </div>

      {/* Bottom controls bar (Ratio, Background, Layouts) */}
      <div className="h-10 w-full flex items-center justify-center gap-4 border-t border-border/30 bg-card/30">
        <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          <span className="opacity-60">◻</span> Ratio (9:16)
        </button>
        <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          <span className="opacity-60">◻</span> Background
        </button>
        <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          <span className="opacity-60">◻</span> Layouts
        </button>
      </div>
    </div>
  );
}

// ── Right Icon Rail ──
function RightRail() {
  const [activeId, setActiveId] = React.useState(null);

  return (
    <div className="flex h-full">
      {/* Drawer placeholder — shown when an icon is active */}
      {activeId && (
        <div className="w-[300px] border-l bg-card flex flex-col">
          {/* Drawer header */}
          <div className="h-11 flex items-center justify-between px-3 border-b">
            <span className="text-xs font-semibold text-foreground">
              {RAIL_ICONS.find((r) => r.id === activeId)?.label}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setActiveId(null)}
            >
              <span className="text-xs">✕</span>
            </Button>
          </div>
          {/* Drawer body placeholder */}
          <ScrollArea className="flex-1">
            <div className="p-4 flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <span className="text-xs opacity-60">
                {RAIL_ICONS.find((r) => r.id === activeId)?.label} panel
              </span>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Icon rail — always visible */}
      <div className="w-12 min-w-[48px] border-l bg-card flex flex-col items-center py-2 gap-0.5">
        <TooltipProvider delayDuration={300}>
          {RAIL_ICONS.map((item, i) => {
            const Icon = item.icon;
            const prevGroup = i > 0 ? RAIL_ICONS[i - 1].group : item.group;
            const isActive = activeId === item.id;

            return (
              <React.Fragment key={item.id}>
                {i > 0 && item.group !== prevGroup && (
                  <Separator className="w-7 my-1" />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setActiveId(isActive ? null : item.id)}
                      className={`
                        w-10 h-10 rounded-md flex flex-col items-center justify-center gap-0.5
                        transition-colors cursor-pointer
                        ${isActive
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                        }
                      `}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-[9px] leading-none font-medium">{item.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              </React.Fragment>
            );
          })}
        </TooltipProvider>
      </div>
    </div>
  );
}

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
export default function EditorLayout() {
  return (
    <div className="dark flex flex-col h-full w-full overflow-hidden bg-background text-foreground"
      style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      {/* Top toolbar */}
      <Topbar />

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
                <PreviewPanel />
              </ResizablePanel>
            </ResizablePanelGroup>

            {/* Right icon rail + drawer (not in resizable — fixed width) */}
            <RightRail />
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
