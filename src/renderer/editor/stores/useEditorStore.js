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

  handleSave: async () => {
    const { clip, project, clipTitle } = get();
    if (!clip || !project) return;
    try {
      const editSegments = useSubtitleStore.getState().editSegments;
      const { captionText, captionSegments } = useCaptionStore.getState();
      await window.clipflow.projectUpdateClip(project.id, clip.id, {
        title: clipTitle,
        caption: captionText,
        captionSegments: captionSegments,
        subtitles: editSegments,
      });
      set({ dirty: false });
    } catch (e) {
      console.error("Save failed:", e);
    }
  },
}));

export default useEditorStore;
