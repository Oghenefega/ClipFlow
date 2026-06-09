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
  // Per-card rephrase/regenerate in flight, keyed "title:0" / "caption:2" (#85).
  // Transient; lets only the worked card show a spinner.
  busyCards: {},
  // Per-clip cache of AI state (suggestions, context, rejections, accepted indices).
  // In-memory only; dies on app close. Lets the user see prior suggestions when
  // bouncing between clips in one session without re-paying for the API call (#8).
  // Permanent learning data lives separately via window.clipflow.anthropicLogHistory.
  _perClipCache: {},

  // ── Actions ──
  setAiContext: (c) => set({ aiContext: c }),
  setAiGame: (g) => set({ aiGame: g }),

  // Gather the per-clip context every title/caption call needs. Uses the
  // current editor subtitle segments so it reflects trims/edits on the timeline.
  _collectClipParams: (gamesDb) => {
    const { aiGame, aiContext } = get();
    const { project, clip } = useEditorStore.getState();
    const editSegments = useSubtitleStore.getState().editSegments || [];
    const transcript = editSegments.map((s) => s.text).join(" ").trim();
    const activeGame = (gamesDb || []).find((g) => g.name === aiGame);
    return {
      transcript,
      userContext: aiContext.trim(),
      gameName: aiGame,
      gameContextAuto: activeGame?.aiContextAuto || "",
      gameContextUser: activeGame?.aiContextUser || "",
      projectName: project?.name || "",
      // Detection signals (#85 Chunk B) — ground generation in the clip's
      // measured intensity instead of transcript text alone. Both already live
      // on the clip from detection (ai-pipeline.js); only the batch generate
      // prompt renders them.
      energyLevel: clip?.energyLevel || "",
      confidence: clip?.confidence || 0,
    };
  },

  generate: async (anthropicApiKey, gamesDb) => {
    const { aiGenerating, aiRejections } = get();
    const { clip, project } = useEditorStore.getState();
    if (!clip || !project || aiGenerating) return;
    if (!anthropicApiKey) {
      set({ aiError: "Anthropic API key not set. Go to Settings." });
      return;
    }

    set({ aiGenerating: true, aiError: "" });
    try {
      const result = await window.clipflow.anthropicGenerate({
        ...get()._collectClipParams(gamesDb),
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

  // Rephrase ("rephrase": same hook, reworded) or regenerate ("regenerate":
  // new angle) a SINGLE card, replacing just that slot (#85 Chunk A).
  _runSingleCard: async (mode, anthropicApiKey, gamesDb, kind, idx) => {
    const { clip } = useEditorStore.getState();
    if (!clip) return;
    if (!anthropicApiKey) {
      set({ aiError: "Anthropic API key not set. Go to Settings." });
      return;
    }
    const cardKey = `${kind}:${idx}`;
    const listKey = kind === "title" ? "titles" : "captions";
    const field = kind === "title" ? "title" : "caption";

    const { aiSuggestions, busyCards } = get();
    const list = aiSuggestions?.[listKey] || [];
    const card = list[idx];
    if (!card || busyCards[cardKey]) return;

    set({ busyCards: { ...busyCards, [cardKey]: true }, aiError: "" });
    try {
      const params = {
        ...get()._collectClipParams(gamesDb),
        kind,
        currentText: card[field] || "",
        otherOptions: list.filter((_, i) => i !== idx).map((c) => c?.[field]).filter(Boolean),
      };
      const fn = mode === "rephrase"
        ? window.clipflow.anthropicRephraseOption
        : window.clipflow.anthropicRegenerateOption;
      const result = await fn(params);

      if (result.error) {
        set({ aiError: result.error });
      } else if (result.success && result.data && result.data[field]) {
        const s = get();
        const newList = [...(s.aiSuggestions?.[listKey] || [])];
        newList[idx] = result.data;
        const patch = {
          aiSuggestions: { ...s.aiSuggestions, [listKey]: newList },
        };
        // The slot's text changed — drop a stale "Applied" mark on it.
        if (kind === "title" && s.acceptedTitleIdx === idx) patch.acceptedTitleIdx = null;
        if (kind === "caption" && s.acceptedCaptionIdx === idx) patch.acceptedCaptionIdx = null;
        set(patch);
      } else {
        set({ aiError: "AI returned no usable result." });
      }
    } catch (e) {
      set({ aiError: e.message });
    }
    const after = get().busyCards;
    const { [cardKey]: _drop, ...rest } = after;
    set({ busyCards: rest });
  },

  rephrase: (anthropicApiKey, gamesDb, kind, idx) =>
    get()._runSingleCard("rephrase", anthropicApiKey, gamesDb, kind, idx),
  regenerate: (anthropicApiKey, gamesDb, kind, idx) =>
    get()._runSingleCard("regenerate", anthropicApiKey, gamesDb, kind, idx),

  acceptTitle: async (titleObj, idx) => {
    const { aiGame } = get();
    const newTitle = titleObj.title || titleObj.text || "";
    useEditorStore.getState().setClipTitle(newTitle);
    useEditorStore.getState().markDirty();
    // Persist immediately so the accepted title can't be lost by navigating
    // away before autosave fires (#8). Only mark "Applied" once the save is
    // confirmed — a failed save must surface an error, not a false success
    // badge for a pick that never reached disk (#92).
    const saved = await useEditorStore.getState().handleSave().catch(() => false);
    if (!saved) {
      set({ aiError: "Couldn't save your title pick — please try again." });
      return;
    }
    set({ acceptedTitleIdx: idx, aiError: "" });
    window.clipflow?.anthropicLogHistory?.({
      type: "pick", titleChosen: newTitle, game: aiGame, timestamp: Date.now(),
    });
  },

  acceptCaption: async (captionObj, idx) => {
    const { aiGame } = get();
    const text = captionObj.caption || captionObj.text || "";
    useCaptionStore.getState().setCaptionText(text);
    useEditorStore.getState().markDirty();
    // Persist immediately — same reasoning as acceptTitle (#8). Mark "Applied"
    // only after the save is confirmed; surface an error on failure instead of
    // showing a false success badge (#92).
    const saved = await useEditorStore.getState().handleSave().catch(() => false);
    if (!saved) {
      set({ aiError: "Couldn't save your caption pick — please try again." });
      return;
    }
    set({ acceptedCaptionIdx: idx, aiError: "" });
    window.clipflow?.anthropicLogHistory?.({
      type: "pick", captionChosen: text, game: aiGame, timestamp: Date.now(),
    });
  },

  reject: (text, kind = "title") => {
    const { aiGame } = get();
    // Carry kind on each entry (backend buildUserContent accepts {text} objects)
    // and cap the list so it can't grow unbounded across a session (#91).
    set((s) => ({ aiRejections: [...s.aiRejections, { text, kind }].slice(-40) }));
    // Log under the correct field so caption rejections don't pollute the
    // title learning signal (and vice-versa) in anthropicLogHistory (#91).
    window.clipflow?.anthropicLogHistory?.(
      kind === "caption"
        ? { type: "reject", captionRejected: text, game: aiGame, timestamp: Date.now() }
        : { type: "reject", titleRejected: text, game: aiGame, timestamp: Date.now() }
    );
  },

  reset: () => set({
    aiContext: "",
    aiGenerating: false,
    aiError: "",
    aiSuggestions: null,
    aiRejections: [],
    acceptedTitleIdx: null,
    acceptedCaptionIdx: null,
    busyCards: {},
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
      busyCards: {},
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
