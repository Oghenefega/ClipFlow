import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  Search, X, RefreshCw, Loader2, Upload, Volume2, VolumeX, Music,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { Separator } from "../../../../components/ui/separator";
import { ScrollArea } from "../../../../components/ui/scroll-area";
import { Button } from "../../../../components/ui/button";
import { Slider } from "../../../../components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../../components/ui/tooltip";
import useEditorStore from "../../stores/useEditorStore";
import usePlaybackStore from "../../stores/usePlaybackStore";
import { timelineToSource, getTimelineDuration } from "../../models/timeMapping";
import TrackRow, { AUDIO_EXTENSIONS, fmtDur } from "./TrackRow";
import TagPicker from "./TagPicker";

export { AUDIO_EXTENSIONS };

/**
 * The Audio panel — the music/SFX library (#208), auditioning (#209), per-sound
 * default levels (#210) and the waveform rows (#211).
 *
 * Lifted out of RightPanelNew.js in session 138: at ~490 lines it was the largest
 * component in a 2900-line file, and the row now owns a canvas, a lazy peaks
 * fetch and its own playhead tick.
 */
export default function AudioPanel() {
  const [subTab, setSubTab] = useState("music");
  const [search, setSearch] = useState("");
  // #212: All / Favorites / Recent / Untagged. Recent answers "the sound I used on
  // a prior clip"; Untagged turns 490 unlabelled tracks into a shrinking queue
  // instead of an invisible backlog.
  const [view, setView] = useState("all");
  const [tagFilter, setTagFilter] = useState(null);
  const [moods, setMoods] = useState([]);
  const [recentTags, setRecentTags] = useState([]);
  const [tagEditor, setTagEditor] = useState(null); // { track, x, y }
  const [hoveredId, setHoveredId] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState(null); // { text, error } — import/delete feedback
  const [playingId, setPlayingId] = useState(null);
  const [armedDeleteId, setArmedDeleteId] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [sortMode, setSortMode] = useState("folder"); // folder | name | length
  const [scan, setScan] = useState(null); // { done, total } while durations are read
  // Auditioning a library plays at full blast otherwise: Epidemic masters to
  // broadcast loudness, and a placed song sits at 0.4 anyway, so previewing at
  // 1.0 was both painful and a lie about how it lands on the clip.
  const [previewVolume, setPreviewVolume] = useState(0.35);
  const [refreshing, setRefreshing] = useState(false);
  const audioRef = useRef(null);
  const statusTimer = useRef(null);
  const searchRef = useRef(null);

  const refresh = useCallback(async () => {
    const result = await window.clipflow.assetsList();
    if (result?.success) setAssets(result.assets);
    else if (result?.error) setStatus({ text: result.error, error: true });
    setLoaded(true);
    return result?.success ? result.assets : null;
  }, []);
  // Re-lists on mount, and again whenever the library is edited from outside this
  // panel (#210 — saving a default volume from the timeline popover).
  const assetsRevision = useEditorStore((s) => s.assetsRevision);
  useEffect(() => { refresh(); }, [refresh, assetsRevision]);

  // #208: a cold watched library spends a minute or two reading durations, and
  // a track has no honest lane until its own is read. Re-list at most every 2s
  // while that runs, so the panel fills in without re-rendering hundreds of
  // rows on every batch, then once more when it finishes.
  useEffect(() => {
    let timer = null;
    window.clipflow.onAssetsScanProgress((p) => {
      setScan(p);
      if (p.done >= p.total) {
        clearTimeout(timer);
        timer = null;
        refresh();
        return;
      }
      if (!timer) timer = setTimeout(() => { timer = null; refresh(); }, 2000);
    });
    return () => {
      clearTimeout(timer);
      window.clipflow.removeAssetsScanListeners();
    };
  }, [refresh]);

  useEffect(() => {
    window.clipflow.storeGet("audioPreviewVolume").then((v) => {
      if (typeof v === "number" && v >= 0 && v <= 1) setPreviewVolume(v);
    });
    window.clipflow.assetsMoods().then((r) => { if (r?.moods) setMoods(r.moods); });
    window.clipflow.storeGet("audioRecentTags").then((v) => {
      if (Array.isArray(v)) setRecentTags(v);
    });
  }, []);

  // Moods reached for recently get pinned in the picker — with 34 to choose from,
  // the handful actually in rotation shouldn't need hunting for each time.
  const noteTagUsed = useCallback((tag) => {
    setRecentTags((prev) => {
      const next = [tag, ...prev.filter((t) => t !== tag)].slice(0, 8);
      window.clipflow.storeSet("audioRecentTags", next);
      return next;
    });
  }, []);

  // Moving the slider while something is auditioning takes effect immediately.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = previewVolume;
  }, [previewVolume]);

  // Unmount cleanup — stop preview audio and drop the element (standing rule).
  useEffect(() => () => {
    clearTimeout(statusTimer.current);
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); audioRef.current = null; }
  }, []);

  const flashStatus = useCallback((text, error = false) => {
    setStatus({ text, error });
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 5000);
  }, []);

  // #209: `assets:list` already re-walks every watched folder and absorbs new
  // files, so the library was never actually blind — but the only trigger was
  // opening the panel, and nothing said it had happened. With the panel already
  // open, a file dropped into the folder looked ignored.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const before = new Set(assets.map((a) => a.id));
    const next = await refresh();
    setRefreshing(false);
    if (!next) return; // refresh() already flashed the error
    const added = next.filter((a) => !before.has(a.id));
    if (!added.length) { flashStatus("Nothing new"); return; }
    // A just-absorbed file has no duration yet, so it has no lane yet either and
    // shows in neither tab until backfillDurations probes it (#208). Saying so
    // stops the count from contradicting the list for the second that takes.
    const sorting = added.some((a) => !a.type);
    flashStatus(`${added.length} new track${added.length === 1 ? "" : "s"}${sorting ? " — sorting them now" : ""}`);
  }, [assets, refresh, flashStatus]);

  const importFiles = useCallback(async (paths) => {
    if (!paths || paths.length === 0) return;
    const result = await window.clipflow.assetsImport(paths, subTab);
    if (!result?.success) { flashStatus(result?.error || "Import failed", true); return; }
    const n = result.imported.length;
    const skipNote = result.skipped.length ? ` · ${result.skipped.length} skipped (${result.skipped[0].reason})` : "";
    flashStatus(n ? `Imported ${n} file${n === 1 ? "" : "s"}${skipNote}` : `Nothing imported${skipNote}`, n === 0);
    refresh();
  }, [subTab, flashStatus, refresh]);

  const handleUpload = useCallback(async () => {
    const paths = await window.clipflow.openFileDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
    });
    if (paths) importFiles(paths);
  }, [importFiles]);

  const togglePlay = useCallback((track) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.pause();
    a.volume = previewVolume;
    a.src = `file://${track.path.replace(/\\/g, "/")}`;
    a.onended = () => setPlayingId(null);
    a.play().then(() => setPlayingId(track.id)).catch(() => {
      flashStatus(`Can't play ${track.name}`, true);
      setPlayingId(null);
    });
  }, [playingId, flashStatus, previewVolume]);

  const toggleFavorite = useCallback(async (track) => {
    const result = await window.clipflow.assetsFavorite(track.id);
    if (result?.success) refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (track) => {
    if (armedDeleteId !== track.id) { setArmedDeleteId(track.id); return; }
    setArmedDeleteId(null);
    if (playingId === track.id) { audioRef.current?.pause(); setPlayingId(null); }
    const result = await window.clipflow.assetsDelete(track.id);
    if (result?.success) { flashStatus(`Deleted ${track.name}`); refresh(); }
    else flashStatus(result?.error || "Delete failed", true);
  }, [armedDeleteId, playingId, flashStatus, refresh]);

  // Leaving a row also disarms its delete — the two-click confirm must not
  // survive the pointer going somewhere else.
  const handleHover = useCallback((id) => {
    setHoveredId(id);
    if (id === null) setArmedDeleteId(null);
  }, []);

  // #202: place this asset on the clip at the playhead's SOURCE moment, so it
  // follows that footage through later trims. A song added mid-clip ends the
  // one playing across that moment — that gesture IS the hyped → sad switch.
  const handleAddToTimeline = useCallback((track) => {
    const es = useEditorStore.getState();
    if (!es.clip) { flashStatus("Open a clip to add sounds", true); return; }
    const nle = es.nleSegments || [];
    const tl = usePlaybackStore.getState().currentTime;
    let sourceTime = tl;
    if (nle.length > 0) {
      const clamped = Math.max(0, Math.min(tl, getTimelineDuration(nle) - 0.05));
      const m = timelineToSource(clamped, nle);
      sourceTime = m.found ? m.sourceTime : nle[0].sourceStart;
    }
    const res = es.addAudioPlacement(track, sourceTime);
    const at = fmtDur(Math.max(0, tl));
    flashStatus(res.clampedName
      ? `${track.name} plays from ${at} · ${res.clampedName} now ends there`
      : `${track.name} added at ${at}`);
    // #212: the single chokepoint for placing a sound, so this is the one place
    // Recent needs stamping. Fire-and-forget — a failed stamp must not block the
    // placement that already happened.
    window.clipflow.assetsMarkUsed(track.id).then((r) => {
      if (r?.success) setAssets((prev) => prev.map((a) => (a.id === track.id ? { ...a, lastUsedAt: r.lastUsedAt } : a)));
    }).catch(() => {});
  }, [flashStatus]);

  // #212: tags. The picker edits one track, or the whole selection when several
  // rows are picked.
  const openTagEditor = useCallback((track, e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setTagEditor({ track, x: Math.min(r.left, window.innerWidth - 260), y: r.top - 6 });
  }, []);

  const applyTags = useCallback(async (track, tags) => {
    const result = await window.clipflow.assetsSetTags(track.id, tags);
    if (!result?.success) { flashStatus(result?.error || "Couldn't save tags", true); return; }
    setAssets((prev) => prev.map((a) => (a.id === track.id ? { ...a, tags: result.tags } : a)));
    setTagEditor((t) => (t && t.track.id === track.id ? { ...t, track: { ...t.track, tags: result.tags } } : t));
  }, [flashStatus]);

  // #208: the duration rule is ~98% right on a real library; this is the escape
  // hatch for the rest, and it survives every later rescan.
  const moveToOtherLane = useCallback(async (track) => {
    const dest = track.type === "music" ? "sfx" : "music";
    const result = await window.clipflow.assetsSetType(track.id, dest);
    if (result?.success) {
      flashStatus(`${track.name} moved to ${dest === "music" ? "Music" : "Sound effects"}`);
      refresh();
    } else flashStatus(result?.error || "Move failed", true);
  }, [flashStatus, refresh]);

  // #210: forget this sound's saved level. Sounds already placed on a clip keep
  // the volume they were given — this only changes what future placements open at.
  const clearDefaultVolume = useCallback(async (track) => {
    const result = await window.clipflow.assetsSetDefaultVolume(track.id, null);
    if (result?.success) {
      flashStatus(`${track.name} back to the default level`);
      refresh();
    } else flashStatus(result?.error || "Couldn't clear", true);
  }, [flashStatus, refresh]);

  // Tags render always-visible on the row (Fega's call over hover-only). Two fit a
  // narrow panel; the rest collapse into a count. Clicking one filters by it —
  // the fastest way to go from "this worked" to "what else is like it".
  // useCallback keeps TrackRow's memo intact.
  const renderTags = useCallback((track) => {
    const tags = track.tags || [];
    if (!tags.length) return null;
    const shown = tags.slice(0, 2);
    const extra = tags.length - shown.length;
    return (
      <div className="flex items-center gap-1 shrink-0 max-w-[52%]">
        {shown.map((t) => (
          <button
            key={t}
            onClick={(e) => { e.stopPropagation(); setTagFilter((cur) => (cur === t ? null : t)); }}
            title={tags.join(", ")}
            className={`h-[15px] px-1.5 rounded text-[9.5px] font-medium truncate max-w-[68px] transition-colors ${
              tagFilter === t ? "bg-primary/25 text-violet-200" : "bg-white/[0.07] text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
        {extra > 0 && (
          <span className="text-[9.5px] text-muted-foreground/70" title={tags.join(", ")}>+{extra}</span>
        )}
      </div>
    );
  }, [tagFilter]);

  const filteredTracks = useMemo(() => {
    let t = assets.filter((a) => a.type === subTab);
    if (view === "favorites") t = t.filter((a) => a.favorite);
    else if (view === "recent") t = t.filter((a) => a.lastUsedAt);
    else if (view === "untagged") t = t.filter((a) => !(a.tags || []).length);
    if (tagFilter) t = t.filter((a) => (a.tags || []).includes(tagFilter));
    if (search) t = t.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
    return t;
  }, [assets, subTab, view, tagFilter, search]);

  // Every mood actually in use in this lane, most-used first — the filter strip
  // only offers tags that would return something.
  const tagCounts = useMemo(() => {
    const counts = new Map();
    for (const a of assets) {
      if (a.type !== subTab) continue;
      for (const t of a.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [assets, subTab]);

  const untaggedCount = useMemo(
    () => assets.filter((a) => a.type === subTab && !(a.tags || []).length).length,
    [assets, subTab],
  );

  // Watched folders keep their own shape — Fega's mood folders ("Troll - Derpy
  // - Funny", "Lowkey - Just Chatting") are the useful part of his library.
  // Insertion order follows the scan, so a folder's tracks stay together.
  // Sorting by length drops the folders instead: the point of that view is to
  // compare across the whole lane, which grouping would hide.
  const groups = useMemo(() => {
    // #212: Recent is an ordering, not a folder view — newest use first, grouping
    // dropped, capped so it stays a shortlist rather than a second library.
    if (view === "recent") {
      const sorted = [...filteredTracks]
        .sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")))
        .slice(0, 30);
      return [{ name: null, path: null, tracks: sorted }];
    }
    if (sortMode === "length") {
      // The end nearest the OTHER lane comes first — a song that is suspiciously
      // short and an effect that is suspiciously long are the two shapes the
      // duration rule gets wrong, so this lands them at the top of each tab.
      const dir = subTab === "music" ? 1 : -1;
      const sorted = [...filteredTracks].sort((a, b) => dir * ((a.durationSec ?? 0) - (b.durationSec ?? 0)));
      return [{ name: null, path: null, tracks: sorted }];
    }
    const byName = new Map();
    for (const t of filteredTracks) {
      const g = t.group || "Other";
      if (!byName.has(g)) byName.set(g, { path: t.groupPath, tracks: [] });
      byName.get(g).tracks.push(t);
    }
    let out = [...byName.entries()].map(([name, v]) => ({ name, path: v.path, tracks: v.tracks }));
    if (sortMode === "name") {
      out = out
        .map((g) => ({ ...g, tracks: [...g.tracks].sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  }, [filteredTracks, sortMode, subTab, view]);

  // Groups start collapsed — hundreds of open rows is a wall. Searching opens
  // everything so nothing is buried behind a closed folder, and a lone group
  // never collapses (a small uploaded library behaves exactly as before).
  const searching = search.trim().length > 0;
  const grouped = sortMode !== "length" && view !== "recent" && groups.length > 1;
  const isOpen = useCallback(
    (name) => searching || !grouped || expandedGroups.has(name),
    [searching, grouped, expandedGroups],
  );
  const toggleGroup = useCallback((name) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex gap-4 px-3 pt-2 pb-1 border-b border-border/40">
        {["music", "sfx"].map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`text-xs font-medium pb-2 border-b-2 transition-colors ${subTab === t ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
            {t === "music" ? "Music" : "Sound effect"}
          </button>
        ))}
      </div>

      {/* Search + refresh + upload */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-secondary/50 border border-border/40 flex-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" />
          {/* #209: clearing a query took backspacing the whole thing out. */}
          {search && (
            <button
              onClick={() => { setSearch(""); searchRef.current?.focus(); }}
              title="Clear search"
              className="shrink-0 h-4 w-4 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <TooltipProvider delayDuration={200}>
          {/* Preview volume — affects auditioning here only, never the clip */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                    {previewVolume === 0
                      ? <VolumeX className="h-3.5 w-3.5" />
                      : <Volume2 className="h-3.5 w-3.5" />}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent className="text-[12px]">Preview volume — {Math.round(previewVolume * 100)}%</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-56 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-foreground">Preview volume</span>
                <span className="text-[11px] text-muted-foreground">{Math.round(previewVolume * 100)}%</span>
              </div>
              <Slider
                value={[previewVolume * 100]}
                min={0}
                max={100}
                step={5}
                onValueChange={([v]) => setPreviewVolume(v / 100)}
                onValueCommit={([v]) => window.clipflow.storeSet("audioPreviewVolume", v / 100)}
              />
              <p className="text-[11px] text-muted-foreground/70 mt-2 leading-snug">
                How loud tracks play when you audition them here. Doesn't change how they sound on the clip.
              </p>
            </PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                onClick={handleRefresh} disabled={refreshing}>
                {refreshing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[12px]">Check your audio folders for new files</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleUpload}>
                <Upload className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[12px]">Upload audio files</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Import/delete feedback */}
      {status && (
        <div className={`px-3 pb-1.5 text-[11px] ${status.error ? "text-red-400" : "text-emerald-400"}`}>{status.text}</div>
      )}

      {/* First scan of a watched folder — tracks land in a lane as they're read */}
      {scan && scan.done < scan.total && (
        <div className="px-3 pb-1.5 text-[11px] text-muted-foreground">
          Reading your audio folders — {scan.done} of {scan.total}. Tracks appear as they're sorted.
        </div>
      )}

      {/* Filter pills + sort */}
      <div className="flex items-center gap-1.5 px-3 pb-2">
        {[["all", "All", null],
          ["favorites", "Favorites", null],
          ["recent", "Recent", null],
          ["untagged", "Untagged", untaggedCount]].map(([id, label, n]) => (
          <button key={id} onClick={() => setView(id)}
            className={`shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1 ${
              view === id ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground border border-border/40 hover:border-border/60 hover:text-foreground"
            }`}>
            {label}
            {n ? <span className="opacity-55 text-[10px]">{n}</span> : null}
          </button>
        ))}
        <TooltipProvider delayDuration={200}>
          <div className="ml-auto flex items-center gap-1.5">
            {[["folder", "Folder", "Grouped by the folder they live in"],
              ["name", "Name", "A to Z within each folder"],
              ["length", "Length", subTab === "music" ? "Shortest first — the ones most likely to be sound effects" : "Longest first — the ones most likely to be music"]]
              .map(([id, label, hint]) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <button onClick={() => setSortMode(id)}
                      className={`shrink-0 text-[11px] transition-colors ${
                        sortMode === id ? "text-primary font-medium" : "text-muted-foreground/70 hover:text-foreground"
                      }`}>
                      {label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-[12px]">{hint}</TooltipContent>
                </Tooltip>
              ))}
          </div>
        </TooltipProvider>
      </div>

      {/* #212: mood filter — only moods that actually exist in this lane, so the
          strip can never offer a filter that returns nothing. */}
      {tagCounts.length > 0 && (
        <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto">
          {tagFilter && (
            <button onClick={() => setTagFilter(null)}
              className="shrink-0 h-[22px] px-2 rounded text-[10.5px] font-medium bg-primary/20 text-violet-200 border border-primary/45 flex items-center gap-1">
              {tagFilter} <X className="h-2.5 w-2.5" />
            </button>
          )}
          {tagCounts.filter(([t]) => t !== tagFilter).slice(0, 12).map(([t, n]) => (
            <button key={t} onClick={() => setTagFilter(t)}
              className="shrink-0 h-[22px] px-2 rounded text-[10.5px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors flex items-center gap-1">
              {t} <span className="opacity-50 text-[9.5px]">{n}</span>
            </button>
          ))}
        </div>
      )}

      <Separator />

      {/* Track list */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {groups.map((g) => (
            <div key={g.name || "__all__"}>
              {grouped && (
                <button onClick={() => toggleGroup(g.name)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-colors">
                  {isOpen(g.name)
                    ? <ChevronDown className="h-3 w-3 shrink-0" />
                    : <ChevronRight className="h-3 w-3 shrink-0" />}
                  {/* Hover shows the real folder — the short name alone can't say
                      which "Music" or "SFX" folder this is. */}
                  <span className="truncate" title={g.path || g.name}>{g.name}</span>
                  <span className="ml-auto opacity-60">{g.tracks.length}</span>
                </button>
              )}
              {isOpen(g.name) && g.tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  playing={playingId === track.id}
                  audioRef={audioRef}
                  hovered={hoveredId === track.id}
                  armedDelete={armedDeleteId === track.id}
                  onHover={handleHover}
                  onTogglePlay={togglePlay}
                  onFavorite={toggleFavorite}
                  onSwapLane={moveToOtherLane}
                  onDelete={handleDelete}
                  onAdd={handleAddToTimeline}
                  onClearDefaultVolume={clearDefaultVolume}
                  onEditTags={openTagEditor}
                  renderTags={renderTags}
                />
              ))}
            </div>
          ))}
          {loaded && filteredTracks.length === 0 && (
            <div className="py-12 text-center px-4">
              <Music className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <div className="text-xs text-muted-foreground">
                {tagFilter ? `Nothing tagged “${tagFilter}” here`
                  : view === "favorites" ? "No favorites yet"
                  : view === "recent" ? "Nothing used yet"
                  : view === "untagged" ? "Everything here is tagged"
                  : subTab === "music" ? "No music yet" : "No sound effects yet"}
              </div>
              <div className="text-[12px] text-muted-foreground/60 mt-1">
                {tagFilter ? "Clear the mood filter, or tag some tracks with it"
                  : view === "favorites" ? "Star a track to pin it here"
                  : view === "recent" ? "Sounds you add to a clip show up here so you can reuse them"
                  : view === "untagged" ? "Nice — every track in this tab has a mood"
                  : "Upload here, or add an audio folder in Settings — everything in it shows up automatically, subfolders included"}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {tagEditor && (
        <TagPicker
          moods={moods}
          selected={tagEditor.track.tags || []}
          recentTags={recentTags}
          x={tagEditor.x}
          y={tagEditor.y}
          bulkCount={1}
          onToggle={(m) => {
            const cur = tagEditor.track.tags || [];
            const next = cur.includes(m) ? cur.filter((t) => t !== m) : [...cur, m];
            if (!cur.includes(m)) noteTagUsed(m);
            applyTags(tagEditor.track, next);
          }}
          onAddFree={(t) => {
            const cur = tagEditor.track.tags || [];
            if (cur.includes(t)) return;
            noteTagUsed(t);
            applyTags(tagEditor.track, [...cur, t]);
          }}
          onClose={() => setTagEditor(null)}
        />
      )}
    </div>
  );
}
