import { create } from "zustand";

const usePlaybackStore = create((set, get) => ({
  playing: false,
  currentTime: 0,
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

  seekTo: (sec) => {
    const ref = get()._videoRef;
    if (ref?.current) ref.current.currentTime = sec;
    set({ currentTime: sec });
  },

  setTlSpeed: (speed) => set({ tlSpeed: speed }),
  setTlScrubbing: (v) => set({ tlScrubbing: v }),
  setTrimIn: (t) => set({ trimIn: t }),
  setTrimOut: (t) => set({ trimOut: t }),

  reset: () => set({ playing: false, currentTime: 0, tlScrubbing: false, trimIn: 0, trimOut: null }),
}));

export default usePlaybackStore;
