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
}));

export default useAIStore;
