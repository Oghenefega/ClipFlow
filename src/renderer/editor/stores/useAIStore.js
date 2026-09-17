import { create } from "zustand";
import posthog from "posthog-js";
import useEditorStore from "./useEditorStore";
import useSubtitleStore from "./useSubtitleStore";
import useCaptionStore from "./useCaptionStore";

// #424: every call and every apply is counted, here for PostHog (cross-install
// usage) and in the main process for the ai_calls table (cost, path, reason).
function trackCall(kind, result) {
  try { posthog.capture("clipflow_titlegen_call", { kind, path: result.path || "", fallback: Boolean(result.fallback) }); } catch (_) {}
}
function trackApplied(cardKind, callId) {
  try { posthog.capture("clipflow_titlegen_applied", { card_kind: cardKind }); } catch (_) {}
  if (Number.isInteger(callId)) window.clipflow?.aiCallApplied?.(callId);
}

// #420: the approve-time batch landed. Only the open clip needs telling — any
// other clip reads the saved cards off its clip when it is opened.
if (typeof window !== "undefined" && window.clipflow?.onTitlegenDone) {
  window.clipflow.onTitlegenDone(({ clipId, suggestions, error }) => {
    const openId = useEditorStore.getState().clip?.id;
    if (!openId || openId !== clipId) return;
    if (suggestions) {
      useAIStore.setState({
        aiSuggestions: { titles: suggestions.titles || [], captions: suggestions.captions || [] },
        aiCallId: suggestions.callId ?? null,
        aiFallback: suggestions.fallback || null,
        aiGenerating: false,
        aiError: "",
      });
    } else {
      useAIStore.setState({ aiGenerating: false, aiError: error || "Couldn't write titles for this clip." });
    }
  });
}

// #436: clips with a Generate still running. The panel's spinner is one flag
// shared by whichever clip is open, so a clip switch reads it back from here —
// coming back to a clip that is still generating shows the spinner (and keeps
// the Generate button off, so the same clip is never paid for twice).
const _generatingFor = new Set();

