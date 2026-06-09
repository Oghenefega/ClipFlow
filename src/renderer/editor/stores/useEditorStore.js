import { create } from "zustand";
import useSubtitleStore from "./useSubtitleStore";
import useCaptionStore from "./useCaptionStore";
import usePlaybackStore from "./usePlaybackStore";
import useLayoutStore from "./useLayoutStore";
// Cross-store import — accessed only inside function bodies, ESM live
// bindings resolve the cycle. Do NOT call .getState() at module top-level.
import useAIStore from "./useAIStore";
import { BUILTIN_TEMPLATE, applyTemplate } from "../utils/templateUtils";
import { createSegment, createInitialSegments, cloneSegments } from "../models/segmentModel";
import { getTimelineDuration, sourceToTimeline, getSegmentTimelineRange } from "../models/timeMapping";
import { splitAtTimeline, deleteSegment, trimSegmentLeft, trimSegmentRight, extendSegmentLeft, extendSegmentRight } from "../models/segmentOps";

// ── Autosave internals (module-closure, NOT in state) ──
// Kept outside Zustand state to avoid infinite subscribe loops when the timer is (re)set.
// Any state write triggers subscribe listeners, which fire scheduleAutosave, which must not
// itself mutate state or it would re-trigger the listener and loop forever.
//
// _savesInFlight is a COUNTER (not boolean). Reasoning: if autosave is mid-IPC and user
// clicks Save, we want BOTH saves to run (the autosave captured state at t=0, but the
// user may have edited during the IPC — the explicit save captures the latest). Main
// process serializes updateClip calls via electron-store. Last write wins with latest data.
// A boolean would have blocked the second save and lost those edits.
let _autosaveTimer = null;
let _savesInFlight = 0;
const AUTOSAVE_DEBOUNCE_MS = 800;

// _loadGen guards initFromContext against overlapping/stale runs. initFromContext is
// async + destructive (it clears all stores, then awaits project load, then applies
// template/style in a Promise). If two runs overlap (rapid clip switch, StrictMode
// double-invoke), a stale run could clobber the live one — manifesting as an
// intermittent empty timeline or the saved style snapping back to template default.
// Each run captures its generation; after every await it bails if a newer run started.
let _loadGen = 0;

