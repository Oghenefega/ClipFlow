import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Separator } from "../../../components/ui/separator";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Button } from "../../../components/ui/button";
import { Slider } from "../../../components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Copy,
  Download,
  Settings2,
  Plus,
  ChevronRight,
  AlignLeft,
  AlignJustify,
} from "lucide-react";
import useSubtitleStore from "../stores/useSubtitleStore";
import usePlaybackStore from "../stores/usePlaybackStore";
import useLayoutStore from "../stores/useLayoutStore";
import { fmtTime, parseTime } from "../utils/timeUtils";

// ── Highlight color palette ──
const WORD_COLORS = [
  { id: "none", color: "transparent", label: "No highlight", border: "hsl(240 4% 30%)" },
  { id: "white", color: "#ffffff", label: "White" },
  { id: "red", color: "#f87171", label: "Red" },
  { id: "yellow", color: "#fbbf24", label: "Yellow" },
  { id: "green", color: "#4cce8a", label: "Green" },
];

// ════════════════════════════════════════════════════════════════
//  SEARCH BAR
// ════════════════════════════════════════════════════════════════
function SubtitleSearch({ searchText, setSearchText, matchCount, matchIdx, onPrev, onNext, onClose }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  return (
    <div className="flex items-center gap-1 px-2.5 h-8 rounded-md bg-secondary/50 border border-primary/20">
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search..."
        className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground min-w-0"
      />
      {searchText && matchCount > 0 && (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
          {matchIdx + 1}/{matchCount}
        </span>
      )}
      {searchText && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onPrev}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={onNext}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          <button
            onClick={onClose}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  SUBTITLE SETTINGS POPOVER
// ════════════════════════════════════════════════════════════════
function SubtitleSettingsPopover() {
  const showSubs = useSubtitleStore((s) => s.showSubs);
  const punctOn = useSubtitleStore((s) => s.punctOn);
  const emojiOn = useSubtitleStore((s) => s.emojiOn);
  const setShowSubs = useSubtitleStore((s) => s.setShowSubs);
  const setPunctOn = useSubtitleStore((s) => s.setPunctOn);
  const setEmojiOn = useSubtitleStore((s) => s.setEmojiOn);

  const toggles = [
    { label: "Subtitle display", value: showSubs, onChange: (v) => setShowSubs(v) },
    { label: "Punctuation", value: punctOn, onChange: (v) => setPunctOn(v) },
    { label: "Emoji", value: emojiOn, onChange: (v) => setEmojiOn(v) },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1">
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0 bg-card border-border" align="end" sideOffset={6}>
        <div className="px-3 py-2.5 border-b">
          <span className="text-xs font-semibold text-foreground">Subtitle settings</span>
        </div>
        <div className="py-1">
          {toggles.map((t, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-xs text-foreground">{t.label}</span>
              <button
                onClick={() => t.onChange(!t.value)}
                className={`
                  relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer
                  ${t.value ? "bg-primary" : "bg-secondary"}
                `}
              >
                <span
                  className={`
                    absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200
                    ${t.value ? "left-[18px]" : "left-0.5"}
                  `}
                />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ════════════════════════════════════════════════════════════════
//  TIMECODE POPOVER  (adjust start/end time)
// ════════════════════════════════════════════════════════════════
function TimecodePopover({ segment, children }) {
  const updateSegmentTimes = useSubtitleStore((s) => s.updateSegmentTimes);
  const [localStart, setLocalStart] = useState(segment.startSec);
  const [localEnd, setLocalEnd] = useState(segment.endSec);
  const [open, setOpen] = useState(false);

  // Get the clip duration from context — use a reasonable max
  const maxTime = Math.max(segment.endSec + 10, 30);
  const minGap = 0.1; // minimum segment length

  useEffect(() => {
    if (open) {
      setLocalStart(segment.startSec);
      setLocalEnd(segment.endSec);
    }
  }, [open, segment.startSec, segment.endSec]);

  const handleStartChange = (val) => {
    const v = Math.min(val, localEnd - minGap);
    setLocalStart(Math.max(0, v));
  };

  const handleEndChange = (val) => {
    const v = Math.max(val, localStart + minGap);
    setLocalEnd(Math.min(maxTime, v));
  };

  const handleApply = () => {
    updateSegmentTimes(segment.id, localStart, localEnd);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-card border-border" side="bottom" align="start" sideOffset={4}>
        <div className="px-3 py-2.5 border-b">
          <span className="text-xs font-semibold text-foreground">Adjust start and end time</span>
        </div>
        <div className="px-3 py-3 space-y-3">
          {/* Dual-thumb range slider */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-8 shrink-0">Start</span>
              <Slider
                value={[localStart]}
                onValueChange={([v]) => handleStartChange(v)}
                min={0}
                max={maxTime}
                step={0.1}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-8 shrink-0">End</span>
              <Slider
                value={[localEnd]}
                onValueChange={([v]) => handleEndChange(v)}
                min={0}
                max={maxTime}
                step={0.1}
                className="flex-1"
              />
            </div>
          </div>

          {/* Time inputs */}
          <div className="flex items-center gap-2">
            <input
              value={fmtTime(localStart)}
              onChange={(e) => {
                const sec = parseTime(e.target.value);
                if (!isNaN(sec)) handleStartChange(sec);
              }}
              className="flex-1 h-7 px-2 text-xs font-mono text-center rounded bg-secondary border border-border text-foreground outline-none focus:border-primary/40"
            />
            <span className="text-muted-foreground text-xs">—</span>
            <input
              value={fmtTime(localEnd)}
              onChange={(e) => {
                const sec = parseTime(e.target.value);
                if (!isNaN(sec)) handleEndChange(sec);
              }}
              className="flex-1 h-7 px-2 text-xs font-mono text-center rounded bg-secondary border border-border text-foreground outline-none focus:border-primary/40"
            />
          </div>

          {/* Apply / Cancel */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs bg-primary text-primary-foreground" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ════════════════════════════════════════════════════════════════
//  WORD COLOR PICKER (hover palette)
// ════════════════════════════════════════════════════════════════
function WordColorPicker({ segId, wordIdx, onSelect }) {
  return (
    <div
      className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full z-30 flex items-center gap-1 px-1.5 py-1 rounded-md bg-popover border border-border shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {WORD_COLORS.map((c) => (
        <TooltipProvider key={c.id} delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onSelect(segId, wordIdx, c.id === "none" ? null : c.color)}
                className="w-4 h-4 rounded-full border transition-transform hover:scale-125 cursor-pointer shrink-0"
                style={{
                  background: c.color,
                  borderColor: c.border || c.color,
                  borderWidth: c.id === "none" ? 2 : 1,
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] py-0.5 px-1.5">
              {c.label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
      <button className="w-4 h-4 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <ChevronRight className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  TRANSCRIPT TAB
// ════════════════════════════════════════════════════════════════
function TranscriptTab() {
  const editSegments = useSubtitleStore((s) => s.editSegments);
  const activeRow = useSubtitleStore((s) => s.activeRow);
  const setActiveRow = useSubtitleStore((s) => s.setActiveRow);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const transcriptSearch = useSubtitleStore((s) => s.transcriptSearch);
  const setTranscriptSearch = useSubtitleStore((s) => s.setTranscriptSearch);

  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);

  // Find all search matches
  const matches = useMemo(() => {
    if (!transcriptSearch) return [];
    const q = transcriptSearch.toLowerCase();
    const result = [];
    editSegments.forEach((seg, segIdx) => {
      const text = seg.text.toLowerCase();
      let pos = 0;
      while ((pos = text.indexOf(q, pos)) !== -1) {
        result.push({ segIdx, pos, len: q.length });
        pos += 1;
      }
    });
    return result;
  }, [editSegments, transcriptSearch]);

  const navMatch = useCallback((dir) => {
    if (matches.length === 0) return;
    setMatchIdx((prev) => {
      const next = (prev + dir + matches.length) % matches.length;
      // Scroll to & seek to segment
      const m = matches[next];
      setActiveRow(m.segIdx);
      if (editSegments[m.segIdx]) seekTo(editSegments[m.segIdx].startSec);
      return next;
    });
  }, [matches, editSegments, setActiveRow, seekTo]);

  // Highlight matching text in a segment
  const renderHighlightedText = useCallback((text, segIdx) => {
    if (!transcriptSearch) return text;
    const q = transcriptSearch.toLowerCase();
    const lower = text.toLowerCase();
    const parts = [];
    let last = 0;
    let pos = 0;
    while ((pos = lower.indexOf(q, last)) !== -1) {
      if (pos > last) parts.push(<span key={last}>{text.slice(last, pos)}</span>);
      parts.push(
        <span key={pos} className="bg-primary/25 text-primary-foreground rounded px-0.5">
          {text.slice(pos, pos + q.length)}
        </span>
      );
      last = pos + q.length;
    }
    if (last < text.length) parts.push(<span key={last}>{text.slice(last)}</span>);
    return parts.length > 0 ? parts : text;
  }, [transcriptSearch]);

  const handleRowClick = (seg, idx) => {
    setActiveRow(idx);
    seekTo(seg.startSec);
  };

  const handleCopyAll = () => {
    const text = editSegments.map(s => s.text).join(" ");
    navigator.clipboard?.writeText(text);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 min-h-[36px]">
        <div className="flex-1">
          {searchOpen ? (
            <SubtitleSearch
              searchText={transcriptSearch}
              setSearchText={setTranscriptSearch}
              matchCount={matches.length}
              matchIdx={matchIdx}
              onPrev={() => navMatch(-1)}
              onNext={() => navMatch(1)}
              onClose={() => { setSearchOpen(false); setTranscriptSearch(""); setMatchIdx(0); }}
            />
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 px-2 h-7 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <Search className="h-3 w-3" />
              Search
            </button>
          )}
        </div>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleCopyAll}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[10px]">Copy transcript</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[10px]">Download</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Separator />

      {/* Transcript rows */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {editSegments.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No transcript data
            </div>
          )}
          {editSegments.map((seg, idx) => (
            <button
              key={seg.id}
              onClick={() => handleRowClick(seg, idx)}
              className={`
                w-full text-left px-3 py-2 transition-colors cursor-pointer
                ${activeRow === idx ? "bg-primary/8" : "hover:bg-secondary/40"}
              `}
            >
              <div className="flex gap-2 items-start">
                <span className="text-[10px] font-mono text-amber-500/70 whitespace-nowrap shrink-0 pt-0.5 min-w-[80px]">
                  {seg.start} – {seg.end}
                </span>
                <span className="text-xs text-foreground/90 leading-relaxed break-words">
                  {renderHighlightedText(seg.text, idx)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  EDIT SUBTITLES TAB
// ════════════════════════════════════════════════════════════════
function EditSubtitlesTab() {
  const editSegments = useSubtitleStore((s) => s.editSegments);
  const activeSegId = useSubtitleStore((s) => s.activeSegId);
  const setActiveSegId = useSubtitleStore((s) => s.setActiveSegId);
  const esFilter = useSubtitleStore((s) => s.esFilter);
  const setEsFilter = useSubtitleStore((s) => s.setEsFilter);
  const selectedWordInfo = useSubtitleStore((s) => s.selectedWordInfo);
  const setSelectedWordInfo = useSubtitleStore((s) => s.setSelectedWordInfo);
  const setHighlightColor = useSubtitleStore((s) => s.setHighlightColor);
  const transcriptSearch = useSubtitleStore((s) => s.transcriptSearch);
  const setTranscriptSearch = useSubtitleStore((s) => s.setTranscriptSearch);
  const seekTo = usePlaybackStore((s) => s.seekTo);

  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [hoveredWord, setHoveredWord] = useState(null); // { segId, wordIdx }

  // ── Search matches ──
  const matches = useMemo(() => {
    if (!transcriptSearch) return [];
    const q = transcriptSearch.toLowerCase();
    const result = [];
    editSegments.forEach((seg, segIdx) => {
      const text = seg.text.toLowerCase();
      let pos = 0;
      while ((pos = text.indexOf(q, pos)) !== -1) {
        result.push({ segIdx, segId: seg.id, pos, len: q.length });
        pos += 1;
      }
    });
    return result;
  }, [editSegments, transcriptSearch]);

  const navMatch = useCallback((dir) => {
    if (matches.length === 0) return;
    setMatchIdx((prev) => {
      const next = (prev + dir + matches.length) % matches.length;
      const m = matches[next];
      setActiveSegId(m.segId);
      if (editSegments[m.segIdx]) seekTo(editSegments[m.segIdx].startSec);
      return next;
    });
  }, [matches, editSegments, setActiveSegId, seekTo]);

  // ── Segment click ──
  const handleSegClick = (seg) => {
    setActiveSegId(seg.id);
    seekTo(seg.startSec);
  };

  // ── Word click → seek ──
  const handleWordClick = (seg, wordIdx) => {
    setActiveSegId(seg.id);
    setSelectedWordInfo({ segId: seg.id, wordIdx });
    if (seg.words && seg.words[wordIdx]) {
      seekTo(seg.words[wordIdx].start);
    }
  };

  // ── Word color selection ──
  const handleWordColorSelect = (segId, wordIdx, color) => {
    // Store word-level highlight in segment data
    // For now, just set the global highlight color when a word is tagged
    if (color) setHighlightColor(color);
    setHoveredWord(null);
  };

  // ── Render segment text with per-word interaction ──
  const renderWords = (seg) => {
    const textWords = seg.text.split(/(\s+)/);
    let wordIdx = 0;

    return textWords.map((token, i) => {
      // Whitespace tokens
      if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;

      const currentWordIdx = wordIdx;
      wordIdx++;
      const isSelected = selectedWordInfo?.segId === seg.id && selectedWordInfo?.wordIdx === currentWordIdx;
      const isHovered = hoveredWord?.segId === seg.id && hoveredWord?.wordIdx === currentWordIdx;

      return (
        <span
          key={i}
          className={`
            relative inline-block cursor-pointer rounded px-0.5 transition-colors
            ${isSelected ? "bg-primary/20 text-primary" : "hover:bg-secondary/60"}
          `}
          onClick={(e) => { e.stopPropagation(); handleWordClick(seg, currentWordIdx); }}
          onMouseEnter={() => setHoveredWord({ segId: seg.id, wordIdx: currentWordIdx })}
          onMouseLeave={() => setHoveredWord(null)}
        >
          {token}
          {/* Color picker on hover */}
          {isHovered && (
            <WordColorPicker
              segId={seg.id}
              wordIdx={currentWordIdx}
              onSelect={handleWordColorSelect}
            />
          )}
        </span>
      );
    });
  };

  // ── Highlight search matches in text ──
  const renderSearchHighlight = (text) => {
    if (!transcriptSearch) return null;
    const q = transcriptSearch.toLowerCase();
    const lower = text.toLowerCase();
    if (!lower.includes(q)) return null;
    // If there's a search match, we overlay highlighting via the word rendering
    return true;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: view mode + settings */}
      <div className="flex items-center gap-1 px-3 py-1.5 min-h-[36px]">
        {/* CC icon + mode toggle */}
        <div className="flex items-center gap-1 flex-1">
          <span className="text-[10px] font-bold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">CC</span>

          {/* Sentence / Paragraph toggle */}
          <div className="flex items-center rounded-md bg-secondary/40 p-0.5">
            <button
              onClick={() => setEsFilter("all")}
              className={`h-6 px-2 rounded text-[10px] font-medium transition-colors ${
                esFilter === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlignLeft className="h-3 w-3" />
            </button>
            <button
              onClick={() => setEsFilter("paragraph")}
              className={`h-6 px-2 rounded text-[10px] font-medium transition-colors ${
                esFilter === "paragraph" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlignJustify className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Search toggle + Settings */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${
            searchOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <Search className="h-3.5 w-3.5" />
        </button>
        <SubtitleSettingsPopover />
      </div>

      {/* Search bar (conditional) */}
      {searchOpen && (
        <div className="px-3 pb-1.5">
          <SubtitleSearch
            searchText={transcriptSearch}
            setSearchText={setTranscriptSearch}
            matchCount={matches.length}
            matchIdx={matchIdx}
            onPrev={() => navMatch(-1)}
            onNext={() => navMatch(1)}
            onClose={() => { setSearchOpen(false); setTranscriptSearch(""); setMatchIdx(0); }}
          />
        </div>
      )}

      <Separator />

      {/* Segment list */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {editSegments.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No subtitle segments
            </div>
          )}
          {editSegments.map((seg) => {
            const isActive = activeSegId === seg.id;

            return (
              <div
                key={seg.id}
                onClick={() => handleSegClick(seg)}
                className={`
                  group relative px-3 py-2.5 cursor-pointer transition-colors border-b border-border/30
                  ${isActive ? "bg-primary/8" : "hover:bg-secondary/30"}
                `}
              >
                <div className="flex gap-2 items-start">
                  {/* Timecode (clickable → opens popover) */}
                  <TimecodePopover segment={seg}>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-mono text-amber-500/70 hover:text-amber-400 whitespace-nowrap shrink-0 pt-0.5 min-w-[80px] text-left transition-colors"
                    >
                      {seg.start}
                      <br />
                      {seg.end}
                    </button>
                  </TimecodePopover>

                  {/* Segment text with per-word hover */}
                  <div className="flex-1 text-xs text-foreground/90 leading-relaxed break-words">
                    {renderWords(seg)}
                  </div>

                  {/* Add / action button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); }}
                    className="shrink-0 w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {/* Duration badge */}
                {isActive && (
                  <div className="mt-1.5 ml-[84px]">
                    <span className="text-[9px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                      {seg.dur}
                    </span>
                    {seg.warning && (
                      <span className="text-[9px] text-amber-500/70 ml-1.5">
                        ⚠ {seg.warning}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  LEFT PANEL (main export)
// ════════════════════════════════════════════════════════════════
export default function LeftPanelNew() {
  const lpTab = useLayoutStore((s) => s.lpTab);
  const setLpTab = useLayoutStore((s) => s.setLpTab);

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      {/* Tab header */}
      <div className="px-3 pt-2.5 pb-1 shrink-0">
        <div className="flex rounded-md bg-secondary/40 p-0.5">
          <button
            onClick={() => setLpTab("transcript")}
            className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
              lpTab === "transcript"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Transcript
          </button>
          <button
            onClick={() => setLpTab("edit-subtitles")}
            className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
              lpTab === "edit-subtitles"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Edit subtitles
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {lpTab === "transcript" ? <TranscriptTab /> : <EditSubtitlesTab />}
      </div>
    </div>
  );
}
