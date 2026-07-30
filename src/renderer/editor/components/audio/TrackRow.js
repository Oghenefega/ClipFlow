import React, { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Star, Plus, Trash2, Music, Volume2 } from "lucide-react";
import { getCachedPeaks, hasTriedPeaks, requestPeaks, drawPeaks } from "./audioPeaks";

export const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];

export function fmtDur(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

/** m:ss for a live playhead — always two digits, no em-dash fallback. */
function fmtPos(sec) {
  const t = Math.max(0, sec || 0);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

const WAVE_COLOR = { music: "rgba(94,234,212,0.55)", sfx: "rgba(196,181,253,0.60)" };

/**
 * Waveform peaks for one row, fetched only once the row has been on screen.
 *
 * 761 files is far too many to extract eagerly (one FFmpeg decode each), so the
 * row asks only when it's actually visible and the shared queue caps how many run
 * at once. `rootMargin` starts the ones just below the fold so scrolling at a
 * normal pace mostly finds them already drawn.
 */
function useLazyPeaks(path, hostRef) {
  const [peaks, setPeaks] = useState(() => getCachedPeaks(path));
  const [settled, setSettled] = useState(() => hasTriedPeaks(path));

  useEffect(() => {
    const cached = getCachedPeaks(path);
    setPeaks(cached);
    setSettled(hasTriedPeaks(path));
    if (!path || hasTriedPeaks(path)) return;

    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    let observer = null;

    const fetchNow = () => {
      requestPeaks(path).then((p) => {
        if (!alive) return;
        setPeaks(p);
        setSettled(true);
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      fetchNow();
    } else {
      // `root` MUST be the scrolling viewport, not the default (the browser
      // window). Intersection against the window is still clipped by every
      // ancestor, so a row scrolled out of the ScrollArea never reports as
      // intersecting and its waveform would never load — and `rootMargin`
      // expands the WINDOW rect, so it can't rescue that either. Measured: only
      // the rows inside the panel's visible box ever fired.
      const root = host.closest("[data-radix-scroll-area-viewport]") || null;
      observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          observer = null;
          fetchNow();
        }
      }, { root, rootMargin: "220px 0px" });
      observer.observe(host);
    }
    return () => { alive = false; observer?.disconnect(); };
  }, [path, hostRef]);

  return { peaks, settled };
}

/**
 * Canvas that redraws on resize — the drawer is user-resizable.
 *
 * The canvas is positioned ABSOLUTELY, exactly as Scrubber does below, and that
 * is load-bearing (#215). drawPeaks writes a pixel width onto it; in flow, that
 * width becomes a floor on the row's width instead of a result of it, because
 * Radix's scroll viewport sizes its content box to its contents. Rows then
 * ratchet: the ~130px of buttons the hovered row adds widens the shared box,
 * every other row's wrapper measures wider, repaints wider, widens the box
 * again. Measured at ~138px of growth per hover pass, unbounded, which both
 * stretched the waveforms and pushed the action buttons out of sight.
 */
function Waveform({ peaks, kind, height, className }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const paint = () => {
      const w = wrap.clientWidth;
      if (w > 0) {
        drawPeaks(canvasRef.current, peaks, { width: w, height, color: WAVE_COLOR[kind] || WAVE_COLOR.sfx });
      }
    };
    paint();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [peaks, kind, height]);

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className || ""}`} style={{ height }}>
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
    </div>
  );
}

/**
 * The scrubber the playing row expands into (#211).
 *
 * It reads the shared <audio> element on its own rAF loop and keeps the position
 * in LOCAL state — deliberately. Lifting the playhead into the panel would
 * re-render every row in the list 60 times a second, which on a 761-track library
 * is a frozen panel. Only the playing row repaints.
 */
function Scrubber({ audioRef, peaks, kind, durationSec }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [pos, setPos] = useState(0);
  const total = durationSec || audioRef.current?.duration || 0;

  useEffect(() => {
    let raf = null;
    const tick = () => {
      const a = audioRef.current;
      if (a) setPos(a.currentTime || 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioRef]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const paint = () => {
      const w = wrap.clientWidth;
      if (w > 0) drawPeaks(canvasRef.current, peaks, { width: w, height: 40, color: WAVE_COLOR[kind] || WAVE_COLOR.sfx });
    };
    paint();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [peaks, kind]);

  const seekTo = useCallback((clientX) => {
    const wrap = wrapRef.current;
    const a = audioRef.current;
    if (!wrap || !a || !total) return;
    const r = wrap.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    a.currentTime = frac * total;
    setPos(a.currentTime);
  }, [audioRef, total]);

  const onPointerDown = useCallback((e) => {
    e.stopPropagation();
    seekTo(e.clientX);
    const move = (ev) => seekTo(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [seekTo]);

  const pct = total > 0 ? Math.max(0, Math.min(100, (pos / total) * 100)) : 0;

  return (
    <div className="pl-[55px] pr-3 pb-2 bg-primary/[0.06]">
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        className="relative h-10 rounded-[5px] overflow-hidden cursor-pointer bg-black/30"
        title="Drag to scrub"
      >
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
        <div className="absolute top-0 bottom-0 left-0 bg-primary/25 pointer-events-none" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-0 bottom-0 w-0.5 pointer-events-none"
          style={{ left: `${pct}%`, background: "hsl(258 90% 78%)", boxShadow: "0 0 7px hsl(258 90% 70%)" }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums">
        <span>{fmtPos(pos)}</span>
        <span>{fmtDur(durationSec)}</span>
      </div>
    </div>
  );
}

/**
 * One library track (#211, layout A). Name on its own line, waveform underneath
 * with its tags alongside, then length + saved-volume badge. Playing expands the
 * row into a scrubber, so the waveform you audition against is the one you drag.
 *
 * Memoised: the panel re-renders on search/filter/sort, and 761 rows re-running
 * their canvas paints is the difference between instant and janky.
 */
function TrackRow({
  track, playing, audioRef, hovered, armedDelete,
  onHover, onTogglePlay, onFavorite, onSwapLane, onDelete, onAdd,
  onClearDefaultVolume, onEditTags, renderTags,
}) {
  const hostRef = useRef(null);
  const { peaks } = useLazyPeaks(track.path, hostRef);

  // Offline = its whole folder is unreachable (drive unplugged); missing = deleted
  // from a folder that reads fine. Either way it stays listed, it just can't play.
  const unavailable = track.offline || track.missing;
  const KindIcon = track.type === "music" ? Music : Volume2;

  return (
    <div ref={hostRef}>
      <div
        onMouseEnter={() => onHover(track.id)}
        onMouseLeave={() => onHover(null)}
        className={`flex items-start gap-2.5 px-3 py-1.5 transition-colors group ${
          playing ? "bg-primary/[0.06]" : "hover:bg-secondary/30"
        } ${unavailable ? "opacity-50" : ""}`}
      >
        <button
          onClick={() => !unavailable && onTogglePlay(track)}
          className={`w-[34px] h-[34px] mt-0.5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
            track.type === "music" ? "bg-teal-500/15 text-teal-300" : "bg-primary/15 text-violet-300"
          } ${unavailable ? "cursor-default" : "cursor-pointer hover:brightness-125"}`}
          title={unavailable ? "Unavailable" : playing ? "Pause" : "Preview"}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-xs text-foreground font-medium truncate" title={track.path}>{track.name}</div>

          {/* Waveform + tags share a line so the wave gets real width in a narrow panel */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <Waveform peaks={peaks} kind={track.type} height={16} className="flex-1 min-w-0" />
            {renderTags ? renderTags(track) : null}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
            <span>
              {fmtDur(track.durationSec)}
              {track.offline ? " · drive offline" : track.missing ? " · file missing" : ""}
            </span>
            {/* #210: a calibrated level. Click to forget it. */}
            {track.defaultVolume != null && (
              <button
                onClick={() => onClearDefaultVolume(track)}
                title={`Always starts at ${Math.round(track.defaultVolume * 100)}% — click to forget`}
                className="shrink-0 h-[15px] px-1.5 rounded-full text-[9.5px] font-bold bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors"
              >
                {Math.round(track.defaultVolume * 100)}%
              </button>
            )}
          </div>
        </div>

        {(hovered || track.favorite) && (
          <div className="flex items-center gap-0.5 shrink-0 mt-1">
            <button
              onClick={() => onFavorite(track)}
              title={track.favorite ? "Unfavorite" : "Favorite"}
              className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors ${
                track.favorite ? "text-amber-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Star className="h-3 w-3" fill={track.favorite ? "currentColor" : "none"} />
            </button>
            {hovered && onEditTags && (
              <button
                onClick={(e) => onEditTags(track, e)}
                title="Tags"
                className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-[13px] leading-none"
              >
                #
              </button>
            )}
            {hovered && (
              <button
                onClick={() => onSwapLane(track)}
                title={track.type === "music" ? "This is a sound effect" : "This is music"}
                className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <KindIcon className="h-3 w-3" />
              </button>
            )}
            {hovered && track.source === "library" && (
              <button
                onClick={() => onDelete(track)}
                title={armedDelete ? "Click again to delete" : "Delete"}
                className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors ${
                  armedDelete ? "text-red-400 bg-red-500/15" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            {hovered && (
              <button
                onClick={() => !unavailable && onAdd(track)}
                title="Add at playhead"
                className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors ${
                  unavailable ? "bg-primary/30 text-primary-foreground/40 cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {playing && (
        <Scrubber audioRef={audioRef} peaks={peaks} kind={track.type} durationSec={track.durationSec} />
      )}
    </div>
  );
}

export default React.memo(TrackRow);