const useEditorStore = create((set, get) => ({
  // ── Core data ──
  project: null,
  clip: null,
  clipTitle: "",
  editingTitle: false,
  dirty: false,
  waveformPeaks: null,
  waveformError: null,

  // ── NLE Segment Model (non-destructive editing) ──
  // Each segment is { id, sourceStart, sourceEnd } — a window into the source file.
  // Timeline position is DERIVED from segment order, never stored.
  nleSegments: [],
  sourceDuration: 0, // total source file duration

  // Legacy compatibility — kept for gradual migration of timeline UI components
  audioSegments: [],
  sourceStartTime: 0,
  sourceEndTime: 0,
  maxExtendSec: 0,
  maxExtendLeftSec: 0,
  extending: false,
  videoVersion: 0,

  // Phase 4: Media Offline state. Set when project.sourceFile is missing on disk.
  // Editor shows a "Locate file…" banner and disables preview until user resolves.
  sourceOffline: false,

  // ── Actions ──
  initFromContext: async (editorContext, localProjects) => {
    if (!editorContext) {
      set({ project: null, clip: null, clipTitle: "", dirty: false });
      return;
    }

    // #125: Source-preview mode — open a raw recording in the editor with no
    // backing project/clip (watch-only). Skip the projectLoad IPC and synthesize
    // a thin shell so videoSrc + waveform + timeline self-fill on onLoadedMetadata.
    // clip stays null, so Save/Render/Re-transcribe all no-op (zero disk writes).
    if (editorContext.sourcePreviewPath) {
      const myGen = ++_loadGen;
      const path = editorContext.sourcePreviewPath;
      const label = editorContext.label || "Recording";
      useSubtitleStore.getState().clearAll();
      useCaptionStore.getState().initFromClip(null);
      usePlaybackStore.getState().reset();
      try { useAIStore.getState().swapToClip(get().clip?.id || null, null); } catch (e) {}

      let sourceOffline = false;
      try {
        if (window.clipflow?.fileExists) sourceOffline = !(await window.clipflow.fileExists(path));
      } catch (_) { sourceOffline = false; }
      if (myGen !== _loadGen) return; // a newer load started — abandon

      set({
        project: { id: "__source_preview__", sourceFile: path, name: label, clips: [], transcription: null },
        clip: null,
        clipTitle: label,
        editingTitle: false,
        dirty: false,
        waveformPeaks: null,
        waveformError: null,
        audioSegments: [],
        nleSegments: [],
        sourceStartTime: 0,
        sourceEndTime: 0,
        sourceDuration: 0,
        maxExtendSec: 0,
        maxExtendLeftSec: 0,
        extending: false,
        sourceOffline,
      });
      usePlaybackStore.getState().reset();
      usePlaybackStore.setState({ clipFileOffset: 0, clipFileDuration: 0 });
      return;
    }

    // Claim this load generation. Any earlier in-flight run is now stale and will
    // bail at its next checkpoint instead of clobbering the state we're about to set.
    const myGen = ++_loadGen;

    // CRITICAL: Clear all stores BEFORE async load to prevent old data leaking
    // into the new clip while the project loads from disk
    useSubtitleStore.getState().clearAll();
    useCaptionStore.getState().initFromClip(null);
    usePlaybackStore.getState().reset();
    // AI store: swap cache instead of reset, so user's prior suggestions for
    // this clip survive a tab/clip switch within a session (#8).
    try {
      const oldClipId = get().clip?.id || null;
      const newClipId = editorContext?.clipId || null;
      useAIStore.getState().swapToClip(oldClipId, newClipId);
    } catch (e) {}
    set({ clip: null, project: null, clipTitle: "Loading...", dirty: false, waveformPeaks: null, waveformError: null, audioSegments: [], nleSegments: [] });

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

    // A newer load started while we awaited — abandon this stale run.
    if (myGen !== _loadGen) return;

    // Compute source boundaries for clip extension
    const sourceStart = clip?.startTime || 0;
    const sourceEnd = clip?.endTime || 0;
    const sourceDur = project?.sourceDuration || 0;
    const clipDuration = sourceEnd > sourceStart ? sourceEnd - sourceStart : 0;
    // Maximum clip-relative time = how far the clip can extend into the source
    const maxExtend = sourceDur > 0 ? sourceDur - sourceStart : clipDuration;

    // ── NLE Segment Initialization (with migration from old format) ──
    let nleSegs;
    if (clip?.nleSegments && clip.nleSegments.length > 0) {
      // New format: NLE segments already stored
      nleSegs = clip.nleSegments;
    } else if (clip?.audioSegments && clip.audioSegments.length > 0) {
      // Old format: convert absolute clip-relative audioSegments to NLE source references
      nleSegs = clip.audioSegments.map((seg) =>
        createSegment(sourceStart + seg.startSec, sourceStart + seg.endSec, seg.id)
      );
    } else if (sourceStart > 0 || sourceEnd > 0) {
      // Fresh clip: single segment spanning clip range in source
      nleSegs = createInitialSegments(sourceStart, sourceEnd);
    } else {
      nleSegs = [];
    }

    // Phase 4: Media Offline check — project.sourceFile must exist on disk for
    // the editor to preview. If moved/deleted, show the Media Offline banner.
    let sourceOffline = false;
    try {
      if (project?.sourceFile && window.clipflow?.fileExists) {
        const exists = await window.clipflow.fileExists(project.sourceFile);
        sourceOffline = !exists;
      }
    } catch (_) { sourceOffline = false; }

    // A newer load started while we awaited fileExists — abandon this stale run.
    if (myGen !== _loadGen) return;

    set({
      project,
      clip,
      clipTitle: clip?.title || "Untitled Clip",
      editingTitle: false,
      dirty: false,
      nleSegments: nleSegs,
      sourceStartTime: sourceStart,
      sourceEndTime: sourceEnd,
      sourceDuration: sourceDur,
      maxExtendSec: maxExtend > 0 ? maxExtend : clipDuration,
      maxExtendLeftSec: sourceStart,
      extending: false,
      sourceOffline,
    });

    // Clear any stale playback state from the previous clip BEFORE we populate
    // nleSegments. reset() wipes nleSegments: [] and currentTime: 0 — running it
    // after setNleSegments(nleSegs) silently clobbers the segments.
    usePlaybackStore.getState().reset();

    // Phase 4: <video>.src is the full source recording, so video.currentTime
    // IS source-absolute time. clipFileOffset = 0 means no translation needed.
    // clipFileDuration = sourceDuration (the unchanging extent of the video).
    usePlaybackStore.setState({
      clipFileOffset: 0,
      clipFileDuration: sourceDur,
    });

    // Sync NLE segments to playback store for duration and segment-aware playback
    usePlaybackStore.getState().setNleSegments(nleSegs);

    // Initialize other stores from clip data
    useCaptionStore.getState().initFromClip(clip);
    useSubtitleStore.getState().initSegments(project, clip);

    // Auto-apply default template on editor open, then restore any saved styling
    // Template provides defaults; saved clip styling (from handleSave) wins.
    const restoreSavedStyles = () => {
      if (clip?.subtitleStyle) {
        useSubtitleStore.getState().restoreSavedStyle(clip.subtitleStyle);
      }
      if (clip?.captionStyle) {
        useCaptionStore.getState().restoreSavedStyle(clip.captionStyle);
        // Restore caption position
        if (clip.captionStyle.yPercent !== undefined) {
          useLayoutStore.getState().setCapYPercent(clip.captionStyle.yPercent);
        }
        // Restore caption width (#32)
        if (clip.captionStyle.widthPercent !== undefined) {
          useLayoutStore.getState().setCapWidthPercent(clip.captionStyle.widthPercent);
        }
      }
      if (clip?.subtitleStyle?.yPercent !== undefined) {
        useLayoutStore.getState().setSubYPercent(clip.subtitleStyle.yPercent);
      }
      // Clear undo/redo stacks — user should not be able to undo past initial state
      useSubtitleStore.setState({ _undoStack: [], _redoStack: [], _lastUndoPushTime: 0 });
    };

    // Merge per-clip saved segmentMode into the template before applying, so
    // applyTemplate builds editSegments at the final mode in a single pass
    // (rather than building at template's mode then rebuilding at saved mode).
    const applyMergedTemplate = (tpl) => {
      if (!tpl) return;
      const savedMode = clip?.subtitleStyle?.segmentMode;
      const merged = savedMode !== undefined
        ? { ...tpl, subtitle: { ...tpl.subtitle, segmentMode: savedMode } }
        : tpl;
      applyTemplate(merged);
    };

    if (window.clipflow?.storeGet) {
      Promise.all([
        window.clipflow.storeGet("defaultTemplateId"),
        window.clipflow.storeGet("layoutTemplates"),
        window.clipflow.storeGet("builtInTemplateDeleted"),
      ]).then(([defaultId, savedTemplates, builtInDeleted]) => {
        // A newer load started while storeGet resolved — don't apply this run's
        // template/style over the current clip (was the style-revert race).
        if (myGen !== _loadGen) return;
        const id = defaultId || "fega-default";
        const allTemplates = [
          ...(builtInDeleted ? [] : [BUILTIN_TEMPLATE]),
          ...(Array.isArray(savedTemplates) ? savedTemplates : []),
        ];
        const tpl = allTemplates.find((t) => t.id === id) || allTemplates[0];
        applyMergedTemplate(tpl);
        restoreSavedStyles();
      }).catch(() => {
        if (myGen !== _loadGen) return;
        applyMergedTemplate(BUILTIN_TEMPLATE);
        restoreSavedStyles();
      });
    } else {
      applyMergedTemplate(BUILTIN_TEMPLATE);
      restoreSavedStyles();
    }

    // Reset waveform (real extraction via FFmpeg in main process — TODO)
    set({ waveformPeaks: null, waveformError: null });

    // Set AI game from project data
    if (project?.game) {
      setTimeout(() => {
        try {
          useAIStore.getState().setAiGame(project.game);
        } catch (e) {}
      }, 0);
    }
  },

  setClipTitle: (title) => set({ clipTitle: title }),
  setEditingTitle: (v) => set({ editingTitle: v }),
  setDirty: (v) => set({ dirty: v }),
  markDirty: () => set({ dirty: true }),
  setWaveformPeaks: (peaks) => set({ waveformPeaks: peaks }),
  setWaveformError: (error) => set({ waveformError: error }),

  // ── NLE Segment Actions (non-destructive editing) ──
  // All operations are instant — no FFmpeg, no async, no file modification.
  // Each action: push undo snapshot → apply pure function → set state → sync playback store.

  setNleSegments: (segs) => {
    set({ nleSegments: segs });
    usePlaybackStore.getState().setNleSegments(segs);
  },

  _pushNleUndo: () => {
    try {
      useSubtitleStore.getState()._pushUndo();
    } catch (_) {}
  },

  initNleSegments: (duration) => {
    const { nleSegments, sourceStartTime } = get();
    if (nleSegments.length === 0 && duration > 0) {
      const segs = createInitialSegments(sourceStartTime, sourceStartTime + duration);
      set({ nleSegments: segs });
      usePlaybackStore.getState().setNleSegments(segs);
    }
  },

  splitAtTimeline: (timelineTime) => {
    get()._pushNleUndo();
    const newSegs = splitAtTimeline(get().nleSegments, timelineTime);
    set({ nleSegments: newSegs });
    usePlaybackStore.getState().setNleSegments(newSegs);
    get().markDirty();
  },

  deleteNleSegment: (segmentId) => {
    get()._pushNleUndo();
    const newSegs = deleteSegment(get().nleSegments, segmentId);
    set({ nleSegments: newSegs });
    usePlaybackStore.getState().setNleSegments(newSegs);
    get().markDirty();
  },

  trimNleSegmentLeft: (segmentId, newSourceStart) => {
    get()._pushNleUndo();
    const newSegs = trimSegmentLeft(get().nleSegments, segmentId, newSourceStart);
    set({ nleSegments: newSegs });
    usePlaybackStore.getState().setNleSegments(newSegs);
    get().markDirty();
  },

  trimNleSegmentRight: (segmentId, newSourceEnd) => {
    get()._pushNleUndo();
    const newSegs = trimSegmentRight(get().nleSegments, segmentId, newSourceEnd);
    set({ nleSegments: newSegs });
    usePlaybackStore.getState().setNleSegments(newSegs);
    get().markDirty();
  },

  extendNleSegmentLeft: (segmentId, newSourceStart) => {
    get()._pushNleUndo();
    const { nleSegments, sourceDuration } = get();
    const newSegs = extendSegmentLeft(nleSegments, segmentId, newSourceStart, sourceDuration);
    set({ nleSegments: newSegs });
    usePlaybackStore.getState().setNleSegments(newSegs);
    get().markDirty();
  },

  extendNleSegmentRight: (segmentId, newSourceEnd) => {
    get()._pushNleUndo();
    const { nleSegments, sourceDuration } = get();
    const newSegs = extendSegmentRight(nleSegments, segmentId, newSourceEnd, sourceDuration);
    set({ nleSegments: newSegs });
    usePlaybackStore.getState().setNleSegments(newSegs);
    get().markDirty();
  },

  /**
   * "Delete subtitle/caption + clip" — cut ONLY this segment's span out of the
   * live NLE timeline (#109: single shared action for both the timeline
   * right-click menu and the Edit-subtitles row trash menu, which previously
   * carried duplicate copies that could drift).
   *
   * Splits the NLE timeline at the span's start/end, then deletes only the
   * isolated middle slice (the gap ripple-closes — timeline position is derived
   * from segment order). Uses a PLAIN delete for the sub/cap, never ripple:
   * rippling shifts later segments' source values and desyncs them from footage,
   * whereas the nleSegments mapping already repositions the survivors correctly.
   * Subtitles inside the cut span auto-hide via the mapping and are filtered out
   * on save (#84).
   *
   * @param {"sub"|"cap"} track
   * @param {string} segId
   */
  deleteSpanWithClip: (track, segId) => {
    const subStore = useSubtitleStore.getState();
    const capStore = useCaptionStore.getState();

    // Resolve the span in TIMELINE coordinates. Subtitles are stored
    // source-absolute (→ map through nleSegments); captions are already in
    // timeline time.
    let tlStart, tlEnd;
    if (track === "sub") {
      const raw = subStore.editSegments.find((s) => s.id === segId);
      if (!raw) return;
      const a = sourceToTimeline(raw.startSec, get().nleSegments);
      const b = sourceToTimeline(raw.endSec, get().nleSegments);
      // Span can't be mapped onto the timeline → just drop the subtitle.
      if (!a.found || !b.found) { subStore.deleteSegment(segId); return; }
      tlStart = a.timelineTime;
      tlEnd = b.timelineTime;
    } else if (track === "cap") {
      const seg = capStore.captionSegments.find((s) => s.id === segId);
      if (!seg) return;
      tlStart = seg.startSec;
      tlEnd = seg.endSec;
    } else {
      return;
    }

    // Isolate the span, then delete only the segment(s) inside it.
    get().splitAtTimeline(tlStart);
    get().splitAtTimeline(tlEnd);
    const afterSplit = get().nleSegments;
    const spanIds = afterSplit
      .filter((s) => {
        const r = getSegmentTimelineRange(s.id, afterSplit);
        return r && r.start >= tlStart - 0.01 && r.end <= tlEnd + 0.01;
      })
      .map((s) => s.id);

    if (track === "sub") subStore.deleteSegment(segId);
    else capStore.deleteCaptionSegment(segId);
    spanIds.forEach((id) => get().deleteNleSegment(id));
  },

  /**
   * Phase 4: Media Offline recovery. Opens a file dialog to let the user point
   * to the moved/renamed source recording. On success, updates project.sourceFile
   * and clears sourceOffline state so preview resumes.
   */
  locateSource: async () => {
    const { project } = get();
    if (!project?.id || !window.clipflow?.projectLocateSource) return;
    const result = await window.clipflow.projectLocateSource(project.id);
    if (result?.canceled || result?.error) return;
    if (result?.success && result.sourceFile) {
      set({
        project: { ...project, sourceFile: result.sourceFile },
        sourceOffline: false,
        videoVersion: get().videoVersion + 1,
      });
    }
  },

  // ── Legacy Audio segment actions (kept for gradual migration) ──
  setAudioSegments: (segs) => set({ audioSegments: segs }),

  initAudioSegments: (duration) => {
    const { audioSegments } = get();
    if (audioSegments.length === 0 && duration > 0) {
      set({ audioSegments: [{ id: "audio-1", startSec: 0, endSec: duration, sourceOffset: 0 }] });
    }
    // Also init NLE segments if needed
    get().initNleSegments(duration);
  },

  _pushAudioUndo: () => {
    try {
      useSubtitleStore.getState()._pushUndo();
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

  rippleDeleteAudioSegment: async (segId) => {
    get()._pushAudioUndo();
    const { audioSegments } = get();
    const seg = audioSegments.find(s => s.id === segId);
    if (!seg) return;

    const remainingOrig = audioSegments.filter(s => s.id !== segId);
    if (remainingOrig.length === 0) {
      // #93: clear BOTH models + persist. Previously left a stale nleSegments
      // array and never marked dirty, so the empty state could fail to autosave.
      set({ audioSegments: [], nleSegments: [] });
      usePlaybackStore.getState().setNleSegments([]); // also sets duration = 0
      get().markDirty();
      return;
    }

    // Capture remaining segments BEFORE ripple shift (file-relative positions)
    const sortedOrig = [...remainingOrig].sort((a, b) => a.startSec - b.startSec);

    // Perform ripple shift — close the gap
    const gap = seg.endSec - seg.startSec;
    const next = audioSegments
      .filter(s => s.id !== segId)
      .map(s => {
        if (s.startSec >= seg.endSec) {
          return { ...s, startSec: s.startSec - gap, endSec: s.endSec - gap, sourceOffset: 0 };
        }
        return { ...s, sourceOffset: 0 };
      });
    set({ audioSegments: next });

    // Always concat-recut: rebuild clip file from only the kept segments
    // This ensures the file matches the editor's rippled timeline
    set({ extending: true });
    try {
      const videoRef = usePlaybackStore.getState().getVideoRef();
      if (videoRef?.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      get()._trimToAudioBounds();
      await get()._concatRecutAfterDelete(sortedOrig);
      get().markDirty();
    } catch (err) {
      console.error("[RippleDeleteAudio] ConcatRecut error:", err);
    } finally {
      set({ extending: false, videoVersion: get().videoVersion + 1 });
    }
  },

  // Concat recut: splice only the kept segments from source into a new clip file.
  // Used after mid-section deletes so the file matches the editor's rippled timeline.
  // remainingSegs: audio segments BEFORE ripple shift (original file-relative positions)
  _concatRecutAfterDelete: async (remainingSegs) => {
    const { clip, project, sourceStartTime, sourceDuration } = get();
    if (!clip || !project || !remainingSegs || remainingSegs.length === 0) return;

    // Convert clip-relative positions to source-absolute
    const sourceSegments = remainingSegs
      .sort((a, b) => a.startSec - b.startSec)
      .map(s => ({
        start: sourceStartTime + s.startSec,
        end: sourceStartTime + s.endSec,
      }));

    console.log("[ConcatRecut] sourceSegments:", JSON.stringify(sourceSegments));

    await new Promise((r) => setTimeout(r, 150));

    const result = await window.clipflow.concatRecutClip(
      project.id, clip.id, sourceSegments
    );

    // #97: user switched clips mid-recut — disk already persisted by clipId in
    // the handler; abort the in-memory write so we don't clobber the now-active clip.
    if (get().clip?.id !== clip.id || get().project?.id !== project.id) return;

    if (result?.error) {
      console.error("[ConcatRecut] Failed:", result.error);
      throw new Error(result.error);
    }

    const newDuration = result.duration;
    const newStart = sourceSegments[0].start;
    const newEnd = sourceSegments[sourceSegments.length - 1].end;
    const nleSegs = result.nleSegments || clip.nleSegments;
    const newClip = {
      ...clip,
      startTime: newStart,
      endTime: newEnd,
      duration: newDuration,
      nleSegments: nleSegs,
    };
    const newProject = {
      ...project,
      clips: project.clips.map((c) => (c.id === clip.id ? newClip : c)),
    };
    const maxExtend = sourceDuration > 0 ? sourceDuration - newStart : newDuration;
    set({
      clip: newClip,
      project: newProject,
      sourceStartTime: newStart,
      sourceEndTime: newEnd,
      maxExtendSec: maxExtend > 0 ? maxExtend : newDuration,
      maxExtendLeftSec: newStart,
      nleSegments: nleSegs,
      waveformPeaks: null,
      videoVersion: get().videoVersion + 1,
    });
    usePlaybackStore.getState().setNleSegments(nleSegs); // owns duration (#96)
    console.log("[ConcatRecut] Success — newDuration:", newDuration, "segments:", sourceSegments.length);
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
      console.log("[TrimToAudio] Shifting left by", audioStart, "to fill gap");
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
      // #96: duration is set once below from the final audio bounds — no interim
      // setDuration here (it was unconditionally superseded).
    }

    if (needsSubUpdate) subStore.setEditSegments(subs);
    if (needsCapUpdate) capStore.setCaptionSegments(caps);

    // Always sync playback duration to final audio bounds
    const finalSegs = get().audioSegments;
    if (finalSegs.length > 0) {
      const finalSorted = [...finalSegs].sort((a, b) => a.startSec - b.startSec);
      usePlaybackStore.getState().setDuration(finalSorted[finalSorted.length - 1].endSec);
    }
  },

  // ── Silent save: persistence only, no UI side effects. Shared by handleSave + autosave. ──
  _doSilentSave: async () => {
    const { clip, project, clipTitle } = get();
    if (!clip || !project) return false;
    try {
      const subState = useSubtitleStore.getState();
      const editSegments = subState.editSegments;
      const capState = useCaptionStore.getState();
      const layState = useLayoutStore.getState();
      const { nleSegments, audioSegments } = get();
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
        yPercent: layState.subYPercent ?? 80,
        highlightColor: subState.highlightColor, punctuationRemove: subState.punctuationRemove,
        animateOn: subState.animateOn, animateScale: subState.animateScale,
        animateGrowFrom: subState.animateGrowFrom, animateSpeed: subState.animateSpeed,
        segmentMode: subState.segmentMode,
        syncOffset: subState.syncOffset || 0,
      };
      const captionStyle = {
        fontFamily: capState.captionFontFamily, fontWeight: capState.captionFontWeight || 900,
        fontSize: capState.captionFontSize, bold: capState.captionBold, italic: capState.captionItalic,
        underline: capState.captionUnderline, color: capState.captionColor,
        lineSpacing: capState.captionLineSpacing,
        strokeOn: capState.captionStrokeOn, strokeColor: capState.captionStrokeColor,
        strokeWidth: capState.captionStrokeWidth, strokeOpacity: capState.captionStrokeOpacity,
        strokeBlur: capState.captionStrokeBlur, strokeOffsetX: capState.captionStrokeOffsetX, strokeOffsetY: capState.captionStrokeOffsetY,
        shadowOn: capState.captionShadowOn, shadowColor: capState.captionShadowColor,
        shadowBlur: capState.captionShadowBlur, shadowOpacity: capState.captionShadowOpacity,
        shadowOffsetX: capState.captionShadowOffsetX, shadowOffsetY: capState.captionShadowOffsetY,
        glowOn: capState.captionGlowOn, glowColor: capState.captionGlowColor,
        glowOpacity: capState.captionGlowOpacity, glowIntensity: capState.captionGlowIntensity,
        glowBlur: capState.captionGlowBlur, glowBlend: capState.captionGlowBlend,
        glowOffsetX: capState.captionGlowOffsetX, glowOffsetY: capState.captionGlowOffsetY,
        bgOn: capState.captionBgOn, bgColor: capState.captionBgColor,
        bgOpacity: capState.captionBgOpacity, bgPaddingX: capState.captionBgPaddingX,
        bgPaddingY: capState.captionBgPaddingY, bgRadius: capState.captionBgRadius,
        yPercent: layState.capYPercent ?? 15,
        widthPercent: layState.capWidthPercent ?? 90,
      };
      // #84: persist only subtitles that fall within the clip's CURRENT nleSegments
      // source range (covers trims + extends). editSegments also carries source-wide
      // "extras" merged in for extend-coverage (useSubtitleStore.initSegments) — those
      // must NOT be written to sub1 or it gets polluted with the whole recording. They
      // are re-derived live from project.transcription on every open.
      const persistedSubs = (nleSegments && nleSegments.length > 0)
        ? editSegments.filter((s) =>
            nleSegments.some((n) => s.startSec < n.sourceEnd && s.endSec > n.sourceStart)
          )
        : editSegments;
      await window.clipflow.projectUpdateClip(project.id, clip.id, {
        title: clipTitle,
        caption: capState.captionText,
        captionSegments: capState.captionSegments,
        subtitles: { sub1: persistedSubs, sub2: [], _format: "source-absolute" },
        nleSegments: nleSegments,
        audioSegments: audioSegments, // legacy — kept for backwards compatibility
        subtitleStyle,
        captionStyle,
      });
      set({ dirty: false });
      return true;
    } catch (e) {
      console.error("Save failed:", e);
      return false;
    }
  },

  // ── Explicit save (Save button). Persists + sets dirty=false. UI flash handled by caller. ──
  // Increments _savesInFlight so the dirty=false echo from _doSilentSave can't schedule
  // a redundant autosave 800ms later.
  handleSave: async () => {
    if (_autosaveTimer) { clearTimeout(_autosaveTimer); _autosaveTimer = null; }
    _savesInFlight++;
    try {
      return await get()._doSilentSave();
    } finally {
      _savesInFlight--;
    }
  },

  // ── Autosave: debounced persistence, survives renderer crashes. ──
  // Bail conditions: no clip/project (nothing to save), or `extending` (FFmpeg actively
  // rewriting the source file + clip metadata — autosaving mid-extend would race with the
  // extend handler's own updateClip call and could overwrite {sourceStartTime, duration}).
  scheduleAutosave: () => {
    // Suppress during any in-flight save: _doSilentSave calls set({ dirty: false }), which
    // fires the useEditorStore subscribe listener, which calls scheduleAutosave. Without
    // this guard that would loop: save → dirty=false echo → schedule → save → ...
    if (_savesInFlight > 0) return;
    const { clip, project, extending } = get();
    if (!clip || !project) return;
    if (extending) return;
    if (_autosaveTimer) clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => {
      _autosaveTimer = null;
      // Re-check guards at fire time — state may have changed during the 800ms window.
      const { clip: c, project: p, extending: ex } = get();
      if (!c || !p || ex) return;
      // If a save started during the debounce (e.g., explicit Save button), skip this
      // autosave — the explicit save already captured newer state.
      if (_savesInFlight > 0) return;
      _savesInFlight++;
      const t0 = performance.now();
      const clipId = c.id;
      get()._doSilentSave().finally(() => {
        _savesInFlight--;
        const ms = Math.round(performance.now() - t0);
        console.log(`[autosave] saved clipId=${clipId} in ${ms}ms`);
      });
    }, AUTOSAVE_DEBOUNCE_MS);
  },

  // ── Flush: cancel pending timer + fire save immediately (awaitable). ──
  // Used on window blur + editor unmount.
  flushAutosave: async () => {
    if (_autosaveTimer) {
      clearTimeout(_autosaveTimer);
      _autosaveTimer = null;
    }
    // If a save is already running (explicit or autosave), skip — it'll land with current
    // state. Double-flushing (e.g., blur during handleSave) just returns.
    if (_savesInFlight > 0) return;
    const { clip, project, extending } = get();
    if (!clip || !project || extending) return;
    _savesInFlight++;
    try {
      await get()._doSilentSave();
    } finally {
      _savesInFlight--;
    }
  },
}));

export default useEditorStore;
