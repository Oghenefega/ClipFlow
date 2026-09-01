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
import { getTimelineDuration, sourceToTimeline, sourceToTimelineClamped, getSegmentTimelineRange, timelineToSource, segmentIdAtTimeline } from "../models/timeMapping";
import { normalizePlacements, resolvePlacements, occupantsFromLane, SOUND_TRACK_CAP } from "../models/audioPlacements";
import { normalizeMediaPlacements, DEFAULT_MEDIA_SEC, DEFAULT_VIDEO_VOLUME, MEDIA_TRACK_CAP } from "../models/mediaPlacements";
import { splitAtTimeline, deleteSegment, moveSegment, trimSegmentLeft, trimSegmentRight, extendSegmentLeft, extendSegmentRight } from "../models/segmentOps";
import { resolveReframeStyle, resolveClipReframe, resolveSegmentReframe } from "../utils/reframeStyle";

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

// #348: mirror a clip's reframe write onto the in-store project.clips copy so
// panel state derived from project.clips stays consistent with disk.
// reframe === undefined deletes the override key (inherit); null/object set it.
function projectWithClipReframe(project, clipId, reframe) {
  if (!project?.clips) return project;
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id !== clipId) return c;
      if (reframe === undefined) {
        const { reframe: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, reframe };
    }),
  };
}

// #297: the writer hands back errno text ("EPERM: operation not permitted,
// rename '...'"). A creator needs the cause, not the syscall — and needs enough
// to report it. Say what happened, keep the code. Unrecognised errors pass
// through verbatim rather than being flattened into something vague.
function describeSaveFailure(reason) {
  const code = /(EPERM|EACCES|EROFS|EBUSY|ENOSPC|ENOENT)/.exec(reason || "")?.[1];
  switch (code) {
    case "EPERM":
    case "EACCES":
    case "EROFS":
      return `the project file is read-only or locked by another program (${code})`;
    case "EBUSY":
      return `the project file is in use by another program (${code})`;
    case "ENOSPC":
      return `the drive is full (${code})`;
    case "ENOENT":
      return `the project folder is missing — is the drive still connected? (${code})`;
    default:
      return reason;
  }
}

// #178/#300: what Chromium's media stack can actually decode. FFmpeg handles
// everything below and more, which is why a file can transcribe, waveform and
// render perfectly while the preview shows a black rectangle or plays mute.
// HEVC is listed because Electron decodes it where the GPU can; when it can't,
// the <video> raises an error event and the decode path reports it instead.
const CHROMIUM_AUDIO_CODECS = ["aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le", "pcm_s24le", "pcm_u8", "pcm_f32le"];
const CHROMIUM_VIDEO_CODECS = ["h264", "vp8", "vp9", "av1", "hevc"];
const CODEC_LABELS = { alac: "ALAC (Apple Lossless)", ac3: "AC-3 (Dolby Digital)", eac3: "E-AC-3", dts: "DTS", truehd: "Dolby TrueHD" };

/**
 * Turn an ffprobe result into a plain-language warning, or null when the file
 * is fine.
 *
 * Codecs only — deliberately NOT the container. Measured on Electron 40
 * (s192): Chromium plays H.264 + AAC inside Matroska bytes perfectly well, so
 * warning on "this is an MKV" would nag people whose recording works. What
 * actually breaks is codec-level, and a codec the element can't open at all
 * raises an error event instead (see setPreviewDecodeError).
 */
