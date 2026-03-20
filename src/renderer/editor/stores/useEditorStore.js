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
  extending: false, // true while an extend operation is in progress

  // ── Actions ──
  initFromContext: (editorContext, localProjects) => {
    if (!editorContext) {
      set({ project: null, clip: null, clipTitle: "", dirty: false });
      return;
    }
    const project = localProjects.find((p) => p.id === editorContext.projectId) || null;
    const clip = project ? (project.clips || []).find((c) => c.id === editorContext.clipId) || null : null;

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
      let ns = Math.max(0, newStart);
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
    const newAudioEnd = sorted[sorted.length - 1].endSec;
    const currentDuration = usePlaybackStore.getState().duration;

    // Check if we've extended PAST the current clip duration
    if (newAudioEnd > currentDuration + 0.1) {
      // ── EXTEND CLIP ──
      set({ extending: true });
      try {
        const newSourceEnd = sourceStartTime + newAudioEnd;
        const result = await window.clipflow.extendClip(
          project.id, clip.id, newSourceEnd
        );
        if (result?.error) {
          console.error("Extend clip failed:", result.error);
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
          set({ clip: newClip, project: newProject, sourceEndTime: newSourceEnd });

          // Update video duration in playback store
          usePlaybackStore.getState().setDuration(newAudioEnd);

          // Pull new subtitle segments for the extended range from project transcription
          get()._extendSubtitles(currentDuration, newAudioEnd);

          // Extend caption to new end if it was at the old boundary
          get()._extendCaptionToAudioEnd(currentDuration, newAudioEnd);

          // Re-extract waveform for the new clip
          if (result.filePath && window.clipflow?.ffmpegExtractWaveformPeaks) {
            window.clipflow.ffmpegExtractWaveformPeaks(result.filePath, 400)
              .then((wfResult) => {
                if (wfResult?.peaks?.length > 0) set({ waveformPeaks: wfResult.peaks });
              })
              .catch(() => {});
          }

          // Reload video element with new file
          const videoRef = usePlaybackStore.getState().getVideoRef();
          if (videoRef?.current) {
            videoRef.current.src = `file://${result.filePath.replace(/\\/g, "/")}`;
            videoRef.current.load();
          }

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
      const end = seg.endSec || Infinity;
      // If caption ended at or near the old boundary, extend it
      if (Math.abs(end - oldEnd) < 0.2 || end === null) {
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

    // Trim subtitle segments
    const subStore = useSubtitleStore.getState();
    const subs = subStore.editSegments;
    if (subs.length > 0) {
      const lastSub = subs[subs.length - 1];
      if (lastSub.endSec > audioEnd + 0.01) {
        // Trim segments: remove any fully past audioEnd, clamp partial ones
        const trimmed = subs
          .filter((s) => s.startSec < audioEnd)
          .map((s) => (s.endSec > audioEnd ? { ...s, endSec: audioEnd } : s));
        subStore.setEditSegments(trimmed);
      }
    }

    // Trim caption segments
    const capStore = useCaptionStore.getState();
    const caps = capStore.captionSegments;
    if (caps.length > 0) {
      const lastCap = caps[caps.length - 1];
      if ((lastCap.endSec || Infinity) > audioEnd + 0.01) {
        const trimmed = caps
          .filter((s) => s.startSec < audioEnd)
          .map((s) => {
            const end = s.endSec || Infinity;
            return end > audioEnd ? { ...s, endSec: audioEnd } : s;
          });
        capStore.setCaptionSegments(trimmed);
      }
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
