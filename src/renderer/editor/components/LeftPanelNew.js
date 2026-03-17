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
  ChevronRight,
  Scissors,
  Merge,
  Check,
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

// ── Punctuation options ──
const PUNCTUATION_OPTIONS = [
  { key: "period", char: "." },
  { key: "comma", char: "," },
  { key: "question", char: "?" },
  { key: "exclamation", char: "!" },
  { key: "semicolon", char: ";" },
  { key: "colon", char: ":" },
  { key: "ellipsis", char: "..." },
];

// ── Segment mode options (replaces old Sentence/Paragraph) ──
const SEGMENT_MODES = [
  { id: "sentence", label: "Sentence" },
  { id: "3word", label: "3 Words" },
  { id: "1word", label: "1 Word" },
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
    <div className="flex items-center gap-1.5 px-2.5 h-9 rounded-md bg-secondary/50 border border-primary/20">
      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search..."
        className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground min-w-0"
      />
      {searchText && matchCount > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {matchIdx + 1}/{matchCount}
        </span>
      )}
      {searchText && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onPrev} className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={onNext} className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  SUBTITLE SETTINGS POPOVER (no emoji, enhanced punctuation)
// ════════════════════════════════════════════════════════════════
function SubtitleSettingsPopover() {
  const showSubs = useSubtitleStore((s) => s.showSubs);
  const setShowSubs = useSubtitleStore((s) => s.setShowSubs);
  const punctOn = useSubtitleStore((s) => s.punctOn);
  const setPunctOn = useSubtitleStore((s) => s.setPunctOn);
  const punctuationRemove = useSubtitleStore((s) => s.punctuationRemove);
  const setPunctuationRemove = useSubtitleStore((s) => s.setPunctuationRemove);

  const togglePunct = (key) => {
    setPunctuationRemove({ ...punctuationRemove, [key]: !punctuationRemove[key] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
          <Settings2 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-card border-border" align="end" sideOffset={6}>
        <div className="px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Subtitle settings</span>
        </div>
        <div className="py-1">
          {/* Subtitle display toggle */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm text-foreground">Subtitle display</span>
            <button
              onClick={() => setShowSubs(!showSubs)}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer ${showSubs ? "bg-primary" : "bg-secondary"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${showSubs ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Punctuation master toggle */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm text-foreground">Punctuation</span>
            <button
              onClick={() => setPunctOn(!punctOn)}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer ${punctOn ? "bg-primary" : "bg-secondary"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${punctOn ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Per-punctuation removal controls */}
          {punctOn && (
            <div className="px-3 pb-2.5">
              <span className="text-xs text-muted-foreground mb-2 block">Remove specific punctuation:</span>
              <div className="flex flex-wrap gap-1.5">
                {PUNCTUATION_OPTIONS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => togglePunct(p.key)}
                    className={`
                      h-7 px-2.5 rounded text-xs font-medium border transition-colors cursor-pointer
                      ${punctuationRemove[p.key]
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                      }
                    `}
                  >
                    {punctuationRemove[p.key] && <Check className="h-3 w-3 inline mr-1" />}
                    {p.char}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ════════════════════════════════════════════════════════════════
//  TIMECODE POPOVER — single dual-thumb slider (matching Vizard)
// ════════════════════════════════════════════════════════════════
function TimecodePopover({ segment, children }) {
  const updateSegmentTimes = useSubtitleStore((s) => s.updateSegmentTimes);
  const duration = usePlaybackStore((s) => s.duration);
  const [localStart, setLocalStart] = useState(segment.startSec);
  const [localEnd, setLocalEnd] = useState(segment.endSec);
  const [open, setOpen] = useState(false);

  const maxTime = duration > 0 ? duration : Math.max(segment.endSec + 10, 30);
  const minGap = 0.1;

  useEffect(() => {
    if (open) {
      setLocalStart(segment.startSec);
      setLocalEnd(segment.endSec);
    }
  }, [open, segment.startSec, segment.endSec]);

  const handleRangeChange = (values) => {
    let [newStart, newEnd] = values;
    if (newEnd - newStart < minGap) {
      if (newStart !== localStart) {
        newStart = Math.max(0, newEnd - minGap);
      } else {
        newEnd = Math.min(maxTime, newStart + minGap);
      }
    }
    setLocalStart(Math.max(0, newStart));
    setLocalEnd(Math.min(maxTime, newEnd));
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
      <PopoverContent className="w-[320px] p-0 bg-card border-border" side="bottom" align="start" sideOffset={4}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Adjust start and end time</span>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Dual-thumb range slider */}
          <Slider
            value={[localStart, localEnd]}
            onValueChange={handleRangeChange}
            min={0}
            max={maxTime}
            step={0.05}
            className="w-full"
          />

          {/* Time inputs */}
          <div className="flex items-center gap-3">
            <input
              value={fmtTime(localStart)}
              onChange={(e) => {
                const sec = parseTime(e.target.value);
                if (!isNaN(sec)) handleRangeChange([sec, localEnd]);
              }}
              className="flex-1 h-9 px-3 text-sm font-mono text-center rounded-md bg-secondary border border-border text-foreground outline-none focus:border-primary/50"
            />
            <span className="text-muted-foreground text-sm font-medium">—</span>
            <input
              value={fmtTime(localEnd)}
              onChange={(e) => {
                const sec = parseTime(e.target.value);
                if (!isNaN(sec)) handleRangeChange([localStart, sec]);
              }}
              className="flex-1 h-9 px-3 text-sm font-mono text-center rounded-md bg-secondary border border-border text-foreground outline-none focus:border-primary/50"
            />
          </div>

          {/* Cancel / Apply */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-8 px-4 text-sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 px-4 text-sm bg-primary text-primary-foreground" onClick={handleApply}>
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
                className="w-5 h-5 rounded-full border transition-transform hover:scale-125 cursor-pointer shrink-0"
                style={{
                  background: c.color,
                  borderColor: c.border || c.color,
                  borderWidth: c.id === "none" ? 2 : 1,
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px] py-0.5 px-1.5">
              {c.label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
      <button className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  SEGMENT MODE DROPDOWN (Sentence / 3-Word / 1-Word)
//  Replaces old Sentence/Paragraph toggle
// ════════════════════════════════════════════════════════════════
function SegmentModeDropdown() {
  const segmentMode = useSubtitleStore((s) => s.segmentMode);
  const setSegmentMode = useSubtitleStore((s) => s.setSegmentMode);
  const [open, setOpen] = useState(false);

  const currentLabel = SEGMENT_MODES.find((m) => m.id === segmentMode)?.label || "Sentence";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-8 px-3 rounded-md bg-secondary/50 border border-border/50 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1.5 cursor-pointer">
          {currentLabel}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] p-0 bg-card border-border" align="start" sideOffset={4}>
        <div className="py-1">
          {SEGMENT_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => { setSegmentMode(m.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer flex items-center gap-2 ${
                segmentMode === m.id
                  ? "text-primary bg-primary/8"
                  : "text-foreground hover:bg-secondary/40"
              }`}
            >
              {segmentMode === m.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              <span className={segmentMode !== m.id ? "ml-[22px]" : ""}>{m.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ════════════════════════════════════════════════════════════════
//  TRANSCRIPT TAB — one continuous body of text
// ════════════════════════════════════════════════════════════════
function TranscriptTab() {
  const editSegments = useSubtitleStore((s) => s.editSegments);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const transcriptSearch = useSubtitleStore((s) => s.transcriptSearch);
  const setTranscriptSearch = useSubtitleStore((s) => s.setTranscriptSearch);

  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);

  // Build flat word list from all segments for continuous paragraph
  const allWords = useMemo(() => {
    const words = [];
    editSegments.forEach((seg) => {
      if (seg.words && seg.words.length > 0) {
        seg.words.forEach((w) => {
          words.push({ ...w, segId: seg.id });
        });
      } else {
        const textWords = seg.text.split(/\s+/).filter(Boolean);
        const dur = seg.endSec - seg.startSec;
        const perWord = dur / Math.max(1, textWords.length);
        textWords.forEach((tw, i) => {
          words.push({
            word: tw,
            start: seg.startSec + i * perWord,
            end: seg.startSec + (i + 1) * perWord,
            segId: seg.id,
          });
        });
      }
    });
    return words;
  }, [editSegments]);

  const fullText = useMemo(() => allWords.map((w) => w.word).join(" "), [allWords]);

  const matches = useMemo(() => {
    if (!transcriptSearch) return [];
    const q = transcriptSearch.toLowerCase();
    const lower = fullText.toLowerCase();
    const result = [];
    let pos = 0;
    while ((pos = lower.indexOf(q, pos)) !== -1) {
      result.push({ pos, len: q.length });
      pos += 1;
    }
    return result;
  }, [fullText, transcriptSearch]);

  const navMatch = useCallback((dir) => {
    if (matches.length === 0) return;
    setMatchIdx((prev) => {
      const next = (prev + dir + matches.length) % matches.length;
      const m = matches[next];
      let charCount = 0;
      for (const w of allWords) {
        const wordEnd = charCount + w.word.length;
        if (m.pos >= charCount && m.pos < wordEnd) {
          seekTo(w.start);
          break;
        }
        charCount = wordEnd + 1;
      }
      return next;
    });
  }, [matches, allWords, seekTo]);

  const activeWordIdx = useMemo(() => {
    for (let i = allWords.length - 1; i >= 0; i--) {
      if (currentTime >= allWords[i].start) return i;
    }
    return -1;
  }, [allWords, currentTime]);

  const handleWordClick = (word) => {
    seekTo(word.start);
  };

  const handleCopyAll = () => {
    navigator.clipboard?.writeText(fullText);
  };

  const renderWords = () => {
    if (allWords.length === 0) {
      return (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No transcript data
        </div>
      );
    }

    let searchHighlightRanges = [];
    if (transcriptSearch) {
      const q = transcriptSearch.toLowerCase();
      const lower = fullText.toLowerCase();
      let pos = 0;
      while ((pos = lower.indexOf(q, pos)) !== -1) {
        searchHighlightRanges.push({ start: pos, end: pos + q.length });
        pos += 1;
      }
    }

    let charOffset = 0;
    return allWords.map((w, idx) => {
      const wordStart = charOffset;
      const wordEnd = charOffset + w.word.length;
      charOffset = wordEnd + 1;

      const isActive = idx === activeWordIdx;
      const isSearchHit = searchHighlightRanges.some(
        (r) => wordStart < r.end && wordEnd > r.start
      );

      return (
        <React.Fragment key={idx}>
          <span
            onClick={() => handleWordClick(w)}
            className={`
              inline cursor-pointer rounded-sm px-0.5 transition-colors
              ${isActive ? "bg-primary/20 text-primary font-semibold" : ""}
              ${isSearchHit ? "bg-yellow-500/25" : ""}
              ${!isActive && !isSearchHit ? "hover:bg-secondary/50" : ""}
            `}
          >
            {w.word}
          </span>
          {idx < allWords.length - 1 && " "}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 min-h-[40px]">
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
              className="flex items-center gap-1.5 px-2.5 h-8 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          )}
        </div>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors" onClick={handleCopyAll}>
                <Copy className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Copy transcript</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
                <Download className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Download</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Separator />

      {/* Continuous flowing paragraph */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-4 text-sm text-foreground/90 leading-relaxed">
          {renderWords()}
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
  const selectedWordInfo = useSubtitleStore((s) => s.selectedWordInfo);
  const setSelectedWordInfo = useSubtitleStore((s) => s.setSelectedWordInfo);
  const setHighlightColor = useSubtitleStore((s) => s.setHighlightColor);
  const transcriptSearch = useSubtitleStore((s) => s.transcriptSearch);
  const setTranscriptSearch = useSubtitleStore((s) => s.setTranscriptSearch);
  const splitSegment = useSubtitleStore((s) => s.splitSegment);
  const mergeSegment = useSubtitleStore((s) => s.mergeSegment);
  const seekTo = usePlaybackStore((s) => s.seekTo);

  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [hoveredWord, setHoveredWord] = useState(null);

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

  const handleSegClick = (seg) => {
    setActiveSegId(seg.id);
    seekTo(seg.startSec);
  };

  const handleWordClick = (seg, wordIdx) => {
    setActiveSegId(seg.id);
    setSelectedWordInfo({ segId: seg.id, wordIdx });
    if (seg.words && seg.words[wordIdx]) {
      seekTo(seg.words[wordIdx].start);
    }
  };

  const handleWordColorSelect = (segId, wordIdx, color) => {
    if (color) setHighlightColor(color);
    setHoveredWord(null);
  };

  const renderWords = (seg) => {
    const textWords = seg.text.split(/(\s+)/);
    let wordIdx = 0;

    return textWords.map((token, i) => {
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

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: search far left | segment mode dropdown + split + merge + settings on right */}
      <div className="flex items-center gap-1.5 px-3 py-2 min-h-[40px]">
        {/* Search toggle — far left */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={`h-8 w-8 flex items-center justify-center rounded transition-colors shrink-0 ${
            searchOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <Search className="h-4 w-4" />
        </button>

        {/* Segment mode dropdown (replaces old Sentence/Paragraph toggle) */}
        <SegmentModeDropdown />

        <div className="flex-1" />

        {/* Split button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-30"
                onClick={() => splitSegment()}
                disabled={!activeSegId}
              >
                <Scissors className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Split at selected word</TooltipContent>
          </Tooltip>

          {/* Merge button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-30"
                onClick={() => mergeSegment()}
                disabled={!activeSegId}
              >
                <Merge className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Merge with next</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Settings */}
        <SubtitleSettingsPopover />
      </div>

      {/* Search bar (conditional) */}
      {searchOpen && (
        <div className="px-3 pb-2">
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

      {/* Segment list — timecodes ABOVE each segment, active = left purple border */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {editSegments.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
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
                  group relative cursor-pointer transition-colors border-b border-border/30
                  ${isActive ? "bg-primary/8" : "hover:bg-secondary/30"}
                `}
              >
                {/* Active segment indicator — left purple border */}
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-r" />
                )}

                <div className={`px-4 py-3 ${isActive ? "pl-5" : ""}`}>
                  {/* Timecode row — ABOVE the text */}
                  <div className="flex items-center justify-between mb-1.5">
                    <TimecodePopover segment={seg}>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-mono text-muted-foreground hover:text-amber-400 transition-colors cursor-pointer"
                      >
                        {seg.start} — {seg.end}
                      </button>
                    </TimecodePopover>

                    <span className="text-xs text-muted-foreground">
                      {seg.dur}
                    </span>
                  </div>

                  {/* Segment text with per-word hover */}
                  <div className="text-sm text-foreground/90 leading-relaxed break-words">
                    {renderWords(seg)}
                  </div>

                  {/* Warning if present */}
                  {isActive && seg.warning && (
                    <div className="mt-1.5">
                      <span className="text-xs text-amber-500/70">
                        {seg.warning}
                      </span>
                    </div>
                  )}
                </div>
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
      <div className="px-3 pt-3 pb-1.5 shrink-0">
        <div className="flex rounded-lg bg-secondary/40 p-0.5">
          <button
            onClick={() => setLpTab("transcript")}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
              lpTab === "transcript"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Transcript
          </button>
          <button
            onClick={() => setLpTab("edit-subtitles")}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
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
