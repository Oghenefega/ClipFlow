import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Separator } from "../../../components/ui/separator";
import { ScrollArea } from "../../../components/ui/scroll-area";
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
} from "lucide-react";
import useSubtitleStore from "../stores/useSubtitleStore";
import usePlaybackStore from "../stores/usePlaybackStore";
import useLayoutStore from "../stores/useLayoutStore";
import useEditorStore from "../stores/useEditorStore";
import { timelineToSource } from "../models/timeMapping";
import { InlineWordEditor } from "./leftpanel/InlineWordEditor";
import SegmentRow from "./leftpanel/SegmentRow";

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
  const rawOriginalSegments = useSubtitleStore((s) => s.originalSegments);
  const nleSegments = useEditorStore((s) => s.nleSegments);
  // #66/#77: render the clip range in timeline time (not the whole source recording).
  // Recomputes only when the source segments or NLE layout change.
  const originalSegments = useMemo(
    () => useSubtitleStore.getState().getTimelineMappedOriginalSegments(),
    [rawOriginalSegments, nleSegments]
  );
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const transcriptSearch = useSubtitleStore((s) => s.transcriptSearch);
  const setTranscriptSearch = useSubtitleStore((s) => s.setTranscriptSearch);
  const updateWordInSegment = useSubtitleStore((s) => s.updateWordInSegment);
  const syncOffset = useSubtitleStore((s) => s.syncOffset);
  const adjustedTime = currentTime - syncOffset;

  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [editingWord, setEditingWord] = useState(null); // { globalIdx }

  // Build flat word list with segment context for editing.
  // Each word carries segId + segWordIdx so a clicked/edited word maps back to its segment.
  // No paragraph breaks — the transcript flows as one continuous, naturally-wrapping paragraph.
  const allWords = useMemo(() => {
    const words = [];
    originalSegments.forEach((seg) => {
      let segWordIdx = 0;
      if (seg.words && seg.words.length > 0) {
        seg.words.forEach((w) => {
          words.push({
            ...w, segId: seg.id, segWordIdx: segWordIdx++,
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

  const activeWordIdx = useMemo(() => {
    for (let i = allWords.length - 1; i >= 0; i--) {
      if (adjustedTime >= allWords[i].start) return i;
    }
    return -1;
  }, [allWords, adjustedTime]);

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
          {idx < allWords.length - 1 ? " " : ""}
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
  const rawEditSegments = useSubtitleStore((s) => s.editSegments);
  const nleSegments = useEditorStore((s) => s.nleSegments);
  // #66/#77: render/highlight/seek from the clip-range, timeline-mapped list
  // (same transform the preview overlay uses). Edit actions stay keyed by id on
  // the raw store, so split/merge/delete/word-edit are unaffected.
  const editSegments = useMemo(
    () => useSubtitleStore.getState().getTimelineMappedSegments(),
    [rawEditSegments, nleSegments]
  );
  const activeSegId = useSubtitleStore((s) => s.activeSegId);
  const setActiveSegId = useSubtitleStore((s) => s.setActiveSegId);
  const selectedWordInfo = useSubtitleStore((s) => s.selectedWordInfo);
  const setSelectedWordInfo = useSubtitleStore((s) => s.setSelectedWordInfo);
  const transcriptSearch = useSubtitleStore((s) => s.transcriptSearch);
  const setTranscriptSearch = useSubtitleStore((s) => s.setTranscriptSearch);
  const splitSegment = useSubtitleStore((s) => s.splitSegment);
  const mergeSegment = useSubtitleStore((s) => s.mergeSegment);
  const createSegmentAtTime = useSubtitleStore((s) => s.createSegmentAtTime);
  const syncOffset = useSubtitleStore((s) => s.syncOffset);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const adjustedTime = currentTime - syncOffset;

  const playing = usePlaybackStore((s) => s.playing);

  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [editingWord, setEditingWord] = useState(null); // { segId, wordIdx }

  // Clear explicit word selection when playback starts, so playback highlight takes over
  useEffect(() => {
    if (playing) setSelectedWordInfo(null);
  }, [playing, setSelectedWordInfo]);

  // ...and while ALREADY playing: the effect above only fires on the pause→play
  // transition, so a mid-playback word click froze the karaoke highlight for
  // every segment until the next pause/play (#132). Hand the highlight back once
  // the VIDEO has reached the clicked word — not before: seekTo writes the store
  // time synchronously, so without the vid.seeking guard this would clear on the
  // click's own render and re-expose the highlight flicker the selection masks.
  // Selections without a clickTime (timecode button, timeline block click) clear
  // immediately during playback; paused stickiness is unchanged.
  useEffect(() => {
    if (!playing || !selectedWordInfo) return;
    const t = selectedWordInfo.clickTime;
    const vid = usePlaybackStore.getState().getVideoRef()?.current;
    if (t == null || (adjustedTime >= t - 0.05 && !(vid && vid.seeking))) {
      setSelectedWordInfo(null);
    }
  }, [playing, adjustedTime, selectedWordInfo, setSelectedWordInfo]);

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

  // Auto-track active segment from playhead position
  // Only auto-track during playback — when user explicitly selects a segment
  // (selectedWordInfo is set), let their selection take precedence until playback resumes
  const activeSegRef = useRef(null);
  useEffect(() => {
    // Don't override explicit user selection — only auto-track during playback
    if (selectedWordInfo && !playing) return;
    // Half-open interval [startSec, endSec): adjacent segments share a boundary
    // (A.endSec === B.startSec), so an inclusive `<= endSec` made find() return
    // the segment ENDING at that instant (it sorts first) — clicking a row seeks
    // to its startSec and the active bar jumped up to the previous segment.
    const currentSeg = editSegments.find(
      (s) => adjustedTime >= s.startSec && adjustedTime < s.endSec
    );
    if (currentSeg && currentSeg.id !== activeSegId) {
      setActiveSegId(currentSeg.id);
    }
  }, [adjustedTime, editSegments, activeSegId, setActiveSegId, selectedWordInfo, playing]);

  // Auto-scroll active segment into view
  useEffect(() => {
    if (activeSegRef.current) {
      activeSegRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeSegId]);

  // Find active word index within a segment based on playback time
  // Uses "most recent word" approach to bridge gaps between words
  // Respects segment timeline boundaries — no highlighting outside startSec/endSec
  // Returns a TEXT-space index: seg.words is the trim-FILTERED timeline list but
  // SegmentRow compares against full-text token positions, so the filtered
  // position is mapped back through srcWordIdx (#131). Identity fallback covers
  // unmapped lists (no NLE data), which are 1:1 with the text.
  const getActiveWordInSeg = useCallback((seg) => {
    if (!seg.words || seg.words.length === 0) return -1;
    // Must be within segment's timeline boundaries — half-open [startSec, endSec)
    // so the shared boundary with the next segment belongs to that next segment,
    // not this one (else both segments' boundary words highlight at once).
    if (adjustedTime < seg.startSec || adjustedTime >= seg.endSec) return -1;
    const textIdx = (i) => seg.words[i].srcWordIdx ?? i;
    // Exact match first
    for (let i = seg.words.length - 1; i >= 0; i--) {
      if (adjustedTime >= seg.words[i].start && adjustedTime <= seg.words[i].end) return textIdx(i);
    }
    // Fallback: most recent word that started (bridges inter-word gaps)
    let best = -1;
    for (let i = 0; i < seg.words.length; i++) {
      if (adjustedTime >= seg.words[i].start) best = i;
      else break;
    }
    if (best >= 0 && adjustedTime <= seg.words[best].end + 0.5) return textIdx(best);
    return -1;
  }, [adjustedTime]);

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
                  // currentTime is timeline time; createSegmentAtTime expects
                  // source-absolute, so map it back through the NLE segments (#66/#77).
                  const tlTime = usePlaybackStore.getState().currentTime;
                  const map = timelineToSource(tlTime, nleSegments || []);
                  const srcTime = map.found ? map.sourceTime : tlTime;
                  const newId = createSegmentAtTime(srcTime);
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
            // Compute the per-row inputs here in the parent (which subscribes to
            // currentTime) and pass them as referentially-stable props so the
            // React.memo'd SegmentRow re-renders only when ITS values change —
            // during playback that's just the one row whose active word moved (#57 D2).
            const activeWordInSeg = getActiveWordInSeg(seg);
            const selectedWordIdx =
              selectedWordInfo?.segId === seg.id ? selectedWordInfo.wordIdx : -1;
            const editing =
              editingWord && editingWord.segId === seg.id ? editingWord : null;

            return (
              <SegmentRow
                key={seg.id}
                ref={isActive ? activeSegRef : undefined}
                seg={seg}
                isActive={isActive}
                activeWordInSeg={activeWordInSeg}
                selectedWordIdx={selectedWordIdx}
                anySelected={!!selectedWordInfo}
                editing={editing}
                setEditingWord={setEditingWord}
              />
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
