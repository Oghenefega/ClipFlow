import { create } from "zustand";

const usePlaybackStore = create((set, get) => ({
  playing: false,
  currentTime: 0,
  duration: 0,
  tlSpeed: "1x",
  tlScrubbing: false,
  trimIn: 0,
  trimOut: null, // null = full clip duration

  // videoRef is stored here as a plain object property (not reactive)
  // Set it once via initVideoRef() from PreviewPanel
  _videoRef: null,

  // ── Actions ──
  initVideoRef: (ref) => { get()._videoRef = ref; },
  getVideoRef: () => get()._videoRef,

  setPlaying: (v) => set({ playing: v }),
  togglePlay: () => {
    const { playing } = get();
    set({ playing: !playing });
  },

  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),

  seekTo: (sec) => {
    // Clamp to audio bounds if available
    let clamped = sec;
    try {
      const editorStore = require("./useEditorStore").default;
      const audioSegments = editorStore.getState().audioSegments;
      if (audioSegments.length > 0) {
        const sorted = [...audioSegments].sort((a, b) => a.startSec - b.startSec);
        const audioEnd = sorted[sorted.length - 1].endSec;
        clamped = Math.min(clamped, audioEnd);
        clamped = Math.max(clamped, 0);
      }
    } catch (_) {}
    const ref = get()._videoRef;
    if (ref?.current) ref.current.currentTime = clamped;
    set({ currentTime: clamped });
  },

  setTlSpeed: (speed) => set({ tlSpeed: speed }),
  setTlScrubbing: (v) => set({ tlScrubbing: v }),
  setTrimIn: (t) => set({ trimIn: t }),
  setTrimOut: (t) => set({ trimOut: t }),

  reset: () => set({ playing: false, currentTime: 0, duration: 0, tlScrubbing: false, trimIn: 0, trimOut: null }),
}));

export default usePlaybackStore;
