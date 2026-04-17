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
  Scissors,
  Merge,
  Check,
  Plus,
  CaseSensitive,
  Trash2,
  Film,
} from "lucide-react";
import useSubtitleStore from "../stores/useSubtitleStore";
import usePlaybackStore from "../stores/usePlaybackStore";
import useLayoutStore from "../stores/useLayoutStore";
import useEditorStore from "../stores/useEditorStore";
import { fmtTime, parseTime } from "../utils/timeUtils";

const PUNCTUATION_OPTIONS = [
  { key: "period", char: "." },
  { key: "comma", char: "," },
  { key: "question", char: "?" },
  { key: "exclamation", char: "!" },
  { key: "semicolon", char: ";" },
  { key: "colon", char: ":" },
  { key: "ellipsis", char: "..." },
];

const SEGMENT_MODES = [
  { id: "3word", label: "3 Words" },
  { id: "1word", label: "1 Word" },
];

// ════════════════════════════════════════════════════════════════
//  INLINE WORD EDITOR — shown on double-click
// ════════════════════════════════════════════════════════════════
function InlineWordEditor({ initialText, onConfirm, onCancel, selectAll }) {
  const inputRef = useRef(null);
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (selectAll) {
        inputRef.current.select();
      } else {
        // Place cursor at end
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If text is empty, signal deletion via onConfirm with empty string
      onConfirm(text.trim());
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onConfirm(text.trim())}
      className="inline bg-primary/15 text-primary border border-primary/30 rounded px-1.5 py-0.5 text-sm outline-none min-w-[40px]"
      style={{ width: `${Math.max(40, text.length * 9.5 + 16)}px` }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

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
//  SUBTITLE SETTINGS POPOVER
// ════════════════════════════════════════════════════════════════
function SubtitleSettingsPopover() {
  const showSubs = useSubtitleStore((s) => s.showSubs);
  const setShowSubs = useSubtitleStore((s) => s.setShowSubs);
  const punctuationRemove = useSubtitleStore((s) => s.punctuationRemove);
  const setPunctuationRemove = useSubtitleStore((s) => s.setPunctuationRemove);
  const [punctDropOpen, setPunctDropOpen] = useState(false);

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
      <PopoverContent className="dark w-[280px] p-0 bg-[hsl(240_6%_10%)] border-[hsl(240_4%_20%)]" align="end" sideOffset={6}>
        <div className="px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Subtitle settings</span>
        </div>
        <div className="py-1">
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm text-foreground">Subtitle display</span>
            <button
              onClick={() => setShowSubs(!showSubs)}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer ${showSubs ? "bg-primary" : "bg-secondary"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${showSubs ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm text-foreground">Punctuation</span>
            <button
              onClick={() => setPunctDropOpen(!punctDropOpen)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
            >
              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${punctDropOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          {punctDropOpen && (
            <div className="px-3 pb-2.5">
              <span className="text-xs text-muted-foreground mb-2 block">Tap to remove:</span>
              <div className="flex flex-wrap gap-1.5">
                {PUNCTUATION_OPTIONS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => togglePunct(p.key)}
                    className={`
                      h-7 px-2.5 rounded text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1
                      ${punctuationRemove[p.key]
                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                        : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                      }
                    `}
                  >
                    {punctuationRemove[p.key] && <X className="h-3 w-3" />}
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
//  TIMECODE POPOVER — local ±5s range slider, not full video
// ════════════════════════════════════════════════════════════════
function TimecodePopover({ segment, children }) {
  const updateSegmentTimes = useSubtitleStore((s) => s.updateSegmentTimes);
  const editSegments = useSubtitleStore((s) => s.editSegments);
  const duration = usePlaybackStore((s) => s.duration);
  const [localStart, setLocalStart] = useState(segment.startSec);
  const [localEnd, setLocalEnd] = useState(segment.endSec);
  const [open, setOpen] = useState(false);

  // Find neighbor boundaries to prevent overlap
  const segIdx = editSegments.findIndex((s) => s.id === segment.id);
  const prevSeg = segIdx > 0 ? editSegments[segIdx - 1] : null;
  const nextSeg = segIdx < editSegments.length - 1 ? editSegments[segIdx + 1] : null;

  // Slider range: ±5s around current segment, clamped to neighbors and video bounds
  const sliderMin = Math.max(0, prevSeg ? prevSeg.endSec : segment.startSec - 5);
  const sliderMax = Math.min(
    duration > 0 ? duration : segment.endSec + 10,
    nextSeg ? nextSeg.startSec : segment.endSec + 5
  );
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
        newStart = Math.max(sliderMin, newEnd - minGap);
      } else {
        newEnd = Math.min(sliderMax, newStart + minGap);
      }
    }
    setLocalStart(Math.max(sliderMin, newStart));
    setLocalEnd(Math.min(sliderMax, newEnd));
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
      <PopoverContent className="dark w-[280px] p-0 bg-[hsl(240_6%_10%)] border-[hsl(240_4%_20%)]" side="bottom" align="start" sideOffset={4} collisionPadding={12}>
        <div className="px-3 py-2.5 border-b border-[hsl(240_4%_20%)]">
          <span className="text-sm font-semibold text-white">Adjust start and end time</span>
        </div>
        <div className="px-3 py-3 space-y-3">
          {/* Dual-thumb range slider */}
          <Slider
            value={[localStart, localEnd]}
            onValueChange={handleRangeChange}
            min={sliderMin}
            max={sliderMax}
            step={0.05}
            className="w-full"
          />

          {/* Time inputs */}
          <div className="flex items-center justify-center gap-1.5">
            <input
              value={fmtTime(localStart)}
              onChange={(e) => {
                const sec = parseTime(e.target.value);
                if (!isNaN(sec)) handleRangeChange([sec, localEnd]);
              }}
              className="w-[72px] h-6 px-0.5 text-xs font-mono text-center rounded bg-[hsl(240_6%_15%)] border border-[hsl(240_4%_22%)] text-white outline-none focus:border-primary/50"
            />
            <span className="text-[hsl(240_5%_50%)] text-xs">–</span>
            <input
              value={fmtTime(localEnd)}
              onChange={(e) => {
                const sec = parseTime(e.target.value);
                if (!isNaN(sec)) handleRangeChange([localStart, sec]);
              }}
              className="w-[72px] h-6 px-0.5 text-xs font-mono text-center rounded bg-[hsl(240_6%_15%)] border border-[hsl(240_4%_22%)] text-white outline-none focus:border-primary/50"
            />
          </div>

          {/* Cancel / Apply */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-8 px-3 text-sm text-[hsl(240_5%_65%)] hover:text-white" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 px-4 text-sm bg-primary text-white hover:bg-primary/90" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ════════════════════════════════════════════════════════════════
//  SEGMENT MODE DROPDOWN
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
      <PopoverContent className="dark w-[160px] p-0 bg-[hsl(240_6%_10%)] border-[hsl(240_4%_20%)]" align="start" sideOffset={4}>
        <div className="py-1">
          {SEGMENT_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => { setSegmentMode(m.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer flex items-center gap-2 ${
                segmentMode === m.id ? "text-primary bg-primary/8" : "text-foreground hover:bg-secondary/40"
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
//  TRANSCRIPT TAB — continuous paragraph with inline editing
// ════════════════════════════════════════════════════════════════
function TranscriptTab() {
  const originalSegments = useSubtitleStore((s) => s.originalSegments);
  // #57 Phase B: subscribe to the store-derived active word index instead of
  // re-scanning 5000+ words at 60Hz. Store computes it inside setCurrentTime
  // via forward-scan (O(1) amortized) and only notifies this subscriber when
  // the index actually changes (word-rate, 1-3Hz).
  const activeWordIdx = usePlaybackStore((s) => s.activeTranscriptWordIdx);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const transcriptSearch = useSubtitleStore((s) => s.transcriptSearch);
  const setTranscriptSearch = useSubtitleStore((s) => s.setTranscriptSearch);
  const updateWordInSegment = useSubtitleStore((s) => s.updateWordInSegment);

  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [editingWord, setEditingWord] = useState(null); // { globalIdx }

  // Build flat word list with segment context for editing
  // Each word carries segId + segWordIdx for editing, plus segBreakAfter for paragraph breaks
  const allWords = useMemo(() => {
    const words = [];
    originalSegments.forEach((seg, segIndex) => {
      let segWordIdx = 0;
      if (seg.words && seg.words.length > 0) {
        seg.words.forEach((w, wi) => {
          words.push({
            ...w, segId: seg.id, segWordIdx: segWordIdx++,
            segBreakAfter: wi === seg.words.length - 1 && segIndex < originalSegments.length - 1,
          });
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
            segWordIdx: segWordIdx++,
            segBreakAfter: i === textWords.length - 1 && segIndex < originalSegments.length - 1,
          });
        });
      }
    });
    return words;
  }, [originalSegments]);

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
        if (m.pos >= charCount && m.pos < wordEnd) { seekTo(w.start); break; }
        charCount = wordEnd + 1;
      }
      return next;
    });
  }, [matches, allWords, seekTo]);

  // Auto-scroll active word into view
  const activeWordRef = useRef(null);
  useEffect(() => {
    if (activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeWordIdx]);

  const handleWordClick = (word) => { seekTo(word.start); };

  const handleWordDoubleClick = (e, idx) => {
    e.stopPropagation();
    setEditingWord({ globalIdx: idx, selectAll: true });
  };

  const handleEditConfirm = (idx, newText) => {
    const w = allWords[idx];
    if (!newText) {
      // Empty text — delete word from segment
      const subStore = useSubtitleStore.getState();
      const origSegs = subStore.originalSegments;
      const seg = origSegs.find(s => s.id === w.segId);
      if (seg) {
        const textWords = seg.text.split(/\s+/).filter(Boolean);
        if (textWords.length <= 1) {
          // Don't delete from transcript — just cancel
        } else {
          textWords.splice(w.segWordIdx, 1);
          subStore.updateSegmentText(w.segId, textWords.join(" "));
        }
      }
    } else {
      updateWordInSegment(w.segId, w.segWordIdx, newText);
    }
    setEditingWord(null);
  };

  const handleCopyAll = () => { navigator.clipboard?.writeText(fullText); };

  const renderWords = () => {
    if (allWords.length === 0) {
      return <div className="py-8 text-center text-sm text-muted-foreground">No transcript data</div>;
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
      const isSearchHit = searchHighlightRanges.some((r) => wordStart < r.end && wordEnd > r.start);
      const isEditing = editingWord?.globalIdx === idx;

      if (isEditing) {
        return (
          <React.Fragment key={idx}>
            <InlineWordEditor
              initialText={w.word}
              onConfirm={(t) => handleEditConfirm(idx, t)}
              onCancel={() => setEditingWord(null)}
              selectAll={editingWord?.selectAll}
            />
            {idx < allWords.length - 1 && " "}
          </React.Fragment>
        );
      }

      return (
        <React.Fragment key={idx}>
          <span
            ref={isActive ? activeWordRef : null}
            onClick={() => handleWordClick(w)}
            onDoubleClick={(e) => handleWordDoubleClick(e, idx)}
            className={`
              inline cursor-pointer rounded-sm px-0.5 transition-colors
              ${isActive ? "bg-primary/20 text-primary font-semibold" : ""}
              ${isSearchHit ? "bg-yellow-500/25" : ""}
              ${!isActive && !isSearchHit ? "hover:bg-secondary/50" : ""}
            `}
          >
            {w.word}
          </span>
          {w.segBreakAfter ? <><br /><br /></> : (idx < allWords.length - 1 ? " " : "")}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 min-h-[40px]">
        <div className="flex-1">
          {searchOpen ? (
            <SubtitleSearch
              searchText={transcriptSearch} setSearchText={setTranscriptSearch}
              matchCount={matches.length} matchIdx={matchIdx}
              onPrev={() => navMatch(-1)} onNext={() => navMatch(1)}
              onClose={() => { setSearchOpen(false); setTranscriptSearch(""); setMatchIdx(0); }}
            />
          ) : (
            <button onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 px-2.5 h-8 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              <Search className="h-4 w-4" /> Search
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
      <ScrollArea className="flex-1">
        <div className="px-5 py-4 text-sm text-foreground/90 leading-relaxed">
          {renderWords()}
        </div>
      </ScrollArea>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  EDIT SUBTITLES TAB — with playback-following active word
// ════════════════════════════════════════════════════════════════
function EditSubtitlesTab() {
  const editSegments = useSubtitleStore((s) => s.editSegments);
  const activeSegId = useSubtitleStore((s) => s.activeSegId);
  const setActiveSegId = useSubtitleStore((s) => s.setActiveSegId);
  const selectedWordInfo = useSubtitleStore((s) => s.selectedWordInfo);
  const setSelectedWordInfo = useSubtitleStore((s) => s.setSelectedWordInfo);
  const transcriptSearch = useSubtitleStore((s) => s.transcriptSearch);
  const setTranscriptSearch = useSubtitleStore((s) => s.setTranscriptSearch);
  const splitSegment = useSubtitleStore((s) => s.splitSegment);
  const mergeSegment = useSubtitleStore((s) => s.mergeSegment);
  const updateWordInSegment = useSubtitleStore((s) => s.updateWordInSegment);
  const createSegmentAtTime = useSubtitleStore((s) => s.createSegmentAtTime);
  const deleteSegment = useSubtitleStore((s) => s.deleteSegment);
  // #57 Phase C: drop the 60Hz currentTime/syncOffset subs. The per-word
  // highlight is driven by store-derived activeSubtitleWordIdx (word index
  // within the active seg, computed in setCurrentTime via forward-scan).
  // The whole tab now re-renders only on seg or word transitions — not every frame.
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const playing = usePlaybackStore((s) => s.playing);
  const activeSubtitleWordIdx = usePlaybackStore((s) => s.activeSubtitleWordIdx);

  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [editingWord, setEditingWord] = useState(null); // { segId, wordIdx }

  // Clear explicit word selection when playback starts, so playback highlight takes over
  useEffect(() => {
    if (playing) setSelectedWordInfo(null);
  }, [playing, setSelectedWordInfo]);

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

  // Auto-track active segment from playhead position.
  // #57 Phase B: read store-derived `activeSubtitleSegId` (computed inside
  // setCurrentTime via forward-scan) instead of re-scanning editSegments every
  // 60fps frame. This effect now fires only on segment-boundary crossings.
  // Only auto-track during playback — when user explicitly selects a segment
  // (selectedWordInfo is set), let their selection take precedence until playback resumes.
  const activeSubtitleSegId = usePlaybackStore((s) => s.activeSubtitleSegId);
  const activeSegRef = useRef(null);
  useEffect(() => {
    if (selectedWordInfo && !playing) return;
    if (activeSubtitleSegId && activeSubtitleSegId !== activeSegId) {
      setActiveSegId(activeSubtitleSegId);
    }
  }, [activeSubtitleSegId, activeSegId, setActiveSegId, selectedWordInfo, playing]);

  // Auto-scroll active segment into view
  useEffect(() => {
    if (activeSegRef.current) {
      activeSegRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeSegId]);

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

  const handleEditConfirm = (segId, wordIdx, newText) => {
    if (!newText) {
      // Empty text — delete the word from the segment
      const seg = editSegments.find(s => s.id === segId);
      if (!seg) { setEditingWord(null); return; }
      const textWords = seg.text.split(/\s+/).filter(Boolean);
      if (textWords.length <= 1) {
        // Last word in segment — delete the entire segment
        deleteSegment(segId);
      } else {
        // Remove just this word
        textWords.splice(wordIdx, 1);
        useSubtitleStore.getState().updateSegmentText(segId, textWords.join(" "));
      }
    } else {
      updateWordInSegment(segId, wordIdx, newText);
    }
    setEditingWord(null);
  };

  // #57 Phase C: active-word-in-seg is now derived inside the store
  // (see usePlaybackStore._findActiveWordInSeg). Only the active segment has
  // a live word index — all others get -1, so their rendered output is stable
  // and React skips reconciling them on playback ticks.
  const renderWords = (seg) => {
    const textWords = seg.text.split(/(\s+)/);
    let wordIdx = 0;
    const activeWordInSeg = seg.id === activeSubtitleSegId ? activeSubtitleWordIdx : -1;

    return textWords.map((token, i) => {
      if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;

      const currentWordIdx = wordIdx;
      wordIdx++;
      const isSelected = selectedWordInfo?.segId === seg.id && selectedWordInfo?.wordIdx === currentWordIdx;
      // Prioritize explicit user selection over playback-derived highlight
      // This prevents the "off-by-one" where clicking a word highlights the prior one
      // because seekTo hasn't updated currentTime yet
      const isPlaybackActive = !selectedWordInfo && currentWordIdx === activeWordInSeg;
      const isHighlighted = isSelected || isPlaybackActive;
      const isEditing = editingWord?.segId === seg.id && editingWord?.wordIdx === currentWordIdx;

      if (isEditing) {
        return (
          <InlineWordEditor
            key={i}
            initialText={token}
            onConfirm={(t) => handleEditConfirm(seg.id, currentWordIdx, t)}
            onCancel={() => setEditingWord(null)}
            selectAll={editingWord?.selectAll}
          />
        );
      }

      return (
        <span
          key={i}
          className={`
            inline-block cursor-pointer rounded px-0.5 transition-colors
            ${isHighlighted ? "bg-primary/20 text-primary font-semibold" : ""}
            ${!isHighlighted ? "hover:bg-secondary/60" : ""}
          `}
          onClick={(e) => { e.stopPropagation(); handleWordClick(seg, currentWordIdx); setEditingWord({ segId: seg.id, wordIdx: currentWordIdx, selectAll: false }); }}
          onDoubleClick={(e) => { e.stopPropagation(); setEditingWord({ segId: seg.id, wordIdx: currentWordIdx, selectAll: true }); }}
        >
          {token}
        </span>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 min-h-[40px]">
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={`h-8 w-8 flex items-center justify-center rounded transition-colors shrink-0 ${
            searchOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <Search className="h-4 w-4" />
        </button>

        <SegmentModeDropdown />

        <div className="flex-1" />

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                onClick={() => {
                  const time = usePlaybackStore.getState().currentTime;
                  const newId = createSegmentAtTime(time);
                  if (newId) setEditingWord({ segId: newId, wordIdx: 0, selectAll: true, isNew: true });
                }}
              >
                <Plus className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Add subtitle at playhead</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-30"
                onClick={() => splitSegment()} disabled={!activeSegId}
              >
                <Scissors className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Split at selected word</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-30"
                onClick={() => mergeSegment()} disabled={!activeSegId}
              >
                <Merge className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Merge with next</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <SubtitleSettingsPopover />
      </div>

      {searchOpen && (
        <div className="px-3 pb-2">
          <SubtitleSearch
            searchText={transcriptSearch} setSearchText={setTranscriptSearch}
            matchCount={matches.length} matchIdx={matchIdx}
            onPrev={() => navMatch(-1)} onNext={() => navMatch(1)}
            onClose={() => { setSearchOpen(false); setTranscriptSearch(""); setMatchIdx(0); }}
          />
        </div>
      )}

      <Separator />

      {/* Segments with compact timecodes above text + active word tracking */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {editSegments.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No subtitle segments</div>
          )}
          {editSegments.map((seg) => {
            const isActive = activeSegId === seg.id;

            return (
              <div
                key={seg.id}
                ref={isActive ? activeSegRef : null}
                onClick={() => handleSegClick(seg)}
                className={`group relative cursor-pointer transition-colors border-b border-border/30 ${isActive ? "bg-primary/8" : "hover:bg-secondary/30"}`}
              >
                {/* Active segment left border */}
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-r" />}

                <div className="px-3 py-2.5">
                  {/* Compact timecode row */}
                  <div className="flex items-center gap-2 mb-1">
                    <TimecodePopover segment={seg}>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-mono text-muted-foreground hover:text-amber-400 transition-colors cursor-pointer"
                      >
                        {seg.start} — {seg.end}
                      </button>
                    </TimecodePopover>
                    <span className="text-xs text-muted-foreground ml-auto">{seg.dur}</span>
                    {/* ALL CAPS toggle */}
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const isAllCaps = seg.text === seg.text.toUpperCase() && seg.text.length > 0;
                              const newText = isAllCaps ? seg.text.toLowerCase() : seg.text.toUpperCase();
                              useSubtitleStore.getState().updateSegmentText(seg.id, newText);
                            }}
                            className={`h-5 px-1.5 rounded text-[9px] font-bold transition-colors cursor-pointer ${
                              seg.text === seg.text.toUpperCase() && seg.text.length > 0
                                ? "bg-primary/20 text-primary border border-primary/30"
                                : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/40 border border-transparent"
                            }`}
                          >
                            AA
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Toggle ALL CAPS</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* Delete button — visible on hover */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="dark w-[200px] p-0 bg-[hsl(240_6%_10%)] border-[hsl(240_4%_20%)]" side="bottom" align="end" sideOffset={4}>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSegment(seg.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" /> Delete subtitle only
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Delete subtitle + overlapping audio segment
                            const edStore = useEditorStore.getState();
                            const audioSegs = edStore.audioSegments;
                            const overlapping = audioSegs.filter(
                              a => a.startSec < seg.endSec && a.endSec > seg.startSec
                            );
                            // Delete subtitle first
                            useSubtitleStore.getState().rippleDeleteSegment(seg.id);
                            // Delete overlapping audio segments + their subtitles
                            overlapping.forEach(a => {
                              const subStore = useSubtitleStore.getState();
                              const innerSubs = subStore.editSegments.filter(
                                s => s.startSec >= a.startSec && s.endSec <= a.endSec
                              );
                              innerSubs.forEach(s => subStore.rippleDeleteSegment(s.id));
                              edStore.rippleDeleteAudioSegment(a.id);
                            });
                          }}
                        >
                          <Film className="h-3.5 w-3.5 text-red-500" /> Delete subtitle + clip
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Segment text — show inline editor for empty (newly created) segments */}
                  <div className="text-sm text-foreground/90 leading-relaxed break-words">
                    {seg.text === "" && editingWord?.segId === seg.id ? (
                      <InlineWordEditor
                        initialText=""
                        onConfirm={(t) => {
                          if (t.trim()) {
                            useSubtitleStore.getState().updateSegmentText(seg.id, t.trim());
                          } else {
                            deleteSegment(seg.id);
                          }
                          setEditingWord(null);
                        }}
                        onCancel={() => { deleteSegment(seg.id); setEditingWord(null); }}
                        selectAll={false}
                      />
                    ) : seg.text === "" ? (
                      <span
                        className="text-muted-foreground/40 italic cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setEditingWord({ segId: seg.id, wordIdx: 0, selectAll: true, isNew: true }); }}
                      >
                        Click to type...
                      </span>
                    ) : (
                      renderWords(seg)
                    )}
                  </div>

                  {isActive && seg.warning && (
                    <div className="mt-1"><span className="text-xs text-amber-500/70">{seg.warning}</span></div>
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
//  LEFT PANEL
// ════════════════════════════════════════════════════════════════
export default function LeftPanelNew() {
  const lpTab = useLayoutStore((s) => s.lpTab);
  const setLpTab = useLayoutStore((s) => s.setLpTab);

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      <div className="px-3 pt-3 pb-1.5 shrink-0">
        <div className="flex rounded-lg bg-secondary/40 p-0.5">
          <button
            onClick={() => setLpTab("transcript")}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
              lpTab === "transcript" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Transcript
          </button>
          <button
            onClick={() => setLpTab("edit-subtitles")}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
              lpTab === "edit-subtitles" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Edit subtitles
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {lpTab === "transcript" ? <TranscriptTab /> : <EditSubtitlesTab />}
      </div>
    </div>
  );
}