function describePlaybackGap(info) {
  const audio = (info.audioCodec || "").toLowerCase();
  if (audio && !CHROMIUM_AUDIO_CODECS.includes(audio)) {
    return {
      kind: "audio",
      codec: audio,
      title: `No sound in the preview — ${CODEC_LABELS[audio] || audio.toUpperCase()} audio`,
      detail: "The preview can't decode this recording's audio format, so it plays silently. Subtitles, waveforms and the finished clip are unaffected. To hear it here, set OBS's recording audio encoder to AAC or FLAC.",
    };
  }

  const video = (info.videoCodec || "").toLowerCase();
  if (video && !CHROMIUM_VIDEO_CODECS.includes(video)) {
    return {
      kind: "video",
      codec: video,
      title: `No picture in the preview — ${video.toUpperCase()} video`,
      detail: "The preview can't decode this recording's video format. Detection and rendering are unaffected. To see it here, record with H.264 or HEVC in OBS.",
    };
  }

  return null;
}

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
  // #297: why the last save failed, or null when the clip is safely on disk.
  // Sticky on purpose — unlike a flash, silent data loss deserves to stay on
  // screen until it is actually resolved.
  saveError: null,
  waveformPeaks: null,
  waveformError: null,

  // ── NLE Segment Model (non-destructive editing) ──
  // Each segment is { id, sourceStart, sourceEnd } — a window into the source file.
  // Timeline position is DERIVED from segment order, never stored.
  nleSegments: [],
  // #202: SFX/music placements on the Music + SFX lanes. Both kinds share one
  // shape: an anchor at a SOURCE moment (so they follow their footage through
  // trims/reorders, like subtitles) plus the window of their file that plays.
  // Timeline length is DERIVED: trimEnd - trimStart.
  // Shape: { id, assetId, name, path, kind: "sfx"|"music", durationSec,
  //          sourceTime, trimStart, trimEnd, volume 0-1, trackIndex,
  //          fadeIn?/fadeOut? (music only, seconds) }
  audioPlacements: [],
  // #312: how many lanes each sound kind is split across. Purely layout — the
  // mix takes every placement regardless — so this exists only so overlapping
  // sounds stop drawing over each other.
  musicTrackCount: 1,
  sfxTrackCount: 1,
  // #310/#311: images, GIFs and videos placed on the picture. Anchored to a
  // SOURCE moment like sounds are, plus where they sit on the OUTPUT frame
  // (percent, x/y = centre).
  // Shape: { id, assetId, name, path, mediaType: "image"|"gif"|"video",
  //          durationSec, sourceTime, trimStart, trimEnd, trackIndex,
  //          xPct, yPct, wPct, opacity 0-1, and on videos volume 0-1 + muted }.
  //          trimStart is 0 on stills and GIFs; on a video it's a real window
  //          into the file. See models/mediaPlacements.js.
  mediaPlacements: [],
  // How many media lanes are shown. Lane index IS z-order — higher draws on top.
  mediaTrackCount: 1,
  // #296: lane enable + source-audio mute, persisted per clip. Absent means
  // ENABLED everywhere — every read is `!== false` — so clips saved before this
  // feature open with every lane on and nothing has to migrate. The Subtitle
  // lane is NOT here: it is `showSubs` in useSubtitleStore, the switch the
  // render already had and never honoured (#295).
  laneEnabled: { cap: true, music: true, sfx: true, media: true },
  sourceAudioMuted: false,
  // #210: bumped whenever something outside the Audio panel edits the asset
  // LIBRARY (not a placement) — saving a sound's default volume from the
  // timeline popover, for one. The panel owns `assets` in its own state, so
  // without this it keeps handing stale entries to addAudioPlacement and a
  // freshly-saved default is ignored until the panel is reopened.
  assetsRevision: 0,
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

  // #178/#300: the preview must never fail silently. Two ways it can:
  //   - the <video> refuses the file outright (raises an error event), or
  //   - it plays video with no sound because Chromium has no decoder for the
  //     audio codec (ALAC, AC-3) — no error event at all, just silence.
  // A probe on load catches the second; onError catches the first.
  // { kind: "decode" | "audio" | "video", codec, title, detail }
  previewWarning: null,

  // ── #164 Reframe calibration draft ──
  // Live-edited copy of project.reframe while the Layout panel is open.
  // null = not calibrating. The preview renders boxes + a live vertical PiP
  // from this draft; commitReframeDraft persists it, cancelReframeDraft drops it.
  reframeDraft: null,

  // The Layout panel owns the Result canvas element; the preview compositor paints it.
  reframePipCanvas: null,

  // #164 B4: one-shot flag raised by the preview's auto-offer banner ([Set up]).
  // The Layout panel consumes it once the calibration draft exists and fires
  // the same Detect the button runs. Cleared on consume, cancel, and clip load.
  reframeAutoDetectPending: false,

  // #349: which target the Layout panel writes to — the open clip (Phase A
  // behaviour) or the section under the playhead. Reset on clip load.
  layoutScope: "clip",

  // ── Actions ──
  initFromContext: async (editorContext, localProjects) => {
    if (!editorContext) {
      set({ project: null, clip: null, clipTitle: "", dirty: false, saveError: null, previewWarning: null, reframeDraft: null, reframeAutoDetectPending: false });
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
        // #297: source preview never writes, so a saveError carried over from a
        // previous clip could never clear here (Retry no-ops with clip: null).
        saveError: null,
        waveformPeaks: null,
        waveformError: null,
        audioSegments: [],
        nleSegments: [],
        audioPlacements: [],
        mediaPlacements: [],
        mediaTrackCount: 1,
        musicTrackCount: 1,
        sfxTrackCount: 1,
        laneEnabled: { cap: true, music: true, sfx: true, media: true },
        sourceAudioMuted: false,
        sourceStartTime: 0,
        sourceEndTime: 0,
        sourceDuration: 0,
        maxExtendSec: 0,
        maxExtendLeftSec: 0,
        extending: false,
        sourceOffline,
        previewWarning: null,
      });
      usePlaybackStore.getState().reset();
      usePlaybackStore.setState({ clipFileOffset: 0, clipFileDuration: 0 });
      if (!sourceOffline) get().checkSourcePlayability(path);
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
    set({ clip: null, project: null, clipTitle: "Loading...", dirty: false, saveError: null, waveformPeaks: null, waveformError: null, audioSegments: [], nleSegments: [], audioPlacements: [], mediaPlacements: [], mediaTrackCount: 1, musicTrackCount: 1, sfxTrackCount: 1, laneEnabled: { cap: true, music: true, sfx: true, media: true }, sourceAudioMuted: false });

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
      // #202: restore SFX/music placements from the clip record (normalize fills
      // the trim window + anchor that pre-trimming clips don't carry)
      audioPlacements: normalizePlacements(clip?.sfx, nleSegs),
      // #310: image/GIF overlays. Same deal — normalize fills the defaults a
      // clip saved by an older build doesn't carry.
      mediaPlacements: normalizeMediaPlacements(clip?.media),
      mediaTrackCount: Math.max(1, Math.min(MEDIA_TRACK_CAP, clip?.mediaTrackCount || 1)),
      // #312: extra Music/SFX lanes. Absent = one lane, which is what every
      // clip saved before this had.
      musicTrackCount: Math.max(1, Math.min(SOUND_TRACK_CAP, clip?.musicTrackCount || 1)),
      sfxTrackCount: Math.max(1, Math.min(SOUND_TRACK_CAP, clip?.sfxTrackCount || 1)),
      // #296: absent = enabled, so a clip that predates the feature opens with
      // every lane on and its source audio audible.
      laneEnabled: {
        cap: clip?.laneEnabled?.cap !== false,
        music: clip?.laneEnabled?.music !== false,
        sfx: clip?.laneEnabled?.sfx !== false,
        media: clip?.laneEnabled?.media !== false,
      },
      sourceAudioMuted: clip?.sourceAudioMuted === true,
      sourceStartTime: sourceStart,
      sourceEndTime: sourceEnd,
      sourceDuration: sourceDur,
      maxExtendSec: maxExtend > 0 ? maxExtend : clipDuration,
      maxExtendLeftSec: sourceStart,
      extending: false,
      sourceOffline,
      previewWarning: null, // re-probed below for the newly opened source
      reframeDraft: null, // #164: a clip/project switch drops any in-flight calibration
      reframeAutoDetectPending: false,
      layoutScope: "clip", // #349
    });

    if (!sourceOffline && project?.sourceFile) get().checkSourcePlayability(project.sourceFile);

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

    // Sync NLE segments to playback store for duration and segment-aware
    // playback. snapToStart: the <video> still holds the previous clip here
    // (its src swaps on the next render), so the default element-read snap
    // would decide from stale time (#90) — a clip open starts at its head.
    usePlaybackStore.getState().setNleSegments(nleSegs, { snapToStart: true });

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

    // Set AI game from the clip's content tag when retagged (#197), else the project
    const aiGameName = clip?.gameName || project?.game;
    if (aiGameName) {
      setTimeout(() => {
        try {
          useAIStore.getState().setAiGame(aiGameName);
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

  /**
   * Reorder: move a section to a different slot on the timeline. Source times
   * are untouched, so subtitles (source-timed, projected through this list on
   * every read) travel with the section automatically.
   *
   * @param {string} segmentId
   * @param {number} toIndex - slot counted AFTER the section is lifted out
   */
  moveNleSegment: (segmentId, toIndex) => {
    const newSegs = moveSegment(get().nleSegments, segmentId, toIndex);
    if (newSegs === get().nleSegments) return; // no-op drop — no undo entry
    get()._pushNleUndo();
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

  /**
   * The M / S keys: make the playhead the start (or the end) of the section it
   * currently sits inside. The rest of that section on the far side of the
   * playhead is trimmed off, and any whole section beyond it is removed.
   *
   * Selection is deliberately ignored — the section under the playhead is the
   * target, so the keys behave the same whatever happens to be highlighted.
   *
   * Timeline position is the ordered concatenation of the sections, so removing
   * and trimming closes the gap on its own; there is no ripple step. The whole
   * operation is ONE undo entry, not one per section removed.
   *
   * @param {"start"|"end"} side
   */
  trimTimelineToPlayhead: (side) => {
    const segs = get().nleSegments;
    if (segs.length === 0) return;

    const timelineTime = usePlaybackStore.getState().currentTime;
    let { sourceTime, found, segmentIndex } = timelineToSource(timelineTime, segs);
    if (!found) return;

    // Sitting exactly on a join, timelineToSource resolves to the EARLIER
    // section (its offset equals its full duration). On screen the playhead is
    // at the head of the next one, so treat it that way — otherwise M would
    // shave the previous section down to the 50ms minimum instead of dropping
    // it, which looks like the key half-worked.
    if (sourceTime >= segs[segmentIndex].sourceEnd - 1e-6 && segmentIndex + 1 < segs.length) {
      segmentIndex += 1;
      sourceTime = segs[segmentIndex].sourceStart;
    }

    const target = segs[segmentIndex];
    const trimmed = side === "start"
      ? trimSegmentLeft(segs, target.id, sourceTime)
      : trimSegmentRight(segs, target.id, sourceTime);

    // Drop the sections wholly on the far side of the playhead.
    const kept = side === "start"
      ? trimmed.slice(segmentIndex)
      : trimmed.slice(0, segmentIndex + 1);

    // Playhead already sat on that edge (or the trim clamped to nothing) —
    // don't burn an undo entry on a no-op. Compared by value because
    // trimSegment* rebuilds the target object either way.
    const unchanged = kept.length === segs.length &&
      kept.every((s, i) => s.sourceStart === segs[i].sourceStart && s.sourceEnd === segs[i].sourceEnd);
    if (unchanged) return;

    get()._pushNleUndo();
    set({ nleSegments: kept });
    usePlaybackStore.getState().setNleSegments(kept);

    // Park the playhead on the same frame it was on: that frame is now either
    // the first or the last on the timeline. Set explicitly rather than letting
    // setNleSegments infer it from the element's position, which lags a seek.
    usePlaybackStore.getState().seekTo(side === "start" ? 0 : getTimelineDuration(kept));
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

  // ── Asset audio placements (#202) — the Music + SFX lanes ──
  // Both kinds anchor to a source-absolute `sourceTime` and play the file
  // window [trimStart, trimEnd]; see models/audioPlacements.js.

  bumpAssetsRevision: () => set({ assetsRevision: get().assetsRevision + 1 }),

  addAudioPlacement: (asset, sourceTime) => {
    get()._pushNleUndo();
    const kind = asset.type === "music" ? "music" : "sfx";
    const fileLen = asset.durationSec || 0;
    const placement = {
      id: `snd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      assetId: asset.id,
      name: asset.name,
      path: asset.path,
      kind,
      durationSec: fileLen,
      // Music sits under the voice. Effects sit above the music but still under
      // it — a library one-shot is mastered hot, and dropping one at full level
      // buried the clip. Existing placements keep whatever they were given.
      // #210: a level saved on the asset itself wins — that's the whole point of
      // calibrating a boom once instead of on every clip.
      volume: asset.defaultVolume ?? (kind === "music" ? 0.4 : 0.6),
      sourceTime,
      trimStart: 0,
      trimEnd: fileLen,
      // #312: first lane of its kind. Nothing auto-stacks — a sound landing on
      // a second lane would be a surprise, and the lanes are layout only.
      trackIndex: 0,
      // #209: both kinds fade. A cinematic boom wants a tail as much as a song
      // does; the fade math was never music-specific, only the gates were.
      fadeIn: 0,
      fadeOut: 0,
    };

    let list = get().audioPlacements;
    let clampedName = null;

    // A song fills the room it has — up to the next song, or the end of the
    // clip, or the length of the file, whichever comes first — and the song
    // playing across this moment ends here. That single gesture IS the switch
    // from one track to another. Nothing is removed: a song dropped between two
    // others just fills the gap.
    if (kind === "music") {
      const nle = get().nleSegments || [];
      const clipEnd = getTimelineDuration(nle);
      const anchor = sourceToTimelineClamped(sourceTime, nle);
      const start = anchor.found ? anchor.timelineTime : 0;
      const songs = resolvePlacements(list.filter((p) => p.kind === "music"), nle);

      let room = clipEnd > start ? clipEnd - start : (fileLen || 0);
      for (const s of songs) {
        if (s.tlStart > start + 0.001) room = Math.min(room, s.tlStart - start);
      }
      placement.trimEnd = Math.max(0.5, Math.min(fileLen || room, room));

      list = list.map((p) => {
        if (p.kind !== "music") return p;
        const s = songs.find((x) => x.id === p.id);
        // Only the song actually playing across this moment gets cut short.
        if (!s || s.tlStart > start - 0.001 || s.tlEnd <= start + 0.001) return p;
        clampedName = p.name;
        return { ...p, trimEnd: (p.trimStart || 0) + Math.max(0.2, start - s.tlStart) };
      });
    }

    set({ audioPlacements: [...list, placement] });
    get().markDirty();
    return { id: placement.id, clampedName };
  },

  // Alt+drag duplicate — clone sits on the same moment; the drag that follows
  // moves the clone (same convention as subtitle blocks).
  duplicateAudioPlacement: (id) => {
    const src = get().audioPlacements.find((p) => p.id === id);
    if (!src) return null;
    get()._pushNleUndo();
    const clone = { ...src, id: `snd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` };
    set({ audioPlacements: [...get().audioPlacements, clone] });
    get().markDirty();
    return clone.id;
  },

  // Commit a drag: move a sound to a new source-absolute time (undo = one Ctrl+Z).
  moveAudioPlacement: (id, newSourceTime) => {
    get()._pushNleUndo();
    set({
      audioPlacements: get().audioPlacements.map((p) =>
        p.id === id ? { ...p, sourceTime: newSourceTime } : p
      ),
    });
    get().markDirty();
  },

  // Live-updating props (volume slider, fades, trim handles) — no undo entry
  // per tick; the caller pushes one when its gesture starts.
  setAudioPlacementProps: (id, patch) => {
    set({
      audioPlacements: get().audioPlacements.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
    });
    get().markDirty();
  },

  // ── #312: extra Music / SFX lanes ──
  // A sound lane index is LAYOUT ONLY — the mix is unchanged by it, so adding a
  // lane and dragging a block onto it can never alter the export. That's the
  // whole difference from a media lane, where the index IS z-order.
  addSoundTrack: (kind) => {
    const key = kind === "music" ? "musicTrackCount" : "sfxTrackCount";
    const next = Math.min(SOUND_TRACK_CAP, (get()[key] || 1) + 1);
    if (next === get()[key]) return;
    set({ [key]: next });
    get().markDirty();
  },

  // Only ever removes the LAST lane, and only when it's empty — a sound should
  // never vanish because a lane was closed under it. "Empty" is asked of the RAW
  // placements, so a dormant one (footage cut away, block not drawn) still holds
  // the lane; the timeline's − button asks the same question, so it can never
  // render over a click this refuses (#321).
  removeSoundTrack: (kind) => {
    const key = kind === "music" ? "musicTrackCount" : "sfxTrackCount";
    const count = get()[key] || 1;
    if (count <= 1) return false;
    const last = count - 1;
    const mine = get().audioPlacements.filter((p) => p.kind === kind);
    if (occupantsFromLane(mine, last).length > 0) return false;
    set({ [key]: last });
    get().markDirty();
    return true;
  },

  deleteAudioPlacement: (id) => {
    get()._pushNleUndo();
    set({ audioPlacements: get().audioPlacements.filter((p) => p.id !== id) });
    get().markDirty();
  },

  // ── #296: disable / enable ──
  // Disabling never touches `volume`, so the level you dialled in survives
  // being switched off and back on — the whole reason this replaced the
  // mute-by-zeroing-the-slider idea (#294).
  // A mixed selection resolves one way: if anything is still on, turn it off.
  // Re-enabling REMOVES the key rather than writing `enabled: true`, so a
  // placement switched off and back on is byte-identical to before.
  toggleAudioPlacementEnabled: (ids) => {
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length === 0) return;
    const placements = get().audioPlacements;
    const anyOn = placements.some((p) => list.includes(p.id) && p.enabled !== false);
    get()._pushNleUndo();
    set({
      audioPlacements: placements.map((p) => {
        if (!list.includes(p.id)) return p;
        if (!anyOn) { const { enabled, ...rest } = p; return rest; }
        return { ...p, enabled: false };
      }),
    });
    get().markDirty();
  },

  // ── Media placements (#310) — the image/GIF overlay lanes ──
  // Same anchoring as sounds (a SOURCE moment, so an overlay follows its
  // footage), plus where it sits on the OUTPUT frame in percent.
  // See models/mediaPlacements.js.

  // `durationSec` is the file's own length — a GIF's loop or a video's runtime,
  // probed at add time; null for a still. The block starts one loop / one whole
  // video long, or DEFAULT_MEDIA_SEC.
  addMediaPlacement: (asset, sourceTime, durationSec = null) => {
    get()._pushNleUndo();
    const len = durationSec > 0 ? durationSec : DEFAULT_MEDIA_SEC;
    const mediaType = asset.type === "gif" ? "gif" : asset.type === "video" ? "video" : "image";
    const placement = {
      id: `med_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      assetId: asset.id,
      name: asset.name,
      path: asset.path,
      mediaType,
      durationSec: durationSec > 0 ? durationSec : null,
      sourceTime,
      trimStart: 0,
      trimEnd: len,
      // #311: a video's sound rides along, on by default. Absent on stills and
      // GIFs — there's nothing to level.
      ...(mediaType === "video" ? { volume: DEFAULT_VIDEO_VOLUME, muted: false } : {}),
      // Bottom lane by default. Nothing auto-stacks: which lane an overlay sits
      // on IS the user's z-order decision, so we never move one for them.
      trackIndex: 0,
      xPct: 50,
      yPct: 50,
      wPct: 40,
      opacity: 1,
    };
    set({ mediaPlacements: [...get().mediaPlacements, placement] });
    get().markDirty();
    return { id: placement.id };
  },

  // Alt+drag duplicate — the clone sits on the same moment and the drag that
  // follows moves it (same convention as sound and subtitle blocks).
  duplicateMediaPlacement: (id) => {
    const src = get().mediaPlacements.find((p) => p.id === id);
    if (!src) return null;
    get()._pushNleUndo();
    const clone = { ...src, id: `med_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` };
    set({ mediaPlacements: [...get().mediaPlacements, clone] });
    get().markDirty();
    return clone.id;
  },

  // Live-updating props (canvas drag/resize, opacity, trim handles) — no undo
  // entry per tick; the caller pushes one when its gesture starts.
  setMediaPlacementProps: (id, patch) => {
    set({
      mediaPlacements: get().mediaPlacements.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
    });
    get().markDirty();
  },

  deleteMediaPlacement: (id) => {
    get()._pushNleUndo();
    set({ mediaPlacements: get().mediaPlacements.filter((p) => p.id !== id) });
    get().markDirty();
  },

  // #296 convention: re-enabling REMOVES the key rather than writing
  // `enabled: true`, so a placement switched off and back on is byte-identical.
  toggleMediaPlacementEnabled: (ids) => {
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length === 0) return;
    const placements = get().mediaPlacements;
    const anyOn = placements.some((p) => list.includes(p.id) && p.enabled !== false);
    get()._pushNleUndo();
    set({
      mediaPlacements: placements.map((p) => {
        if (!list.includes(p.id)) return p;
        if (!anyOn) { const { enabled, ...rest } = p; return rest; }
        return { ...p, enabled: false };
      }),
    });
    get().markDirty();
  },

  addMediaTrack: () => {
    const next = Math.min(MEDIA_TRACK_CAP, (get().mediaTrackCount || 1) + 1);
    if (next === get().mediaTrackCount) return;
    set({ mediaTrackCount: next });
    get().markDirty();
  },

  // Only ever removes the TOP lane, and only when it's empty — an overlay
  // should never vanish because a lane was closed under it. Same raw-placement
  // occupancy question the sound twin asks, and the same one the − button asks
  // before it renders (#321).
  removeMediaTrack: () => {
    const count = get().mediaTrackCount || 1;
    if (count <= 1) return false;
    const top = count - 1;
    if (occupantsFromLane(get().mediaPlacements, top).length > 0) return false;
    set({ mediaTrackCount: top });
    get().markDirty();
    return true;
  },

  // Caption / Music / SFX / Media lanes. The Subtitle lane lives in useSubtitleStore
  // (`showSubs`), and the Audio lane gets a MUTE rather than a disable — its
  // blocks are the video sections, so switching it off would delete the picture.
  toggleLaneEnabled: (lane) => {
    const cur = get().laneEnabled || {};
    set({ laneEnabled: { ...cur, [lane]: cur[lane] === false } });
    get().markDirty();
  },

  toggleSourceAudioMuted: () => {
    set({ sourceAudioMuted: !get().sourceAudioMuted });
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
        previewWarning: null,
        videoVersion: get().videoVersion + 1,
      });
      get().checkSourcePlayability(result.sourceFile);
    }
  },

  /**
   * #178/#300: probe the source and warn about anything Chromium can't play.
   *
   * FFmpeg decodes far more than Chromium does, so transcription, waveforms and
   * the final render all succeed on files the preview cannot show — which is
   * exactly why the failure reads as "the editor is broken" rather than "this
   * codec isn't supported". Fire-and-forget: never blocks opening a clip.
   */
  checkSourcePlayability: async (sourcePath) => {
    if (!sourcePath || !window.clipflow?.ffmpegProbe) return;
    const myGen = _loadGen;
    let info = null;
    try { info = await window.clipflow.ffmpegProbe(sourcePath); } catch (_) { return; }
    if (!info || myGen !== _loadGen) return; // stale load, or probe unavailable

    const warning = describePlaybackGap(info);
    if (warning && !get().previewWarning) set({ previewWarning: warning });
  },

  /**
   * Raised by the preview's <video> onError — the element refused the file.
   * Outranks a probe warning: this one already happened on screen.
   */
  setPreviewDecodeError: (detail) => {
    set({
      previewWarning: {
        kind: "decode",
        title: "This recording can't be played here",
        detail: detail || "The preview couldn't decode the file. Transcription, subtitles and rendering are unaffected.",
      },
    });
  },

  dismissPreviewWarning: () => set({ previewWarning: null }),

  // ── #164 Reframe calibration (Layout panel) ──
  beginReframeDraft: (sourceW, sourceH) => {
    const { project, reframeDraft, layoutScope, nleSegments } = get();
    if (reframeDraft) return; // already calibrating
    // Dims resolution chain: explicit args → project probe fields → the live
    // <video> element (covers pre-#164 projects with null probe fields) →
    // 1920x1080 as the final guess. Works for ANY aspect — Fega's real canvas
    // is 2560x2880 (8:9), never assume horizontal.
    const vid = usePlaybackStore.getState()._videoRef?.current;
    const w = sourceW || project?.sourceWidth || vid?.videoWidth || 1920;
    const h = sourceH || project?.sourceHeight || vid?.videoHeight || 1080;
    // #349: under section scope the draft targets the section under the
    // playhead, captured NOW so scrubbing during calibration can't retarget
    // it. Seeds from that section's effective layout.
    const targetSegmentId = layoutScope === "section" && nleSegments.length > 1
      ? segmentIdAtTimeline(usePlaybackStore.getState().currentTime || 0, nleSegments)
      : null;
    const targetSeg = targetSegmentId ? nleSegments.find((s) => s.id === targetSegmentId) : null;
    const existing = targetSeg
      ? resolveSegmentReframe(targetSeg, get().clip, project)
      : resolveClipReframe(get().clip, project); // #348: clip override > project layout
    // #164 B3: camRect === null is a real saved value (game-only layout) —
    // it must route to the "edit existing" path, not fresh defaults.
    if (existing?.gameRect && (existing.camRect || existing.camRect === null)) {
      set({
        reframeDraft: {
          layoutId: existing.layoutId ?? null,
          camRect: existing.camRect ? { ...existing.camRect } : null,
          gameRect: { ...existing.gameRect },
          style: resolveReframeStyle(existing?.style),
          sourceW: w,
          sourceH: h,
          targetSegmentId,
        },
      });
      return;
    }
    // Fresh defaults (Fega, session 103): game covers the FULL frame — users
    // free-form crop the sides themselves, which is also how the cam corner
    // gets shaved off the game band. Cam guess sits bottom-left.
    set({
      reframeDraft: {
        layoutId: null,
        camRect: { x: Math.round(w * 0.02), y: Math.round(h * 0.68), w: Math.round(w * 0.26), h: Math.round(h * 0.28) },
        gameRect: { x: 0, y: 0, w, h },
        style: resolveReframeStyle(null),
        sourceW: w,
        sourceH: h,
        targetSegmentId,
      },
    });
  },

  updateReframeDraft: (key, rect) => {
    const { reframeDraft } = get();
    if (!reframeDraft || (key !== "camRect" && key !== "gameRect")) return;
    // #164 B3: camRect may be cleared to null (game-only presets).
    const next = key === "camRect" && rect === null
      ? null
      : { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
    set({
      reframeDraft: {
        ...reframeDraft,
        [key]: next,
      },
    });
  },

  // Merge a style patch into the in-flight draft (Layout panel "Background &
  // edge" controls); no-op when not calibrating.
  updateReframeStyle: (patch) => {
    const { reframeDraft } = get();
    if (!reframeDraft) return;
    set({
      reframeDraft: {
        ...reframeDraft,
        style: resolveReframeStyle({ ...reframeDraft.style, ...patch }),
      },
    });
  },

  setReframePipCanvas: (el) => set({ reframePipCanvas: el }),

  cancelReframeDraft: () => set({ reframeDraft: null, reframeAutoDetectPending: false }),

  // #164 B4: banner → Layout panel handshake for the auto-run Detect.
  requestReframeAutoDetect: () => set({ reframeAutoDetectPending: true }),
  clearReframeAutoDetect: () => set({ reframeAutoDetectPending: false }),

  // Persist the draft as the OPEN CLIP's layout override (#348 — Apply is
  // clip-scoped; "Apply to all clips" is the separate whole-project action)
  // AND upsert it into the app-level layout library (`reframeLayouts`) under
  // layoutName — one Apply both applies and saves (Fega, session 105: the
  // separate save step was redundant). Upserts by the draft's layoutId so
  // repeat applies update the same entry (no duplicates); a fresh layout gets
  // its new id in the SAME write. Default is only claimed when no valid
  // default exists. Re-checks project AND clip identity after the IPC await so
  // a rapid clip/project switch can't get a stale write (#97 family).
  commitReframeDraft: async (layoutName) => {
    const { project, clip, reframeDraft } = get();
    if (!project?.id || !reframeDraft) return { error: "Nothing to apply" };
    if (!clip?.id) return { error: "Open a clip to apply a layout" };
    const clipId = clip.id;
    const name = (layoutName || "").trim() || "Layout";
    const layouts = (await window.clipflow.storeGet("reframeLayouts")) || [];
    const existingIdx = reframeDraft.layoutId
      ? layouts.findIndex((l) => l.id === reframeDraft.layoutId)
      : -1;
    const id = existingIdx >= 0 ? layouts[existingIdx].id : "layout_" + Date.now();
    const reframe = {
      layoutId: id,
      // #164 B3: {...null} would become {} — null camRect must copy as null.
      camRect: reframeDraft.camRect ? { ...reframeDraft.camRect } : null,
      gameRect: { ...reframeDraft.gameRect },
      style: resolveReframeStyle(reframeDraft.style),
    };
    if (get().project?.id !== project.id || get().clip?.id !== clipId) return { error: "Clip changed during save" };
    if (reframeDraft.targetSegmentId) {
      // #349: section scope — a store write; autosave persists nleSegments.
      const r = get().setSegmentReframe(reframeDraft.targetSegmentId, reframe);
      if (r?.error) return r;
    } else {
      const result = await window.clipflow.projectUpdateClipReframe(project.id, clipId, reframe);
      if (result?.error) return result;
      if (get().project?.id !== project.id || get().clip?.id !== clipId) return { error: "Clip changed during save" };
    }
    const now = new Date().toISOString();
    const entryFields = {
      name,
      camRect: reframe.camRect ? { ...reframe.camRect } : null,
      gameRect: { ...reframe.gameRect },
      style: { ...reframe.style },
      updatedAt: now,
    };
    if (existingIdx >= 0) {
      layouts[existingIdx] = { ...layouts[existingIdx], ...entryFields };
    } else {
      layouts.push({
        id,
        sourceWidth: project.sourceWidth,
        sourceHeight: project.sourceHeight,
        createdAt: now,
        ...entryFields,
      });
    }
    await window.clipflow.storeSet("reframeLayouts", layouts);
    const currentDefaultId = await window.clipflow.storeGet("reframeLayoutDefaultId");
    if (!(currentDefaultId && layouts.some((l) => l.id === currentDefaultId))) {
      await window.clipflow.storeSet("reframeLayoutDefaultId", id);
    }
    if (reframeDraft.targetSegmentId) {
      set({ reframeDraft: null });
      return { success: true };
    }
    set({
      clip: { ...get().clip, reframe },
      project: projectWithClipReframe(get().project, clipId, reframe),
      reframeDraft: null,
    });
    return { success: true };
  },

  // #349: write ONE section's layout. reframe: object = section override,
  // null = this section renders raw, undefined = drop the key (inherit the
  // clip). Store-only on purpose: _doSilentSave writes nleSegments wholesale
  // and the undo stack snapshots them, so persistence and undo come free —
  // unlike clip.reframe, which is kept out of the autosave list and needs its
  // own IPC.
  setSegmentReframe: (segmentId, reframe) => {
    const segs = get().nleSegments;
    const idx = segs.findIndex((s) => s.id === segmentId);
    if (idx === -1) return { error: "Section not found" };
    get()._pushNleUndo();
    const next = segs.map((s, i) => {
      if (i !== idx) return s;
      if (reframe === undefined) {
        const { reframe: _drop, ...rest } = s;
        return rest;
      }
      return { ...s, reframe };
    });
    set({ nleSegments: next });
    usePlaybackStore.getState().setNleSegments(next);
    get().markDirty();
    return { success: true };
  },

  setLayoutScope: (scope) => set({ layoutScope: scope === "section" ? "section" : "clip" }),

  // #348: drop this clip's override — back to the project layout.
  clearClipReframe: async () => {
    const { project, clip } = get();
    if (!project?.id || !clip?.id) return { error: "No clip open" };
    const clipId = clip.id;
    const result = await window.clipflow.projectUpdateClipReframe(project.id, clipId, "inherit");
    if (result?.error) return result;
    if (get().project?.id !== project.id || get().clip?.id !== clipId) return { error: "Clip changed during save" };
    const { reframe: _drop, ...clipRest } = get().clip;
    set({ clip: clipRest, project: projectWithClipReframe(get().project, clipId, undefined), reframeDraft: null });
    return { success: true };
  },

  // #348: explicitly no layout for THIS clip (raw render), whatever the
  // project layout says.
  disableClipReframe: async () => {
    const { project, clip } = get();
    if (!project?.id || !clip?.id) return { error: "No clip open" };
    const clipId = clip.id;
    const result = await window.clipflow.projectUpdateClipReframe(project.id, clipId, null);
    if (result?.error) return result;
    if (get().project?.id !== project.id || get().clip?.id !== clipId) return { error: "Clip changed during save" };
    set({
      clip: { ...get().clip, reframe: null },
      project: projectWithClipReframe(get().project, clipId, null),
      reframeDraft: null,
    });
    return { success: true };
  },

  // #348: the old whole-project behavior — push a layout (default: this
  // clip's effective one; pass null to remove everywhere) to project.reframe
  // and strip every clip's override in one save.
  applyReframeToAllClips: async (reframeArg) => {
    const { project, clip } = get();
    if (!project?.id) return { error: "No project" };
    const eff = reframeArg !== undefined ? reframeArg : resolveClipReframe(clip, project);
    const result = await window.clipflow.projectApplyReframeAllClips(project.id, eff);
    if (result?.error) return result;
    if (get().project?.id !== project.id) return { error: "Project changed during save" };
    // Patch state locally (never swap in the disk copy of the open clip —
    // it may be behind the in-memory edits the autosave hasn't flushed yet).
    const cur = get().clip;
    let nextClip = cur;
    if (cur && cur.reframe !== undefined) {
      const { reframe: _drop, ...rest } = cur;
      nextClip = rest;
    }
    // #349: the section overrides go too — and they must go from the STORE's
    // nleSegments, or the next autosave writes them straight back over what
    // projects.js just stripped.
    const stripSeg = (s) => {
      if (s.reframe === undefined) return s;
      const { reframe: _d, ...rest } = s;
      return rest;
    };
    const segs = get().nleSegments;
    const nextSegs = segs.some((s) => s.reframe !== undefined) ? segs.map(stripSeg) : segs;
    set({
      project: {
        ...get().project,
        reframe: eff,
        clips: (get().project.clips || []).map((c) => {
          const hasSegOverride = (c.nleSegments || []).some((s) => s.reframe !== undefined);
          if (c.reframe === undefined && !hasSegOverride) return c;
          const { reframe: _drop2, ...rest } = c;
          return hasSegOverride ? { ...rest, nleSegments: c.nleSegments.map(stripSeg) } : rest;
        }),
      },
      clip: nextClip,
      nleSegments: nextSegs,
      reframeDraft: null,
    });
    if (nextSegs !== segs) usePlaybackStore.getState().setNleSegments(nextSegs);
    return { success: true };
  },

  // Attach a saved layout-library entry to the OPEN CLIP (#348; Layout
  // panel's "Saved layouts" list). Requires an exact source-dimension
  // match — a layout calibrated for a different recording size can't transfer.
  applyReframeLayout: async (entry) => {
    const { project, clip, layoutScope, nleSegments } = get();
    if (!project?.id) return { error: "No project" };
    if (!clip?.id) return { error: "Open a clip to apply a layout" };
    if (entry.sourceWidth !== project.sourceWidth || entry.sourceHeight !== project.sourceHeight) {
      return { error: "Layout was calibrated for a different source size" };
    }
    const clipId = clip.id;
    const reframe = {
      layoutId: entry.id,
      // #164 B3: game-only entries carry camRect null — copy it as null.
      camRect: entry.camRect ? { ...entry.camRect } : null,
      gameRect: { ...entry.gameRect },
      style: resolveReframeStyle(entry.style),
    };
    // #349: section scope → the section under the playhead, store-only write.
    if (layoutScope === "section" && nleSegments.length > 1) {
      const segId = segmentIdAtTimeline(usePlaybackStore.getState().currentTime || 0, nleSegments);
      if (!segId) return { error: "No section under the playhead" };
      const r = get().setSegmentReframe(segId, reframe);
      if (r?.error) return r;
      set({ reframeDraft: null });
      return { success: true };
    }
    const result = await window.clipflow.projectUpdateClipReframe(project.id, clipId, reframe);
    if (result?.error) return result;
    if (get().project?.id !== project.id || get().clip?.id !== clipId) return { error: "Clip changed during save" };
    set({
      clip: { ...get().clip, reframe },
      project: projectWithClipReframe(get().project, clipId, reframe),
      reframeDraft: null,
    });
    return { success: true };
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
      const { nleSegments, audioSegments, audioPlacements, mediaPlacements, mediaTrackCount, musicTrackCount, sfxTrackCount, laneEnabled, sourceAudioMuted } = get();
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
        highlightMode: subState.highlightMode,
        effectOrder: subState.effectOrder,
        // #296: the Subtitle lane's switch. Saved here so it belongs to the
        // clip like every other subtitle setting, instead of leaking across
        // clips for the rest of the session.
        showSubs: subState.showSubs,
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
        effectOrder: capState.captionEffectOrder,
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
      const res = await window.clipflow.projectUpdateClip(project.id, clip.id, {
        title: clipTitle,
        caption: capState.captionText,
        captionSegments: capState.captionSegments,
        subtitles: { sub1: persistedSubs, sub2: [], _format: "source-absolute" },
        nleSegments: nleSegments,
        sfx: audioPlacements, // #202: SFX/music placements (Sounds lane)
        media: mediaPlacements, // #310: image/GIF overlays (Media lanes)
        mediaTrackCount, // how many overlay lanes this clip shows
        musicTrackCount, // #312: how many Music lanes this clip shows
        sfxTrackCount, //   #312: how many SFX lanes this clip shows
        laneEnabled, // #296: Caption / Music / SFX lane switches
        sourceAudioMuted, // #296: Audio lane mute (the clip's own sound)
        audioSegments: audioSegments, // legacy — kept for backwards compatibility
        subtitleStyle,
        captionStyle,
      });
      // #188: `clip` is a snapshot taken when the clip was opened, and the render
      // payload spreads it (renderPayload.js). Retitling only moves `clipTitle`,
      // so without refreshing the snapshot a render is stamped with the title the
      // clip had on open — "Clip 3.mp4" forever. `renderPath`/`thumbnailPath` go
      // stale the same way, and resolveRenderOutputPath needs the current
      // renderPath to recognise (and overwrite) this clip's OWN file.
      // Gated on the three fields main can rewrite behind the renderer's back so
      // an ordinary autosave swaps nothing and costs no re-render.
      // #297: a resolved promise is NOT a successful save. project:updateClip
      // returns { error } instead of throwing, so a locked project.json, a full
      // disk or a disconnected drive all arrived here looking exactly like a
      // good write — and dirty was cleared regardless, telling the user their
      // work was safe moments before it vanished. Nothing is marked clean now
      // unless the clip came back from disk.
      const next = res?.clip;
      if (!next) {
        const reason = res?.error || "the app got no answer from the file writer";
        console.error("Save failed:", reason);
        set({ saveError: describeSaveFailure(reason) });
        return false;
      }
      const changed = (
        next.title !== clip.title ||
        next.renderPath !== clip.renderPath ||
        next.thumbnailPath !== clip.thumbnailPath
      );
      set({ dirty: false, saveError: null, ...(changed ? { clip: next } : {}) });
      return true;
    } catch (e) {
      console.error("Save failed:", e);
      set({ saveError: describeSaveFailure(e?.message) || "the clip could not be written" });
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
