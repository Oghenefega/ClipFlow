import { create } from "zustand";
import useEditorStore from "./useEditorStore";
import useSubtitleStore from "./useSubtitleStore";
import useCaptionStore from "./useCaptionStore";

const useAIStore = create((set, get) => ({
  aiContext: "",
  aiGame: "Arc Raiders",
  aiGenerating: false,
  aiError: "",
  aiSuggestions: null, // { titles: [], captions: [] }
  aiRejections: [],
  acceptedTitleIdx: null,
  acceptedCaptionIdx: null,
  // Per-clip cache of AI state (suggestions, context, rejections, accepted indices).
  // In-memory only; dies on app close. Lets the user see prior suggestions when
  // bouncing between clips in one session without re-paying for the API call (#8).
  // Permanent learning data lives separately via window.clipflow.anthropicLogHistory.
  _perClipCache: {},

  // ── Actions ──
  setAiContext: (c) => set({ aiContext: c }),
  setAiGame: (g) => set({ aiGame: g }),

  generate: async (anthropicApiKey, gamesDb) => {
    const { aiGenerating, aiGame, aiContext, aiRejections } = get();
    const { clip, project } = useEditorStore.getState();
    if (!clip || !project || aiGenerating) return;
    if (!anthropicApiKey) {
      set({ aiError: "Anthropic API key not set. Go to Settings." });
      return;
    }

    set({ aiGenerating: true, aiError: "" });
    try {
      // Use the current editor subtitle segments — these reflect any trims,
      // deletions, or edits the user has made on the timeline
      const editSegments = useSubtitleStore.getState().editSegments || [];
      const transcript = editSegments
        .map((s) => s.text)
        .join(" ")
        .trim();

      const activeGame = gamesDb.find((g) => g.name === aiGame);
      const result = await window.clipflow.anthropicGenerate({
        transcript,
        userContext: aiContext.trim(),
        gameName: aiGame,
        gameContextAuto: activeGame?.aiContextAuto || "",
        gameContextUser: activeGame?.aiContextUser || "",
        projectName: project.name || "",
        rejectedSuggestions: aiRejections,
      });

      if (result.error) {
        set({ aiError: result.error });
      } else if (result.success && result.data) {
        set({ aiSuggestions: result.data, acceptedTitleIdx: null, acceptedCaptionIdx: null });
      }
    } catch (e) {
      set({ aiError: e.message });
    }
    set({ aiGenerating: false });
  },

  acceptTitle: (titleObj, idx) => {
    const { aiGame } = get();
    const newTitle = titleObj.title || titleObj.text || "";
    useEditorStore.getState().setClipTitle(newTitle);
    useEditorStore.getState().markDirty();
    set({ acceptedTitleIdx: idx });
    // Persist immediately so the accepted title can't be lost by navigating
    // away before autosave fires (#8). Fire-and-forget — UI doesn't block.
    useEditorStore.getState().handleSave().catch((e) => console.error("Auto-save after acceptTitle failed:", e));
    window.clipflow?.anthropicLogHistory?.({
      type: "pick", titleChosen: newTitle, game: aiGame, timestamp: Date.now(),
    });
  },

  acceptCaption: (captionObj, idx) => {
    const { aiGame } = get();
    const text = captionObj.caption || captionObj.text || "";
    useCaptionStore.getState().setCaptionText(text);
    useEditorStore.getState().markDirty();
    set({ acceptedCaptionIdx: idx });
    // Persist immediately — same reasoning as acceptTitle (#8).
    useEditorStore.getState().handleSave().catch((e) => console.error("Auto-save after acceptCaption failed:", e));
    window.clipflow?.anthropicLogHistory?.({
      type: "pick", captionChosen: text, game: aiGame, timestamp: Date.now(),
    });
  },

  reject: (text) => {
    const { aiGame } = get();
    set((s) => ({ aiRejections: [...s.aiRejections, text] }));
    window.clipflow?.anthropicLogHistory?.({
      type: "reject", titleRejected: text, game: aiGame, timestamp: Date.now(),
    });
  },

  reset: () => set({
    aiContext: "",
    aiGenerating: false,
    aiError: "",
    aiSuggestions: null,
    aiRejections: [],
    acceptedTitleIdx: null,
    acceptedCaptionIdx: null,
  }),

  // Save current clip's AI state to cache, restore new clip's cached state (#8).
  // Called from useEditorStore.openClip in place of reset() so users see their
  // prior suggestions when switching between clips in a session.
  swapToClip: (oldClipId, newClipId) => {
    const state = get();
    const cache = { ...state._perClipCache };
    if (oldClipId) {
      cache[oldClipId] = {
        aiContext: state.aiContext,
        aiSuggestions: state.aiSuggestions,
        aiRejections: state.aiRejections,
        acceptedTitleIdx: state.acceptedTitleIdx,
        acceptedCaptionIdx: state.acceptedCaptionIdx,
      };
    }
    const cached = newClipId ? cache[newClipId] : null;
    set({
      _perClipCache: cache,
      aiContext: cached?.aiContext ?? "",
      aiSuggestions: cached?.aiSuggestions ?? null,
      aiRejections: cached?.aiRejections ?? [],
      acceptedTitleIdx: cached?.acceptedTitleIdx ?? null,
      acceptedCaptionIdx: cached?.acceptedCaptionIdx ?? null,
      aiGenerating: false,
      aiError: "",
    });
  },

  // Drop a clip's cached AI state. Called when a clip is published — its
  // suggestions are no longer needed (#8).
  clearCacheForClip: (clipId) => {
    if (!clipId) return;
    const cache = { ...get()._perClipCache };
    delete cache[clipId];
    set({ _perClipCache: cache });
  },
}));

export default useAIStore;
