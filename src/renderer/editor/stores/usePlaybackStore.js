import { create } from "zustand";
import {
  sourceToTimelineNear,
  segmentIndexAtTimeline,
  timelineToSource,
  getTimelineDuration,
  getSegmentTimelineRange,
} from "../models/timeMapping";

// Rungs the R / E keys climb on repeat presses. A fourth press falls off the
// end of the ladder and drops back to normal speed.
const SHUTTLE_LADDER = [1.5, 2, 4];

const usePlaybackStore = create((set, get) => ({
  playing: false,
  currentTime: 0, // TIMELINE time (derived from source time via segment mapping)
  duration: 0,
  tlSpeed: "1x",
  tlScrubbing: false,

  // ── Shuttle (R / E) ──
  // Direction of the current shuttle: 0 off, 1 fast forward, -1 rewind.
  // shuttleRate is the rung of SHUTTLE_LADDER we're on. Rewind is driven by a
  // rAF in PreviewPanel rather than playbackRate, because <video> has no
  // reverse gear.
  shuttleDir: 0,
  shuttleRate: 1,

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
  initVideoRef: (ref) => set({ _videoRef: ref }),
  getVideoRef: () => get()._videoRef,

  setPlaying: (v) => set({ playing: v }),
  togglePlay: () => {
    // Space always returns to normal speed — it's the "stop whatever is going
    // on" key, and that includes an in-progress shuttle.
    get().resetShuttle();
    const { playing, currentTime, duration, seekTo } = get();
    if (!playing) {
      // Starting playback: re-assert the video position from the playhead. The
      // rAF loop treats <video>.currentTime as the source of truth and snaps the
      // playhead to it on the first frame, so any video↔playhead drift (e.g. a
      // metadata reload that parked the element at the first segment) would yank
      // the playhead to the wrong spot. Seeking here guarantees play starts from
      // the visible playhead. If we're at the very end, replay from the start.
      if (duration > 0 && currentTime >= duration - 0.1) {
        seekTo(0);
      } else {
        seekTo(currentTime);
      }
    }
    set({ playing: !playing });
  },

  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),

  /**
   * Set the NLE segment list and update duration.
   * Called by editor store whenever nleSegments changes.
   */
  setNleSegments: (segments, opts) => {
    const duration = getTimelineDuration(segments);
    set({ nleSegments: segments, duration });

    const { clipFileOffset } = get();
    const ref = get()._videoRef;
    const vid = ref?.current;

    // Clip-load path (#90): the <video> element still holds the PREVIOUS
    // clip's position at this point (its src swaps only on the next render),
    // so deciding the snap from vid.currentTime reads stale state. A clip
    // open always starts at its head — set that explicitly. Seeking the
    // element here covers same-recording clip switches (same src → no
    // loadedmetadata fires); cross-recording switches get reset by the src
    // swap and re-positioned in PreviewPanel's onLoadedMetadata.
    if (opts?.snapToStart) {
      set({ currentTime: 0 });
      if (vid && segments.length > 0) {
        vid.currentTime = Math.max(0, segments[0].sourceStart - clipFileOffset);
      }
      return;
    }

    // If video's current source position is outside all new segments, snap it
    // into the first segment. Video currentTime is CLIP-RELATIVE; segments are
    // SOURCE-ABSOLUTE — translate via clipFileOffset.
    if (vid && segments.length > 0) {
      const srcAbs = vid.currentTime + clipFileOffset;
      // Prefer the section the playhead was in before the edit (#351): with
      // repeated footage a plain scan would re-map it onto the earlier copy.
      const mapped = sourceToTimelineNear(srcAbs, segments, segmentIndexAtTimeline(get().currentTime, segments));
      if (!mapped.found) {
        const targetAbs = segments[0].sourceStart;
        vid.currentTime = Math.max(0, targetAbs - clipFileOffset);
        // Snap store currentTime to the timeline position we just seeked to
        // (start of first segment = timeline 0). Previously we hardcoded 0
        // which was correct numerically but brittle.
        set({ currentTime: 0 });
      } else {
        set({ currentTime: mapped.timelineTime });
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

    // Resolve against the section the playhead is in (#351). A source moment
    // can live in two sections once footage is repeated; a first-match scan
    // answered with the earlier copy every time, so play at the later copy
    // mapped back onto the first and looped at the cut. The playhead's own
    // TIMELINE position is unambiguous — a join counts as the later section,
    // which is where the seek issued below lands.
    const hint = segmentIndexAtTimeline(get().currentTime, nleSegments);
    const mapped = sourceToTimelineNear(sourceAbs, nleSegments, hint);
    if (mapped.found) {
      const seg = nleSegments[mapped.segmentIndex];
      if (sourceAbs >= seg.sourceEnd - 0.02) {
        const nextIdx = mapped.segmentIndex + 1;
        if (nextIdx < nleSegments.length) {
          return {
            // Stamp the EXACT join, not the 20ms-early trigger time: the next
            // tick derives its section hint from currentTime, and a join
            // resolves to the section that starts there — the one the seek
            // below lands in. Stamping 7.98 instead of 8 left the hint on the
            // earlier section, which re-claimed the landed frame when the two
            // shared footage (the #351 loop, reproduced in the s229 E2E).
            timelineTime: getSegmentTimelineRange(nextIdx, nleSegments).start,
            needsSeek: true,
            seekToSource: toVid(nleSegments[nextIdx].sourceStart),
            // Which segment the seek lands in — lets the preview's
            // double-buffer swap validate its pre-parked standby element.
            seekToIndex: nextIdx,
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

    // Source time is in a gap — the element decoded past a cut before our seek
    // landed. Recover in TIMELINE order, not source order: sections can be
    // reordered, so the segment with the next later source time may sit anywhere
    // on the timeline. Resume at the head of whatever section follows the
    // playhead. (On an unreordered list this picks the same segment as before.)
    const tlNow = get().currentTime;
    const here = timelineToSource(tlNow, nleSegments);
    const nextIdx = here.found ? here.segmentIndex + 1 : nleSegments.length;
    if (nextIdx < nleSegments.length) {
      return {
        timelineTime: getSegmentTimelineRange(nextIdx, nleSegments).start, // the join — see above
        needsSeek: true,
        seekToSource: toVid(nleSegments[nextIdx].sourceStart),
        seekToIndex: nextIdx,
      };
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

  /**
   * R / E. Each press in the same direction climbs a rung; a press in the
   * other direction restarts the ladder that way; the press past the top rung
   * returns to normal.
   *
   * @param {1|-1} dir - 1 fast forward, -1 rewind
   */
  cycleShuttle: (dir) => {
    const { shuttleDir, shuttleRate } = get();
    // Direction change (or a speed set from the dropdown) restarts at rung one.
    const rung = shuttleDir === dir ? SHUTTLE_LADDER.indexOf(shuttleRate) : -1;
    const next = SHUTTLE_LADDER[rung + 1];

    if (!next) {
      get().resetShuttle();
      return;
    }

    if (dir === 1) {
      // Same reasoning as togglePlay: re-assert the element's position from the
      // playhead before starting, so playback begins from what's on screen.
      if (!get().playing) get().seekTo(get().currentTime);
      set({ shuttleDir: 1, shuttleRate: next, tlSpeed: `${next}x`, playing: true });
    } else {
      // Rewind: the element stays paused and a rAF walks the playhead back, so
      // hand back any forward speed we'd set first.
      if (shuttleDir === 1) set({ tlSpeed: "1x" });
      set({ shuttleDir: -1, shuttleRate: next, playing: false });
    }
  },

  resetShuttle: () => {
    // Only give back a speed WE set — one the user picked from the dropdown
    // must survive pressing space.
    if (get().shuttleDir === 1) set({ tlSpeed: "1x" });
    set({ shuttleDir: 0, shuttleRate: 1 });
  },

  reset: () => set({
    playing: false,
    currentTime: 0,
    duration: 0,
    tlScrubbing: false,
    nleSegments: [],
    shuttleDir: 0,
    shuttleRate: 1,
    tlSpeed: "1x",
  }),
}));

export default usePlaybackStore;
