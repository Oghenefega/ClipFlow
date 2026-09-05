/**
 * useSourceStems — the live preview of the recording levels (#272).
 *
 * A <video> element plays ONE of a recording's audio tracks (OBS's full mix),
 * so to hear the levels while dragging, the clip's range of each individual
 * track is pulled out by FFmpeg (audio:extractStems), decoded into Web Audio
 * buffers and played through one GainNode per track, in step with the
 * picture. While the stems are active the video element itself is muted
 * (PreviewPanelNew); when nothing is turned and the popover is closed they are
 * torn down and the video's own sound comes back — an untouched clip costs
 * nothing.
 *
 * The bytes arrive over IPC and become AudioBuffers — never a file:// media
 * element, so the CORS taint that silences createMediaElementSource on local
 * files is not in play.
 *
 * Sync: the video is the clock. Each rAF tick (and on pause) `sync(video)`
 * hands the picture's position to the StemPlayer (utils/stemPlayer.js), which
 * restarts the buffer sources on any drift — a seek, a section cut, an A/B
 * element swap and slow clock drift all land in that one check.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEditorStore from "../../stores/useEditorStore";
import usePlaybackStore from "../../stores/usePlaybackStore";
import { resolveClipAudioMix, isFlat, mixableTracks, dbToGain, normalizeMix } from "../../models/audioMix";
import { StemPlayer } from "../../utils/stemPlayer";

// Stems cover the sections plus this margin, so ordinary trims and small
// extends never re-extract.
const RANGE_MARGIN_SEC = 5;
// Section edits arrive in bursts (a drag); extract once they settle.
const RELOAD_DEBOUNCE_MS = 300;

function patchInfo(patch) {
  useEditorStore.setState((s) => ({ audioMixInfo: { ...(s.audioMixInfo || {}), ...patch } }));
}

/**
 * @returns {{ active: boolean, sync: (video: HTMLVideoElement) => void }}
 *   `active` — stems are loaded and playing in place of the video's sound
 *   (mute the video element). `sync` — stable; call it from the playback
 *   tick and whenever playback stops.
 */
