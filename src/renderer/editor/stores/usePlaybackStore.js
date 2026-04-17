import { create } from "zustand";
import {
  sourceToTimeline,
  timelineToSource,
  getTimelineDuration,
} from "../models/timeMapping";

const usePlaybackStore = create((set, get) => ({
  playing: false,
  currentTime: 0, // TIMELINE time (derived from source time via segment mapping)
  duration: 0,
  tlSpeed: "1x",
  tlScrubbing: false,
  trimIn: 0,
  trimOut: null, // null = full clip duration

  // NLE segment list — set by editor store whenever segments change
  nleSegments: [],

  // Video element plays the pre-cut clip file. Its local currentTime is
  // clip-relative (0 = clip.startTime). Segments are source-absolute.
  // absolute = vidTime + clipFileOffset;  vidTime = absolute - clipFileOffset
  clipFileOffset: 0,

  // True duration of the clip file on disk (set once from video.duration on
  // loadedmetadata). Distinct from `duration` above, which is timeline duration
  // and shrinks on trim. Used by waveform peak slicing, which needs the
  // unchanging clip-file extent as denominator.
  clipFileDuration: 0,

  // videoRef is stored here as a plain object property (not reactive)
  // Set it once via initVideoRef() from PreviewPanel
  _videoRef: null,

  // ── Actions ──
  initVideoRef: (ref) => { get()._videoRef = ref; },
  getVideoRef: () => get()._videoRef,

  setPlaying: (v) => set({ playing: v }),
  togglePlay: () => {
    const { playing, currentTime, duration, seekTo } = get();
    if (!playing && duration > 0 && currentTime >= duration - 0.1) {
      seekTo(0);
    }
    set({ playing: !playing });
  },

  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),

  /**
   * Set the NLE segment list and update duration.
   * Called by editor store whenever nleSegments changes.
   */
  setNleSegments: (segments) => {
    const duration = getTimelineDuration(segments);
    set({ nleSegments: segments, duration });

    // If video's current source position is outside all new segments, snap it
    // into the first segment. Video currentTime is CLIP-RELATIVE; segments are
    // SOURCE-ABSOLUTE — translate via clipFileOffset.
    const { clipFileOffset } = get();
    const ref = get()._videoRef;
    const vid = ref?.current;
    if (vid && segments.length > 0) {
      const srcAbs = vid.currentTime + clipFileOffset;
      // Use epsilon-tolerant check so sub-millisecond FP drift at the segment
      // start doesn't falsely mark the video as "outside" the segment.
      const EPS = 0.001;
      const inside = segments.some((s) => srcAbs >= s.sourceStart - EPS && srcAbs <= s.sourceEnd + EPS);
      if (!inside) {
        const targetAbs = segments[0].sourceStart;
        vid.currentTime = Math.max(0, targetAbs - clipFileOffset);
        // Snap store currentTime to the timeline position we just seeked to
        // (start of first segment = timeline 0). Previously we hardcoded 0
        // which was correct numerically but brittle.
        set({ currentTime: 0 });
      } else {
        const mapped = sourceToTimeline(srcAbs, segments);
        if (mapped.found) set({ currentTime: mapped.timelineTime });
      }
    }
  },

  /**
   * Seek to a timeline position. Converts to source time and sets video.currentTime.
   */
  seekTo: (timelineSec) => {
    const { nleSegments, clipFileOffset } = get();
    let targetSourceAbs = timelineSec;

    if (nleSegments.length > 0) {
      const clamped = Math.max(0, Math.min(timelineSec, getTimelineDuration(nleSegments)));
      const mapped = timelineToSource(clamped, nleSegments);
      if (mapped.found) {
        targetSourceAbs = mapped.sourceTime;
      } else {
        const last = nleSegments[nleSegments.length - 1];
        targetSourceAbs = last.sourceEnd;
      }
      set({ currentTime: clamped });
    } else {
      set({ currentTime: timelineSec });
    }

    const ref = get()._videoRef;
    if (ref?.current) {
      const writeVal = Math.max(0, targetSourceAbs - clipFileOffset);
      ref.current.currentTime = writeVal;
    }
  },

  /**
   * Called from the rAF loop / onTimeUpdate with the video element's source time.
   * Converts to timeline time and handles gap-crossing between segments.
   *
   * Returns { timelineTime, needsSeek, seekToSource } so the caller
   * can perform the seek on the video element.
   */
  mapSourceTime: (vidTime) => {
    const { nleSegments, clipFileOffset } = get();
    if (nleSegments.length === 0) {
      return { timelineTime: vidTime, needsSeek: false, seekToSource: 0 };
    }

    // Incoming vidTime is CLIP-RELATIVE (video element). Segments are SOURCE-ABSOLUTE.
    const sourceAbs = vidTime + clipFileOffset;
    // Helper: convert source-absolute target back to clip-relative for video.currentTime
    const toVid = (abs) => Math.max(0, abs - clipFileOffset);

    const mapped = sourceToTimeline(sourceAbs, nleSegments);
    if (mapped.found) {
      const seg = nleSegments[mapped.segmentIndex];
      if (sourceAbs >= seg.sourceEnd - 0.02) {
        const nextIdx = mapped.segmentIndex + 1;
        if (nextIdx < nleSegments.length) {
          return {
            timelineTime: mapped.timelineTime,
            needsSeek: true,
            seekToSource: toVid(nleSegments[nextIdx].sourceStart),
          };
        } else {
          return {
            timelineTime: getTimelineDuration(nleSegments),
            needsSeek: false,
            seekToSource: 0,
            atEnd: true,
          };
        }
      }
      return { timelineTime: mapped.timelineTime, needsSeek: false, seekToSource: 0 };
    }

    // Source time is in a gap — find next segment
    for (let i = 0; i < nleSegments.length; i++) {
      if (nleSegments[i].sourceStart > sourceAbs) {
        return {
          timelineTime: get().currentTime,
          needsSeek: true,
          seekToSource: toVid(nleSegments[i].sourceStart),
        };
      }
    }

    return {
      timelineTime: getTimelineDuration(nleSegments),
      needsSeek: false,
      seekToSource: 0,
      atEnd: true,
    };
  },

  setTlSpeed: (speed) => set({ tlSpeed: speed }),
  setTlScrubbing: (v) => set({ tlScrubbing: v }),
  setTrimIn: (t) => set({ trimIn: t }),
  setTrimOut: (t) => set({ trimOut: t }),

  reset: () => set({
    playing: false,
    currentTime: 0,
    duration: 0,
    tlScrubbing: false,
    trimIn: 0,
    trimOut: null,
    nleSegments: [],
  }),
}));

export default usePlaybackStore;
