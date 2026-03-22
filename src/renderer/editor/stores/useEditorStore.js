import { create } from "zustand";
import useSubtitleStore from "./useSubtitleStore";
import useCaptionStore from "./useCaptionStore";
import usePlaybackStore from "./usePlaybackStore";
import { BUILTIN_TEMPLATE, applyTemplate } from "../utils/templateUtils";
const useEditorStore = create((set, get) => ({
  // ── Core data ──
  project: null,
  clip: null,
  clipTitle: "",
  editingTitle: false,
  dirty: false,
  waveformPeaks: null,
  // Audio segments — array of { id, startSec, endSec }
  // Used by timeline for visual rendering AND by preview for playback control
  audioSegments: [],
  // Source boundaries — used for clip extension
  // sourceStartTime: where this clip starts in the source video (seconds)
  // sourceEndTime: where this clip ends in the source video (seconds)
  // sourceDuration: total duration of the source video (seconds)
  // maxExtendSec: maximum clip-relative time this clip can extend to
  sourceStartTime: 0,
  sourceEndTime: 0,
  sourceDuration: 0,
  maxExtendSec: 0,
  maxExtendLeftSec: 0, // how far LEFT the clip can extend (= clip.startTime in source)
  extending: false, // true while an extend operation is in progress
  videoVersion: 0, // incremented on clip re-cut to bust video cache

  // ── Actions ──
  initFromContext: async (editorContext, localProjects) => {
    if (!editorContext) {
      set({ project: null, clip: null, clipTitle: "", dirty: false });
      return;
    }

    // CRITICAL: Clear all stores BEFORE async load to prevent old data leaking
    // into the new clip while the project loads from disk
    useSubtitleStore.getState().clearAll();
    useCaptionStore.getState().initFromClip(null);
    usePlaybackStore.getState().reset();
    set({ clip: null, project: null, clipTitle: "Loading...", dirty: false, waveformPeaks: null, audioSegments: [] });

    // Load full project via IPC — localProjects are summaries without clips
    let project = null;
    let clip = null;
    try {
      const result = await window.clipflow.projectLoad(editorContext.projectId);
      if (result && !result.error && result.project) {
        project = result.project;
        clip = (project.clips || []).find((c) => c.id === editorContext.clipId) || null;
      }
    } catch (e) {
      // Fallback to summary (won't have clips, but prevents crash)
      project = localProjects.find((p) => p.id === editorContext.projectId) || null;
    }

    // Compute source boundaries for clip extension
    const sourceStart = clip?.startTime || 0;
    const sourceEnd = clip?.endTime || 0;
    const sourceDur = project?.sourceDuration || 0;
    const clipDuration = sourceEnd > sourceStart ? sourceEnd - sourceStart : 0;
    // Maximum clip-relative time = how far the clip can extend into the source
    const maxExtend = sourceDur > 0 ? sourceDur - sourceStart : clipDuration;

    set({
      project,
      clip,
      clipTitle: clip?.title || "Untitled Clip",
      editingTitle: false,
      dirty: false,
      sourceStartTime: sourceStart,
      sourceEndTime: sourceEnd,
      sourceDuration: sourceDur,
      maxExtendSec: maxExtend > 0 ? maxExtend : clipDuration,
      maxExtendLeftSec: sourceStart, // how many seconds we can extend backwards
      extending: false,
    });

    // Initialize other stores from clip data
    useCaptionStore.getState().initFromClip(clip);
    useSubtitleStore.getState().initSegments(project, clip);
    usePlaybackStore.getState().reset();

    // Auto-apply default template on editor open
    // Load the user's chosen default template (or fall back to built-in)
    if (window.clipflow?.storeGet) {
      Promise.all([
        window.clipflow.storeGet("defaultTemplateId"),
        window.clipflow.storeGet("layoutTemplates"),
        window.clipflow.storeGet("builtInTemplateDeleted"),
      ]).then(([defaultId, savedTemplates, builtInDeleted]) => {
        const id = defaultId || "fega-default";
        const allTemplates = [
          ...(builtInDeleted ? [] : [BUILTIN_TEMPLATE]),
          ...(Array.isArray(savedTemplates) ? savedTemplates : []),
        ];
        const tpl = allTemplates.find((t) => t.id === id) || allTemplates[0];
        if (tpl) applyTemplate(tpl);
        // Clear undo/redo stacks — user should not be able to undo past initial state
        useSubtitleStore.setState({ _undoStack: [], _redoStack: [], _lastUndoPushTime: 0 });
      }).catch(() => {
        // Fallback: apply built-in template
        applyTemplate(BUILTIN_TEMPLATE);
        useSubtitleStore.setState({ _undoStack: [], _redoStack: [], _lastUndoPushTime: 0 });
      });
    } else {
      applyTemplate(BUILTIN_TEMPLATE);
      useSubtitleStore.setState({ _undoStack: [], _redoStack: [], _lastUndoPushTime: 0 });
    }

    // Reset waveform (real extraction via FFmpeg in main process — TODO)
    set({ waveformPeaks: null });

    // Set AI game from project data
    if (project?.game) {
      // Defer to avoid import cycle — useAIStore imported lazily
      setTimeout(() => {
        try {
          const useAIStore = require("./useAIStore").default;
          useAIStore.getState().setAiGame(project.game);
        } catch (e) { /* ignore */ }
      }, 0);
    }
  },

  setClipTitle: (title) => set({ clipTitle: title }),
  setEditingTitle: (v) => set({ editingTitle: v }),
  setDirty: (v) => set({ dirty: v }),
  markDirty: () => set({ dirty: true }),
  setWaveformPeaks: (peaks) => set({ waveformPeaks: peaks }),

  // ── Audio segment actions ──
  setAudioSegments: (segs) => set({ audioSegments: segs }),

  initAudioSegments: (duration) => {
    const { audioSegments } = get();
    if (audioSegments.length === 0 && duration > 0) {
      set({ audioSegments: [{ id: "audio-1", startSec: 0, endSec: duration }] });
    }
  },

  _pushAudioUndo: () => {
    try {
      const subStore = require("./useSubtitleStore").default;
      subStore.getState()._pushUndo();
    } catch (_) {}
  },

  splitAudioSegment: (time) => {
    get()._pushAudioUndo();
    set((s) => {
      const seg = s.audioSegments.find((seg) => time > seg.startSec + 0.05 && time < seg.endSec - 0.05);
      if (!seg) return s;
      const newId = `audio-${Date.now()}`;
      return {
        audioSegments: s.audioSegments.flatMap((as) => {
          if (as.id !== seg.id) return [as];
          return [
            { ...as, endSec: time },
            { id: newId, startSec: time, endSec: as.endSec },
          ];
        }),
      };
    });
  },

  deleteAudioSegment: (segId) => {
    get()._pushAudioUndo();
    set((s) => ({
      audioSegments: s.audioSegments.filter((seg) => seg.id !== segId),
    }));
    get()._trimToAudioBounds();
  },

  rippleDeleteAudioSegment: (segId) => {
    get()._pushAudioUndo();
    const { audioSegments } = get();
    const seg = audioSegments.find(s => s.id === segId);
    if (!seg) return;
    const gap = seg.endSec - seg.startSec;
    const next = audioSegments
      .filter(s => s.id !== segId)
      .map(s => {
        if (s.startSec >= seg.endSec) {
          return { ...s, startSec: s.startSec - gap, endSec: s.endSec - gap };
        }
        return s;
      });
    set({ audioSegments: next });
    get()._trimToAudioBounds();
  },

  resizeAudioSegment: (id, newStart, newEnd) => {
    get()._pushAudioUndo();
    set((s) => {
      const sorted = [...s.audioSegments].sort((a, b) => a.startSec - b.startSec);
      const idx = sorted.findIndex((seg) => seg.id === id);
      if (idx < 0) return s;
      const prevSeg = idx > 0 ? sorted[idx - 1] : null;
      const nextSeg = idx < sorted.length - 1 ? sorted[idx + 1] : null;
      const minDur = 0.1;
      // Allow extending left past 0 (negative) up to -maxExtendLeftSec (source boundary)
      const minStart = -(get().maxExtendLeftSec || 0);
      let ns = Math.max(minStart, newStart);
      // Allow extending up to maxExtendSec (source boundary), not just current clip duration
      const maxEnd = get().maxExtendSec || usePlaybackStore.getState().duration || Infinity;
      let ne = Math.min(maxEnd, newEnd);
      ns = Math.min(ns, ne - minDur);
      ne = Math.max(ne, ns + minDur);
      const updated = sorted.map((seg) => ({ ...seg }));
      if (prevSeg && ns < prevSeg.endSec) {
        const pi = sorted.findIndex((seg) => seg.id === prevSeg.id);
        updated[pi].endSec = Math.max(updated[pi].startSec + minDur, ns);
      }
      if (nextSeg && ne > nextSeg.startSec) {
        const ni = sorted.findIndex((seg) => seg.id === nextSeg.id);
        updated[ni].startSec = Math.min(updated[ni].endSec - minDur, ne);
      }
      updated[idx].startSec = ns;
      updated[idx].endSec = ne;
      return { audioSegments: updated };
    });
    // NOTE: _trimToAudioBounds is NOT called here — it runs on mouse-up only
    // so dragging back out restores the original sub/caption extents
  },

  // Called explicitly on mouse-up after audio resize to commit trim or extension
  commitAudioResize: async () => {
    const { audioSegments, clip, project, sourceStartTime } = get();
    if (audioSegments.length === 0 || !clip || !project) {
      get()._trimToAudioBounds();
      return;
    }

    const sorted = [...audioSegments].sort((a, b) => a.startSec - b.startSec);
    const newAudioStart = sorted[0].startSec;
    const newAudioEnd = sorted[sorted.length - 1].endSec;
    const currentDuration = usePlaybackStore.getState().duration;

    // Check if we've extended LEFT past 0
    if (newAudioStart < -0.1) {
      return get().commitLeftExtend();
    }

    // Check if we've extended PAST the current clip duration
    if (newAudioEnd > currentDuration + 0.1) {
      // ── EXTEND CLIP ──
      set({ extending: true });
      try {
        // Unload video to release file lock (Windows EBUSY prevention)
        const videoRef = usePlaybackStore.getState().getVideoRef();
        if (videoRef?.current) {
          videoRef.current.pause();
          videoRef.current.removeAttribute("src");
          videoRef.current.load();
        }
        await new Promise((r) => setTimeout(r, 100));

        const newSourceEnd = sourceStartTime + newAudioEnd;
        const result = await window.clipflow.extendClip(
          project.id, clip.id, newSourceEnd
        );
        if (result?.error) {
          console.error("[ExtendRight] Failed:", result.error);
          // Revert audio segment to current duration
          set((s) => ({
            audioSegments: s.audioSegments.map((seg) =>
              seg.endSec > currentDuration ? { ...seg, endSec: currentDuration } : seg
            ),
          }));
        } else {
          // Update clip data with new boundaries
          const newClip = { ...clip, endTime: newSourceEnd, filePath: result.filePath };
          const newProject = {
            ...project,
            clips: project.clips.map((c) => (c.id === clip.id ? newClip : c)),
          };
          set({ clip: newClip, project: newProject, sourceEndTime: newSourceEnd, videoVersion: get().videoVersion + 1 });

          // Update video duration in playback store
          usePlaybackStore.getState().setDuration(newAudioEnd);

          // Pull new subtitle segments for the extended range from project transcription
          get()._extendSubtitles(currentDuration, newAudioEnd);

          // Extend caption to new end if it was at the old boundary
          get()._extendCaptionToAudioEnd(currentDuration, newAudioEnd);

          get().markDirty();
        }
      } catch (err) {
        console.error("Extend clip error:", err);
      } finally {
        set({ extending: false });
      }
    } else {
      // Normal trim (no extension)
      get()._trimToAudioBounds();
    }
  },

  // Commit left extension — called on mouse-up when audio start < 0
  commitLeftExtend: async () => {
    const { audioSegments, clip, project, sourceStartTime } = get();
    if (audioSegments.length === 0 || !clip || !project) {
      get()._trimToAudioBounds();
      return;
    }

    const sorted = [...audioSegments].sort((a, b) => a.startSec - b.startSec);
    const newAudioStart = sorted[0].startSec;

    // Only extend if the left edge is negative (dragged past 0)
    if (newAudioStart >= -0.1) {
      get()._trimToAudioBounds();
      return;
    }

    set({ extending: true });
    try {
      const delta = Math.abs(newAudioStart); // positive number — how many seconds we're prepending
      const newSourceStart = sourceStartTime - delta;

      // Unload video to release file lock (Windows EBUSY prevention)
      const videoRef = usePlaybackStore.getState().getVideoRef();
      if (videoRef?.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      // Brief delay for OS to release file handle
      await new Promise((r) => setTimeout(r, 100));

      const result = await window.clipflow.extendClipLeft(
        project.id, clip.id, newSourceStart
      );

      if (result?.error) {
        console.error("Extend clip left failed:", result.error);
        // Revert audio segment start to 0
        set((s) => ({
          audioSegments: s.audioSegments.map((seg) =>
            seg.startSec < 0 ? { ...seg, startSec: 0 } : seg
          ),
        }));
      } else {
        // Shift ALL existing timestamps forward by delta
        // Audio segments: shift all by +delta, so the old start=0 becomes start=delta
        set((s) => ({
          audioSegments: s.audioSegments.map((seg) => ({
            ...seg,
            startSec: seg.startSec + delta,
            endSec: seg.endSec + delta,
          })),
        }));

        // Update clip data with new boundaries
        const newClip = {
          ...clip,
          startTime: newSourceStart,
          filePath: result.filePath,
          duration: result.duration,
        };
        const newProject = {
          ...project,
          clips: project.clips.map((c) => (c.id === clip.id ? newClip : c)),
        };
        set({
          clip: newClip,
          project: newProject,
          sourceStartTime: newSourceStart,
          maxExtendLeftSec: newSourceStart, // updated — less room to extend left now
          videoVersion: get().videoVersion + 1,
        });

        // Update playback duration
        usePlaybackStore.getState().setDuration(result.duration);

        // Shift existing subtitles forward and prepend new ones for the revealed range
        get()._shiftAndPrependSubtitles(delta, newSourceStart);

        // Shift caption segments forward (extend start back, keep end position relative)
        get()._shiftCaptionLeft(delta);

        get().markDirty();
      }
    } catch (err) {
      console.error("Extend clip left error:", err);
    } finally {
      set({ extending: false });
    }
  },

  // Shift all existing subtitles forward by delta and prepend new segments for revealed range
  _shiftAndPrependSubtitles: (delta, newSourceStart) => {
    const { project } = get();
    const transcription = project?.transcription;
    const subStore = useSubtitleStore.getState();
    const existingSubs = subStore.editSegments;

    // 1. Shift all existing subtitle segments forward by delta
    const shifted = existingSubs.map((seg) => ({
      ...seg,
      startSec: seg.startSec + delta,
      endSec: seg.endSec + delta,
      words: (seg.words || []).map((w) => ({
        ...w,
        start: (w.start || 0) + delta,
        end: (w.end || 0) + delta,
      })),
    }));

    // 2. Pull new segments from project transcription for the newly revealed range [0, delta]
    if (!transcription?.segments) {
      subStore.setEditSegments(shifted);
      return;
    }

    const sourceRevealStart = newSourceStart;
    const sourceRevealEnd = newSourceStart + delta;

    const newSegs = transcription.segments
      .filter((s) => s.start < sourceRevealEnd && s.end > sourceRevealStart)
      .map((s) => {
        const segStart = Math.max(0, s.start - newSourceStart);
        const segEnd = Math.min(delta, s.end - newSourceStart);
        return {
          id: `ext-left-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          start: `${Math.floor(segStart / 60)}:${(segStart % 60).toFixed(1).padStart(4, "0")}`,
          end: `${Math.floor(segEnd / 60)}:${(segEnd % 60).toFixed(1).padStart(4, "0")}`,
          dur: `${(segEnd - segStart).toFixed(1)}s`,
          text: s.text,
          track: "s1",
          conf: "high",
          startSec: segStart,
          endSec: segEnd,
          warning: null,
          words: (s.words || []).map((w) => ({
            word: w.word,
            start: Math.max(0, (w.start || 0) - newSourceStart),
            end: Math.max(0, (w.end || 0) - newSourceStart),
            probability: w.probability ?? 1,
          })),
        };
      })
      .filter((ns) => !shifted.some((es) =>
        Math.abs(es.startSec - ns.startSec) < 0.1 && Math.abs(es.endSec - ns.endSec) < 0.1
      ));

    // Prepend new segments, then existing shifted segments
    subStore.setEditSegments([...newSegs, ...shifted]);
  },

  // Extend caption backwards: shift all timestamps by delta, extend first caption's start to 0
  _shiftCaptionLeft: (delta) => {
    const capStore = useCaptionStore.getState();
    const caps = capStore.captionSegments;
    if (caps.length === 0) return;

    const updated = caps.map((seg) => ({
      ...seg,
      // If caption started at clip beginning (0), keep it at 0 to cover new content
      startSec: seg.startSec < 0.2 ? 0 : seg.startSec + delta,
      // null endSec = "span full duration" — preserve it (don't convert to a number)
      endSec: seg.endSec == null ? null : seg.endSec + delta,
    }));
    capStore.setCaptionSegments(updated);
  },

  // Pull new subtitle segments from project transcription for extended time range
  _extendSubtitles: (oldEnd, newEnd) => {
    const { project, sourceStartTime } = get();
    const transcription = project?.transcription;
    if (!transcription?.segments) return;

    const subStore = useSubtitleStore.getState();
    const existingSubs = subStore.editSegments;

    // Find source segments that fall in the newly extended range
    const sourceNewStart = sourceStartTime + oldEnd;
    const sourceNewEnd = sourceStartTime + newEnd;

    const newSegs = transcription.segments
      .filter((s) => s.start < sourceNewEnd && s.end > sourceNewStart)
      .map((s) => {
        const segStart = Math.max(0, s.start - sourceStartTime);
        const segEnd = Math.min(newEnd, s.end - sourceStartTime);
        return {
          id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          start: `${Math.floor(segStart / 60)}:${(segStart % 60).toFixed(1).padStart(4, "0")}`,
          end: `${Math.floor(segEnd / 60)}:${(segEnd % 60).toFixed(1).padStart(4, "0")}`,
          dur: `${(segEnd - segStart).toFixed(1)}s`,
          text: s.text,
          track: "s1",
          conf: "high",
          startSec: segStart,
          endSec: segEnd,
          warning: null,
          words: (s.words || []).map((w) => ({
            word: w.word,
            start: Math.max(0, (w.start || 0) - sourceStartTime),
            end: Math.max(0, (w.end || 0) - sourceStartTime),
            probability: w.probability ?? 1,
          })),
        };
      })
      // Filter out segments that already exist (overlap with existing subs)
      .filter((ns) => !existingSubs.some((es) =>
        Math.abs(es.startSec - ns.startSec) < 0.1 && Math.abs(es.endSec - ns.endSec) < 0.1
      ));

    if (newSegs.length > 0) {
      subStore.setEditSegments([...existingSubs, ...newSegs]);
    }
  },

  // Extend caption end to match new audio end (if it was at the old boundary)
  _extendCaptionToAudioEnd: (oldEnd, newEnd) => {
    const capStore = useCaptionStore.getState();
    const caps = capStore.captionSegments;
    if (caps.length === 0) return;

    const updated = caps.map((seg) => {
      // null endSec = "span full duration" — keep as null (it auto-extends)
      if (seg.endSec == null) return seg;
      // If caption ended at or near the old boundary, extend it
      if (Math.abs(seg.endSec - oldEnd) < 0.2) {
        return { ...seg, endSec: newEnd };
      }
      return seg;
    });
    capStore.setCaptionSegments(updated);
  },

  // Trim subtitle & caption segments so nothing extends past the last audio segment's end
  _trimToAudioBounds: () => {
    const { audioSegments } = get();
    if (audioSegments.length === 0) return;

    const sorted = [...audioSegments].sort((a, b) => a.startSec - b.startSec);
    const audioEnd = sorted[sorted.length - 1].endSec;
    const audioStart = sorted[0].startSec;

    const subStore = useSubtitleStore.getState();
    const capStore = useCaptionStore.getState();
    let subs = subStore.editSegments;
    let caps = capStore.captionSegments;
    let needsSubUpdate = false;
    let needsCapUpdate = false;

    // ── Right trim: remove/clamp segments past audioEnd ──
    if (subs.length > 0 && subs[subs.length - 1].endSec > audioEnd + 0.01) {
      subs = subs
        .filter((s) => s.startSec < audioEnd)
        .map((s) => (s.endSec > audioEnd ? { ...s, endSec: audioEnd } : s));
      needsSubUpdate = true;
    }
    if (caps.length > 0 && (caps[caps.length - 1].endSec || Infinity) > audioEnd + 0.01) {
      caps = caps
        .filter((s) => s.startSec < audioEnd)
        .map((s) => {
          const end = s.endSec || Infinity;
          return end > audioEnd ? { ...s, endSec: audioEnd } : s;
        });
      needsCapUpdate = true;
    }

    // ── Left trim: remove/clamp segments before audioStart ──
    if (audioStart > 0.01) {
      if (subs.length > 0) {
        subs = subs
          .filter((s) => s.endSec > audioStart + 0.01)
          .map((s) => {
            if (s.startSec < audioStart) {
              // Clamp start and filter words
              const words = (s.words || []).filter((w) => (w.end || 0) > audioStart);
              return { ...s, startSec: audioStart, words };
            }
            return s;
          });
        needsSubUpdate = true;
      }
      if (caps.length > 0) {
        caps = caps
          .filter((s) => (s.endSec == null ? Infinity : s.endSec) > audioStart + 0.01)
          .map((s) => (s.startSec < audioStart ? { ...s, startSec: audioStart } : s));
        needsCapUpdate = true;
      }

      // ── Shift everything left so first audio starts at 0 ──
      const shift = audioStart;

      // Shift audio segments
      set({
        audioSegments: sorted.map((s) => ({
          ...s,
          startSec: s.startSec - shift,
          endSec: s.endSec - shift,
        })),
      });

      // Shift subtitles
      subs = subs.map((s) => ({
        ...s,
        startSec: s.startSec - shift,
        endSec: s.endSec - shift,
        words: (s.words || []).map((w) => ({
          ...w,
          start: (w.start || 0) - shift,
          end: (w.end || 0) - shift,
        })),
      }));
      needsSubUpdate = true;

      // Shift captions
      caps = caps.map((s) => ({
        ...s,
        startSec: s.startSec - shift,
        endSec: s.endSec == null ? null : s.endSec - shift,
      }));
      needsCapUpdate = true;

      // Update playback duration
      usePlaybackStore.getState().setDuration(audioEnd - shift);
    }

    if (needsSubUpdate) subStore.setEditSegments(subs);
    if (needsCapUpdate) capStore.setCaptionSegments(caps);
  },

  // Revert clip to previous boundaries (called by undo when extension is undone)
  revertClipBoundaries: async (clipMeta) => {
    const { clip, project } = get();
    if (!clip || !project || !clipMeta) return;

    const targetStart = clipMeta.startTime ?? clip.startTime;
    const targetEnd = clipMeta.endTime ?? clip.endTime;

    set({ extending: true });

    try {
      // Unload video to release file lock (Windows EBUSY prevention)
      const videoRef = usePlaybackStore.getState().getVideoRef();
      if (videoRef?.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      await new Promise((r) => setTimeout(r, 100));

      const result = await window.clipflow.recutClip(
        project.id, clip.id, targetStart, targetEnd
      );

      if (result?.error) {
        console.error("[RevertClip] Failed:", result.error);
      } else {
        const newDuration = result.duration;
        const newClip = {
          ...clip,
          startTime: targetStart,
          endTime: targetEnd,
          duration: newDuration,
          filePath: result.filePath,
        };
        const newProject = {
          ...project,
          clips: project.clips.map((c) => (c.id === clip.id ? newClip : c)),
        };
        set({
          clip: newClip,
          project: newProject,
          sourceStartTime: clipMeta.sourceStartTime ?? targetStart,
          sourceEndTime: clipMeta.sourceEndTime ?? targetEnd,
          maxExtendLeftSec: clipMeta.maxExtendLeftSec ?? targetStart,
          maxExtendSec: clipMeta.maxExtendSec ?? (get().sourceDuration - targetStart),
          videoVersion: get().videoVersion + 1,
        });

        // Update playback duration
        usePlaybackStore.getState().setDuration(newDuration);

        get().markDirty();
      }
    } catch (err) {
      console.error("[RevertClip] Error:", err);
    } finally {
      set({ extending: false });
    }
  },

  handleSave: async () => {
    const { clip, project, clipTitle } = get();
    if (!clip || !project) return;
    try {
      const subState = useSubtitleStore.getState();
      const editSegments = subState.editSegments;
      const capState = useCaptionStore.getState();
      const { audioSegments } = get();
      // Save subtitle styling snapshot for preview rendering
      const subtitleStyle = {
        fontFamily: subState.subFontFamily, fontWeight: subState.subFontWeight,
        fontSize: subState.fontSize, bold: subState.subBold, italic: subState.subItalic,
        underline: subState.subUnderline, subColor: subState.subColor,
        strokeOn: subState.strokeOn, strokeWidth: subState.strokeWidth,
        strokeColor: subState.strokeColor, strokeOpacity: subState.strokeOpacity,
        strokeBlur: subState.strokeBlur, strokeOffsetX: subState.strokeOffsetX, strokeOffsetY: subState.strokeOffsetY,
        shadowOn: subState.shadowOn, shadowBlur: subState.shadowBlur,
        shadowColor: subState.shadowColor, shadowOpacity: subState.shadowOpacity,
        shadowOffsetX: subState.shadowOffsetX, shadowOffsetY: subState.shadowOffsetY,
        glowOn: subState.glowOn, glowColor: subState.glowColor, glowOpacity: subState.glowOpacity,
        glowIntensity: subState.glowIntensity, glowBlur: subState.glowBlur, glowBlend: subState.glowBlend,
        glowOffsetX: subState.glowOffsetX, glowOffsetY: subState.glowOffsetY,
        bgOn: subState.bgOn, bgOpacity: subState.bgOpacity, bgColor: subState.bgColor,
        bgPaddingX: subState.bgPaddingX, bgPaddingY: subState.bgPaddingY, bgRadius: subState.bgRadius,
        yPercent: subState.subPos != null ? (subState.subPos / 10) * 100 : 80,
      };
      const captionStyle = {
        fontFamily: capState.fontFamily, fontWeight: capState.fontWeight || 900,
        fontSize: capState.fontSize, bold: capState.bold, italic: capState.italic,
        color: capState.color, lineSpacing: capState.lineSpacing,
        yPercent: capState.yPercent ?? 15,
      };
      await window.clipflow.projectUpdateClip(project.id, clip.id, {
        title: clipTitle,
        caption: capState.captionText,
        captionSegments: capState.captionSegments,
        subtitles: editSegments,
        audioSegments: audioSegments,
        subtitleStyle,
        captionStyle,
      });
      set({ dirty: false });
    } catch (e) {
      console.error("Save failed:", e);
    }
  },
}));

export default useEditorStore;
