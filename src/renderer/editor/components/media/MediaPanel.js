import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Search, X, RefreshCw, Loader2, Upload, Star, Trash2, Image as ImageIcon, EyeOff, Gamepad2, ChevronDown, Check } from "lucide-react";
import { Separator } from "../../../../components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../components/ui/popover";
import { ScrollArea } from "../../../../components/ui/scroll-area";
import { Button } from "../../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../../components/ui/tooltip";
import useEditorStore from "../../stores/useEditorStore";
import usePlaybackStore from "../../stores/usePlaybackStore";
import { getTimelineDuration, timelineToSource } from "../../models/timeMapping";
import { fmtDur } from "../audio/TrackRow";
import { toFileUrl } from "../../../components/shared";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
export const GIF_EXTENSIONS = ["gif"];
export const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv"];
const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...GIF_EXTENSIONS, ...VIDEO_EXTENSIONS];

const SUB_TABS = [
  ["image", "Images"],
  ["gif", "GIFs"],
  ["video", "Videos"],
];

// #322: the scope showing everything, whatever game it belongs to. Not a tag —
// no game can collide with it, and it never reaches the store.
const ALL_GAMES = "__all__";

/**
 * Video cell thumbnail. preload="metadata" paints the first frame without
 * pulling the whole file; the unmount teardown (pause → removeAttribute →
 * load) is the standing rule — a dropped <video> without it crashes Chromium.
 *
 * #319: a file Chromium can't open used to fail silently here — a black cell
 * that reads as "broken file" when FFmpeg composites it perfectly well. Say
 * which half is missing instead, so the file still gets used.
 */
function VideoThumb({ path }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => {
    const v = ref.current;
    if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
  }, []);
  if (failed) {
    return (
      <div
        title="No preview for this file — it still renders fine"
        className="w-full h-16 flex flex-col items-center justify-center gap-0.5 bg-secondary/40 text-muted-foreground/60"
      >
        <EyeOff className="h-3.5 w-3.5" />
        <span className="text-[9px] leading-none">No preview</span>
      </div>
    );
  }
  return (
    <video
      ref={ref}
      src={toFileUrl(path)}
      muted
      preload="metadata"
      onError={() => setFailed(true)}
      className="w-full h-16 object-cover block"
    />
  );
}

/**
 * One row in a game menu (#322) — used by both the panel's scope chip and the
 * per-item "show this in" menu, so picking a game reads the same in both.
 */