export default function useSourceStems() {
  const project = useEditorStore((s) => s.project);
  const audioMix = useEditorStore((s) => s.audioMix);
  const panelOpen = useEditorStore((s) => s.audioMixPanelOpen);
  const nleSegments = useEditorStore((s) => s.nleSegments);
  const sourceAudioMuted = useEditorStore((s) => s.sourceAudioMuted);
  const sourceOffline = useEditorStore((s) => s.sourceOffline);
  const sourceDuration = useEditorStore((s) => s.sourceDuration);

  const sourceFile = !sourceOffline ? (project?.sourceFile || null) : null;
  const playerRef = useRef(null);
  const loadedRef = useRef(null); // { sourceFile, trackKey, start, end }
  const loadGenRef = useRef(0);
  const [active, setActive] = useState(false);
  const [file, setFile] = useState(null); // { sourceFile, trackCount, setup }

  // What the file is: its track count, and whether the saved calibration
  // (which says which track is the mic) describes it. Re-read when the popover
  // opens, so a setup re-run in Settings is picked up without reopening the clip.
  useEffect(() => {
    if (!sourceFile) {
      setFile(null);
      useEditorStore.getState().setAudioMixInfo(null);
      return;
    }
    let alive = true;
    (async () => {
      const [probe, setup] = await Promise.all([
        window.clipflow.audioProbeTracks(sourceFile).catch(() => null),
        window.clipflow.storeGet("audioSetup").catch(() => null),
      ]);
      if (!alive) return;
      const trackCount = probe && !probe.error && Number.isInteger(probe.trackCount) ? probe.trackCount : null;
      const matches = !!(setup && Number.isInteger(setup.trackCount) && setup.trackCount === trackCount);
      setFile({ sourceFile, trackCount, setup: matches ? setup : null });
      patchInfo({ sourceFile, trackCount, setup: matches ? setup : null, setupMismatch: !!setup && !matches });
    })();
    return () => { alive = false; };
  }, [sourceFile, panelOpen]);

  const setup = file && file.sourceFile === sourceFile ? file.setup : null;
  const trackIndexes = useMemo(
    () => mixableTracks(setup).map((t) => t.index).filter((i) => file?.trackCount == null || i < file.trackCount),
    [setup, file?.trackCount]
  );
  const trackKey = trackIndexes.join(",");
  const trackIndexesRef = useRef(trackIndexes);
  trackIndexesRef.current = trackIndexes;

  const effMix = resolveClipAudioMix({ audioMix }, project);
  const effMixRef = useRef(effMix);
  effMixRef.current = effMix;
  const wanted = !!(sourceFile && trackIndexes.length > 0 && (panelOpen || !isFlat(effMix)));

  // The window to extract: the sections' union plus the margin.
  const range = useMemo(() => {
    if (!nleSegments || nleSegments.length === 0) return null;
    let lo = Infinity;
    let hi = 0;
    for (const s of nleSegments) {
      lo = Math.min(lo, s.sourceStart);
      hi = Math.max(hi, s.sourceEnd);
    }
    if (!(hi > lo)) return null;
    const start = Math.max(0, lo - RANGE_MARGIN_SEC);
    const end = sourceDuration > 0 ? Math.min(sourceDuration, hi + RANGE_MARGIN_SEC) : hi + RANGE_MARGIN_SEC;
    return { start, end };
  }, [nleSegments, sourceDuration]);

  const applyGains = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    const norm = normalizeMix(effMixRef.current) || {};
    const gains = {};
    for (const i of trackIndexesRef.current) gains[i] = dbToGain(norm[String(i)] || 0);
    p.setGains(gains);
  }, []);

  // Load / reload / tear down.
  useEffect(() => {
    if (!wanted || !range) {
      loadGenRef.current++;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      loadedRef.current = null;
      setActive(false);
      return;
    }
    const loaded = loadedRef.current;
    if (loaded && (loaded.sourceFile !== sourceFile || loaded.trackKey !== trackKey)) {
      // Another recording (or another track set): the old stems must not play
      // a single frame against the new picture.
      loadGenRef.current++;
      if (playerRef.current) playerRef.current.destroy();
      playerRef.current = null;
      loadedRef.current = null;
      setActive(false);
    } else if (loaded && range.start >= loaded.start && range.end <= loaded.end) {
      return; // covered — nothing to do
    }
    const gen = ++loadGenRef.current;
    const timer = setTimeout(async () => {
      patchInfo({ loading: true, error: null });
      const res = await window.clipflow
        .audioExtractStems(sourceFile, range.start, range.end, trackIndexesRef.current)
        .catch((e) => ({ error: e?.message || String(e) }));
      if (gen !== loadGenRef.current) return;
      if (!res || res.error) {
        patchInfo({ loading: false, error: res?.error || "Could not prepare the tracks" });
        return;
      }
      try {
        if (!playerRef.current) playerRef.current = new StemPlayer();
        await playerRef.current.load(res);
      } catch (e) {
        if (gen === loadGenRef.current) patchInfo({ loading: false, error: e?.message || "Could not decode the tracks" });
        return;
      }
      if (gen !== loadGenRef.current) return;
      loadedRef.current = { sourceFile, trackKey, start: res.rangeStart, end: res.rangeEnd };
      const peaks = {};
      for (const t of res.tracks) peaks[t.index] = t.peak;
      applyGains();
      playerRef.current.setMuted(useEditorStore.getState().sourceAudioMuted);
      patchInfo({ loading: false, error: null, peaks });
      setActive(true);
    }, RELOAD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [wanted, range, sourceFile, trackKey, applyGains]);

  // Levels move → gains move, instantly.
  useEffect(() => { applyGains(); }, [effMix, active, trackKey, applyGains]);

  // #296's mute covers the stems too.
  useEffect(() => {
    if (playerRef.current) playerRef.current.setMuted(sourceAudioMuted);
  }, [sourceAudioMuted, active]);

  // Standing <media> cleanup rule: everything down on unmount.
  useEffect(() => () => {
    loadGenRef.current++;
    if (playerRef.current) playerRef.current.destroy();
    playerRef.current = null;
    loadedRef.current = null;
    useEditorStore.getState().setAudioMixInfo(null);
  }, []);

  const sync = useCallback((video) => {
    const p = playerRef.current;
    if (!p || !video) return;
    const offset = usePlaybackStore.getState().clipFileOffset || 0;
    p.sync(video.currentTime + offset, !video.paused && !video.seeking && !video.ended, video.playbackRate || 1);
  }, []);

  return { active, sync };
}
