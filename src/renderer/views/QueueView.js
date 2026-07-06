import React, { useState, useRef, useEffect, useMemo } from "react";
import posthog from "posthog-js";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, Badge, Select, InfoBanner, Checkbox, extractGameTag, toFileUrl } from "../components/shared";
import CaptionsView from "./CaptionsView";
import TestChip from "../components/TestChip";
import PlatformIcon from "../components/PlatformIcon";
import { localISO } from "../utils/trackerEngine";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const FULL_DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// Hour options: 8 AM through 12 AM (midnight) = hours 8..23 then 0
const HOUR_OPTIONS = (() => {
  const o = [];
  for (let h = 8; h < 24; h++) {
    const hr = h % 12 || 12, ap = h < 12 ? "AM" : "PM";
    o.push({ value: String(h).padStart(2, "0"), label: `${hr} ${ap}` });
  }
  // Add 12 AM (midnight) at the end
  o.push({ value: "00", label: "12 AM" });
  return o;
})();
// Minute options: 00-55 in 5-minute increments
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const m = i * 5;
  return { value: String(m).padStart(2, "0"), label: String(m).padStart(2, "0") };
});
// Legacy TIME_OPTIONS for display/lookup (used in tracker logging)
const genTimeOptions = () => {
  const o = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 5) {
    const hr = h % 12 || 12, ap = h < 12 ? "AM" : "PM";
    o.push({ value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, label: `${hr}:${String(m).padStart(2, "0")} ${ap}` });
  }
  return o;
};
const TIME_OPTIONS = genTimeOptions();

const getWeekDates = (refDate) => {
  const d = new Date(refDate);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return DAY_NAMES.map((name, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return { dayName: name, iso: localISO(x), label: `${x.toLocaleString("en-US", { month: "short" })} ${x.getDate()}` };
  });
};
const getUpcomingDates = () => {
  const d = [], n = new Date();
  for (let i = 0; i < 14; i++) {
    const x = new Date(n); x.setDate(n.getDate() + i);
    const dn = FULL_DAY_NAMES[x.getDay()];
    if (dn === "Sunday") continue;
    d.push({ label: `${dn} ${x.toLocaleString("en-US", { month: "short" })} ${x.getDate()}`, dayName: dn, iso: localISO(x) });
  }
  return d;
};

// Parse a time slot string like "3:30 PM" into total minutes since midnight
const parseTimeToMinutes = (s) => {
  const [t, ap] = s.split(" ");
  let [h, m] = t.split(":").map(Number);
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + m;
};

// Snap a time string to the nearest slot in the provided timeSlots array
const snapToSlot = (timeStr, timeSlots) => {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return timeStr;
  let h = parseInt(match[1]), m = parseInt(match[2]);
  const ap = match[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  const mins = h * 60 + m;
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < timeSlots.length; i++) {
    const d = Math.abs(parseTimeToMinutes(timeSlots[i]) - mins);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return timeSlots[best];
};

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return children({ ref: setNodeRef, style: { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }, attributes, listeners });
}

