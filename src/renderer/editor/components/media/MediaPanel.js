import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Search, X, RefreshCw, Loader2, Upload, Star, Trash2, Image as ImageIcon } from "lucide-react";
import { Separator } from "../../../../components/ui/separator";
import { ScrollArea } from "../../../../components/ui/scroll-area";
import { Button } from "../../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../../components/ui/tooltip";
import useEditorStore from "../../stores/useEditorStore";
import { fmtDur } from "../audio/TrackRow";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
export const GIF_EXTENSIONS = ["gif"];
export const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv"];
const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...GIF_EXTENSIONS, ...VIDEO_EXTENSIONS];

const SUB_TABS = [
  ["image", "Images"],
  ["gif", "GIFs"],
  ["video", "Videos"],
];

function fileUrl(p) {
  return `file://${p.replace(/\\/g, "/")}`;
}

/**
 * Video cell thumbnail. preload="metadata" paints the first frame without
 * pulling the whole file; the unmount teardown (pause → removeAttribute →
 * load) is the standing rule — a dropped <video> without it crashes Chromium.
 */
function VideoThumb({ path }) {
  const ref = useRef(null);
  useEffect(() => () => {
    const v = ref.current;
    if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
  }, []);
  return <video ref={ref} src={fileUrl(path)} muted preload="metadata" className="w-full h-16 object-cover block" />;
}

/**
 * The Media panel (#309): images, GIFs and videos from the watched media
 * folders (Settings) plus drop-imported one-offs, ahead of the overlay
 * placement model (#310) that will let them onto the timeline. Modeled on
 * AudioPanel; speaks only in categories — folder names never show here
 * (they're internal lingo; Settings is where folders live).
 */
export default function MediaPanel() {
  const [subTab, setSubTab] = useState("image");
  const [search, setSearch] = useState("");
  // All / Favorites / Recent — same flow as Audio. Recent stays empty until
  // #310 wires add-to-timeline, which stamps lastUsedAt.
  const [view, setView] = useState("all");
  const [assets, setAssets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [folderCount, setFolderCount] = useState(0);
  const [status, setStatus] = useState(null); // { text, error } — import/delete feedback
  const [armedDeleteId, setArmedDeleteId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const statusTimer = useRef(null);
  const searchRef = useRef(null);

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
    const result = await window.clipflow.assetsImport(paths, null);
    if (!result?.success) { flashStatus(result?.error || "Import failed", true); return; }
    const n = result.imported.length;
    const skipNote = result.skipped.length ? ` · ${result.skipped.length} skipped (${result.skipped[0].reason})` : "";
    flashStatus(n ? `Imported ${n} file${n === 1 ? "" : "s"}${skipNote}` : `Nothing imported${skipNote}`, n === 0);
    refresh();
  }, [flashStatus, refresh]);

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

  const toggleFavorite = useCallback(async (item) => {
    const result = await window.clipflow.assetsFavorite(item.id);
    if (result?.success) refresh();
  }, [refresh]);

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

  const counts = useMemo(() => {
    const c = { image: 0, gif: 0, video: 0 };
    for (const a of mediaAssets) c[a.type]++;
    return c;
  }, [mediaAssets]);

  const filtered = useMemo(() => {
    let t = mediaAssets.filter((a) => a.type === subTab);
    if (view === "favorites") t = t.filter((a) => a.favorite);
    else if (view === "recent") {
      t = t.filter((a) => a.lastUsedAt)
        .sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")))
        .slice(0, 30);
    }
    if (search) t = t.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
    return t;
  }, [mediaAssets, subTab, view, search]);

  const subTabLabel = SUB_TABS.find(([id]) => id === subTab)[1];

  return (
    <div className="flex flex-col h-full">
      {/* Watched-folder note — categories only, no folder names (Settings has those) */}
      {folderCount > 0 && (
        <div className="px-3 pt-2 text-[11px] text-muted-foreground/70">
          {folderCount} watched folder{folderCount === 1 ? "" : "s"} · {mediaAssets.length} item{mediaAssets.length === 1 ? "" : "s"}
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
                  title={item.offline ? `${item.name} — folder offline` : item.missing ? `${item.name} — file missing` : item.name}
                  className={`relative rounded-md overflow-hidden bg-secondary/40 border border-border/40 group ${item.offline || item.missing ? "opacity-50" : ""}`}
                >
                  {item.missing || item.offline ? (
                    <div className="w-full h-16 flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  ) : item.type === "video" ? (
                    <VideoThumb path={item.path} />
                  ) : (
                    <img src={fileUrl(item.path)} alt="" loading="lazy" className="w-full h-16 object-cover block" />
                  )}
                  {/* Star — hover or already favorited */}
                  <button
                    onClick={() => toggleFavorite(item)}
                    title={item.favorite ? "Unfavorite" : "Favorite"}
                    className={`absolute top-1 left-1 h-5 w-5 rounded flex items-center justify-center bg-black/60 transition-opacity ${
                      item.favorite ? "text-yellow-400" : "text-white/80 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <Star className={`h-3 w-3 ${item.favorite ? "fill-yellow-400" : ""}`} />
                  </button>
                  {/* Uploaded one-offs can be deleted; watched-folder files can't */}
                  {item.source !== "folder" && (
                    <button
                      onClick={() => handleDelete(item)}
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
                  : `No ${subTabLabel.toLowerCase()} yet`}
              </div>
              <div className="text-[12px] text-muted-foreground/60 mt-1">
                {view === "favorites" ? "Star an item to pin it here"
                  : view === "recent" ? "Media you add to a clip shows up here so you can reuse it"
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