const useAIStore = create((set, get) => ({
  aiContext: "",
  // #262: no personal default — seeded from the clip/project on load; "" until then.
  aiGame: "",
  aiGenerating: false,
  aiError: "",
  aiSuggestions: null, // { titles: [], captions: [] }
  // #424: the ai_calls row id of the batch that produced aiSuggestions, and
  // the one-line note shown when the lesser path wrote the cards (null when
  // Gemini watched the clip). Single-card results carry their own callId.
  aiCallId: null,
  aiFallback: null,
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
  // #334 (reverses #197): the picker only steers title/caption generation —
  // hashtag and game context follow the selection, but the clip's content tag
  // is never written from here. Re-categorizing a clip lives in the Projects
  // tab's per-clip tag menu, where the consequence is visible.
  setAiGame: (g) => set({ aiGame: g }),

  // Gather the per-clip context every title/caption call needs. Scopes the
  // transcript to THIS clip's cut window via getTimelineMappedSegments — the
  // same visibleSubtitleSegments clipping the Transcript panel, preview, and
  // render path use. Raw editSegments holds source-wide extras (resolveClipSubtitles
  // includeExtras, for outward extends), so joining it fed the AI the WHOLE
  // recording's transcript → titles/captions referenced moments from other clips.
  _collectClipParams: (gamesDb) => {
    const { aiGame, aiContext } = get();
    const { project, clip } = useEditorStore.getState();
    const mapped = useSubtitleStore.getState().getTimelineMappedSegments();
    const transcript = mapped.map((s) => s.text).join(" ").trim();
    const activeGame = (gamesDb || []).find((g) => g.name === aiGame);
    return {
      transcript,
      userContext: aiContext.trim(),
      gameName: aiGame,
      // #183: identity so the generated options can be joined against what
      // actually gets published for this clip later.
      clipId: clip?.id || "",
      projectId: project?.id || "",
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

  // #262 follow-up: no renderer key gate — the main process resolves raw key
  // vs gateway itself and returns a proper error if neither is configured.
  generate: async (gamesDb) => {
    const { aiGenerating, aiRejections } = get();
    const { clip, project } = useEditorStore.getState();
    if (!clip || !project || aiGenerating) return;

    // #436: the call takes seconds and the user can open another clip while it
    // runs. Everything after the await belongs to THIS clip: written to the
    // panel only while it is still the open one, otherwise parked in its
    // session cache (the main process has already saved the cards on the right
    // clip) so they are there on return without a second paid call.
    const startedFor = clip.id;
    const stillOpen = () => useEditorStore.getState().clip?.id === startedFor;

    _generatingFor.add(startedFor);
    set({ aiGenerating: true, aiError: "" });
    try {
      const result = await window.clipflow.anthropicGenerate({
        ...get()._collectClipParams(gamesDb),
        rejectedSuggestions: aiRejections,
      });

      if (result.error) {
        if (stillOpen()) set({ aiError: result.error });
      } else if (result.success && result.data) {
        const landed = {
          aiSuggestions: result.data,
          aiCallId: result.callId ?? null,
          aiFallback: result.fallback || null,
          acceptedTitleIdx: null,
          acceptedCaptionIdx: null,
        };
        if (stillOpen()) set(landed);
        else set((s) => ({ _perClipCache: { ...s._perClipCache, [startedFor]: { ...(s._perClipCache[startedFor] || {}), ...landed } } }));
        trackCall("generate", result);
      }
    } catch (e) {
      if (stillOpen()) set({ aiError: e.message });
    }
    _generatingFor.delete(startedFor);
    // Not this call's spinner any more if another clip is open (it may be
    // running its own Generate).
    if (stillOpen()) set({ aiGenerating: false });
  },

  // Rephrase ("rephrase": same hook, reworded) or regenerate ("regenerate":
  // new angle) a SINGLE card, replacing just that slot (#85 Chunk A).
  _runSingleCard: async (mode, gamesDb, kind, idx) => {
    const { clip, project } = useEditorStore.getState();
    if (!clip) return;
    // #436: same rule as generate — the result belongs to the clip it was
    // asked for, wherever the user is by the time it lands.
    const startedFor = clip.id;
    const startedProject = project?.id;
    const stillOpen = () => useEditorStore.getState().clip?.id === startedFor;
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
        cardIdx: idx,
        currentText: card[field] || "",
        otherOptions: list.filter((_, i) => i !== idx).map((c) => c?.[field]).filter(Boolean),
      };
      const fn = mode === "rephrase"
        ? window.clipflow.anthropicRephraseOption
        : window.clipflow.anthropicRegenerateOption;
      const result = await fn(params);

      if (result.error) {
        if (stillOpen()) set({ aiError: result.error });
      } else if (result.success && result.data && result.data[field]) {
        // The clip's AI state: the live panel while it is open, else its
        // session cache entry (swapToClip parked it there on the way out).
        const s = stillOpen() ? get() : get()._perClipCache[startedFor];
        if (s?.aiSuggestions) {
          const newList = [...(s.aiSuggestions[listKey] || [])];
          // The card remembers which call wrote it, so applying it later stamps
          // that call, not the batch (#424).
          newList[idx] = { ...result.data, callId: result.callId ?? null };
          const patch = {
            aiSuggestions: { ...s.aiSuggestions, [listKey]: newList },
          };
          if (result.fallback) patch.aiFallback = result.fallback;
          // The slot's text changed — drop a stale "Applied" mark on it.
          if (kind === "title" && s.acceptedTitleIdx === idx) patch.acceptedTitleIdx = null;
          if (kind === "caption" && s.acceptedCaptionIdx === idx) patch.acceptedCaptionIdx = null;
          if (stillOpen()) set(patch);
          else set((st) => ({ _perClipCache: { ...st._perClipCache, [startedFor]: { ...st._perClipCache[startedFor], ...patch } } }));
          trackCall(mode, result);
          // Saved under the clip the card was written FOR, never the open one.
          get()._persistCards(startedProject, startedFor, patch.aiSuggestions);
        }
      } else if (stillOpen()) {
        set({ aiError: "AI returned no usable result." });
      }
    } catch (e) {
      if (stillOpen()) set({ aiError: e.message });
    }
    // busyCards was reset by the clip switch; only clear this clip's own mark.
    if (stillOpen()) {
      const after = get().busyCards;
      const { [cardKey]: _drop, ...rest } = after;
      set({ busyCards: rest });
    }
  },

  rephrase: (gamesDb, kind, idx) =>
    get()._runSingleCard("rephrase", gamesDb, kind, idx),
  regenerate: (gamesDb, kind, idx) =>
    get()._runSingleCard("regenerate", gamesDb, kind, idx),

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
    trackApplied("title", titleObj.callId ?? get().aiCallId);
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
    trackApplied("caption", captionObj.callId ?? get().aiCallId);
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
    aiCallId: null,
    aiFallback: null,
    aiRejections: [],
    acceptedTitleIdx: null,
    acceptedCaptionIdx: null,
    busyCards: {},
  }),

  // #420: cards saved on the clip (by Generate or by the approve-time auto
  // path) outlive the session cache. Called by useEditorStore.openClip once
  // the clip is loaded. The session cache wins when it has something; else
  // the disk copy is shown; else, if the approve-time batch is still being
  // written, the spinner shows until titlegen:done lands.
  seedFromClip: async (clip) => {
    if (!clip) return;
    if (get().aiSuggestions) return;
    const saved = clip.suggestions;
    if (saved?.titles?.length) {
      set({
        aiSuggestions: { titles: saved.titles, captions: saved.captions || [] },
        aiCallId: saved.callId ?? null,
        aiFallback: saved.fallback || null,
      });
      return;
    }
    if (!window.clipflow?.titlegenPending) return;
    const pending = await window.clipflow.titlegenPending(clip.id).catch(() => false);
    if (pending && useEditorStore.getState().clip?.id === clip.id && !get().aiSuggestions) {
      set({ aiGenerating: true, aiError: "" });
    }
  },

  // #420: a Regenerate or Rephrase changed a card — keep the saved set current.
  // Takes the clip the card was written FOR — by the time a call lands the
  // open clip may be a different one (#436).
  _persistCards: (projectId, clipId, aiSuggestions) => {
    if (!projectId || !clipId || !aiSuggestions) return;
    window.clipflow?.titlegenSaveCards?.(projectId, clipId, {
      titles: aiSuggestions.titles || [],
      captions: aiSuggestions.captions || [],
    })?.catch?.(() => {});
  },

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
        aiCallId: state.aiCallId,
        aiFallback: state.aiFallback,
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
      aiCallId: cached?.aiCallId ?? null,
      aiFallback: cached?.aiFallback ?? null,
      aiRejections: cached?.aiRejections ?? [],
      acceptedTitleIdx: cached?.acceptedTitleIdx ?? null,
      acceptedCaptionIdx: cached?.acceptedCaptionIdx ?? null,
      aiGenerating: _generatingFor.has(newClipId),
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