// ── Phase 2: Per-platform control constants ──
const PLATFORM_CHAR_LIMITS = { tiktok: 2200, instagram: 2200, facebook: 63206, youtube_title: 100, youtube_desc: 5000 };
const PLATFORM_KEYS = ["tiktok", "instagram", "facebook", "youtube"];
const PLATFORM_META = {
  tiktok:    { label: "TikTok",    abbr: "TT", bg: "#000",     border: "rgba(255,255,255,0.15)" },
  instagram: { label: "Instagram", abbr: "IG", bg: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", border: "none" },
  facebook:  { label: "Facebook",  abbr: "FB", bg: "#1877f2",  border: "none" },
  youtube:   { label: "YouTube",   abbr: "YT", bg: "#c4302b",  border: "none" },
};

// Human-friendly labels for TikTok privacy_level enum values returned by creator_info.
// Used in the per-clip TikTok options panel dropdown.
const TIKTOK_PRIVACY_LABELS = {
  PUBLIC_TO_EVERYONE: "Public",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

// #71: A clip is "placeholder-named" if its title is the unedited "Clip N" default
// the pipeline assigned. Manual rename or AI Titles overwrite the title to something
// else and silence the warning. Strict pattern — anything past the number opts out.
const PLACEHOLDER_TITLE_RE = /^Clip \d+$/;
const isPlaceholderTitle = (title) => PLACEHOLDER_TITLE_RE.test((title || "").trim());

// Resolve caption for a platform using template + clip data, respecting overrides
function resolveCaption(platformKey, clip, captionTemplates, ytDescriptions, gamesDb) {
  // Prefer clip.gameTag (first-class field, lowercased); fall back to title hashtag for legacy clips.
  const gameTag = (clip.gameTag || extractGameTag(clip.title) || "").toLowerCase();
  // YouTube description comes from ytDescriptions per-game system.
  // ytDescriptions is keyed by game display name ("Arc Raiders"). Projects store
  // clip.gameTag as the short abbreviation from gamesDb (e.g. "RL", "AR") OR sometimes
  // as a hashtag slug ("rocketleague") via title extraction. Resolve via gamesDb by
  // matching either form to find the display name.
  if (platformKey === "youtube") {
    let key = null;
    const game = (gamesDb || []).find((g) =>
      (g.tag || "").toLowerCase() === gameTag ||
      (g.hashtag || "").toLowerCase() === gameTag
    );
    if (game?.name && ytDescriptions?.[game.name]) {
      key = game.name;
    } else {
      // Permissive fallback for legacy entries: match a key whose spaces-stripped lowercase form == gameTag.
      key = Object.keys(ytDescriptions || {}).find((k) =>
        k.toLowerCase().replace(/\s+/g, "") === gameTag
      ) || null;
    }
    if (key && ytDescriptions[key]?.desc) {
      // Prefer the gamesDb hashtag for {gametitle} substitution so saved templates
      // still render "#rocketleague" even when clip.gameTag is the short form ("RL").
      const hashtagForSub = (game?.hashtag || gameTag || "").toLowerCase();
      return ytDescriptions[key].desc
        .replace(/\{title\}/g, clip.title || "")
        .replace(/#{gametitle}/g, hashtagForSub ? `#${hashtagForSub}` : "");
    }
    return clip.title || "";
  }
  // TikTok / Instagram / Facebook — use captionTemplates
  const template = captionTemplates?.[platformKey];
  if (!template) return clip.title || "";
  return template
    .replace(/\{title\}/g, clip.title || "")
    .replace(/#{gametitle}/g, gameTag ? `#${gameTag}` : "");
}

// Map connected account to platform key
function accountToPlatformKey(account) {
  const p = (account.platform || "").toLowerCase();
  if (p === "tiktok") return "tiktok";
  if (p === "instagram") return "instagram";
  if (p === "facebook") return "facebook";
  if (p === "youtube") return "youtube";
  if (p === "meta" && account.igAccountId) return "instagram";
  return null;
}

// Character count color
function charCountColor(len, max) {
  const pct = len / max;
  if (pct > 1) return T.red;
  if (pct > 0.8) return T.yellow;
  return T.textTertiary;
}

// TikTok per-clip options panel — guideline-compliant UX for Content Posting API
// audit (https://developers.tiktok.com/doc/content-sharing-guidelines/).
//
// Wave 2 scope (this revision):
//   A1 — "Posting as <nickname> (@<handle>)" header
//   A2 — privacy dropdown sourced from creator_info, no default value
//
// Later waves will add interaction toggles, commercial disclosure, etc.
function TiktokOptionsPanel({ clip, account, onSave, onCreatorInfoLoaded }) {
  const [creatorInfo, setCreatorInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch creator info on mount (and whenever the account changes).
  // `cancelled` guard prevents setState after unmount if the user closes the
  // panel mid-fetch. On success, also pushes the data up via callback so the
  // parent's publish-button gate can apply A7 (duration check) synchronously.
  useEffect(() => {
    if (!account?.key) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.clipflow?.tiktokQueryCreatorInfo({ accountId: account.key })
      .then((r) => {
        if (cancelled) return;
        if (r?.error) {
          setError(r.error);
          setCreatorInfo(null);
        } else {
          const info = r.creatorInfo || null;
          setCreatorInfo(info);
          setError(null);
          if (info && onCreatorInfoLoaded) onCreatorInfoLoaded(account.key, info);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || "Failed to load TikTok options");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [account?.key, onCreatorInfoLoaded]);

  if (loading) {
    return (
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.textTertiary }}>
        Loading TikTok options…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.red, background: T.redDim }}>
        Couldn't load TikTok options — {error}. Publishing to TikTok is blocked until this resolves.
      </div>
    );
  }

  // A1: prefer creator_info's canonical fields (matches what TikTok's guideline
  // calls "the creator's nickname"); fall back to the stored account record if
  // for some reason the API returned an empty value.
  const nickname = creatorInfo?.creator_nickname || account.displayName || "TikTok";
  const handle = creatorInfo?.creator_username || account.name || "";

  // A2 + A5 cross-constraint: branded content can NOT be private, so SELF_ONLY
  // is filtered out of the dropdown whenever Branded Content is active. The
  // auto-clear at toggle-time handles the "already picked SELF_ONLY" case so
  // the dropdown can never display a now-invalid current value.
  const brandedActive = clip.tiktokIsBrandedContent === true;
  const rawPrivacyOptions = Array.isArray(creatorInfo?.privacy_level_options) ? creatorInfo.privacy_level_options : [];
  const privacyOptions = brandedActive ? rawPrivacyOptions.filter((o) => o !== "SELF_ONLY") : rawPrivacyOptions;

  // A2: per guideline, dropdown has NO default value — user must actively pick.
  // We surface this by border-coloring the select red until set, plus a small
  // "Required" hint adjacent to it.
  const privacySet = !!clip.tiktokPrivacy;

  // A5 state derivations
  const disclosureOn = clip.tiktokCommercialDisclosure === true;
  const yourBrandOn = clip.tiktokIsYourBrand === true;
  const subOptionPicked = yourBrandOn || brandedActive;

  // A7 — in-panel duration check. Surfaces a visible error inline so the user
  // sees the problem without having to click Publish. Parent's gate also blocks
  // publish using the same data via the onCreatorInfoLoaded callback.
  const maxDurationSec = creatorInfo?.max_video_post_duration_sec;
  const clipDurationSec = Number(clip.duration);
  const durationTooLong = !!maxDurationSec && Number.isFinite(clipDurationSec) && clipDurationSec > maxDurationSec;

  // Toggling Branded Content ON while SELF_ONLY is selected must clear the
  // privacy back to unset (forces re-pick). Other state changes don't need
  // similar handling.
  const handleBrandedContentToggle = () => {
    const next = !brandedActive;
    const partial = { tiktokIsBrandedContent: next };
    if (next && clip.tiktokPrivacy === "SELF_ONLY") partial.tiktokPrivacy = null;
    onSave(partial);
  };

  // Toggling the master disclosure OFF resets both sub-options back to false
  // so re-enabling later starts from a clean state (matches TikTok's UX where
  // unchecking the master collapses + clears the section).
  const handleDisclosureMasterToggle = () => {
    const next = !disclosureOn;
    if (next) onSave({ tiktokCommercialDisclosure: true });
    else onSave({ tiktokCommercialDisclosure: false, tiktokIsYourBrand: false, tiktokIsBrandedContent: false });
  };

  return (
    <>
      {/* A1 — Posting-as header */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: T.labelStrong, fontWeight: 700, letterSpacing: 0.3 }}>Posting as</span>
        <span style={{ fontSize: 13, color: T.text, fontWeight: 700 }}>{nickname}</span>
        {handle && (
          <span style={{ fontSize: 12.5, color: T.textSecondary, fontFamily: T.mono }}>@{handle}</span>
        )}
      </div>

      {/* A2 — Privacy dropdown. Uses the custom Select component instead of a
          native <select> because Chromium's default option rendering has poor
          contrast on dark backgrounds (text barely readable until hovered). */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: T.labelStrong, fontWeight: 700, minWidth: 50, letterSpacing: 0.3 }}>Privacy</span>
        <Select
          value={clip.tiktokPrivacy || ""}
          onChange={(value) => onSave({ tiktokPrivacy: value || null })}
          options={[
            { value: "", label: "— Select privacy —" },
            ...privacyOptions.map((opt) => ({ value: opt, label: TIKTOK_PRIVACY_LABELS[opt] || opt })),
          ]}
          style={{ minWidth: 160 }}
        />
        {!privacySet && (
          <span style={{ fontSize: 10, color: T.red, fontWeight: 700 }}>Required</span>
        )}
      </div>

      {/* A3 + A6 — Interaction toggles (Disable Duet/Stitch/Comment).
          Each toggle is a pill: OFF (transparent) = allow, ON (green) = disable.
          If creator_info reports the feature disabled at account level, the toggle
          is locked ON with reduced opacity and not-allowed cursor (A6 force-on). */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 11, color: T.labelStrong, fontWeight: 700, marginBottom: 7, letterSpacing: 0.3 }}>Interactions</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <TiktokInteractionToggle
            label="Disable Duet"
            userOn={clip.tiktokDisableDuet === true}
            forceOn={creatorInfo?.duet_disabled === true}
            onToggle={() => onSave({ tiktokDisableDuet: !(clip.tiktokDisableDuet === true) })}
          />
          <TiktokInteractionToggle
            label="Disable Stitch"
            userOn={clip.tiktokDisableStitch === true}
            forceOn={creatorInfo?.stitch_disabled === true}
            onToggle={() => onSave({ tiktokDisableStitch: !(clip.tiktokDisableStitch === true) })}
          />
          <TiktokInteractionToggle
            label="Disable Comment"
            userOn={clip.tiktokDisableComment === true}
            forceOn={creatorInfo?.comment_disabled === true}
            onToggle={() => onSave({ tiktokDisableComment: !(clip.tiktokDisableComment === true) })}
          />
        </div>
      </div>

      {/* A7 — Duration check. Rendered as an inline error banner inside the
          panel when the clip exceeds the account's max video duration. Publish
          gate (parent) enforces the same check at the button level. */}
      {durationTooLong && (
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.redBorder}`, background: T.redDim, fontSize: 10, color: T.red, fontWeight: 700 }}>
          This clip is {Math.round(clipDurationSec)}s — your TikTok account only allows posts up to {maxDurationSec}s. Trim the clip or use a shorter render.
        </div>
      )}

      {/* A4 — Music Usage Confirmation disclosure (with conditional Branded
          Content Policy variant per A5 rule 4/5). Verbatim wording per the
          Content Sharing Guidelines; links open in the OS default browser
          via the openExternal IPC.
          Renders ABOVE A5 (Commercial Disclosure) so the panel follows the
          guideline's Point 1→5 order (Round-2 audit fix). */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.textSecondary, lineHeight: 1.55 }}>
        By posting, you agree to TikTok&apos;s{" "}
        {brandedActive && (
          <>
            <a
              href="https://www.tiktok.com/legal/page/global/bc-policy/en"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.clipflow?.openExternal?.("https://www.tiktok.com/legal/page/global/bc-policy/en");
              }}
              style={{ color: T.accent, textDecoration: "underline", cursor: "pointer" }}
            >Branded Content Policy</a>{" and "}
          </>
        )}
        <a
          href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.clipflow?.openExternal?.("https://www.tiktok.com/legal/page/global/music-usage-confirmation/en");
          }}
          style={{ color: T.accent, textDecoration: "underline", cursor: "pointer" }}
        >Music Usage Confirmation</a>.
      </div>

      {/* A5 — Commercial Content Disclosure.
          Master toggle (OFF by default) reveals two sub-options when on.
          Conditional label shows what TikTok will visibly tag the post as.
          When the user enables this but doesn't pick a sub-option, the
          publish button is gated via getTiktokBlockReason (verbatim tooltip
          per the guideline). */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div
          onClick={(e) => { e.stopPropagation(); handleDisclosureMasterToggle(); }}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
          <Checkbox checked={disclosureOn} size={16} />
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Disclose commercial content</span>
        </div>
        {disclosureOn && (
          <div style={{ marginTop: 8, marginLeft: 24, display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Sub-option: Your Brand */}
            <div
              onClick={(e) => { e.stopPropagation(); onSave({ tiktokIsYourBrand: !yourBrandOn }); }}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <Checkbox checked={yourBrandOn} size={14} />
              <span style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>Your Brand</span>
              <span style={{ fontSize: 11.5, color: T.textSecondary }}>— you&apos;re promoting yourself or your own product</span>
            </div>
            {/* Sub-option: Branded Content */}
            <div
              onClick={(e) => { e.stopPropagation(); handleBrandedContentToggle(); }}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <Checkbox checked={brandedActive} size={14} />
              <span style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>Branded Content</span>
              <span style={{ fontSize: 11.5, color: T.textSecondary }}>— paid partnership with a third party</span>
            </div>
            {/* Conditional label hint or "Required" prompt */}
            {!subOptionPicked && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: T.red, fontWeight: 700 }}>
                Required — pick at least one sub-option above.
              </div>
            )}
            {brandedActive && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: T.textSecondary, fontStyle: "italic" }}>
                Your post will be labeled as &quot;Paid partnership&quot;.
              </div>
            )}
            {yourBrandOn && !brandedActive && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: T.textSecondary, fontStyle: "italic" }}>
                Your post will be labeled as &quot;Promotional content&quot;.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Pill-style toggle for the TikTok interaction section. Three states:
//   off:      transparent bg, grey text                 (= "allow")
//   on:       green bg + green text                     (= user-disabled)
//   force-on: green bg + reduced opacity + lock cursor  (= TikTok-disabled at account level)
//
// Force-on is non-clickable and surfaces a tooltip explaining the constraint.
function TiktokInteractionToggle({ label, userOn, forceOn, onToggle }) {
  const on = userOn || forceOn;
  const locked = forceOn;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!locked) onToggle(); }}
      disabled={locked}
      title={locked
        ? `${label} is enforced by your TikTok account settings — change it in the TikTok app to control it here.`
        : (on ? `Click to allow this interaction on the post.` : `Click to disable this interaction on the post.`)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px",
        borderRadius: 20,
        border: `1px solid ${on ? T.green : T.border}`,
        background: on ? "rgba(74,222,128,0.12)" : "transparent",
        color: on ? T.green : T.textSecondary,
        opacity: locked ? 0.6 : 1,
        cursor: locked ? "not-allowed" : "pointer",
        fontSize: 11, fontWeight: 700, lineHeight: 1, transition: "all 0.15s", fontFamily: T.font,
      }}
    >
      {/* A6 lock indicator — icon + LOCKED kept as their own centered flex box so the
          small text shares the label's midline instead of riding above it. */}
      {locked && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, lineHeight: 1 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1 }}>LOCKED</span>
        </span>
      )}
      <span style={{ lineHeight: 1 }}>{label}</span>
    </button>
  );
}

export default function QueueView({
  allClips, localProjects, setLocalProjects, mainGame, mainGameTag, platforms, trackerData, setTrackerData,
  weeklyTemplate, weekTemplateOverrides,
  ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates,
  platformOptions, setPlatformOptions, gamesDb, awardXp,
}) {
  // Mirror a successful projectUpdateClip into local React state so derived UI
  // (filters, scheduled section, override displays) updates without a tab reload.
  const updateClipInState = React.useCallback((projectId, clipId, updates) => {
    if (!setLocalProjects) return;
    setLocalProjects((prev) => prev.map((p) =>
      p.id !== projectId ? p : { ...p, clips: (p.clips || []).map((c) =>
        c.id !== clipId ? c : { ...c, ...updates })
    }));
  }, [setLocalProjects]);
  const scheduledClipIds = new Set(trackerData.map((t) => t.clipId).filter(Boolean));
  const scheduledTitles = new Set(trackerData.map((t) => t.title).filter(Boolean));
  // projectId → metadata (gameTag, gameColor, name, testMode). gameTag is lowercased
  // once here so all downstream comparisons can use === without case juggling.
  const projectInfo = React.useMemo(() => {
    const map = {};
    for (const p of (localProjects || [])) {
      map[p.id] = {
        name: p.name || p.sourceName || p.id,
        gameTag: (p.gameTag || "").toLowerCase(),
        gameColor: p.gameColor || "",
        testMode: p.testMode === true || (Array.isArray(p.tags) && p.tags.includes("test")),
      };
    }
    return map;
  }, [localProjects]);
  // Preserve projectId on each clip for IPC calls. Promote gameTag to a first-class
  // field on the clip (lowercased) — derived from clip.gameTag if present, else from
  // the parent project, else legacy fallback by parsing the title hashtag.
  const mainGameTagLc = (mainGameTag || "").toLowerCase();
  const approved = Object.entries(allClips).flatMap(([projectId, clips]) => {
    const projGameTag = projectInfo[projectId]?.gameTag || "";
    return clips
      .map((c) => {
        const clipTag = (c.gameTag || "").toLowerCase() || projGameTag || extractGameTag(c.title) || "";
        return { ...c, _projectId: projectId, gameTag: clipTag };
      })
      // A rendered, approved, unpublished, unscheduled clip ALWAYS shows. The
      // hashtag check belongs only to the editor's override-able send-to-queue
      // warning (EditorLayout onSendToQueue) — it must not also hide clips here,
      // and a title #hashtag is unrelated to a clip's game/"Just Chatting" tag (#139).
      .filter((c) => (c.status === "approved" || c.status === "ready")
        && !scheduledClipIds.has(c.id)
        && !scheduledTitles.has(c.title));
  }).sort((a, b) => (a.queueOrder ?? Infinity) - (b.queueOrder ?? Infinity) || new Date(a.createdAt) - new Date(b.createdAt));
  const isClipTest = (clip) => !!(clip && clip._projectId && projectInfo[clip._projectId]?.testMode);
  const mainCount = approved.filter((c) => c.gameTag === mainGameTagLc).length;
  const [selClip, setSelClip] = useState(null);
  const [schedAction, setSchedAction] = useState(null);
  const [schedDate, setSchedDate] = useState("");
  const [schedHour, setSchedHour] = useState("12");
  const [schedMin, setSchedMin] = useState("30");
  const schedTime = `${schedHour.padStart(2, "0")}:${schedMin.padStart(2, "0")}`;
  // publishStatus: { [clipId]: { state: "publishing"|"done"|"failed", platforms: { [key]: "pending"|"publishing"|"done"|"failed"|errorMsg } } }
  const [publishStatus, setPublishStatus] = useState({});
  // TikTok creator_info, cached by accountId. Populated by TiktokOptionsPanel
  // on mount (it fetches from main process); read by getTiktokBlockReason so the
  // publish gate can enforce the A7 duration check synchronously at render time.
  // If an account's info hasn't been fetched yet (panel never opened), the gate
  // skips duration validation — TikTok itself rejects too-long videos at init.
  const [tiktokCreatorInfo, setTiktokCreatorInfo] = useState({});
  const onTiktokCreatorInfoLoaded = React.useCallback((accountId, info) => {
    if (!accountId || !info) return;
    setTiktokCreatorInfo((prev) => ({ ...prev, [accountId]: info }));
  }, []);
  // Hydrate publishStatus from clip.publishState (persisted to disk) on mount and as new
  // clips appear, so failed-publish clips remain retryable across app restarts. We track
  // hydrated clipIds in a ref to avoid clobbering live in-memory state once a publish run
  // for that clip is in progress.
  const hydratedPublishRef = useRef(new Set());
  useEffect(() => {
    setPublishStatus((prev) => {
      let next = prev;
      const ensureCopy = () => { if (next === prev) next = { ...prev }; };
      for (const clip of approved) {
        const live = prev[clip.id];
        // Never disturb a clip that's mid-publish in this session.
        if (live && live.state === "publishing") { hydratedPublishRef.current.add(clip.id); continue; }
        const ps = clip.publishState;
        const isEmpty = !ps || Object.keys(ps).length === 0;
        if (isEmpty) {
          // Persisted publish history was cleared (e.g. the clip was re-queued and
          // re-rendered). Drop any stale failed/done markers so the card shows a clean
          // slate, and allow re-hydration if it's published again later.
          hydratedPublishRef.current.delete(clip.id);
          if (live) { ensureCopy(); delete next[clip.id]; }
          continue;
        }
        // Non-empty persisted state: hydrate once from disk. Live in-session state wins.
        if (hydratedPublishRef.current.has(clip.id)) continue;
        hydratedPublishRef.current.add(clip.id);
        if (live) continue;
        const platforms = {};
        let anyFailed = false;
        for (const [k, v] of Object.entries(ps)) {
          if (v === "success") platforms[k] = "done";
          else if (v && typeof v === "object" && v.error) { platforms[k] = v.error; anyFailed = true; }
        }
        ensureCopy();
        next[clip.id] = { state: anyFailed ? "failed" : "done", platforms };
      }
      return next;
    });
  }, [approved]);
  // ── Auto-fire scheduler ──
  // Ticks once per minute (plus once on mount) and triggers publishClip for any clip
  // whose scheduledAt has passed. Clears scheduledAt at fire time so the same clip
  // can't double-fire if the publish takes >60s or if the user reopens the app late.
  // Test-mode clips are skipped (publish is blocked for them anyway).
  // Limitation: only fires while ClipFlow is running. App closed at scheduled time =
  // the next tick after reopen catches it (still due because scheduledAt <= now).
  const autoFiringRef = useRef(new Set());
  const tickRef = useRef();
  tickRef.current = async () => {
    if (publishingRef.current) return;
    const now = Date.now();
    const due = approved
      .filter((c) =>
        c.scheduledAt &&
        new Date(c.scheduledAt).getTime() <= now &&
        !autoFiringRef.current.has(c.id) &&
        !isClipTest(c)
      )
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    for (const clip of due) {
      if (publishingRef.current) break;
      autoFiringRef.current.add(clip.id);
      console.log("[Scheduler] Firing scheduled publish:", clip.title, "(was scheduled for", clip.scheduledAt + ")");
      try {
        await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { scheduledAt: null });
        updateClipInState(clip._projectId, clip.id, { scheduledAt: null });
      } catch (_) { /* non-fatal */ }
      try {
        await publishClip(clip.id, null);
      } catch (e) {
        console.error("[Scheduler] Auto-fire failed for", clip.id, e);
      } finally {
        autoFiringRef.current.delete(clip.id);
      }
    }
  };
  useEffect(() => {
    const fire = () => tickRef.current?.();
    fire();
    const id = setInterval(fire, 60_000);
    return () => clearInterval(id);
  }, []);
  const [scheduled, setScheduled] = useState({});
  const publishingRef = useRef(false);
  // Per-platform publish results captured during this session's publish runs, keyed by
  // clipId → platformKey → { platform, accountId, postId?, url? }. Read by logPost so
  // tracker entries record the platforms that actually succeeded (not all connected).
  const publishResultsRef = useRef({});
  const [publishLogs, setPublishLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [publishProgress, setPublishProgress] = useState(null); // { stage, pct, detail }
  const [editingTitle, setEditingTitle] = useState(null); // clipId being edited
  const [editTitleValue, setEditTitleValue] = useState("");
  // Phase 2: per-platform caption editing state
  const [editingCaption, setEditingCaption] = useState(null); // { clipId, platform }
  const [editCaptionValue, setEditCaptionValue] = useState("");
  const [editingYtTitle, setEditingYtTitle] = useState(null); // clipId
  const [editYtTitleValue, setEditYtTitleValue] = useState("");
  // Phase 3: scheduling state
  const [confirmClipId, setConfirmClipId] = useState(null); // Phase 4: publish confirmation modal
  const [confirmSchedOpts, setConfirmSchedOpts] = useState(null);
  // Phase 5: filter/sort
  const [filterGame, setFilterGame] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all"); // all, unscheduled, scheduled, published, failed, unrendered
  const [sortBy, setSortBy] = useState("queue"); // queue, date, game, scheduled

  // Dequeue a clip (set status to "dequeued" so it leaves the queue but can be re-approved)
  const dequeueClip = async (clip) => {
    if (!clip._projectId) return;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { status: "dequeued" });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { status: "dequeued" });
    } catch (e) { console.error("Dequeue failed:", e); }
  };

  // Save inline title edit
  const saveTitle = async (clip) => {
    const trimmed = editTitleValue.trim();
    if (!trimmed || trimmed === clip.title || !clip._projectId) { setEditingTitle(null); return; }
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { title: trimmed });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { title: trimmed });
    } catch (e) { console.error("Title update failed:", e); }
    setEditingTitle(null);
  };

  // Phase 2: Toggle a platform on/off for a clip
  const togglePlatform = async (clip, platformKey) => {
    if (!clip._projectId) return;
    const current = clip.platformToggles || {};
    const updated = { ...current, [platformKey]: current[platformKey] === false ? true : false };
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { platformToggles: updated });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { platformToggles: updated });
    } catch (e) { console.error("Platform toggle failed:", e); }
  };

  // Phase 2: Save caption override for a platform
  const saveCaptionOverride = async (clip, platformKey, value) => {
    if (!clip._projectId) return;
    const resolved = resolveCaption(platformKey, clip, captionTemplates, ytDescriptions, gamesDb);
    const current = clip.captionOverrides || {};
    // If value matches template, clear the override
    const updated = { ...current, [platformKey]: value === resolved ? undefined : value };
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { captionOverrides: updated });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { captionOverrides: updated });
    } catch (e) { console.error("Caption override save failed:", e); }
    setEditingCaption(null);
  };

  // Phase 2: Reset caption override (back to template)
  const resetCaptionOverride = async (clip, platformKey) => {
    if (!clip._projectId) return;
    const current = clip.captionOverrides || {};
    const updated = { ...current };
    delete updated[platformKey];
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { captionOverrides: updated });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { captionOverrides: updated });
    } catch (e) { console.error("Caption reset failed:", e); }
    setEditingCaption(null);
  };

  // Phase 2: Save YouTube title
  const saveYoutubeTitle = async (clip, value) => {
    if (!clip._projectId) return;
    const ytTitle = value.trim() || null; // null = fallback to clip.title
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { youtubeTitle: ytTitle });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { youtubeTitle: ytTitle });
    } catch (e) { console.error("YouTube title save failed:", e); }
    setEditingYtTitle(null);
  };

  // Phase 2: Save YouTube privacy
  const saveYoutubePrivacy = async (clip, value) => {
    if (!clip._projectId) return;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { youtubePrivacy: value });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { youtubePrivacy: value });
    } catch (e) { console.error("YouTube privacy save failed:", e); }
  };

  // TikTok Content Posting API audit: persist any subset of the per-clip TikTok
  // flat fields (tiktokPrivacy / tiktokDisable* / tiktokCommercialDisclosure /
  // tiktokIsYourBrand / tiktokIsBrandedContent). The TiktokOptionsPanel calls
  // this on each user interaction.
  const saveTiktokFields = async (clip, partial) => {
    if (!clip._projectId || !partial || typeof partial !== "object") return;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, partial);
      if (!r?.error) updateClipInState(clip._projectId, clip.id, partial);
    } catch (e) { console.error("TikTok fields save failed:", e); }
  };

  // Phase 2: Get effective caption for a clip+platform (override or resolved template)
  const getEffectiveCaption = (clip, platformKey) => {
    if (clip.captionOverrides?.[platformKey] != null) return clip.captionOverrides[platformKey];
    return resolveCaption(platformKey, clip, captionTemplates, ytDescriptions, gamesDb);
  };

  // Phase 2: Get which platform keys are enabled for a clip
  const getEnabledPlatforms = (clip) => {
    const toggles = clip.platformToggles || {};
    return activePlat
      .map((p) => accountToPlatformKey(p))
      .filter((k) => k && toggles[k] !== false)
      .filter((v, i, a) => a.indexOf(v) === i); // dedupe
  };

  // TikTok Content Posting API audit: returns a human-readable reason string if
  // publishing should be blocked because the clip's TikTok options are incomplete
  // or invalid, or null if TikTok publishing is allowed (or TikTok isn't enabled).
  // Covers privacy (Wave 2), commercial-disclosure validation (Wave 5), and
  // duration check (Wave 6). Capacity (A8) is handled post-publish via error
  // translation since creator_info doesn't expose a pre-flight capacity flag.
  const getTiktokBlockReason = (clip) => {
    const enabled = getEnabledPlatforms(clip);
    if (!enabled.includes("tiktok")) return null;
    if (!clip.tiktokPrivacy) return "Pick a TikTok privacy level in the TikTok panel before publishing.";
    if (clip.tiktokCommercialDisclosure === true) {
      const youBrand = clip.tiktokIsYourBrand === true;
      const branded = clip.tiktokIsBrandedContent === true;
      // Verbatim wording from TikTok's Content Sharing Guidelines.
      if (!youBrand && !branded) {
        return "You need to indicate if your content promotes yourself, a third party, or both.";
      }
      if (branded && clip.tiktokPrivacy === "SELF_ONLY") {
        return "Branded content cannot be set to private — please choose a different privacy level.";
      }
    }
    // A7 — duration check. Skipped when creator_info hasn't been loaded yet
    // (panel not yet opened) since the value isn't available pre-flight; in
    // that case TikTok's own API rejects too-long videos at init.
    const tiktokAccount = activePlat.find((p) => accountToPlatformKey(p) === "tiktok");
    const info = tiktokAccount ? tiktokCreatorInfo[tiktokAccount.key] : null;
    const maxSec = info?.max_video_post_duration_sec;
    const clipDuration = Number(clip.duration);
    if (maxSec && Number.isFinite(clipDuration) && clipDuration > maxSec) {
      return `This clip is ${Math.round(clipDuration)}s — your TikTok account only allows posts up to ${maxSec}s.`;
    }
    return null;
  };

  // Phase 3: Schedule a clip (persist scheduledAt on clip object, don't publish yet)
  const scheduleClipOnly = async (clip, date, time) => {
    if (!clip._projectId) return;
    // #71: Scheduling a placeholder-named clip means it'll auto-publish later as
    // "Clip 3" unless the user renames it first. Warn explicitly.
    if (isPlaceholderTitle(clip.title)) {
      const ok = window.confirm(`This clip still has a placeholder name (${clip.title}). It will publish to social platforms with this title at the scheduled time.\n\nSchedule anyway?`);
      if (!ok) return;
    }
    const scheduledAt = `${date}T${time}:00`;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { scheduledAt });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { scheduledAt });
    } catch (e) { console.error("Schedule save failed:", e); }
    setSchedAction(null);
  };

  // Phase 3: Unschedule a clip
  const unscheduleClip = async (clip) => {
    if (!clip._projectId) return;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { scheduledAt: null });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { scheduledAt: null });
    } catch (e) { console.error("Unschedule failed:", e); }
  };

  // Phase 3: Auto-suggest next available time slot from weekly template
  const autoSuggestSlot = () => {
    const dates = getUpcomingDates();
    const wd = getWeekDates(new Date());
    const mondayIso = wd[0].iso;
    const tmpl = weekTemplateOverrides?.[mondayIso] || weeklyTemplate;
    if (!tmpl?.timeSlots?.length || !dates.length) return null;
    // Find existing scheduled times for each date
    const takenSlots = new Set();
    approved.forEach((c) => {
      if (c.scheduledAt) takenSlots.add(c.scheduledAt.slice(0, 16)); // "YYYY-MM-DDTHH:MM"
    });
    trackerData.forEach((t) => {
      if (t.date && t.time) {
        const m = t.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (m) {
          let h = parseInt(m[1]), min = parseInt(m[2]);
          const ap = m[3].toUpperCase();
          if (ap === "PM" && h !== 12) h += 12;
          if (ap === "AM" && h === 12) h = 0;
          takenSlots.add(`${t.date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
        }
      }
    });
    for (const d of dates) {
      for (const slot of tmpl.timeSlots) {
        const m = slot.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!m) continue;
        let h = parseInt(m[1]), min = parseInt(m[2]);
        const ap = m[3].toUpperCase();
        if (ap === "PM" && h !== 12) h += 12;
        if (ap === "AM" && h === 12) h = 0;
        const key = `${d.iso}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        if (!takenSlots.has(key)) {
          return { date: d.iso, hour: String(h).padStart(2, "0"), min: String(min).padStart(2, "0"), label: `${d.label} at ${slot}` };
        }
      }
    }
    return null;
  };

  // Phase 4: Retry publishing only failed platforms for a clip
  const retryFailed = async (clipId) => {
    const clip = approved.find((c) => c.id === clipId);
    const ps = publishStatus[clipId];
    if (!clip || !ps?.platforms) return;
    // #60: Hard-block publish for test clips.
    if (isClipTest(clip)) {
      setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: "failed", error: "Test clip — publishing blocked. Untoggle TEST on the project first." } }));
      return;
    }
    publishingRef.current = true;
    const failedKeys = Object.entries(ps.platforms).filter(([, st]) => st !== "done" && st !== "pending" && st !== "publishing").map(([k]) => k);
    if (failedKeys.length === 0) { publishingRef.current = false; return; }
    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: "publishing" } }));
    let nextPublishState = { ...(clip.publishState || {}) };
    let allSuccess = true;
    for (const platKey of failedKeys) {
      const plat = activePlat.find((p) => p.key === platKey);
      if (!plat) continue;
      const pk = accountToPlatformKey(plat);
      const caption = getEffectiveCaption(clip, pk);
      setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: "publishing" } } }));
      try {
        let result;
        if (plat.platform === "TikTok" && window.clipflow?.tiktokPublish) {
          result = await window.clipflow.tiktokPublish({
            accountId: plat.key, videoPath: clip.renderPath, title: clip.title,
            caption, clipId: clip.id,
            postMode: platformOptions?.tiktokPostMode || "direct_post",
            isTest: isClipTest(clip),
            tiktokFields: {
              privacy: clip.tiktokPrivacy || null,
              disableDuet: clip.tiktokDisableDuet === true,
              disableStitch: clip.tiktokDisableStitch === true,
              disableComment: clip.tiktokDisableComment === true,
              commercialDisclosure: clip.tiktokCommercialDisclosure === true,
              isYourBrand: clip.tiktokIsYourBrand === true,
              isBrandedContent: clip.tiktokIsBrandedContent === true,
            },
          });
        } else if ((plat.platform === "Instagram" || (plat.platform === "Meta" && plat.igAccountId)) && window.clipflow?.instagramPublish) {
          result = await window.clipflow.instagramPublish({ accountId: plat.key, videoPath: clip.renderPath, title: clip.title, caption, clipId: clip.id, isTest: isClipTest(clip) });
        } else if (plat.platform === "Facebook" && window.clipflow?.facebookPublish) {
          result = await window.clipflow.facebookPublish({ accountId: plat.key, videoPath: clip.renderPath, title: clip.title, caption, clipId: clip.id, isTest: isClipTest(clip) });
        } else if (plat.platform === "YouTube" && window.clipflow?.youtubePublish) {
          result = await window.clipflow.youtubePublish({ accountId: plat.key, videoPath: clip.renderPath, title: clip.title, caption, clipId: clip.id, tags: [], youtubeTitle: clip.youtubeTitle || clip.title, privacyStatus: clip.youtubePrivacy || "public", isTest: isClipTest(clip) });
        }
        if (result?.error) {
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: result.error } } }));
          nextPublishState[platKey] = { error: String(result.error), at: new Date().toISOString() };
          allSuccess = false;
        } else {
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: "done" } } }));
          nextPublishState[platKey] = "success";
          const postId = result?.post_id || result?.mediaId || result?.videoId || null;
          const url = plat.platform === "YouTube" && result?.videoId ? `https://www.youtube.com/watch?v=${result.videoId}` : null;
          publishResultsRef.current[clip.id] = {
            ...(publishResultsRef.current[clip.id] || {}),
            [pk]: { platform: pk, accountId: plat.key, ...(postId ? { postId } : {}), ...(url ? { url } : {}) },
          };
        }
      } catch (err) {
        setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: err.message || "Failed" } } }));
        nextPublishState[platKey] = { error: err.message || "Failed", at: new Date().toISOString() };
        allSuccess = false;
      }
      try {
        const updates = { publishState: { ...nextPublishState } };
        await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, updates);
        updateClipInState(clip._projectId, clip.id, updates);
      } catch (_) { /* non-fatal */ }
    }
    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: allSuccess ? "done" : "failed" } }));
    publishingRef.current = false;
    loadPublishLogs();

    // If retry brought every enabled platform on this clip to success, the publish run
    // is now complete — log to tracker so the clip moves out of the queue.
    if (allSuccess) {
      const enabledKeys = getEnabledPlatforms(clip)
        .map((pk) => activePlat.find((p) => accountToPlatformKey(p) === pk)?.key)
        .filter(Boolean);
      const everyDone = enabledKeys.every((k) => nextPublishState[k] === "success");
      if (everyDone) {
        const now = new Date();
        logPost(clip, localISO(now), FULL_DAY_NAMES[now.getDay()], now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), false);
      }
    }
  };

  // Phase 4: Open confirmation modal before publishing
  const requestPublish = (clipId, schedOpts) => {
    setConfirmClipId(clipId);
    setConfirmSchedOpts(schedOpts || null);
  };
  const confirmPublish = () => {
    if (confirmClipId) publishClip(confirmClipId, confirmSchedOpts);
    setConfirmClipId(null);
    setConfirmSchedOpts(null);
  };
  const cancelConfirm = () => { setConfirmClipId(null); setConfirmSchedOpts(null); };

  // Drag-to-reorder
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const clipIds = useMemo(() => approved.map((c) => c.id), [approved]);
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = approved.findIndex((c) => c.id === active.id);
    const newIdx = approved.findIndex((c) => c.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    // Recompute order values and persist
    const reordered = [...approved];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    for (let i = 0; i < reordered.length; i++) {
      const c = reordered[i];
      if (c._projectId && c.queueOrder !== i) {
        window.clipflow?.projectUpdateClip(c._projectId, c.id, { queueOrder: i }).catch(() => {});
      }
    }
  };

  // Load publish logs on mount and after any publish
  const loadPublishLogs = async () => {
    if (window.clipflow?.getPublishLogs) {
      try {
        const logs = await window.clipflow.getPublishLogs(20);
        setPublishLogs(logs);
      } catch (e) { console.error("Failed to load publish logs:", e); }
    }
  };
  useEffect(() => { loadPublishLogs(); }, []);

  // Listen for publish progress events (all platforms)
  useEffect(() => {
    const progressHandler = (data) => setPublishProgress(data);
    if (window.clipflow?.onTiktokPublishProgress) window.clipflow.onTiktokPublishProgress(progressHandler);
    if (window.clipflow?.onInstagramPublishProgress) window.clipflow.onInstagramPublishProgress(progressHandler);
    if (window.clipflow?.onFacebookPublishProgress) window.clipflow.onFacebookPublishProgress(progressHandler);
    if (window.clipflow?.onYoutubePublishProgress) window.clipflow.onYoutubePublishProgress(progressHandler);
    return () => {
      if (window.clipflow?.removeTiktokPublishProgressListener) window.clipflow.removeTiktokPublishProgressListener();
      if (window.clipflow?.removeInstagramPublishProgressListener) window.clipflow.removeInstagramPublishProgressListener();
      if (window.clipflow?.removeFacebookPublishProgressListener) window.clipflow.removeFacebookPublishProgressListener();
      if (window.clipflow?.removeYoutubePublishProgressListener) window.clipflow.removeYoutubePublishProgressListener();
    };
  }, []);

  const dates = getUpcomingDates();
  const activePlat = platforms.filter((p) => p.connected);
  const wd = getWeekDates(new Date());
  const mondayIso = wd[0].iso;
  const effectiveTemplate = weekTemplateOverrides?.[mondayIso] || weeklyTemplate;

  const logPost = (clip, date, day, time, isScheduled) => {
    const gt = (clip.gameTag || extractGameTag(clip.title) || "unknown").toLowerCase();
    const snapped = snapToSlot(time, effectiveTemplate.timeSlots);
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const toggles = clip.platformToggles || {};
    const enabled = activePlat.filter((p) => { const k = accountToPlatformKey(p); return k && toggles[k] !== false; });
    const captured = publishResultsRef.current[clip.id] || {};
    const platformResults = enabled.map((p) => {
      const k = accountToPlatformKey(p);
      return captured[k] || { platform: k, accountId: p.key };
    });
    setTrackerData((p) => [...p, { id, date, day, time: snapped, title: clip.title, clipId: clip.id, game: gt, type: gt === mainGameTagLc ? "main" : "other", platforms: enabled.map((p) => p.abbr + "-" + p.name).join(", "), platformResults, mainGameAtTime: mainGame, source: "clipflow", scheduled: !!isScheduled }]);
    awardXp(`clip:${id}`, 10, "clip", date);
    delete publishResultsRef.current[clip.id];
  };

  // Shared publish logic — handles both "Publish Now" and "Schedule" with optional publishTime
  // Phase 2: respects per-clip platformToggles, captionOverrides, youtubeTitle, youtubePrivacy
  const publishClip = async (clipId, scheduleOpts) => {
    if (publishingRef.current) return;
    const clip = approved.find((c) => c.id === clipId);
    if (!clip || !clip.renderPath) {
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: "Clip not rendered — render it first from the Editor", platforms: {} } }));
      return;
    }
    // #60: Hard-block publish for test clips.
    if (isClipTest(clip)) {
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: "Test clip — publishing blocked. Untoggle TEST on the project first.", platforms: {} } }));
      return;
    }

    // Phase 2: Filter platforms by per-clip toggles
    const toggles = clip.platformToggles || {};
    const enabledPlat = activePlat.filter((p) => {
      const key = accountToPlatformKey(p);
      return key && toggles[key] !== false;
    });

    if (enabledPlat.length === 0) {
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: "No platforms enabled — toggle at least one platform on", platforms: {} } }));
      return;
    }

    publishingRef.current = true;
    posthog.capture("clipflow_publish_triggered");

    // Initialize platform statuses
    const platStatuses = {};
    enabledPlat.forEach((p) => { platStatuses[p.key] = "pending"; });
    setPublishStatus((prev) => ({ ...prev, [clipId]: { state: "publishing", platforms: { ...platStatuses } } }));
    // Keep the clip expanded so the per-platform publish results panel (and the
    // TikTok A9 "may take a few minutes" notice on success) stay visible. The
    // previous `setSelClip(null)` here auto-collapsed and hid the live status.
    setSelClip(clipId);
    setSchedAction(null);

    // Track per-platform persistence on the clip itself so failures survive app restart
    // and the clip stays visible/retryable in the queue (#retry-failed-publishes).
    let nextPublishState = { ...(clip.publishState || {}) };
    let allSuccess = true;

    for (let i = 0; i < enabledPlat.length; i++) {
      const plat = enabledPlat[i];
      const platKey = accountToPlatformKey(plat);

      setPublishStatus((prev) => ({
        ...prev,
        [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "publishing" } },
      }));

      // Phase 2: Use per-clip caption override if set, otherwise resolve from template
      const caption = getEffectiveCaption(clip, platKey);

      try {
        let result;
        if (plat.platform === "TikTok" && window.clipflow?.tiktokPublish) {
          result = await window.clipflow.tiktokPublish({
            accountId: plat.key, videoPath: clip.renderPath, title: clip.title,
            caption, clipId: clip.id,
            postMode: platformOptions?.tiktokPostMode || "direct_post",
            isTest: isClipTest(clip),
            tiktokFields: {
              privacy: clip.tiktokPrivacy || null,
              disableDuet: clip.tiktokDisableDuet === true,
              disableStitch: clip.tiktokDisableStitch === true,
              disableComment: clip.tiktokDisableComment === true,
              commercialDisclosure: clip.tiktokCommercialDisclosure === true,
              isYourBrand: clip.tiktokIsYourBrand === true,
              isBrandedContent: clip.tiktokIsBrandedContent === true,
            },
          });
        } else if ((plat.platform === "Instagram" || (plat.platform === "Meta" && plat.igAccountId)) && window.clipflow?.instagramPublish) {
          result = await window.clipflow.instagramPublish({
            accountId: plat.key, videoPath: clip.renderPath, title: clip.title,
            caption, clipId: clip.id, isTest: isClipTest(clip),
          });
        } else if (plat.platform === "Facebook" && window.clipflow?.facebookPublish) {
          result = await window.clipflow.facebookPublish({
            accountId: plat.key, videoPath: clip.renderPath, title: clip.title,
            caption, clipId: clip.id, isTest: isClipTest(clip),
          });
        } else if (plat.platform === "YouTube" && window.clipflow?.youtubePublish) {
          result = await window.clipflow.youtubePublish({
            accountId: plat.key, videoPath: clip.renderPath,
            title: clip.title, caption, clipId: clip.id, tags: [],
            youtubeTitle: clip.youtubeTitle || clip.title,
            privacyStatus: clip.youtubePrivacy || "public",
            isTest: isClipTest(clip),
          });
        } else {
          console.log("Publishing not yet wired for", plat.platform);
          const msg = `${plat.platform} publishing isn't supported yet`;
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: msg } } }));
          nextPublishState[plat.key] = { error: msg, at: new Date().toISOString() };
          allSuccess = false;
          continue;
        }

        if (result?.error) {
          console.error(`[Publish] ${plat.platform} failed for ${plat.key}:`, result.error);
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: result.error } } }));
          nextPublishState[plat.key] = { error: String(result.error), at: new Date().toISOString() };
          allSuccess = false;
        } else {
          console.log(`[Publish] ${plat.platform} success for ${plat.key}:`, result);
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } } }));
          nextPublishState[plat.key] = "success";
          const postId = result?.post_id || result?.mediaId || result?.videoId || null;
          const url = plat.platform === "YouTube" && result?.videoId ? `https://www.youtube.com/watch?v=${result.videoId}` : null;
          publishResultsRef.current[clip.id] = {
            ...(publishResultsRef.current[clip.id] || {}),
            [platKey]: { platform: platKey, accountId: plat.key, ...(postId ? { postId } : {}), ...(url ? { url } : {}) },
          };
        }
      } catch (err) {
        console.error(`[Publish] Error for ${plat.key}:`, err);
        setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: err.message || "Failed" } } }));
        nextPublishState[plat.key] = { error: err.message || "Failed", at: new Date().toISOString() };
        allSuccess = false;
      }
      // Persist this platform's outcome on the clip after each attempt so a mid-loop
      // app close still leaves the clip in a recoverable state.
      try {
        const updates = { publishState: { ...nextPublishState } };
        await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, updates);
        updateClipInState(clip._projectId, clip.id, updates);
      } catch (_) { /* non-fatal — in-memory publishStatus is the source of truth for this session */ }
    }

    // Final status
    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: allSuccess ? "done" : "failed" } }));

    // Tracker entry only on full success — partial failures must remain visible in the
    // queue so the user can retry the failed platforms (#retry-failed-publishes).
    if (allSuccess) {
      if (scheduleOpts) {
        const d = dates.find((x) => x.iso === scheduleOpts.date);
        const tl = TIME_OPTIONS.find((x) => x.value === scheduleOpts.time)?.label || scheduleOpts.time;
        setScheduled((p) => ({ ...p, [clipId]: `${d?.label || scheduleOpts.date} at ${tl}` }));
        logPost(clip, scheduleOpts.date, d?.dayName || "", tl, true);
      } else {
        const now = new Date();
        logPost(clip, localISO(now), FULL_DAY_NAMES[now.getDay()], now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), false);
      }
    }

    publishingRef.current = false;
    setPublishProgress(null);
    loadPublishLogs(); // Refresh logs after publish
  };

  // Phase 4: Route through confirmation modal
  const pubNow = (clipId) => requestPublish(clipId, null);
  const schedAndPublish = (clipId) => requestPublish(clipId, { date: schedDate, time: schedTime });


  // Platform status display helper
  const getPlatStatusIcon = (status) => {
    if (status === "pending") return { icon: "\u23f3", color: T.textMuted };
    if (status === "publishing") return { icon: "\u2b06", color: T.yellow };
    if (status === "done") return { icon: "\u2705", color: T.green };
    // Any other string is an error message
    return { icon: "\u274c", color: T.red };
  };

  // Phase 3: Split approved into unscheduled and scheduled
  const unscheduledClips = approved.filter((c) => !c.scheduledAt);
  const scheduledClips = approved.filter((c) => !!c.scheduledAt).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  // Compute stats
  const publishedToday = publishLogs.filter((l) => l.status === "success" && new Date(l.timestamp).toDateString() === new Date().toDateString()).length;
  const failedCount = approved.filter((c) => publishStatus[c.id]?.state === "failed").length;

  // Phase 5: Collect unique game tags for filter (lowercased — clip.gameTag is canonical)
  const gameTagSet = useMemo(() => {
    const s = new Set();
    approved.forEach((c) => { if (c.gameTag) s.add(c.gameTag); });
    return Array.from(s).sort();
  }, [approved]);

  // Phase 5: Apply filters
  const filterClips = (clips) => {
    let result = clips;
    if (filterGame !== "all") result = result.filter((c) => c.gameTag === filterGame);
    if (filterStatus === "published") result = result.filter((c) => publishStatus[c.id]?.state === "done");
    else if (filterStatus === "failed") result = result.filter((c) => publishStatus[c.id]?.state === "failed");
    else if (filterStatus === "unrendered") result = result.filter((c) => !c.renderPath);
    // "all", "unscheduled", "scheduled" handled by which list is shown
    return result;
  };
  const filteredUnscheduled = filterClips(unscheduledClips);
  const filteredScheduled = filterClips(scheduledClips);
  const showUnscheduled = filterStatus !== "scheduled";
  const showScheduled = filterStatus !== "unscheduled";

  // Status badge helper — Phase 3: show schedule time
  const statusBadge = (clip) => {
    const ps = publishStatus[clip.id];
    const isPub = ps?.state === "done";
    const isPublishing = ps?.state === "publishing";
    const isFailed = ps?.state === "failed";
    const hasVideo = !!clip.renderPath;
    if (isPub) return { label: "Published", bg: "rgba(52,211,153,0.1)", color: T.green };
    if (isPublishing) return { label: "Publishing...", bg: "rgba(251,191,36,0.1)", color: T.yellow };
    if (isFailed) return { label: "Failed", bg: "rgba(248,113,113,0.1)", color: T.red };
    if (clip.scheduledAt) {
      const d = new Date(clip.scheduledAt);
      const label = `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      return { label, bg: "rgba(251,191,36,0.1)", color: T.yellow };
    }
    if (!hasVideo) return { label: "Not rendered", bg: "rgba(251,191,36,0.1)", color: T.yellow };
    return { label: "Queued", bg: T.accentDim, color: T.accentLight };
  };

  // Format scheduledAt for display
  const formatSchedule = (isoStr) => {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  };

  return (
    <div>
      <PageHeader title="Queue & Schedule" subtitle={`${approved.length} clips ready`} />

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Unscheduled</SectionLabel>
          <div style={{ color: T.accentLight, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{unscheduledClips.length}</div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Scheduled</SectionLabel>
          <div style={{ color: T.yellow, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{scheduledClips.length}</div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Published Today</SectionLabel>
          <div style={{ color: T.green, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{publishedToday}</div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Failed</SectionLabel>
          <div style={{ color: T.red, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{failedCount}</div>
        </Card>
      </div>

      {/* Phase 5: Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Filter:</span>
        <Select value={filterStatus} onChange={setFilterStatus} options={[
          { value: "all", label: "All" },
          { value: "unscheduled", label: "Unscheduled" },
          { value: "scheduled", label: "Scheduled" },
          { value: "published", label: "Published" },
          { value: "failed", label: "Failed" },
          { value: "unrendered", label: "Not rendered" },
        ]} style={{ padding: "5px 10px", fontSize: 11 }} />
        {gameTagSet.length > 1 && (
          <Select value={filterGame} onChange={setFilterGame} options={[
            { value: "all", label: "All games" },
            ...gameTagSet.map((g) => ({ value: g, label: g })),
          ]} style={{ padding: "5px 10px", fontSize: 11 }} />
        )}
      </div>

      {/* Phase 4: Publish confirmation modal */}
      {confirmClipId && (() => {
        const clip = approved.find((c) => c.id === confirmClipId);
        if (!clip) return null;
        const enabledKeys = getEnabledPlatforms(clip);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={cancelConfirm}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "24px 28px", maxWidth: 480, width: "90%", maxHeight: "80vh", overflow: "auto" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16 }}>Confirm Publish</div>
              {/* Clip summary */}
              <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 60, flexShrink: 0 }}>
                  <div style={{ aspectRatio: "9/16", borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {clip.thumbnailPath ? <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.textMuted, fontSize: 20 }}>{"\uD83C\uDFAC"}</span>}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>{clip.title}</div>
                  {confirmSchedOpts && <div style={{ fontSize: 11, color: T.yellow, fontWeight: 600, marginBottom: 8 }}>Scheduled: {confirmSchedOpts.date} at {confirmSchedOpts.time}</div>}
                  <div style={{ fontSize: 10, color: T.textTertiary }}>Publishing to {enabledKeys.length} platform{enabledKeys.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
              {/* Per-platform caption preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {enabledKeys.map((pk) => {
                  const meta = PLATFORM_META[pk];
                  const caption = getEffectiveCaption(clip, pk);
                  const isYt = pk === "youtube";
                  return (
                    <div key={pk} style={{ borderRadius: 6, border: `1px solid ${T.border}`, padding: "8px 12px", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <PlatformIcon platform={pk} size={14} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{meta.label}</span>
                        {isYt && <span style={{ fontSize: 10, color: T.textTertiary, marginLeft: "auto" }}>Title: {clip.youtubeTitle || clip.title}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 60, overflow: "hidden" }}>{caption}</div>
                    </div>
                  );
                })}
              </div>
              {/* #71: Placeholder-title warning */}
              {isPlaceholderTitle(clip.title) && (
                <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 7, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 600 }}>
                  This clip still has a placeholder name (<span style={{ fontFamily: T.mono }}>{clip.title}</span>). Run AI Titles and Captions first, or rename it manually before publishing.
                </div>
              )}
              {/* #60: Test-mode banner */}
              {isClipTest(clip) && (
                <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 7, border: `1px dashed rgba(250,204,21,0.45)`, background: "rgba(250,204,21,0.08)", color: "#facc15", fontSize: 11, fontWeight: 600 }}>
                  This clip belongs to a TEST project — publishing is blocked. Untoggle TEST on the project in the Projects tab to go live.
                </div>
              )}
              {/* Actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={cancelConfirm} style={{ padding: "8px 18px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                <button
                  onClick={confirmPublish}
                  disabled={isClipTest(clip)}
                  title={isClipTest(clip) ? "Test clip — publishing blocked." : undefined}
                  style={{ padding: "8px 22px", borderRadius: 7, border: "none", background: isClipTest(clip) ? "rgba(255,255,255,0.04)" : T.green, color: isClipTest(clip) ? T.textMuted : "#0a0b10", fontSize: 12, fontWeight: 700, cursor: isClipTest(clip) ? "not-allowed" : "pointer", fontFamily: T.font }}
                >{isClipTest(clip) ? "Blocked (Test)" : "Publish"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Dashboard table — Phase 3: split into Unscheduled / Scheduled sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clipIds} strategy={verticalListSortingStrategy}>

      {/* UNSCHEDULED SECTION */}
      {showUnscheduled && (
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.accentLight }}>Unscheduled</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>{filteredUnscheduled.length} clip{filteredUnscheduled.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "28px 48px 1fr 70px 110px 90px 80px", gap: 0, padding: "8px 14px", borderBottom: `1px solid ${T.border}` }}>
          {["", "Clip", "Title", "Game", "Platforms", "Status", ""].map((h, i) => (
            <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted }}>{h}</span>
          ))}
        </div>

        {filteredUnscheduled.length === 0 && (
          <div style={{ padding: 30, textAlign: "center" }}>
            <div style={{ color: T.textTertiary, fontSize: 13 }}>{approved.length === 0 ? "No clips queued — approve clips in the Projects tab." : "No unscheduled clips matching filter."}</div>
          </div>
        )}

        {filteredUnscheduled.map((clip) => {
          const isM = clip.gameTag === mainGameTagLc;
          const gameTag = clip.gameTag;
          const ps = publishStatus[clip.id];
          const isPub = ps?.state === "done";
          const isPublishing = ps?.state === "publishing";
          const isFailed = ps?.state === "failed";
          const isSel = selClip === clip.id;
          const hasVideoId = !!clip.renderPath;
          const duration = clip.endTime && clip.startTime ? clip.endTime - clip.startTime : 0;
          const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : "";
          const projName = projectInfo[clip._projectId]?.name || "";
          const badge = statusBadge(clip);

          return (
            <SortableRow key={clip.id} id={clip.id}>
              {({ ref, style: sortStyle, attributes, listeners }) => (
                <div ref={ref} style={sortStyle} {...attributes}>
                  {/* Table row */}
                  <div
                    onClick={() => { if (!isPublishing) { setSelClip(isSel ? null : clip.id); setSchedAction(null); } }}
                    style={{ display: "grid", gridTemplateColumns: "28px 48px 1fr 70px 110px 90px 80px", gap: 0, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: isSel ? T.accentGlow : "transparent", transition: "background 0.15s", opacity: isPub ? 0.6 : 1 }}
                    onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}
                    onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Drag handle */}
                    <div {...listeners} onClick={(e) => e.stopPropagation()} style={{ cursor: "grab", color: T.textMuted, fontSize: 14 }}>{"\u2630"}</div>
                    {/* Thumbnail */}
                    <div style={{ width: 34, height: 60, borderRadius: 6, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {clip.thumbnailPath ? (
                        <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ color: T.textMuted, fontSize: 16 }}>{"\uD83C\uDFAC"}</span>
                      )}
                    </div>
                    {/* Title + sub */}
                    <div style={{ minWidth: 0, paddingRight: 8 }}>
                      <div style={{ color: T.text, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</div>
                      <div style={{ color: T.textTertiary, fontSize: 10, marginTop: 2 }}>{durationStr}{projName ? ` \u00B7 ${projName}` : ""}</div>
                    </div>
                    {/* Game tag */}
                    <div>{gameTag && <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, background: isM ? T.accentDim : "rgba(52,211,153,0.12)", color: isM ? T.accentLight : T.green }}>{(gameTag.length > 6 ? gameTag.slice(0, 6) : gameTag).toUpperCase()}</span>}</div>
                    {/* Platform icons — dimmed if toggled off */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {activePlat.map((p) => {
                        const pk = accountToPlatformKey(p);
                        const isOn = pk && (clip.platformToggles || {})[pk] !== false;
                        return (
                          <PlatformIcon key={p.key} platform={pk} size={20} style={{ opacity: isOn ? 1 : 0.25, transition: "opacity 0.15s" }} />
                        );
                      })}
                    </div>
                    {/* Status */}
                    <div><span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: "nowrap" }}>{badge.label}</span></div>
                    {/* Action button */}
                    <div style={{ textAlign: "right" }}>
                      {!isPub && !isPublishing && hasVideoId && (
                        isClipTest(clip) ? (
                          <TestChip isTest disabled size="sm" title="Test clip — publishing blocked. Untoggle TEST on the project to go live." />
                        ) : (() => {
                          const tikBlock = getTiktokBlockReason(clip);
                          return (
                            <button
                              onClick={(e) => { e.stopPropagation(); if (!tikBlock) pubNow(clip.id); }}
                              disabled={!!tikBlock}
                              title={tikBlock || undefined}
                              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: tikBlock ? "rgba(255,255,255,0.04)" : T.green, color: tikBlock ? T.textMuted : "#0a0b10", fontSize: 10, fontWeight: 700, cursor: tikBlock ? "not-allowed" : "pointer", fontFamily: T.font }}
                            >Publish</button>
                          );
                        })()
                      )}
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isSel && (
                    <div style={{ padding: "20px 24px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", gap: 24 }}>
                        {/* Large thumbnail */}
                        <div style={{ width: 120, flexShrink: 0 }}>
                          <div style={{ aspectRatio: "9/16", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {clip.thumbnailPath ? (
                              <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <span style={{ color: T.textMuted, fontSize: 32 }}>{"\uD83C\uDFAC"}</span>
                            )}
                          </div>
                        </div>
                        {/* Detail content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Editable title */}
                          {editingTitle === clip.id ? (
                            <input
                              autoFocus
                              value={editTitleValue}
                              onChange={(e) => setEditTitleValue(e.target.value)}
                              onBlur={() => saveTitle(clip)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(clip); if (e.key === "Escape") setEditingTitle(null); }}
                              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "6px 10px", color: T.text, fontSize: 17, fontWeight: 800, fontFamily: T.font, outline: "none", marginBottom: 8 }}
                            />
                          ) : (
                            <div
                              onDoubleClick={() => { setEditingTitle(clip.id); setEditTitleValue(clip.title); }}
                              style={{ color: T.text, fontSize: 17, fontWeight: 800, marginBottom: 7, cursor: "text", lineHeight: 1.3 }}
                              title="Double-click to edit"
                            >{clip.title}</div>
                          )}
                          <div style={{ display: "flex", gap: 12, fontSize: 12.5, color: T.textSecondary, marginBottom: 16, alignItems: "center" }}>
                            <span style={{ fontFamily: T.mono }}>{durationStr}</span>
                            {gameTag && <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, background: isM ? T.accentDim : "rgba(52,211,153,0.12)", color: isM ? T.accentLight : T.green }}>{gameTag.toUpperCase()}</span>}
                            {projName && <span>{projName}</span>}
                          </div>

                          {/* Phase 2: Platform toggle pills */}
                          <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11.5, color: T.labelStrong, fontWeight: 600, marginRight: 2 }}>Platforms:</span>
                            {activePlat.map((p) => {
                              const pk = accountToPlatformKey(p);
                              if (!pk) return null;
                              const meta = PLATFORM_META[pk];
                              const isOn = (clip.platformToggles || {})[pk] !== false;
                              return (
                                <button
                                  key={p.key}
                                  onClick={(e) => { e.stopPropagation(); togglePlatform(clip, pk); }}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 6px",
                                    borderRadius: 20, border: `1px solid ${isOn ? "rgba(255,255,255,0.12)" : T.border}`,
                                    background: isOn ? "rgba(255,255,255,0.06)" : "transparent",
                                    opacity: isOn ? 1 : 0.4, cursor: "pointer", transition: "all 0.15s", fontFamily: T.font,
                                  }}
                                >
                                  <PlatformIcon platform={pk} size={18} />
                                  <span style={{ fontSize: 11, fontWeight: 600, color: isOn ? T.text : T.textTertiary }}>{meta.label}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Phase 2: Caption preview cards per enabled platform */}
                          {(() => {
                            const enabledKeys = getEnabledPlatforms(clip);
                            if (enabledKeys.length === 0) return (
                              <div style={{ padding: "10px 14px", borderRadius: 8, background: T.redDim, border: `1px solid ${T.redBorder}`, marginBottom: 14, fontSize: 11, color: T.red, fontWeight: 600 }}>
                                All platforms disabled — toggle at least one to publish.
                              </div>
                            );
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                                {enabledKeys.map((pk) => {
                                  const meta = PLATFORM_META[pk];
                                  const isYt = pk === "youtube";
                                  const caption = getEffectiveCaption(clip, pk);
                                  const hasOverride = clip.captionOverrides?.[pk] != null;
                                  const isEditingThis = editingCaption?.clipId === clip.id && editingCaption?.platform === pk;
                                  const isEditingYtTitleThis = isYt && editingYtTitle === clip.id;
                                  const charLimit = isYt ? PLATFORM_CHAR_LIMITS.youtube_desc : PLATFORM_CHAR_LIMITS[pk];
                                  const ytTitleVal = clip.youtubeTitle || clip.title || "";

                                  return (
                                    <div key={pk} style={{ borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
                                      {/* Caption card header */}
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <PlatformIcon platform={pk} size={16} />
                                          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{meta.label}</span>
                                          {hasOverride && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: T.accent, background: T.accentDim, padding: "1px 7px", borderRadius: 5 }}>CUSTOM</span>}
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.mono, color: charCountColor(caption.length, charLimit) }}>
                                          {caption.length}/{charLimit}
                                        </span>
                                      </div>

                                      {/* YouTube: separate title field */}
                                      {isYt && (
                                        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, minWidth: 32 }}>Title</span>
                                          {isEditingYtTitleThis ? (
                                            <input
                                              autoFocus
                                              value={editYtTitleValue}
                                              onChange={(e) => setEditYtTitleValue(e.target.value)}
                                              onBlur={() => saveYoutubeTitle(clip, editYtTitleValue)}
                                              onKeyDown={(e) => { if (e.key === "Enter") saveYoutubeTitle(clip, editYtTitleValue); if (e.key === "Escape") setEditingYtTitle(null); }}
                                              maxLength={100}
                                              style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 4, padding: "4px 8px", color: T.text, fontSize: 11, fontFamily: T.font, outline: "none" }}
                                            />
                                          ) : (
                                            <div
                                              onClick={(e) => { e.stopPropagation(); setEditingYtTitle(clip.id); setEditYtTitleValue(ytTitleVal); }}
                                              style={{ flex: 1, fontSize: 11, color: T.text, cursor: "text", padding: "4px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                            >{ytTitleVal}</div>
                                          )}
                                          <span style={{ fontSize: 10, fontFamily: T.mono, color: charCountColor(ytTitleVal.length, PLATFORM_CHAR_LIMITS.youtube_title) }}>{ytTitleVal.length}/100</span>
                                        </div>
                                      )}

                                      {/* YouTube: privacy selector */}
                                      {isYt && (
                                        <div style={{ padding: "6px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, minWidth: 32 }}>Privacy</span>
                                          <select
                                            value={clip.youtubePrivacy || "public"}
                                            onChange={(e) => { e.stopPropagation(); saveYoutubePrivacy(clip, e.target.value); }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 8px", color: T.text, fontSize: 11, fontFamily: T.font, outline: "none", cursor: "pointer" }}
                                          >
                                            <option value="public">Public</option>
                                            <option value="unlisted">Unlisted</option>
                                            <option value="private">Private</option>
                                          </select>
                                        </div>
                                      )}

                                      {/* Caption body — rendered ABOVE the platform-specific
                                          options so it sits near the top of the card (close to the
                                          title), and styled as a clearly editable field. */}
                                      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: T.labelStrong, textTransform: "uppercase", marginBottom: 6 }}>{isYt ? "Description" : "Caption"}</div>
                                        {isEditingThis ? (
                                          <textarea
                                            autoFocus
                                            value={editCaptionValue}
                                            onChange={(e) => setEditCaptionValue(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Escape") setEditingCaption(null); }}
                                            style={{ width: "100%", minHeight: 64, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 13, fontFamily: T.font, outline: "none", resize: "vertical", lineHeight: 1.55 }}
                                          />
                                        ) : (
                                          <div
                                            onClick={(e) => { e.stopPropagation(); setEditingCaption({ clipId: clip.id, platform: pk }); setEditCaptionValue(caption); }}
                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accentBorder; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.borderHover; }}
                                            style={{ position: "relative", border: `1px solid ${T.borderHover}`, borderRadius: 8, background: "rgba(255,255,255,0.045)", padding: "10px 54px 10px 12px", fontSize: 13, color: T.text, lineHeight: 1.55, cursor: "text", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "hidden", transition: "border-color 0.15s" }}
                                            title="Click to edit"
                                          >
                                            {caption || <span style={{ color: T.textMuted, fontStyle: "italic" }}>No caption — click to add</span>}
                                            <span style={{ position: "absolute", top: 8, right: 10, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: T.textTertiary, pointerEvents: "none" }}>
                                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
                                                <path d="M12 20h9" />
                                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                              </svg>
                                              Edit
                                            </span>
                                          </div>
                                        )}
                                        {/* Edit/Save/Reset actions */}
                                        {isEditingThis && (
                                          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                                            <span style={{ fontSize: 11, fontFamily: T.mono, color: charCountColor(editCaptionValue.length, charLimit) }}>{editCaptionValue.length}/{charLimit}</span>
                                            <div style={{ flex: 1 }} />
                                            <button onClick={(e) => { e.stopPropagation(); saveCaptionOverride(clip, pk, editCaptionValue); }} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: T.accent, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                                            <button onClick={(e) => { e.stopPropagation(); setEditingCaption(null); }} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                                          </div>
                                        )}
                                        {!isEditingThis && hasOverride && (
                                          <div style={{ marginTop: 8 }}>
                                            <button onClick={(e) => { e.stopPropagation(); resetCaptionOverride(clip, pk); }} style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Reset to template</button>
                                          </div>
                                        )}
                                      </div>

                                      {/* TikTok: per-clip options panel (Content Posting API audit) */}
                                      {pk === "tiktok" && (() => {
                                        const tiktokAccount = activePlat.find((p) => accountToPlatformKey(p) === "tiktok");
                                        if (!tiktokAccount) return null;
                                        return (
                                          <TiktokOptionsPanel
                                            clip={clip}
                                            account={tiktokAccount}
                                            onSave={(partial) => saveTiktokFields(clip, partial)}
                                            onCreatorInfoLoaded={onTiktokCreatorInfoLoaded}
                                          />
                                        );
                                      })()}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Publishing progress (if active) — only shows enabled platforms.
                              After success we keep the panel visible with green styling so
                              the per-platform statuses and the TikTok "processing" notice
                              (A9) stay readable until the user navigates away. */}
                          {(isPublishing || isFailed || isPub) && ps?.platforms && (() => {
                            // A9 / Point 5d: show the "may take a few minutes" notice while the
                            // TikTok post is in-flight (publishing) OR done — not only after the
                            // status poll completes. The audit denial cited this notice being
                            // absent during the long "Processing on TikTok…" window.
                            const tiktokAccepted = Object.entries(ps.platforms).some(([k, st]) => {
                              const p = activePlat.find((ap) => ap.key === k);
                              return p?.platform === "TikTok" && (st === "publishing" || st === "done");
                            });
                            const borderColor = isPublishing ? T.yellowBorder : isFailed ? T.redBorder : T.greenBorder;
                            const heading = isPublishing ? "Publishing..." : isFailed ? "Publish results" : "Published";
                            return (
                              <div style={{ background: T.surface, border: `1px solid ${borderColor}`, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                                <SectionLabel>{heading}</SectionLabel>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                                  {Object.keys(ps.platforms).map((platKey) => {
                                    const plat = activePlat.find((p) => p.key === platKey);
                                    if (!plat) return null;
                                    const st = ps.platforms[platKey] || "pending";
                                    const { icon, color } = getPlatStatusIcon(st);
                                    return (
                                      <div key={platKey} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                                        <span style={{ fontSize: 12 }}>{icon}</span>
                                        <span style={{ color: T.text, fontSize: 11, fontWeight: 600, minWidth: 80 }}>{plat.abbr} — {plat.name}</span>
                                        <span style={{ color, fontSize: 11, fontWeight: 600 }}>{st === "pending" ? "Waiting..." : st === "publishing" ? "Processing…" : st === "done" ? "Sent" : st}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {isFailed && ps.error && <div style={{ marginTop: 8, color: T.red, fontSize: 11, fontWeight: 600 }}>{ps.error}</div>}
                                {/* A9 / Point 5d — TikTok processing notice per Content Sharing
                                    Guidelines. Rendered as a prominent info banner so it's clearly
                                    visible on screen during processing (audit requirement). */}
                                {tiktokAccepted && (
                                  <div style={{ marginTop: 10 }}>
                                    <InfoBanner color={T.accent} icon={"⏳"}>
                                      Your TikTok post may take a few minutes to process and appear on your profile.
                                    </InfoBanner>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Not rendered warning */}
                          {!hasVideoId && (
                            <div style={{ marginBottom: 14 }}>
                              <InfoBanner color={T.yellow} icon={"\u26a0\ufe0f"}>This clip hasn't been rendered yet. Open it in the Editor and click "Ready to Share" first.</InfoBanner>
                            </div>
                          )}

                          {/* Actions */}
                          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 14, borderTop: `1px solid ${T.border}`, flexWrap: "wrap" }}>
                            <button
                              onClick={() => dequeueClip(clip)}
                              style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font, transition: "all 0.15s" }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textTertiary; }}
                            >Remove</button>
                            {/* Phase 3: Unschedule if scheduled */}
                            {clip.scheduledAt && (
                              <button onClick={() => unscheduleClip(clip)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Unschedule</button>
                            )}
                            {/* Phase 4: Retry failed */}
                            {isFailed && (
                              <button onClick={() => retryFailed(clip.id)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.redBorder}`, background: T.redDim, color: T.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Retry Failed</button>
                            )}
                            <div style={{ flex: 1 }} />
                            {schedAction !== "schedule" && !clip.scheduledAt && (
                              <button onClick={() => { setSchedAction("schedule"); const sug = autoSuggestSlot(); if (sug) { setSchedDate(sug.date); setSchedHour(sug.hour); setSchedMin(sug.min); } }} disabled={!hasVideoId} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: hasVideoId ? T.textSecondary : T.textMuted, fontSize: 11, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Schedule</button>
                            )}
                            {!isPub && !isPublishing && (
                              isClipTest(clip) ? (
                                <TestChip isTest disabled size="md" title="Test clip — publishing blocked. Untoggle TEST on the project to go live." />
                              ) : (() => {
                                const tikBlock = getTiktokBlockReason(clip);
                                const canPub = hasVideoId && !publishingRef.current && !tikBlock;
                                return (
                                  <button
                                    onClick={() => { if (canPub) pubNow(clip.id); }}
                                    disabled={!canPub}
                                    title={tikBlock || (!hasVideoId ? "Render the clip before publishing." : undefined)}
                                    style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: canPub ? T.green : "rgba(255,255,255,0.04)", color: canPub ? "#0a0b10" : T.textMuted, fontSize: 11, fontWeight: 700, cursor: canPub ? "pointer" : "not-allowed", fontFamily: T.font }}
                                  >Publish Now</button>
                                );
                              })()
                            )}
                          </div>
                          {/* Phase 3: Schedule picker with auto-suggest */}
                          {schedAction === "schedule" && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <Select value={schedDate} onChange={setSchedDate} options={[{ value: "", label: "Pick date..." }, ...dates.map((d) => ({ value: d.iso, label: d.label }))]} style={{ padding: "8px 12px", fontSize: 12 }} />
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <Select value={schedHour} onChange={setSchedHour} options={HOUR_OPTIONS} style={{ padding: "8px 8px", fontSize: 12, minWidth: 70 }} />
                                  <span style={{ color: T.textMuted, fontSize: 14, fontWeight: 700 }}>:</span>
                                  <Select value={schedMin} onChange={setSchedMin} options={MINUTE_OPTIONS} style={{ padding: "8px 8px", fontSize: 12, minWidth: 56 }} />
                                </div>
                                <button onClick={() => { scheduleClipOnly(clip, schedDate, `${schedHour}:${schedMin}`); }} disabled={!schedDate} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: schedDate ? T.accent : "rgba(255,255,255,0.04)", color: schedDate ? "#fff" : T.textMuted, fontSize: 11, fontWeight: 700, cursor: schedDate ? "pointer" : "default", fontFamily: T.font }}>Save Schedule</button>
                                <button onClick={() => setSchedAction(null)} style={{ padding: "8px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                              </div>
                              {(() => { const sug = autoSuggestSlot(); return sug ? <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 6 }}>Suggested: {sug.label}</div> : null; })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SortableRow>
          );
        })}
      </Card>
      )}

      {/* SCHEDULED SECTION */}
      {showScheduled && scheduledClips.length > 0 && (
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(251,191,36,0.03)", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.yellow }}>Scheduled</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>{filteredScheduled.length} clip{filteredScheduled.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 70px 140px 90px 80px", gap: 0, padding: "8px 14px", borderBottom: `1px solid ${T.border}` }}>
          {["Clip", "Title", "Game", "Scheduled For", "Status", ""].map((h, i) => (
            <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted }}>{h}</span>
          ))}
        </div>

        {filteredScheduled.map((clip) => {
          const isM = clip.gameTag === mainGameTagLc;
          const gameTag = clip.gameTag;
          const ps = publishStatus[clip.id];
          const isPub = ps?.state === "done";
          const isPublishing = ps?.state === "publishing";
          const isFailed = ps?.state === "failed";
          const isSel = selClip === clip.id;
          const hasVideoId = !!clip.renderPath;
          const badge = statusBadge(clip);

          return (
            <div key={clip.id}>
              <div
                onClick={() => { if (!isPublishing) { setSelClip(isSel ? null : clip.id); setSchedAction(null); } }}
                style={{ display: "grid", gridTemplateColumns: "48px 1fr 70px 140px 90px 80px", gap: 0, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: isSel ? T.accentGlow : "transparent", transition: "background 0.15s", opacity: isPub ? 0.6 : 1 }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                {/* Thumbnail */}
                <div style={{ width: 34, height: 60, borderRadius: 6, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {clip.thumbnailPath ? <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.textMuted, fontSize: 16 }}>{"\uD83C\uDFAC"}</span>}
                </div>
                {/* Title */}
                <div style={{ minWidth: 0, paddingRight: 8 }}>
                  <div style={{ color: T.text, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</div>
                </div>
                {/* Game */}
                <div>{gameTag && <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, background: isM ? T.accentDim : "rgba(52,211,153,0.12)", color: isM ? T.accentLight : T.green }}>{(gameTag.length > 6 ? gameTag.slice(0, 6) : gameTag).toUpperCase()}</span>}</div>
                {/* Scheduled time */}
                <div style={{ fontSize: 11, fontWeight: 600, color: T.yellow }}>{formatSchedule(clip.scheduledAt)}</div>
                {/* Status */}
                <div><span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: "nowrap" }}>{badge.label}</span></div>
                {/* Action */}
                <div style={{ textAlign: "right" }}>
                  {!isPub && !isPublishing && hasVideoId && (() => {
                    const tikBlock = getTiktokBlockReason(clip);
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!tikBlock) pubNow(clip.id); }}
                        disabled={!!tikBlock}
                        title={tikBlock || undefined}
                        style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: tikBlock ? "rgba(255,255,255,0.04)" : T.green, color: tikBlock ? T.textMuted : "#0a0b10", fontSize: 10, fontWeight: 700, cursor: tikBlock ? "not-allowed" : "pointer", fontFamily: T.font }}
                      >Publish</button>
                    );
                  })()}
                </div>
              </div>

              {/* Expanded detail — reuse same panel structure */}
              {isSel && (
                <div style={{ padding: "20px 24px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div style={{ width: 120, flexShrink: 0 }}>
                      <div style={{ aspectRatio: "9/16", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {clip.thumbnailPath ? <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.textMuted, fontSize: 32 }}>{"\uD83C\uDFAC"}</span>}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.text, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{clip.title}</div>
                      <div style={{ display: "flex", gap: 10, fontSize: 11, color: T.textTertiary, marginBottom: 8, alignItems: "center" }}>
                        {gameTag && <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, background: isM ? T.accentDim : "rgba(52,211,153,0.12)", color: isM ? T.accentLight : T.green }}>{gameTag.toUpperCase()}</span>}
                        <span style={{ color: T.yellow, fontWeight: 600 }}>{formatSchedule(clip.scheduledAt)}</span>
                      </div>
                      {/* Platform toggles */}
                      <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: T.textTertiary, marginRight: 2 }}>Platforms:</span>
                        {activePlat.map((p) => {
                          const pk = accountToPlatformKey(p);
                          if (!pk) return null;
                          const meta = PLATFORM_META[pk];
                          const isOn = (clip.platformToggles || {})[pk] !== false;
                          return (
                            <button key={p.key} onClick={(e) => { e.stopPropagation(); togglePlatform(clip, pk); }}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 6px", borderRadius: 20, border: `1px solid ${isOn ? "rgba(255,255,255,0.12)" : T.border}`, background: isOn ? "rgba(255,255,255,0.06)" : "transparent", opacity: isOn ? 1 : 0.4, cursor: "pointer", transition: "all 0.15s", fontFamily: T.font }}>
                              <PlatformIcon platform={pk} size={18} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: isOn ? T.text : T.textTertiary }}>{meta.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      {/* Actions */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 14, borderTop: `1px solid ${T.border}`, flexWrap: "wrap" }}>
                        <button onClick={() => dequeueClip(clip)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font, transition: "all 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textTertiary; }}
                        >Remove</button>
                        <button onClick={() => unscheduleClip(clip)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Unschedule</button>
                        {isFailed && <button onClick={() => retryFailed(clip.id)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.redBorder}`, background: T.redDim, color: T.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Retry Failed</button>}
                        <div style={{ flex: 1 }} />
                        {!isPub && !isPublishing && (() => {
                          const tikBlock = getTiktokBlockReason(clip);
                          const canPub = hasVideoId && !publishingRef.current && !tikBlock;
                          return (
                            <button
                              onClick={() => { if (canPub) pubNow(clip.id); }}
                              disabled={!canPub}
                              title={tikBlock || (!hasVideoId ? "Render the clip before publishing." : undefined)}
                              style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: canPub ? T.green : "rgba(255,255,255,0.04)", color: canPub ? "#0a0b10" : T.textMuted, fontSize: 11, fontWeight: 700, cursor: canPub ? "pointer" : "not-allowed", fontFamily: T.font }}
                            >Publish Now</button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>
      )}

      </SortableContext>
      </DndContext>

      {/* PUBLISH LOG */}
      <Card style={{ padding: "14px 20px", marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionLabel>Publish Log</SectionLabel>
          <button onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadPublishLogs(); }} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>{showLogs ? "Hide" : `Show (${publishLogs.length})`}</button>
        </div>
        {showLogs && (
          <div style={{ marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
            {publishLogs.length === 0 && <div style={{ color: T.textTertiary, fontSize: 12, padding: "10px 0" }}>No publish attempts yet.</div>}
            {publishLogs.map((log, i) => {
              const statusColor = log.status === "success" ? T.green : log.status === "failed" ? T.red : log.status === "uploading" || log.status === "started" ? T.yellow : T.textMuted;
              const time = new Date(log.timestamp).toLocaleString();
              return (
                <div key={i} style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ color: T.text, fontSize: 12, fontWeight: 600, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.clipTitle || "Unknown clip"}</span>
                    <span style={{ color: statusColor, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{log.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.textTertiary }}>
                    <span>{log.platform} → {log.accountName || log.accountId}</span>
                    <span>{time}</span>
                  </div>
                  {log.error && <div style={{ color: T.red, fontSize: 11, marginTop: 4, fontFamily: T.mono, wordBreak: "break-all" }}>{log.error}</div>}
                  {log.publishId && <div style={{ color: T.textMuted, fontSize: 10, marginTop: 2, fontFamily: T.mono }}>publish_id: {log.publishId}</div>}
                  {log.postId && <div style={{ color: T.green, fontSize: 10, marginTop: 2, fontFamily: T.mono }}>post_id: {log.postId}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* CAPTIONS & DESCRIPTIONS */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 28 }}>
        <CaptionsView
          ytDescriptions={ytDescriptions}
          setYtDescriptions={setYtDescriptions}
          captionTemplates={captionTemplates}
          setCaptionTemplates={setCaptionTemplates}
          platformOptions={platformOptions}
          setPlatformOptions={setPlatformOptions}
          gamesDb={gamesDb}
        />
      </div>
      <div style={{ height: 60 }} />
    </div>
  );
}