function ScopeOption({ label, color, hint, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11.5px] text-left transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-foreground/90 hover:bg-secondary"
      }`}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={color
          ? { background: color, boxShadow: `0 0 6px ${color}` }
          : { border: "1px solid currentColor", opacity: 0.5 }}
      />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[10px] text-muted-foreground/70 shrink-0">{hint}</span>}
      {active && <Check className="h-3 w-3 shrink-0" />}
    </button>
  );
}

/**
 * The Media panel (#309): images, GIFs and videos from the watched media
 * folders (Settings) plus drop-imported one-offs. Clicking one puts it on the
 * clip at the playhead (#310 images/GIFs, #311 videos). Modeled on
 * AudioPanel; speaks only in categories — folder names never show here
 * (they're internal lingo; Settings is where folders live).
 */
export default function MediaPanel({ gamesDb }) {
  const [subTab, setSubTab] = useState("image");
  const [search, setSearch] = useState("");
  // All / Favorites / Recent — same flow as Audio. Recent fills from the
  // lastUsedAt stamp that adding to the timeline writes (#310).
  const [view, setView] = useState("all");
  const [assets, setAssets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [folderCount, setFolderCount] = useState(0);
  const [status, setStatus] = useState(null); // { text, error } — import/delete feedback
  const [armedDeleteId, setArmedDeleteId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // #322: which game's media the whole panel is showing. Everything below —
  // counts, the All/Favorites/Recent pills, search — lives inside this scope.
  const [scope, setScope] = useState(ALL_GAMES);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [gameMenuId, setGameMenuId] = useState(null); // per-item game popover
  const statusTimer = useRef(null);
  const searchRef = useRef(null);

  // Only games that still exist can scope anything. An item tagged with a game
  // that was deleted or turned off reads as universal — it keeps its tag on
  // disk (the game may come back) but shows everywhere meanwhile.
  const activeGames = useMemo(
    () => (gamesDb || []).filter((g) => g && g.name && g.tag && g.active !== false),
    [gamesDb],
  );
  const gameByTag = useMemo(() => new Map(activeGames.map((g) => [g.tag, g])), [activeGames]);
  const gameOf = useCallback((item) => gameByTag.get(item.gameTag) || null, [gameByTag]);

  // The clip's own tag, falling back to the project's — the same pair the
  // send-to-queue gate reads. Retagging a clip in the AI panel writes it, so
  // this re-runs and the panel follows.
  const clipGameTag = useEditorStore((s) => s.clip?.gameTag || s.project?.gameTag || "");
  useEffect(() => {
    setScope(clipGameTag && gameByTag.has(clipGameTag) ? clipGameTag : ALL_GAMES);
  }, [clipGameTag, gameByTag]);
  const scopeGame = scope === ALL_GAMES ? null : gameByTag.get(scope) || null;

  const refresh = useCallback(async () => {
    const result = await window.clipflow.assetsList();
    if (result?.success) setAssets(result.assets);
    else if (result?.error) setStatus({ text: result.error, error: true });
    setLoaded(true);
    return result?.success ? result.assets : null;
  }, []);
  const assetsRevision = useEditorStore((s) => s.assetsRevision);
  useEffect(() => { refresh(); }, [refresh, assetsRevision]);

  useEffect(() => {
    window.clipflow.storeGet("mediaFolders").then((v) => {
      if (Array.isArray(v)) setFolderCount(v.filter((f) => f && f.enabled !== false).length);
    });
  }, []);

  useEffect(() => () => clearTimeout(statusTimer.current), []);

  const flashStatus = useCallback((text, error = false) => {
    setStatus({ text, error });
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 5000);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const before = new Set(assets.map((a) => a.id));
    const next = await refresh();
    setRefreshing(false);
    if (!next) return; // refresh() already flashed the error
    const added = next.filter((a) => !before.has(a.id) && (a.type === "image" || a.type === "gif" || a.type === "video"));
    flashStatus(added.length ? `${added.length} new item${added.length === 1 ? "" : "s"}` : "Nothing new");
  }, [assets, refresh, flashStatus]);

  const importFiles = useCallback(async (paths) => {
    if (!paths || paths.length === 0) return;
    // #322: an upload made while looking at one game belongs to that game —
    // otherwise it lands in the pool and immediately vanishes from the view it
    // was dropped into. Changeable per item afterwards.
    const result = await window.clipflow.assetsImport(paths, null, scope === ALL_GAMES ? null : scope);
    if (!result?.success) { flashStatus(result?.error || "Import failed", true); return; }
    // Audio is still importable here (the library is one index) — say where it
    // went, or a dropped sound looks like it vanished.
    const sounds = result.imported.filter((a) => a.type === "music" || a.type === "sfx").length;
    const media = result.imported.length - sounds;
    const parts = [];
    if (media) parts.push(`Imported ${media} file${media === 1 ? "" : "s"}`);
    if (sounds) parts.push(`${sounds} sound${sounds === 1 ? "" : "s"} → Audio panel`);
    if (result.skipped.length) parts.push(`${result.skipped.length} skipped (${result.skipped[0].reason})`);
    flashStatus(parts.join(" · ") || "Nothing imported", result.imported.length === 0);
    refresh();
  }, [flashStatus, refresh, scope]);

  const handleUpload = useCallback(async () => {
    const paths = await window.clipflow.openFileDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Media", extensions: MEDIA_EXTENSIONS },
        { name: "Images", extensions: IMAGE_EXTENSIONS },
        { name: "GIFs", extensions: GIF_EXTENSIONS },
        { name: "Videos", extensions: VIDEO_EXTENSIONS },
      ],
    });
    if (paths) importFiles(paths);
  }, [importFiles]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => { try { return window.clipflow.getPathForFile(f); } catch (_) { return null; } })
      .filter(Boolean);
    importFiles(paths);
  }, [importFiles]);

  // #310: put this picture on the clip at the playhead's SOURCE moment, so it
  // follows that footage through later trims — the same anchoring sounds use.
  // A GIF's own length isn't in the library index (only audio and video get
  // probed), so it's read here, once, and the block starts one loop long.
  const handleAddToTimeline = useCallback(async (item) => {
    if (item.missing || item.offline) return;
    const es = useEditorStore.getState();
    if (!es.clip) { flashStatus("Open a clip to add media", true); return; }

    const nle = es.nleSegments || [];
    const tl = usePlaybackStore.getState().currentTime;
    let sourceTime = tl;
    if (nle.length > 0) {
      const clamped = Math.max(0, Math.min(tl, getTimelineDuration(nle) - 0.05));
      const m = timelineToSource(clamped, nle);
      sourceTime = m.found ? m.sourceTime : nle[0].sourceStart;
    }

    // A video's runtime is already in the library index (#309 probes those for
    // the duration badge); a GIF's loop isn't, so it's read here. Either way an
    // unprobeable file falls back to the default length.
    let durationSec = item.type === "video" && item.durationSec > 0 ? Number(item.durationSec) : null;
    if (durationSec == null && (item.type === "gif" || item.type === "video")) {
      try {
        const probe = await window.clipflow.ffmpegProbe(item.path);
        const d = probe?.duration ?? probe?.format?.duration;
        if (d > 0) durationSec = Number(d);
      } catch (_) { /* falls back to the default length */ }
    }

    // #318: a video is the only kind with a WINDOW into its file, and every
    // clamp on that window is derived from the file's length. Placed without
    // one it can be stretched past its own end, where the render freezes the
    // last frame over silence and the preview seeks somewhere that doesn't
    // exist. A GIF or a still has no inside to run out of, so those keep the
    // default-length fallback.
    if (item.type === "video" && !(durationSec > 0)) {
      flashStatus(`Couldn't read how long ${item.name} is, so it wasn't added — try again, or re-export the file`, true);
      return;
    }

    es.addMediaPlacement(item, sourceTime, durationSec);
    flashStatus(`${item.name} added at ${fmtDur(Math.max(0, tl))}`);
    // The one chokepoint for placing media, so the one place Recent is stamped.
    // Fire-and-forget — a failed stamp must not undo a placement that happened.
    window.clipflow.assetsMarkUsed(item.id, item.path).then((r) => {
      if (r?.success) setAssets((prev) => prev.map((a) => (a.id === item.id ? { ...a, lastUsedAt: r.lastUsedAt } : a)));
    }).catch(() => {});
  }, [flashStatus]);

  const toggleFavorite = useCallback(async (item) => {
    const result = await window.clipflow.assetsFavorite(item.id);
    if (result?.success) refresh();
  }, [refresh]);

  // #322: move one item to a game, to every game ("universal"), or back to
  // whatever its folder says (null). The folder assignment covers the bulk;
  // this is the exception — one meme inside a game folder, one rank image
  // dropped in from the desktop.
  const setItemGame = useCallback(async (item, gameTag) => {
    setGameMenuId(null);
    const result = await window.clipflow.assetsSetGame(item.id, gameTag);
    if (!result?.success) { flashStatus(result?.error || "Couldn't change that", true); return; }
    refresh();
  }, [flashStatus, refresh]);

  // Two-click confirm, disarmed when the pointer leaves the cell. Only
  // uploaded one-offs are deletable — watched-folder files belong to the user
  // (assets.js refuses them anyway).
  const handleDelete = useCallback(async (item) => {
    if (armedDeleteId !== item.id) { setArmedDeleteId(item.id); return; }
    setArmedDeleteId(null);
    const result = await window.clipflow.assetsDelete(item.id);
    if (result?.success) { flashStatus(`Deleted ${item.name}`); refresh(); }
    else flashStatus(result?.error || "Delete failed", true);
  }, [armedDeleteId, flashStatus, refresh]);

  const mediaAssets = useMemo(
    () => assets.filter((a) => a.type === "image" || a.type === "gif" || a.type === "video"),
    [assets],
  );

  // A game's view is that game's media PLUS everything universal — the memes
  // and overlays that belong to no game are wanted on every clip.
  const scopedAssets = useMemo(() => {
    if (scope === ALL_GAMES) return mediaAssets;
    return mediaAssets.filter((a) => !gameByTag.has(a.gameTag) || a.gameTag === scope);
  }, [mediaAssets, scope, gameByTag]);

  const counts = useMemo(() => {
    const c = { image: 0, gif: 0, video: 0 };
    for (const a of scopedAssets) c[a.type]++;
    return c;
  }, [scopedAssets]);

  const filtered = useMemo(() => {
    let t = scopedAssets.filter((a) => a.type === subTab);
    if (view === "favorites") t = t.filter((a) => a.favorite);
    else if (view === "recent") {
      t = t.filter((a) => a.lastUsedAt)
        .sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")))
        .slice(0, 30);
    }
    if (search) t = t.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
    return t;
  }, [scopedAssets, subTab, view, search]);

  const subTabLabel = SUB_TABS.find(([id]) => id === subTab)[1];

  return (
    <div className="flex flex-col h-full">
      {/* Game scope + watched-folder note — categories and game names only, no
          folder names (those are internal lingo; Settings is where folders live) */}
      {(activeGames.length > 0 || folderCount > 0) && (
        <div className="flex items-center gap-2 px-3 pt-2">
          {activeGames.length > 0 && (
            <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
              <PopoverTrigger asChild>
                <button
                  title="Which game's media to show"
                  className="shrink-0 h-6 pl-1.5 pr-1.5 rounded-full border border-border/50 hover:border-border/80 flex items-center gap-1.5 text-[11px] font-medium text-foreground/90 transition-colors"
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={scopeGame
                      ? { background: scopeGame.color || "#888", boxShadow: `0 0 6px ${scopeGame.color || "#888"}` }
                      : { border: "1px solid currentColor", opacity: 0.5 }}
                  />
                  <span className="max-w-[104px] truncate">{scopeGame ? scopeGame.name : "All games"}</span>
                  <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                <ScopeOption
                  label="All games"
                  active={scope === ALL_GAMES}
                  onClick={() => { setScope(ALL_GAMES); setScopeOpen(false); }}
                />
                <Separator className="my-1" />
                <div className="max-h-56 overflow-y-auto">
                  {activeGames.map((g) => (
                    <ScopeOption
                      key={g.tag}
                      label={g.name}
                      color={g.color}
                      hint={g.tag === clipGameTag ? "this clip" : null}
                      active={scope === g.tag}
                      onClick={() => { setScope(g.tag); setScopeOpen(false); }}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {folderCount > 0 && (
            <span className="text-[11px] text-muted-foreground/70 truncate">
              {folderCount} watched folder{folderCount === 1 ? "" : "s"} · {scopedAssets.length} item{scopedAssets.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {/* Sub tabs */}
      <div className="flex gap-4 px-3 pt-2 pb-1 border-b border-border/40">
        {SUB_TABS.map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={`text-xs font-medium pb-2 border-b-2 transition-colors flex items-center gap-1 ${subTab === id ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
            {label}
            {counts[id] > 0 && <span className="opacity-55 text-[10px]">{counts[id]}</span>}
          </button>
        ))}
      </div>

      {/* Search + refresh + upload */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-secondary/50 border border-border/40 flex-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${subTabLabel.toLowerCase()}...`}
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" />
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                onClick={handleRefresh} disabled={refreshing}>
                {refreshing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[12px]">Check your media folders for new files</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleUpload}>
                <Upload className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[12px]">Upload images, GIFs or videos</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Import/delete feedback */}
      {status && (
        <div className={`px-3 pb-1.5 text-[11px] ${status.error ? "text-red-400" : "text-emerald-400"}`}>{status.text}</div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 px-3 pb-2">
        {[["all", "All"], ["favorites", "Favorites"], ["recent", "Recent"]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className={`shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors ${
              view === id ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground border border-border/40 hover:border-border/60 hover:text-foreground"
            }`}>
            {label}
          </button>
        ))}
      </div>

      <Separator />

      {/* Thumbnail grid — flat per category, no folder-name group headers */}
      <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="px-3 py-2">
          {filtered.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  onMouseLeave={() => setArmedDeleteId((cur) => (cur === item.id ? null : cur))}
                  onClick={() => handleAddToTimeline(item)}
                  title={
                    item.offline ? `${item.name} — folder offline`
                      : item.missing ? `${item.name} — file missing`
                      : `${item.name} — click to add at the playhead`
                  }
                  className={`relative rounded-md overflow-hidden bg-secondary/40 border border-border/40 group ${
                    item.offline || item.missing
                      ? "opacity-50"
                      : "cursor-pointer hover:border-primary/50 transition-colors"
                  }`}
                >
                  {item.missing || item.offline ? (
                    <div className="w-full h-16 flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  ) : item.type === "video" ? (
                    <VideoThumb path={item.path} />
                  ) : (
                    <img src={toFileUrl(item.path)} alt="" loading="lazy" className="w-full h-16 object-cover block" />
                  )}
                  {/* Star — hover or already favorited */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(item); }}
                    title={item.favorite ? "Unfavorite" : "Favorite"}
                    className={`absolute top-1 left-1 h-5 w-5 rounded flex items-center justify-center bg-black/60 transition-opacity ${
                      item.favorite ? "text-yellow-400" : "text-white/80 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <Star className={`h-3 w-3 ${item.favorite ? "fill-yellow-400" : ""}`} />
                  </button>
                  {/* #322: which game this item shows under. An assigned item
                      wears its game's dot at all times; a universal one only
                      offers the control on hover, so the grid stays quiet. */}
                  {activeGames.length > 0 && (
                    <Popover
                      open={gameMenuId === item.id}
                      onOpenChange={(o) => setGameMenuId(o ? item.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          title={gameOf(item)
                            ? `Shows under ${gameOf(item).name} — click to change`
                            : "Shows under every game — click to pick one"}
                          className={`absolute top-1 left-7 h-5 w-5 rounded flex items-center justify-center bg-black/60 transition-opacity ${
                            gameOf(item) ? "" : "text-white/80 opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {gameOf(item)
                            ? <span className="h-2 w-2 rounded-full" style={{ background: gameOf(item).color || "#888", boxShadow: `0 0 6px ${gameOf(item).color || "#888"}` }} />
                            : <Gamepad2 className="h-3 w-3" />}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-56 p-1" onClick={(e) => e.stopPropagation()}>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Show this in</div>
                        {/* Ticks the EFFECTIVE game, inherited or not — the menu
                            answers "where does this show", not "what did I set".
                            gameOf, not the raw tag: a tag whose game was deleted
                            reads as universal here, same as the grid dot. */}
                        <ScopeOption
                          label="All games"
                          active={!gameOf(item)}
                          onClick={() => setItemGame(item, "universal")}
                        />
                        <div className="max-h-56 overflow-y-auto">
                          {activeGames.map((g) => (
                            <ScopeOption
                              key={g.tag}
                              label={g.name}
                              color={g.color}
                              active={item.gameTag === g.tag}
                              onClick={() => setItemGame(item, g.tag)}
                            />
                          ))}
                        </div>
                        {/* Only a folder item can fall back to a folder */}
                        {item.source === "folder" && item.gameTagSource === "item" && (
                          <>
                            <Separator className="my-1" />
                            <button
                              onClick={() => setItemGame(item, null)}
                              className="w-full px-2 py-1.5 rounded text-[11.5px] text-left text-muted-foreground hover:bg-secondary transition-colors"
                            >
                              Use its folder&apos;s setting
                            </button>
                          </>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                  {/* Uploaded one-offs can be deleted; watched-folder files can't */}
                  {item.source !== "folder" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                      title={armedDeleteId === item.id ? "Click again to delete" : "Delete"}
                      className={`absolute top-1 right-1 h-5 w-5 rounded items-center justify-center bg-black/60 transition-colors hidden group-hover:flex ${
                        armedDeleteId === item.id ? "text-red-400" : "text-white/80 hover:text-foreground"
                      }`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                  {item.type === "video" && item.durationSec != null && item.durationSec > 0 && (
                    <span className="absolute bottom-[18px] right-1 px-1 rounded bg-black/70 text-[9px] text-white/85">
                      {fmtDur(item.durationSec)}
                    </span>
                  )}
                  <div className="px-1.5 py-1 text-[9.5px] text-muted-foreground truncate">{item.name}</div>
                </div>
              ))}
            </div>
          )}

          {loaded && filtered.length === 0 && (
            <div className="py-12 text-center px-4">
              <ImageIcon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <div className="text-xs text-muted-foreground">
                {view === "favorites" ? "No favorites yet"
                  : view === "recent" ? "Nothing used yet"
                  : scopeGame ? `No ${subTabLabel.toLowerCase()} for ${scopeGame.name}`
                  : `No ${subTabLabel.toLowerCase()} yet`}
              </div>
              <div className="text-[12px] text-muted-foreground/60 mt-1">
                {view === "favorites" ? "Star an item to pin it here"
                  : view === "recent" ? "Media you add to a clip shows up here so you can reuse it"
                  : scopeGame ? "Drop files below to add some, or switch to All games to see everything you have"
                  : "Drop files below, or add a media folder in Settings — everything in it shows up automatically, subfolders included"}
              </div>
            </div>
          )}

          {/* Drop-to-import zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`mt-3 rounded-lg border-2 border-dashed text-center py-2.5 px-2 text-[10.5px] transition-colors ${
              dragOver ? "border-primary/50 bg-primary/5 text-foreground" : "border-border/30 text-muted-foreground/60"
            }`}
          >
            Drop files to import — PNG · JPG · WebP · GIF · MP4 · MOV · WebM · MKV
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
