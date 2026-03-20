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

  // ── Actions ──
  initFromContext: (editorContext, localProjects) => {
    if (!editorContext) {
      set({ project: null, clip: null, clipTitle: "", dirty: false });
      return;
    }
    const project = localProjects.find((p) => p.id === editorContext.projectId) || null;
    const clip = project ? (project.clips || []).find((c) => c.id === editorContext.clipId) || null : null;

    set({
      project,
      clip,
      clipTitle: clip?.title || "Untitled Clip",
      editingTitle: false,
      dirty: false,
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
      }).catch(() => {
        // Fallback: apply built-in template
        applyTemplate(BUILTIN_TEMPLATE);
      });
    } else {
      applyTemplate(BUILTIN_TEMPLATE);
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
      let ne = Math.min(usePlaybackStore.getState().duration || Infinity, newEnd);
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

    // After resize, auto-trim subtitles & captions to the new audio boundary
    get()._trimToAudioBounds();
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
      const editSegments = useSubtitleStore.getState().editSegments;
      const { captionText, captionSegments } = useCaptionStore.getState();
      const { audioSegments } = get();
      await window.clipflow.projectUpdateClip(project.id, clip.id, {
        title: clipTitle,
        caption: captionText,
        captionSegments: captionSegments,
        subtitles: editSegments,
        audioSegments: audioSegments,
      });
      set({ dirty: false });
    } catch (e) {
      console.error("Save failed:", e);
    }
  },
}));

export default useEditorStore;
