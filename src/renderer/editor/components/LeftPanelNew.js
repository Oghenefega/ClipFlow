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
  AlignLeft,
  AlignJustify,
  Scissors,
  Merge,
  Type,
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
  { key: "period", label: "Period (.)", char: "." },
  { key: "comma", label: "Comma (,)", char: "," },
  { key: "question", label: "Question (?)", char: "?" },
  { key: "exclamation", label: "Exclamation (!)", char: "!" },
  { key: "semicolon", label: "Semicolon (;)", char: ";" },
  { key: "colon", label: "Colon (:)", char: ":" },
  { key: "ellipsis", label: "Ellipsis (...)", char: "..." },
];

// ── Segment mode options ──
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
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-card border-border" align="end" sideOffset={6}>
        <div className="px-3 py-2.5 border-b border-border">
          <span className="text-xs font-semibold text-foreground">Subtitle settings</span>
        </div>
        <div className="py-1">
          {/* Subtitle display toggle */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-xs text-foreground">Subtitle display</span>
            <button
              onClick={() => setShowSubs(!showSubs)}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer ${showSubs ? "bg-primary" : "bg-secondary"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${showSubs ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Punctuation master toggle */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-xs text-foreground">Punctuation</span>
            <button
              onClick={() => setPunctOn(!punctOn)}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer ${punctOn ? "bg-primary" : "bg-secondary"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${punctOn ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Per-punctuation removal controls (shown when punctuation is ON) */}
          {punctOn && (
            <div className="px-3 pb-2">
              <span className="text-[10px] text-muted-foreground mb-1.5 block">Remove specific punctuation:</span>
              <div className="flex flex-wrap gap-1.5">
                {PUNCTUATION_OPTIONS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => togglePunct(p.key)}
                    className={`
                      h-6 px-2 rounded text-[10px] font-medium border transition-colors cursor-pointer
                      ${punctuationRemove[p.key]
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                      }
                    `}
                  >
                    {punctuationRemove[p.key] && <Check className="h-2.5 w-2.5 inline mr-0.5" />}
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
//  TIMECODE POPOVER — single dual-thumb slider
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
    // Enforce minimum gap
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
      <PopoverContent className="w-[300px] p-0 bg-card border-border" side="bottom" align="start" sideOffset={4}>
        <div className="px-3 py-2.5 border-b border-border">
          <span className="text-xs font-semibold text-foreground">Adjust start and end time</span>
        </div>
        <div className="px-3 py-3 space-y-3">
          {/* Single dual-thumb range slider */}
          <Slider
            value={[localStart, localEnd]}
            onValueChange={handleRangeChange}
            min={0}
            max={maxTime}
            step={0.05}
            minStepsBetweenThumbs={1}
            className="w-full"
          />

          {/* Time inputs */}
          <div className="flex items-center gap-2">
            <input
              value={fmtTime(localStart)}
              onChange={(e) => {
                const sec = parseTime(e.target.value);
                if (!isNaN(sec)) handleRangeChange([sec, localEnd]);
              }}
              className="flex-1 h-7 px-2 text-xs font-mono text-center rounded bg-secondary border border-border text-foreground outline-none focus:border-primary/40"
            />
            <span className="text-muted-foreground text-xs">—</span>
            <input
              value={fmtTime(localEnd)}
              onChange={(e) => {
                const sec = parseTime(e.target.value);
                if (!isNaN(sec)) handleRangeChange([localStart, sec]);
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
//  SEGMENT MODE POPOVER (sentence / 3-word / 1-word)
// ════════════════════════════════════════════════════════════════
function SegmentModePopover() {
  const segmentMode = useSubtitleStore((s) => s.segmentMode);
  const setSegmentMode = useSubtitleStore((s) => s.setSegmentMode);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                <Type className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[10px]">Segment mode</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-0 bg-card border-border" align="end" sideOffset={6}>
        <div className="px-3 py-2 border-b border-border">
          <span className="text-[11px] font-semibold text-foreground">Break subtitles into</span>
        </div>
        <div className="py-1">
          {SEGMENT_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setSegmentMode(m.id)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                segmentMode === m.id
                  ? "text-primary bg-primary/8"
                  : "text-foreground hover:bg-secondary/40"
              }`}
            >
              <div className="flex items-center gap-2">
                {segmentMode === m.id && <Check className="h-3 w-3 text-primary shrink-0" />}
                <span className={segmentMode !== m.id ? "ml-5" : ""}>{m.label}</span>
              </div>
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
        // Fallback: split text, evenly distribute timing
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

  // Full transcript text for search
  const fullText = useMemo(() => allWords.map((w) => w.word).join(" "), [allWords]);

  // Search matches on full text
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
      // Find which word this match starts in and seek there
      const m = matches[next];
      let charCount = 0;
      for (const w of allWords) {
        const wordEnd = charCount + w.word.length;
        if (m.pos >= charCount && m.pos < wordEnd) {
          seekTo(w.start);
          break;
        }
        charCount = wordEnd + 1; // +1 for space
      }
      return next;
    });
  }, [matches, allWords, seekTo]);

  // Find currently active word based on playback time
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

  // Render transcript words with search highlighting
  const renderWords = () => {
    if (allWords.length === 0) {
      return (
        <div className="px-3 py-8 text-center text-xs text-muted-foreground">
          No transcript data
        </div>
      );
    }

    // Build character position map for search highlighting
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
      charOffset = wordEnd + 1; // +1 for space

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
              ${isActive ? "bg-primary/20 text-primary font-medium" : ""}
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

      {/* Continuous flowing paragraph */}
      <ScrollArea className="flex-1">
        <div className="px-3 py-3 text-xs text-foreground/90 leading-relaxed">
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
  const esFilter = useSubtitleStore((s) => s.esFilter);
  const setEsFilter = useSubtitleStore((s) => s.setEsFilter);
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

  const handleSplit = () => {
    splitSegment();
  };

  const handleMerge = () => {
    mergeSegment();
  };

  // ── Render segment text with per-word interaction ──
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
      {/* Toolbar: search far left, Sentence/Paragraph + split/merge + segment mode + settings on right */}
      <div className="flex items-center gap-1 px-3 py-1.5 min-h-[36px]">
        {/* Search toggle — far left */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={`h-7 w-7 flex items-center justify-center rounded transition-colors shrink-0 ${
            searchOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1" />

        {/* Sentence / Paragraph toggle — beside settings */}
        <div className="flex items-center rounded-md bg-secondary/40 p-0.5">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setEsFilter("all")}
                  className={`h-6 px-2 rounded text-[10px] font-medium transition-colors ${
                    esFilter === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sentence
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-[10px]">Sentence view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setEsFilter("paragraph")}
                  className={`h-6 px-2 rounded text-[10px] font-medium transition-colors ${
                    esFilter === "paragraph" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Paragraph
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-[10px]">Paragraph view</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Split button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={handleSplit}
                disabled={!activeSegId}
              >
                <Scissors className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[10px]">Split segment at selected word</TooltipContent>
          </Tooltip>

          {/* Merge button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={handleMerge}
                disabled={!activeSegId}
              >
                <Merge className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[10px]">Merge with next segment</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Segment mode selector */}
        <SegmentModePopover />

        {/* Settings */}
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

      {/* Segment list — timecodes ABOVE each segment */}
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
                  group relative px-3 py-2 cursor-pointer transition-colors border-b border-border/30
                  ${isActive ? "bg-primary/8" : "hover:bg-secondary/30"}
                `}
              >
                {/* Timecode row — ABOVE the text */}
                <div className="flex items-center justify-between mb-1">
                  <TimecodePopover segment={seg}>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-mono text-muted-foreground hover:text-amber-400 transition-colors cursor-pointer"
                    >
                      {seg.start} — {seg.end}
                    </button>
                  </TimecodePopover>

                  {/* Duration badge inline with timecode */}
                  <span className="text-[9px] text-muted-foreground">
                    {seg.dur}
                  </span>
                </div>

                {/* Segment text with per-word hover */}
                <div className="text-xs text-foreground/90 leading-relaxed break-words">
                  {renderWords(seg)}
                </div>

                {/* Warning if present */}
                {isActive && seg.warning && (
                  <div className="mt-1">
                    <span className="text-[9px] text-amber-500/70">
                      {seg.warning}
                    </span>
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
