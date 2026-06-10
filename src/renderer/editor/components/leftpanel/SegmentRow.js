import React, { forwardRef, useState, useEffect } from "react";
import { Button } from "../../../../components/ui/button";
import { Slider } from "../../../../components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../../components/ui/tooltip";
import { Trash2, Film } from "lucide-react";
import useSubtitleStore from "../../stores/useSubtitleStore";
import useEditorStore from "../../stores/useEditorStore";
import usePlaybackStore from "../../stores/usePlaybackStore";
import { timelineToSource, sourceToTimeline } from "../../models/timeMapping";
import { fmtTime, parseTime } from "../../utils/timeUtils";
import { InlineWordEditor } from "./InlineWordEditor";

// ════════════════════════════════════════════════════════════════
//  TIMECODE POPOVER — local ±5s range slider, not full video
// ════════════════════════════════════════════════════════════════
function TimecodePopover({ segment, children }) {
  const updateSegmentTimes = useSubtitleStore((s) => s.updateSegmentTimes);
  const editSegments = useSubtitleStore((s) => s.editSegments);
  const nleSegments = useEditorStore((s) => s.nleSegments);

  // The `segment` prop is the timeline-mapped render copy (#66/#77). Edits must
  // write SOURCE-absolute time, so the slider/clamp/apply work entirely in source
  // time off the raw store segment. Only the two displayed numbers are translated
  // to/from timeline time so they match the segment row instead of showing the
  // full-recording source timecode.
  const toTimeline = (src) => {
    const m = sourceToTimeline(src, nleSegments || []);
    return m.found ? m.timelineTime : src;
  };
  const toSource = (tl) => {
    const m = timelineToSource(tl, nleSegments || []);
    return m.found ? m.sourceTime : tl;
  };
  const segIdx = editSegments.findIndex((s) => s.id === segment.id);
  const seg = segIdx >= 0 ? editSegments[segIdx] : segment;
  const [localStart, setLocalStart] = useState(seg.startSec);
  const [localEnd, setLocalEnd] = useState(seg.endSec);
  const [open, setOpen] = useState(false);

  // Find neighbor boundaries to prevent overlap
  const prevSeg = segIdx > 0 ? editSegments[segIdx - 1] : null;
  const nextSeg = segIdx < editSegments.length - 1 ? editSegments[segIdx + 1] : null;

  // Slider range: ±5s around current segment, clamped to neighbors and the
  // clip's SOURCE extent. Everything here is source-absolute (matches
  // updateSegmentTimes); do NOT use playback `duration`, which is timeline time
  // and would collapse the range for a mid-source clip (#13).
  const startMap = sourceToTimeline(seg.startSec, nleSegments || []);
  const containingNle = startMap.found ? nleSegments[startMap.segmentIndex] : null;
  const clipSrcStart = containingNle ? containingNle.sourceStart : 0;
  const clipSrcEnd = containingNle ? containingNle.sourceEnd : seg.endSec + 10;
  const sliderMin = Math.max(clipSrcStart, prevSeg ? prevSeg.endSec : seg.startSec - 5);
  const sliderMax = Math.min(clipSrcEnd, nextSeg ? nextSeg.startSec : seg.endSec + 5);
  const minGap = 0.1;

  useEffect(() => {
    if (open) {
      setLocalStart(seg.startSec);
      setLocalEnd(seg.endSec);
    }
  }, [open, seg.startSec, seg.endSec]);

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
              value={fmtTime(toTimeline(localStart))}
              onChange={(e) => {
                const tl = parseTime(e.target.value);
                if (!isNaN(tl)) handleRangeChange([toSource(tl), localEnd]);
              }}
              className="w-[72px] h-6 px-0.5 text-xs font-mono text-center rounded bg-[hsl(240_6%_15%)] border border-[hsl(240_4%_22%)] text-white outline-none focus:border-primary/50"
            />
            <span className="text-[hsl(240_5%_50%)] text-xs">–</span>
            <input
              value={fmtTime(toTimeline(localEnd))}
              onChange={(e) => {
                const tl = parseTime(e.target.value);
                if (!isNaN(tl)) handleRangeChange([localStart, toSource(tl)]);
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
//  SEGMENT ROW (#57 Phase D2)
//  One row of the Edit Subtitles list, wrapped in React.memo so that during
//  playback only the row whose active word changed re-renders — the other ~199
//  rows bail out because their props are referentially stable. The parent
//  (EditSubtitlesTab) still subscribes to currentTime and computes each row's
//  isActive / activeWordInSeg, but the heavy per-row reconcile (text split + word
//  spans) no longer runs 100–200×/frame.
//
//  Highlight DECISION logic is UNCHANGED — it was relocated here verbatim and now
//  reads its inputs from props instead of closures:
//    seg              — timeline-mapped segment (from getTimelineMappedSegments memo)
//    isActive         — activeSegId === seg.id
//    activeWordInSeg  — playback-derived active word index in this seg, or -1
//    selectedWordIdx  — this seg's explicitly-selected word, or -1
//    anySelected      — !!selectedWordInfo (global: an explicit selection suppresses
//                       playback highlight everywhere — preserves the original rule)
//    editing          — this row's editingWord slice ({wordIdx,selectAll,isNew}) or null
//    setEditingWord   — parent useState setter (stable across renders)
//  ref is forwarded to the root div; the parent attaches it only to the active row
//  for its auto-scroll-into-view effect.
// ════════════════════════════════════════════════════════════════
const SegmentRow = React.memo(forwardRef(function SegmentRow(
  { seg, isActive, activeWordInSeg, selectedWordIdx, anySelected, editing, setEditingWord },
  ref
) {
  // Store actions are read via getState() inside handlers (event-time, never render
  // path) so they don't need to be threaded as props — keeps the prop set small and
  // stable so React.memo can bail on inactive rows.
  const handleSegClick = () => {
    useSubtitleStore.getState().setActiveSegId(seg.id);
    usePlaybackStore.getState().seekTo(seg.startSec);
  };

  const handleWordClick = (wordIdx) => {
    useSubtitleStore.getState().setActiveSegId(seg.id);
    useSubtitleStore.getState().setSelectedWordInfo({ segId: seg.id, wordIdx });
    // wordIdx is a text-token index; seg.words is the trim-FILTERED timeline
    // list, so positional indexing seeks the wrong word once a trim has dropped
    // words from this segment (#131). Find the word by its original index; if
    // the clicked word itself was trimmed away, seek the nearest surviving one.
    const words = seg.words || [];
    const target =
      words.find((w, j) => (w.srcWordIdx ?? j) === wordIdx) ||
      words.find((w, j) => (w.srcWordIdx ?? j) > wordIdx) ||
      words[words.length - 1];
    if (target) usePlaybackStore.getState().seekTo(target.start);
  };

  const handleEditConfirm = (wordIdx, newText) => {
    const sub = useSubtitleStore.getState();
    if (!newText) {
      // Empty text — delete the word. The store action removes it from text AND
      // words[] together (#136), and deletes the whole segment on the last word.
      sub.deleteWordInSegment(seg.id, wordIdx);
    } else {
      sub.updateWordInSegment(seg.id, wordIdx, newText);
    }
    setEditingWord(null);
  };

  const renderWords = () => {
    const textWords = seg.text.split(/(\s+)/);
    let wordIdx = 0;

    return textWords.map((token, i) => {
      if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;

      const currentWordIdx = wordIdx;
      wordIdx++;
      const isSelected = selectedWordIdx === currentWordIdx;
      // Prioritize explicit user selection over playback-derived highlight.
      // This prevents the "off-by-one" where clicking a word highlights the prior one
      // because seekTo hasn't updated currentTime yet. `anySelected` mirrors the
      // original global `!selectedWordInfo` guard (selection suppresses playback
      // highlight everywhere, not just in this segment).
      const isPlaybackActive = !anySelected && currentWordIdx === activeWordInSeg;
      const isHighlighted = isSelected || isPlaybackActive;
      const isEditing = editing?.wordIdx === currentWordIdx;

      if (isEditing) {
        return (
          <InlineWordEditor
            key={i}
            initialText={token}
            onConfirm={(t) => handleEditConfirm(currentWordIdx, t)}
            onCancel={() => setEditingWord(null)}
            selectAll={editing?.selectAll}
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
          onClick={(e) => { e.stopPropagation(); handleWordClick(currentWordIdx); setEditingWord({ segId: seg.id, wordIdx: currentWordIdx, selectAll: false }); }}
          onDoubleClick={(e) => { e.stopPropagation(); setEditingWord({ segId: seg.id, wordIdx: currentWordIdx, selectAll: true }); }}
        >
          {token}
        </span>
      );
    });
  };

  return (
    <div
      ref={ref}
      onClick={handleSegClick}
      className={`group relative cursor-pointer transition-colors border-b border-border/30 ${isActive ? "bg-primary/8" : "hover:bg-secondary/30"}`}
    >
      {/* Active segment left border */}
      {isActive && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-r" />}

      <div className="px-3 py-2.5">
        {/* Compact timecode row */}
        <div className="flex items-center gap-2 mb-1">
          <TimecodePopover segment={seg}>
            <button
              onClick={(e) => {
                // Select the segment (highlights it on the timeline too)
                // but don't seek — opening a timecode editor isn't navigation.
                // selectedWordInfo makes the selection stick when paused
                // (the playhead auto-track guard), matching a timeline click.
                e.stopPropagation();
                useSubtitleStore.getState().setActiveSegId(seg.id);
                useSubtitleStore.getState().setSelectedWordInfo({ segId: seg.id, wordIdx: 0 });
              }}
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
                    // Treat as ALL CAPS only when there's a cased letter — a digits/
                    // punctuation/emoji-only caption (e.g. "123") equals its own
                    // toUpperCase(), which would falsely show "on" and make the toggle
                    // a silent no-op (#129).
                    const isAllCaps = /[a-z]/i.test(seg.text) && seg.text === seg.text.toUpperCase();
                    const newText = isAllCaps ? seg.text.toLowerCase() : seg.text.toUpperCase();
                    useSubtitleStore.getState().updateSegmentText(seg.id, newText);
                  }}
                  className={`h-5 px-1.5 rounded text-[9px] font-bold transition-colors cursor-pointer ${
                    /[a-z]/i.test(seg.text) && seg.text === seg.text.toUpperCase()
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
                  useSubtitleStore.getState().deleteSegment(seg.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" /> Delete subtitle only
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  // "Delete subtitle + clip" — cut only this subtitle's span out
                  // of the NLE timeline. Shared store action (#109) so this row
                  // menu and the timeline right-click menu stay in lockstep.
                  useEditorStore.getState().deleteSpanWithClip("sub", seg.id);
                }}
              >
                <Film className="h-3.5 w-3.5 text-red-500" /> Delete subtitle + clip
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Segment text — show inline editor for empty (newly created) segments */}
        <div className="text-sm text-foreground/90 leading-relaxed break-words">
          {seg.text === "" && editing ? (
            <InlineWordEditor
              initialText=""
              onConfirm={(t) => {
                if (t.trim()) {
                  useSubtitleStore.getState().updateSegmentText(seg.id, t.trim());
                } else {
                  useSubtitleStore.getState().deleteSegment(seg.id);
                }
                setEditingWord(null);
              }}
              onCancel={() => { useSubtitleStore.getState().deleteSegment(seg.id); setEditingWord(null); }}
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
            renderWords()
          )}
        </div>

        {isActive && seg.warning && (
          <div className="mt-1"><span className="text-xs text-amber-500/70">{seg.warning}</span></div>
        )}
      </div>
    </div>
  );
}));

export default SegmentRow;
