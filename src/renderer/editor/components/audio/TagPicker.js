import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

/**
 * Mood picker for one track, or for a whole selection (#212).
 *
 * 34 moods is too many for a flat grid in a narrow panel, so: the ones actually
 * reached for recently are pinned on top, a search box narrows the rest, and free
 * text covers anything the vocabulary misses. The list is Epidemic Sound's own —
 * see MOODS in src/main/assets.js.
 */
export default function TagPicker({
  moods, selected, recentTags, x, y, bulkCount, onToggle, onAddFree, onClose,
}) {
  const [q, setQ] = useState("");
  const [free, setFree] = useState("");
  const inputRef = useRef(null);
  const has = (m) => selected.includes(m);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? moods.filter((m) => m.toLowerCase().includes(needle)) : moods;
    if (needle) return { pinned: [], rest: list };
    // Pin recent, minus any already shown as selected — selected sit at the top
    // anyway, and a mood listed twice reads as a bug.
    const pinned = recentTags.filter((m) => moods.includes(m) && !has(m)).slice(0, 6);
    return { pinned, rest: list.filter((m) => !pinned.includes(m)) };
  }, [q, moods, recentTags, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const Chip = ({ m }) => (
    <button
      onClick={() => onToggle(m)}
      className={`h-[22px] px-2 rounded text-[10.5px] font-medium border transition-colors ${
        has(m)
          ? "bg-primary/20 border-primary/45 text-violet-200"
          : "border-border text-muted-foreground hover:text-foreground hover:border-border/70"
      }`}
    >
      {m}
    </button>
  );

  const submitFree = () => {
    const t = free.trim();
    if (!t) return;
    onAddFree(t);
    setFree("");
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 w-[248px] rounded-lg border border-border bg-popover shadow-xl p-2.5 dark"
        style={{ left: x, top: y, transform: "translateY(-100%)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-foreground">
            {bulkCount > 1 ? `Tag ${bulkCount} tracks` : "Tags"}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-2 h-[26px] rounded-md bg-secondary/50 border border-border/40 mb-2">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a mood…"
            className="flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Already on this track — first, so removing is as easy as adding */}
        {selected.length > 0 && !q.trim() && (
          <>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">On this track</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {selected.map((m) => <Chip key={m} m={m} />)}
            </div>
          </>
        )}

        {shown.pinned.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Recent</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {shown.pinned.map((m) => <Chip key={m} m={m} />)}
            </div>
          </>
        )}

        <div className="max-h-[168px] overflow-y-auto flex flex-wrap gap-1 content-start">
          {shown.rest.filter((m) => q.trim() || !has(m)).map((m) => <Chip key={m} m={m} />)}
          {shown.rest.length === 0 && (
            <span className="text-[11px] text-muted-foreground py-1">No mood matches “{q.trim()}”</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 px-2 h-[26px] rounded-md bg-secondary/50 border border-border/40 mt-2">
          <span className="text-[12px] text-muted-foreground">+</span>
          <input
            value={free}
            onChange={(e) => setFree(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitFree(); } }}
            placeholder="Add your own…"
            className="flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </>
  );
}
