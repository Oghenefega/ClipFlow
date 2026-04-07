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
      // At or near the end — restart from beginning
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
  },

  /**
   * Seek to a timeline position. Converts to source time and sets video.currentTime.
   */
  seekTo: (timelineSec) => {
    const { nleSegments } = get();
    let targetSourceTime = timelineSec;

    if (nleSegments.length > 0) {
      const clamped = Math.max(0, Math.min(timelineSec, getTimelineDuration(nleSegments)));
      const mapped = timelineToSource(clamped, nleSegments);
      if (mapped.found) {
        targetSourceTime = mapped.sourceTime;
      } else {
        // Past end — clamp to last segment's end
        const last = nleSegments[nleSegments.length - 1];
        targetSourceTime = last.sourceEnd;
      }
      set({ currentTime: clamped });
    } else {
      set({ currentTime: timelineSec });
    }

    const ref = get()._videoRef;
    if (ref?.current) ref.current.currentTime = targetSourceTime;
  },

  /**
   * Called from the rAF loop / onTimeUpdate with the video element's source time.
   * Converts to timeline time and handles gap-crossing between segments.
   *
   * Returns { timelineTime, needsSeek, seekToSource } so the caller
   * can perform the seek on the video element.
   */
  mapSourceTime: (sourceTime) => {
    const { nleSegments } = get();
    if (nleSegments.length === 0) {
      return { timelineTime: sourceTime, needsSeek: false, seekToSource: 0 };
    }

    const mapped = sourceToTimeline(sourceTime, nleSegments);
    if (mapped.found) {
      // Check if we're at/past the current segment's end
      const seg = nleSegments[mapped.segmentIndex];
      if (sourceTime >= seg.sourceEnd - 0.02) {
        // At segment boundary — check if there's a next segment
        const nextIdx = mapped.segmentIndex + 1;
        if (nextIdx < nleSegments.length) {
          return {
            timelineTime: mapped.timelineTime,
            needsSeek: true,
            seekToSource: nleSegments[nextIdx].sourceStart,
          };
        } else {
          // Past last segment — done
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

    // Source time is in a gap (between segments) — find next segment
    for (let i = 0; i < nleSegments.length; i++) {
      if (nleSegments[i].sourceStart > sourceTime) {
        return {
          timelineTime: get().currentTime, // keep current timeline position
          needsSeek: true,
          seekToSource: nleSegments[i].sourceStart,
        };
      }
    }

    // Past all segments
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
