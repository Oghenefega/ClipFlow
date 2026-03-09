import React, { useState, useEffect, useCallback, useRef } from "react";
import T from "./styles/theme";
import Sidebar from "./components/Sidebar";
import { hasHashtag } from "./components/shared";
import { AddGameModal, TranscriptModal } from "./components/modals";
import RenameView from "./views/RenameView";
import UploadView from "./views/UploadView";
import { ProjectsListView, ClipBrowser } from "./views/ProjectsView";
import QueueView from "./views/QueueView";
import CaptionsView from "./views/CaptionsView";
import SettingsView from "./views/SettingsView";

// ============ FALLBACK DEFAULTS (used if electron-store has no data yet) ============
const INITIAL_GAMES = [
  { name: "Arc Raiders", tag: "AR", exe: ["ArcRaiders.exe"], color: "#ff6b35", dayCount: 0, hashtag: "arcraiders", active: true },
  { name: "Rocket League", tag: "RL", exe: ["RocketLeague.exe"], color: "#00b4d8", dayCount: 0, hashtag: "rocketleague", active: true },
  { name: "Valorant", tag: "Val", exe: ["VALORANT-Win64-Shipping.exe"], color: "#ff4655", dayCount: 0, hashtag: "valorant", active: true },
  { name: "Egging On", tag: "EO", exe: ["EggingOn.exe"], color: "#ffd23f", dayCount: 0, hashtag: "eggingon", active: true },
  { name: "Deadline Delivery", tag: "DD", exe: ["DeadlineDelivery.exe"], color: "#fca311", dayCount: 0, hashtag: "deadlinedelivery", active: true },
  { name: "Bionic Bay", tag: "BB", exe: ["BionicBay.exe"], color: "#06d6a0", dayCount: 0, hashtag: "bionicbay", active: true },
  { name: "Prince of Persia", tag: "PoP", exe: ["PrinceOfPersia.exe"], color: "#9b5de5", dayCount: 0, hashtag: "princeofpersia", active: true },
];
const INITIAL_MAIN_POOL = ["Arc Raiders", "Rocket League", "Valorant"];
const INITIAL_IGNORED = ["explorer.exe", "steamwebhelper.exe", "dwm.exe", "ShellExperienceHost.exe", "zen.exe"];
const PUBLISH_ORDER_INIT = [
  { key: "youtube1", platform: "YouTube", abbr: "YT", name: "Fega", connected: true, vizardAccountId: "dml6YXJkLTEtMTc0NTMz" },
  { key: "instagram", platform: "Instagram", abbr: "IG", name: "fegagaming", connected: true, vizardAccountId: "dml6YXJkLTQtMTc0NTM2LTE4OTUw" },
  { key: "facebook", platform: "Facebook", abbr: "FB", name: "Fega Gaming", connected: true, vizardAccountId: "dml6YXJkLTMtMTc0NTM1LTE4OTQ5" },
  { key: "tiktok1", platform: "TikTok", abbr: "TT", name: "fega", connected: true, vizardAccountId: "dml6YXJkLTItMTc0NTM4" },
  { key: "youtube2", platform: "YouTube", abbr: "YT", name: "ThatGuy", connected: true, vizardAccountId: "dml6YXJkLTEtMTc0NTM0" },
  { key: "tiktok2", platform: "TikTok", abbr: "TT", name: "thatguyfega", connected: true, vizardAccountId: "dml6YXJkLTItMTc0NTM3" },
];
const DEFAULT_TIME_SLOTS = ["12:30 PM","1:30 PM","2:30 PM","3:30 PM","4:30 PM","7:30 PM","8:30 PM","9:30 PM"];
const DEFAULT_TEMPLATE = {
  timeSlots: [...DEFAULT_TIME_SLOTS],
  grid: {
    Monday: ["main","main","main","main","main","main","main","main"],
    Tuesday: ["main","other","main","other","main","other","main","main"],
    Wednesday: ["main","other","other","main","other","other","other","main"],
    Thursday: ["main","other","other","main","other","other","main","main"],
    Friday: ["main","other","other","main","other","other","other","main"],
    Saturday: ["main","other","main","other","main","other","main","main"],
  },
};

// Migrate old template format (no timeSlots key) to new format
const migrateTemplate = (tmpl) => {
  if (!tmpl) return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
  if (tmpl.timeSlots && tmpl.grid) return tmpl;
  // Old format: { Monday: [...], Tuesday: [...], ... }
  return { timeSlots: [...DEFAULT_TIME_SLOTS], grid: { ...tmpl } };
};

// Real YouTube descriptions from Fega's actual description files
const REAL_YT_DESCRIPTIONS = {
  "Arc Raiders": { desc: "\u{1F534}Live every day 5PM\nThe funniest and most chaotic Arc Raiders moments from my streams\u{1F602}\n\nStay connected & support the journey \n\u{1F514}SUBSCRIBE https://www.youtube.com/@Fega  \n\u{1F4AA}\u{1F3FD} Become a member: https://www.youtube.com/@Fega/join   \n\nMultistreaming ON \nTwitch: https://www.twitch.tv/fegaabsolute  \nKick: https://www.kick.com/fegaabsolute  \nTiktok: https://www.tiktok.com/fega  \n\n\u{1F53D} Watch My Best Videos \u{1F525}  \n\u{1F3AE} Old but Gold \u2013 Gaming Highlights & Reactions (Valorant, Fortnite,  Fall Guys, Outlast):  https://www.youtube.com/watch?v=GjYKMJdpESM&list=PLb2kk3HKq1SY6wAXPzbptMKqXULJulUmO    \n\n\u{1F4F2} Follow the Journey:  \n\u27A1 https://instagram.com/fegagaming \n\u27A1 https://twitter.com/FegaAbsolute   \n\n\u{1F3AE}Stream Setup  \nCamera | Sony ZVE10 - https://amzn.to/44QBgk7  \nLens | Vlog Lens (Sigma 18-35 lens) - https://amzn.to/4eX3oXm  \nMic | Blue Snowball - https://amzn.to/40ty3pw  \nElgato CamLink - https://amzn.to/4m1REVR  \nElgato Teleprompter - https://amzn.to/45a4Hit  \nGaming Mouse | Glorious Model O Wireless - https://amzn.to/453cwWe   \n\n\u2702\uFE0FMy Content & Editing Essentials  \nBEST Keyboard EVER | https://charachorder.com/FEGA  \nEditing Mouse | Master MX 3s - https://amzn.to/4kQ5D0j  \nNVME SSD Enclosure Casing - https://amzn.to/4nUunH9  \n2tb Samsung SSD - https://amzn.to/4lCtDFm   \n\n\u{1F4B8} All links above are affiliate links. \nPurchasing anything through them  helps support me. Thank you and God bless you!   \n\narc raiders shorts, arc raiders funny moments, arc raiders gameplay, funny gaming shorts, gaming shorts, chaotic extractions, survival shooter clips, funny gaming moments, funny clips, stream highlights, viral shorts, gaming content, gaming videos, gaming entertainment, extraction shooter, third person shooter, arc raiders highlights, arc raiders fails, arc raiders clutch, Fega, YouTube Live, live gaming, live reaction, arc raiders first playthrough, arc raiders solo gameplay, arc raiders pvp, arc raiders pve, arc raiders extraction shooter, arc raiders high level gameplay, arc raiders solo survival, arc raiders update, arc raiders new patch\n\n#arcraiders #gamingshorts #Fega" },
  "Rocket League": { desc: "The funniest and most chaotic Rocket League moments from my streams\u{1F602} \n\nStay connected & support the journey \n\u{1F514}SUBSCRIBE https://www.youtube.com/@Fega  \n\u{1F4AA}\u{1F3FD} Become a member: https://www.youtube.com/@Fega/join   \n\nMultistreaming ON \nTwitch: https://www.twitch.tv/fegaabsolute  \nKick: https://www.kick.com/fegaabsolute  \nTiktok: https://www.tiktok.com/fega  \n\n\u{1F53D} Watch My Best Videos \u{1F525}  \n\u{1F3AE} Old but Gold \u2013 Gaming Highlights & Reactions (Valorant, Fortnite,  Fall Guys, Outlast):  https://www.youtube.com/watch?v=GjYKMJdpESM&list=PLb2kk3HKq1SY6wAXPzbptMKqXULJulUmO    \n\n\u{1F4F2} Follow the Journey:  \n\u27A1 https://instagram.com/fegagaming \n\u27A1 https://twitter.com/FegaAbsolute   \n\n\u{1F3AE}Stream Setup  \nCamera | Sony ZVE10 - https://amzn.to/44QBgk7  \nLens | Vlog Lens (Sigma 18-35 lens) - https://amzn.to/4eX3oXm  \nMic | Blue Snowball - https://amzn.to/40ty3pw  \nElgato CamLink - https://amzn.to/4m1REVR  \nElgato Teleprompter - https://amzn.to/45a4Hit  \nGaming Mouse | Glorious Model O Wireless - https://amzn.to/453cwWe   \n\n\u2702\uFE0FMy Content & Editing Essentials  \nBEST Keyboard EVER | https://charachorder.com/FEGA  \nEditing Mouse | Master MX 3s - https://amzn.to/4kQ5D0j  \nNVME SSD Enclosure Casing - https://amzn.to/4nUunH9  \n2tb Samsung SSD - https://amzn.to/4lCtDFm   \n\n\u{1F4B8} All links above are affiliate links. \nPurchasing anything through them  helps support me. Thank you and God bless you!   \n\nrocket league shorts, rocket league funny moments, rocket league gameplay, funny gaming shorts, gaming shorts, rocket league clips, rocket league highlights, funny gaming moments, funny clips, stream highlights, viral shorts, gaming content, gaming videos, gaming entertainment, rocket league fails, rocket league clutch, rocket league insane moments, rocket league clean goals, rocket league save, rocket league comeback, rocket league overtime, rocket league ranked gameplay, rocket league competitive, rocket league high rank, rocket league gc gameplay, rocket league ssl gameplay, rocket league mechanics, rocket league aerial, rocket league flip reset, rocket league ceiling shot, rocket league freestyle, rocket league whiff, rocket league reaction, rocket league rage moments, rocket league satisfying gameplay, rocket league solo queue, rocket league 1v1, rocket league 2v2, rocket league 3v3, streamer shorts, live gaming shorts, live reaction, YouTube Live, Fega, daily streams, gaming creator, recommended gaming shorts\n\n#rocketleague #gamingshorts #Fega" },
  "Valorant": { desc: "The funniest and most chaotic Valorant moments from my streams\u{1F602}\n\nStay connected & support the journey \n\u{1F514}SUBSCRIBE https://www.youtube.com/@Fega  \n\u{1F4AA}\u{1F3FD} Become a member: https://www.youtube.com/@Fega/join   \n\nMultistreaming ON \nTwitch: https://www.twitch.tv/fegaabsolute  \nKick: https://www.kick.com/fegaabsolute  \nTiktok: https://www.tiktok.com/fega  \n\n\u{1F53D} Watch My Best Videos \u{1F525}  \n\u{1F3AE} Old but Gold \u2013 Gaming Highlights & Reactions (Valorant, Fortnite,  Fall Guys, Outlast):  https://www.youtube.com/watch?v=GjYKMJdpESM&list=PLb2kk3HKq1SY6wAXPzbptMKqXULJulUmO    \n\n\u{1F4F2} Follow the Journey:  \n\u27A1 https://instagram.com/fegagaming \n\u27A1 https://twitter.com/FegaAbsolute   \n\n\u{1F3AE}Stream Setup  \nCamera | Sony ZVE10 - https://amzn.to/44QBgk7  \nLens | Vlog Lens (Sigma 18-35 lens) - https://amzn.to/4eX3oXm  \nMic | Blue Snowball - https://amzn.to/40ty3pw  \nElgato CamLink - https://amzn.to/4m1REVR  \nElgato Teleprompter - https://amzn.to/45a4Hit  \nGaming Mouse | Glorious Model O Wireless - https://amzn.to/453cwWe   \n\n\u2702\uFE0FMy Content & Editing Essentials  \nBEST Keyboard EVER | https://charachorder.com/FEGA  \nEditing Mouse | Master MX 3s - https://amzn.to/4kQ5D0j  \nNVME SSD Enclosure Casing - https://amzn.to/4nUunH9  \n2tb Samsung SSD - https://amzn.to/4lCtDFm   \n\n\u{1F4B8} All links above are affiliate links. \nPurchasing anything through them  helps support me. Thank you and God bless you!   \n\nvalorant shorts, valorant funny moments, valorant gameplay, funny gaming shorts, gaming shorts, fps shorts, valorant clips, valorant highlights, funny gaming moments, funny clips, stream highlights, viral shorts, gaming content, gaming videos, gaming entertainment, valorant fails, valorant clutch, valorant ace, valorant insane moments, valorant ranked gameplay, valorant competitive, valorant high elo, valorant radiant gameplay, valorant immortal gameplay, valorant aim, valorant flicks, valorant headshots, valorant 1v5, valorant comeback, valorant reaction, valorant rage moments, valorant clean ace, valorant jett, valorant reyna, valorant raze, valorant phoenix, valorant solo queue, valorant patch, valorant update, valorant meta, fps funny moments, shooter game clips, streamer shorts, live gaming shorts, live reaction, YouTube Live, Fega, daily streams, gaming creator, recommended gaming shorts\n\n#valorant #gamingshorts #Fega" },
  "Egging On": { desc: "\u{1F534}Live every day 5PM\nThe funniest and most chaotic Egging On moments from my streams \u{1F602}\u{1F95A}\n\nStay connected & support the journey\n\u{1F514}SUBSCRIBE https://www.youtube.com/@Fega\n\u{1F4AA}\u{1F3FD} Become a member: https://www.youtube.com/@Fega/join\n\nMultistreaming ON\nTwitch: https://www.twitch.tv/fegaabsolute\nKick: https://www.kick.com/fegaabsolute\nTiktok: https://www.tiktok.com/fega\n\n\u{1F53D} Watch My Best Videos \u{1F525}\n\u{1F3AE} Old but Gold \u2013 Gaming Highlights & Reactions (Valorant, Fortnite, Fall Guys, Outlast):\nhttps://www.youtube.com/watch?v=GjYKMJdpESM&list=PLb2kk3HKq1SY6wAXPzbptMKqXULJulUmO\n\n\u{1F4F2} Follow the Journey:\n\u27A1 https://instagram.com/fegagaming\n\u27A1 https://twitter.com/FegaAbsolute\n\n\u{1F3AE}Stream Setup\nCamera | Sony ZVE10 - https://amzn.to/44QBgk7\nLens | Vlog Lens (Sigma 18-35 lens) - https://amzn.to/4eX3oXm\nMic | Blue Snowball - https://amzn.to/40ty3pw\nElgato CamLink - https://amzn.to/4m1REVR\nElgato Teleprompter - https://amzn.to/45a4Hit\nGaming Mouse | Glorious Model O Wireless - https://amzn.to/453cwWe\n\n\u2702\uFE0FMy Content & Editing Essentials\nBEST Keyboard EVER | https://charachorder.com/FEGA\nEditing Mouse | Master MX 3s - https://amzn.to/4kQ5D0j\nNVME SSD Enclosure Casing - https://amzn.to/4nUunH9\n2tb Samsung SSD - https://amzn.to/4lCtDFm\n\n\u{1F4B8} All links above are affiliate links.\nPurchasing anything through them helps support me. Thank you and God bless you!\n\negging on shorts, egging on funny moments, egging on gameplay, rage game shorts, funny gaming shorts, chaotic fails, climbing game clips, funny gaming moments, funny clips, stream highlights, viral shorts, gaming content, gaming videos, gaming entertainment, physics based game, rage climbing game, egging on highlights, egging on fails, egging on clutch moments, Fega, YouTube Live, live gaming, live reaction, egging on first playthrough, egging on solo gameplay, egging on rage moments, egging on struggle, egging on climbing\n\n#eggingon #gamingshorts #Fega" },
  "Deadline Delivery": { desc: "\u{1F534}Live every day 5PM\nThe funniest and most chaotic Deadline Delivery moments from my streams\u{1F602}\n\nStay connected & support the journey\n\u{1F514}SUBSCRIBE https://www.youtube.com/@Fega\n\u{1F4AA}\u{1F3FD} Become a member: https://www.youtube.com/@Fega/join\n\nMultistreaming ON\nTwitch: https://www.twitch.tv/fegaabsolute\nKick: https://www.kick.com/fegaabsolute\nTiktok: https://www.tiktok.com/fega\n\n\u{1F53D} Watch My Best Videos \u{1F525}\n\u{1F3AE} Old but Gold \u2013 Gaming Highlights & Reactions (Valorant, Fortnite,  Fall Guys, Outlast):\nhttps://www.youtube.com/watch?v=GjYKMJdpESM&list=PLb2kk3HKq1SY6wAXPzbptMKqXULJulUmO\n\n\u{1F4F2} Follow the Journey:\n\u27A1 https://instagram.com/fegagaming\n\u27A1 https://twitter.com/FegaAbsolute\n\n\u{1F3AE}Stream Setup\nCamera | Sony ZVE10 - https://amzn.to/44QBgk7\nLens | Vlog Lens (Sigma 18-35 lens) - https://amzn.to/4eX3oXm\nMic | Blue Snowball - https://amzn.to/40ty3pw\nElgato CamLink - https://amzn.to/4m1REVR\nElgato Teleprompter - https://amzn.to/45a4Hit\nGaming Mouse | Glorious Model O Wireless - https://amzn.to/453cwWe\n\n\u2702\uFE0FMy Content & Editing Essentials\nBEST Keyboard EVER | https://charachorder.com/FEGA\nEditing Mouse | Master MX 3s - https://amzn.to/4kQ5D0j\nNVME SSD Enclosure Casing - https://amzn.to/4nUunH9\n2tb Samsung SSD - https://amzn.to/4lCtDFm\n\n\u{1F4B8} All links above are affiliate links.\nPurchasing anything through them  helps support me. Thank you and God bless you!\n\ndeadline delivery shorts, deadline delivery funny moments, deadline delivery gameplay, funny gaming shorts, gaming shorts, chaotic delivery, monkey mailman game, funny gaming moments, funny clips, stream highlights, viral shorts, gaming content, gaming videos, gaming entertainment, racing game, drift racing, deadline delivery highlights, deadline delivery fails, deadline delivery clutch, Fega, YouTube Live, live gaming, live reaction, deadline delivery first playthrough, deadline delivery multiplayer, deadline delivery solo, deadline delivery explosive truck, deadline delivery high speed, deadline delivery new game, deadline delivery demo, deadline delivery steam, indie racing game\n\n#deadlinedelivery #gamingshorts #Fega" },
  "Bionic Bay": { desc: "The funniest and most chaotic Bionic Bay moments from my streams\u{1F602}\n\nStay connected & support the journey \n\u{1F514}SUBSCRIBE https://www.youtube.com/@Fega  \n\u{1F4AA}\u{1F3FD} Become a member: https://www.youtube.com/@Fega/join   \n\nMultistreaming ON \nTwitch: https://www.twitch.tv/fegaabsolute  \nKick: https://www.kick.com/fegaabsolute  \nTiktok: https://www.tiktok.com/fega  \n\n\u{1F53D} Watch My Best Videos \u{1F525}  \n\u{1F3AE} Old but Gold \u2013 Gaming Highlights & Reactions (Valorant, Fortnite,  Fall Guys, Outlast):  https://www.youtube.com/watch?v=GjYKMJdpESM&list=PLb2kk3HKq1SY6wAXPzbptMKqXULJulUmO    \n\n\u{1F4F2} Follow the Journey:  \n\u27A1 https://instagram.com/fegagaming \n\u27A1 https://twitter.com/FegaAbsolute   \n\n\u{1F3AE}Stream Setup  \nCamera | Sony ZVE10 - https://amzn.to/44QBgk7  \nLens | Vlog Lens (Sigma 18-35 lens) - https://amzn.to/4eX3oXm  \nMic | Blue Snowball - https://amzn.to/40ty3pw  \nElgato CamLink - https://amzn.to/4m1REVR  \nElgato Teleprompter - https://amzn.to/45a4Hit  \nGaming Mouse | Glorious Model O Wireless - https://amzn.to/453cwWe   \n\n\u2702\uFE0FMy Content & Editing Essentials  \nBEST Keyboard EVER | https://charachorder.com/FEGA  \nEditing Mouse | Master MX 3s - https://amzn.to/4kQ5D0j  \nNVME SSD Enclosure Casing - https://amzn.to/4nUunH9  \n2tb Samsung SSD - https://amzn.to/4lCtDFm   \n\n\u{1F4B8} All links above are affiliate links. \nPurchasing anything through them  helps support me. Thank you and God bless you!   \n\nbionic bay shorts, bionic bay funny moments, bionic bay gameplay, funny gaming shorts, gaming shorts, physics platformer clips, funny gaming moments, funny clips, stream highlights, gaming content, gaming videos, indie game highlights, sci fi platformer, bionic bay highlights, bionic bay fails, bionic bay clutch, bionic bay insane moments, bionic bay rage moments, bionic bay clean runs, bionic bay speedrun moments, bionic bay platforming, bionic bay physics gameplay, bionic bay challenging levels, bionic bay satisfying gameplay, bionic bay parkour, bionic bay reaction, bionic bay indie game, bionic bay new game, indie game funny moments, indie game gameplay shorts, streamer shorts, live gaming shorts, live reaction, YouTube Live, Fega, daily streams, gaming creator, recommended gaming shorts\n\n#BionicBay #gamingshorts #Fega" },
  "Prince of Persia": { desc: "\u{1F534}Live every day 5PM\nFunniest Prince of Persia moments\u{1F602}\n\n\u{1F514}SUBSCRIBE https://www.youtube.com/@Fega\n\u{1F4AA}\u{1F3FD} Become a member: https://www.youtube.com/@Fega/join\n\n#princeofpersia #gamingshorts #Fega" },
};

// Seed Vizard project IDs for auto-import (Fega's existing projects)
const SEED_PROJECT_IDS = ["28647499", "28676572"];

// ============ VIZARD CLIP MAPPING HELPER ============
// Maps raw Vizard API video objects to our clip model, deduplicates re-edits
function mapVizardClips(videos, existingClips = []) {
  // Map API response — videoId is THE unique identifier per Vizard docs
  const mapped = (videos || []).map((v) => {
    // Extract clipEditorId from clipEditorUrl for deduplication
    // Vizard creates multiple versions when clips are re-edited; they share the same clipEditorUrl id
    const editorMatch = (v.clipEditorUrl || "").match(/id=(\d+)/);
    const clipEditorId = editorMatch ? editorMatch[1] : null;

    return {
      id: String(v.videoId),
      videoId: v.videoId,
      title: v.title || "Untitled",
      duration: Math.round((v.videoMsDuration || 0) / 1000),
      viralScore: v.viralScore || 0,
      viralReason: v.viralReason || "",
      transcript: v.transcript || "",
      videoUrl: v.videoUrl || "",
      clipEditorUrl: v.clipEditorUrl || "",
      clipEditorId,
      status: "none",
    };
  });

  // Step 1: Deduplicate re-edits first — group by clipEditorId, keep highest videoId (latest version)
  const groups = {};
  for (const clip of mapped) {
    const key = clip.clipEditorId || clip.id;
    if (!groups[key] || clip.videoId > (groups[key].videoId || 0)) {
      groups[key] = clip;
    }
  }
  const deduped = Object.values(groups);

  // Step 2: Filter out source/original video using duration-based heuristic
  // The source video is the original upload (typically 10-60 min = 600-3600s)
  // AI-generated clips are short (typically 15-90s, rarely over 120s)
  // Strategy: if the longest video is > 3 minutes AND > 3x the second-longest, it's the source
  let clipsOnly = deduped;
  if (deduped.length > 1) {
    const sorted = [...deduped].sort((a, b) => b.duration - a.duration);
    const longest = sorted[0];
    const secondLongest = sorted[1];
    if (longest.duration > 180 && secondLongest.duration > 0 && longest.duration > secondLongest.duration * 3) {
      clipsOnly = deduped.filter((c) => c.id !== longest.id);
    }
  }

  // Merge with existing clips to preserve user edits (status, title)
  return clipsOnly.map((clip) => {
    const existing = existingClips.find((c) => String(c.videoId) === String(clip.videoId));
    if (existing) {
      return {
        ...clip,
        title: existing.title,
        status: existing.status,
      };
    }
    return clip;
  });
}

// No more mock data — managedFiles are scanned from filesystem, renameHistory is persisted

// ============ PERSIST HELPER ============
const persist = (key, value) => {
  if (window.clipflow?.storeSet) window.clipflow.storeSet(key, value);
};

export default function App() {
  // Navigation
  const [view, setView] = useState("rename");
  const [selProj, setSelProj] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Core data
  const [mainGame, setMainGame] = useState("Arc Raiders");
  const [mainPool, setMainPool] = useState(INITIAL_MAIN_POOL);
  const [gamesDb, setGamesDb] = useState(INITIAL_GAMES);
  const mainGameTag = (gamesDb.find((g) => g.name === mainGame)?.hashtag) || "arcraiders";

  // Rename state — starts empty; managedFiles populated from filesystem scan, renameHistory from electron-store
  const [pendingRenames, setPendingRenames] = useState([]);
  const [renameHistory, setRenameHistory] = useState([]);
  const [managedFiles, setManagedFiles] = useState([]);

  // Upload tracking
  const [uploadedFiles, setUploadedFiles] = useState({});

  // Vizard Projects (real data)
  const [vizardProjects, setVizardProjects] = useState([]);

  // Transcript modal
  const [transcript, setTranscript] = useState(null);

  // Add Game modal
  const [showAddGame, setShowAddGame] = useState(false);
  const [newGameExe, setNewGameExe] = useState(null);

  // Settings
  const [ignoredProcesses, setIgnoredProcesses] = useState(INITIAL_IGNORED);
  const [watchFolder, setWatchFolder] = useState("W:\\YouTube Gaming Recordings Onward\\Vertical Recordings Onwards");
  const [platforms, setPlatforms] = useState(PUBLISH_ORDER_INIT);
  const [r2Config, setR2Config] = useState({});
  const [vizardApiKey, setVizardApiKey] = useState("");
  const [downloadPath, setDownloadPath] = useState("");
  const [downloadedClips, setDownloadedClips] = useState([]);

  // Queue / Tracker
  const [weeklyTemplate, setWeeklyTemplate] = useState(JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)));
  const [trackerData, setTrackerData] = useState([]);
  const [weekTemplateOverrides, setWeekTemplateOverrides] = useState({}); // { "2026-03-02": template }
  const [savedTemplates, setSavedTemplates] = useState([]); // [{ name, template }]
  const [mainGameHistory, setMainGameHistory] = useState([]); // [{ date, from, to }]

  // AI Title & Caption Generator
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [styleGuide, setStyleGuide] = useState("");

  // Captions
  const [captionTemplates, setCaptionTemplates] = useState({
    tiktok: "{title} #{gametitle} #fyp #gamingontiktok #fega #fegagaming",
    instagram: "{title} #{gametitle} #reels #gamingreels #fega #fegagaming",
    facebook: "{title} #{gametitle} #gaming #fbreels #fega #fegagaming",
  });
  const [ytDescriptions, setYtDescriptions] = useState(REAL_YT_DESCRIPTIONS);

  // ============ LOAD FROM ELECTRON-STORE ON STARTUP ============
  useEffect(() => {
    const load = async () => {
      if (!window.clipflow?.storeGetAll) { setLoaded(true); return; }
      try {
        const all = await window.clipflow.storeGetAll();
        if (all.watchFolder) setWatchFolder(all.watchFolder);
        if (all.mainGame) setMainGame(all.mainGame);
        if (all.mainPool) setMainPool(all.mainPool);
        if (all.gamesDb) setGamesDb(all.gamesDb);
        if (all.ignoredProcesses) setIgnoredProcesses(all.ignoredProcesses);
        if (all.platforms) {
          // Merge vizardAccountId from defaults if missing in stored data
          const merged = all.platforms.map((p) => {
            if (!p.vizardAccountId) {
              const def = PUBLISH_ORDER_INIT.find((d) => d.key === p.key);
              if (def) return { ...p, vizardAccountId: def.vizardAccountId };
            }
            return p;
          });
          setPlatforms(merged);
        }
        if (all.weeklyTemplate) setWeeklyTemplate(migrateTemplate(all.weeklyTemplate));
        if (all.trackerData) setTrackerData(all.trackerData);
        if (all.weekTemplateOverrides) {
          // Migrate each override
          const migrated = {};
          for (const [k, v] of Object.entries(all.weekTemplateOverrides)) migrated[k] = migrateTemplate(v);
          setWeekTemplateOverrides(migrated);
        }
        if (all.savedTemplates) setSavedTemplates(all.savedTemplates.map((p) => ({ ...p, template: migrateTemplate(p.template) })));
        if (all.mainGameHistory) setMainGameHistory(all.mainGameHistory);
        if (all.captionTemplates) setCaptionTemplates(all.captionTemplates);
        if (all.r2Config) setR2Config(all.r2Config);
        if (all.vizardApiKey) setVizardApiKey(all.vizardApiKey);
        if (all.downloadPath) setDownloadPath(all.downloadPath);
        if (all.downloadedClips) setDownloadedClips(all.downloadedClips);
        if (all.vizardProjects) {
          // Migration: fix corrupted clip IDs (from previous bug where auto-refresh set all IDs to "undefined")
          // Also: re-filter source videos from persisted data using duration heuristic
          const fixed = all.vizardProjects.map((proj) => {
            if (!proj.clips || proj.clips.length === 0) return proj;
            const hasCorrupted = proj.clips.some((c) => !c.id || c.id === "undefined" || !c.videoId);
            if (hasCorrupted) {
              // Clear corrupted clips — auto-refresh will re-fetch from Vizard API
              return { ...proj, clips: [], status: "processing" };
            }
            // Remove source videos that slipped through old filters (duration-based)
            if (proj.clips.length > 1) {
              const sorted = [...proj.clips].sort((a, b) => (b.duration || 0) - (a.duration || 0));
              const longest = sorted[0];
              const secondLongest = sorted[1];
              if (longest.duration > 180 && secondLongest.duration > 0 && longest.duration > secondLongest.duration * 3) {
                return { ...proj, clips: proj.clips.filter((c) => c.id !== longest.id) };
              }
            }
            return proj;
          });
          setVizardProjects(fixed);
        }
        if (all.uploadedFiles) setUploadedFiles(all.uploadedFiles);
        if (all.renameHistory) setRenameHistory(all.renameHistory);
        if (all.anthropicApiKey) setAnthropicApiKey(all.anthropicApiKey);
        if (all.styleGuide) setStyleGuide(all.styleGuide);
        // For ytDescriptions: merge real defaults with any saved overrides
        if (all.ytDescriptions && Object.keys(all.ytDescriptions).length > 0) {
          setYtDescriptions({ ...REAL_YT_DESCRIPTIONS, ...all.ytDescriptions });
        }

        // Scan the actual filesystem to build managedFiles from real renamed files
        const folder = all.watchFolder || "W:\\YouTube Gaming Recordings Onward\\Vertical Recordings Onwards";
        if (window.clipflow.scanWatchFolder) {
          const result = await window.clipflow.scanWatchFolder(folder);
          if (result.files && result.files.length > 0) {
            setManagedFiles(result.files);

            // Migration: initialize dayCount/lastDayDate from filesystem for games that have dayCount 0
            // This runs once when a game has never had its dayCount set (first run or new game)
            const games = all.gamesDb || INITIAL_GAMES;
            const needsMigration = games.filter((g) => !g.dayCount || g.dayCount === 0);
            if (needsMigration.length > 0) {
              const migrated = games.map((g) => {
                if (g.dayCount && g.dayCount > 0) return g;
                // Count unique dates for this game's renamed files
                const gameFiles = result.files.filter((f) => f.tag === g.tag);
                if (gameFiles.length === 0) return g;
                const uniqueDates = new Set(gameFiles.map((f) => f.name.slice(0, 10)));
                const sortedDates = [...uniqueDates].sort();
                const dayCount = sortedDates.length;
                const lastDayDate = sortedDates[sortedDates.length - 1];
                return { ...g, dayCount, lastDayDate };
              });
              setGamesDb(migrated);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
      setLoaded(true);
    };
    load();
  }, []);

  // ============ AUTO-IMPORT SEED PROJECTS + AUTO-REFRESH ============
  useEffect(() => {
    if (!loaded || !vizardApiKey) return;
    if (!window.clipflow?.vizardQueryProject) return;

    const importAndRefresh = async () => {
      // 1. Seed projects — import any that aren't already in the list
      for (const id of SEED_PROJECT_IDS) {
        if (vizardProjects.some((p) => String(p.id) === id)) continue;
        try {
          const result = await window.clipflow.vizardQueryProject(id);
          // Vizard API returns data at top level: { code, videos, projectName, projectId }
          if (result.error || result.code !== 2000 || !result.projectId) continue;
          const clips = mapVizardClips(result.videos);
          const project = {
            id: String(result.projectId || id),
            name: result.projectName || `Vizard Project ${id}`,
            status: clips.length > 0 ? "ready" : "processing",
            progress: result.progress || 0,
            clips,
            createdAt: new Date().toISOString(),
            game: "Unknown",
            gameTag: "?",
            gameColor: T.accent,
            imported: true,
          };
          setVizardProjects((prev) => {
            if (prev.some((p) => String(p.id) === String(project.id))) return prev;
            return [...prev, project];
          });
        } catch (e) {
          console.error(`Failed to seed project ${id}:`, e);
        }
      }

      // 2. Auto-refresh all existing "ready" projects to get fresh clip data / URLs
      for (const proj of vizardProjects) {
        if (proj.status === "processing") continue; // polling already handles these
        try {
          const result = await window.clipflow.vizardQueryProject(proj.id);
          // Vizard API returns data at top level: { code, videos, projectName, projectId }
          if (result.error || result.code !== 2000) continue;
          if (result.videos) {
            setVizardProjects((prev) => prev.map((p) => {
              if (p.id !== String(proj.id)) return p;
              // Merge — deduplicate and preserve user edits (status, title)
              const updatedClips = mapVizardClips(result.videos, p.clips || []);
              return { ...p, clips: updatedClips, status: "ready" };
            }));
          }
        } catch (e) {
          console.error(`Failed to refresh project ${proj.id}:`, e);
        }
      }
    };

    importAndRefresh();
  }, [loaded, vizardApiKey]); // eslint-disable-line

  // ============ AUTO-SAVE TO ELECTRON-STORE ============
  const hasLoaded = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (!hasLoaded.current) { hasLoaded.current = true; return; }
    persist("watchFolder", watchFolder);
  }, [watchFolder, loaded]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mainGame", mainGame); }, [mainGame]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mainPool", mainPool); }, [mainPool]);
  useEffect(() => { if (!hasLoaded.current) return; persist("gamesDb", gamesDb); }, [gamesDb]);
  useEffect(() => { if (!hasLoaded.current) return; persist("ignoredProcesses", ignoredProcesses); }, [ignoredProcesses]);
  useEffect(() => { if (!hasLoaded.current) return; persist("platforms", platforms); }, [platforms]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weeklyTemplate", weeklyTemplate); }, [weeklyTemplate]);
  useEffect(() => { if (!hasLoaded.current) return; persist("trackerData", trackerData); }, [trackerData]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weekTemplateOverrides", weekTemplateOverrides); }, [weekTemplateOverrides]);
  useEffect(() => { if (!hasLoaded.current) return; persist("savedTemplates", savedTemplates); }, [savedTemplates]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mainGameHistory", mainGameHistory); }, [mainGameHistory]);
  useEffect(() => { if (!hasLoaded.current) return; persist("captionTemplates", captionTemplates); }, [captionTemplates]);
  useEffect(() => { if (!hasLoaded.current) return; persist("ytDescriptions", ytDescriptions); }, [ytDescriptions]);
  useEffect(() => { if (!hasLoaded.current) return; persist("r2Config", r2Config); }, [r2Config]);
  useEffect(() => { if (!hasLoaded.current) return; persist("vizardApiKey", vizardApiKey); }, [vizardApiKey]);
  useEffect(() => { if (!hasLoaded.current) return; persist("downloadPath", downloadPath); }, [downloadPath]);
  useEffect(() => { if (!hasLoaded.current) return; persist("downloadedClips", downloadedClips); }, [downloadedClips]);
  useEffect(() => { if (!hasLoaded.current) return; persist("vizardProjects", vizardProjects); }, [vizardProjects]);
  useEffect(() => { if (!hasLoaded.current) return; persist("renameHistory", renameHistory); }, [renameHistory]);
  useEffect(() => { if (!hasLoaded.current) return; persist("anthropicApiKey", anthropicApiKey); }, [anthropicApiKey]);
  useEffect(() => { if (!hasLoaded.current) return; persist("styleGuide", styleGuide); }, [styleGuide]);

  // ============ MAIN GAME SWITCH LOGGING ============
  const prevMainGame = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    if (prevMainGame.current === null) { prevMainGame.current = mainGame; return; }
    if (mainGame !== prevMainGame.current) {
      setMainGameHistory((prev) => [...prev, {
        date: new Date().toISOString().split("T")[0],
        from: prevMainGame.current,
        to: mainGame,
      }]);
      prevMainGame.current = mainGame;
    }
  }, [mainGame, loaded]);

  // ============ HANDLERS ============
  const handleNewGame = (gd) => {
    setGamesDb((p) => [...p, { ...gd, dayCount: 1 }]);
    // Build full YouTube description from template — swap game-specific parts
    const gameName = gd.name;
    const hashtag = gd.hashtag || gameName.toLowerCase().replace(/\s+/g, "");
    const ytDesc = `\u{1F534}Live every day 5PM\nThe funniest and most chaotic ${gameName} moments from my streams\u{1F602}\n\nStay connected & support the journey \n\u{1F514}SUBSCRIBE https://www.youtube.com/@Fega  \n\u{1F4AA}\u{1F3FD} Become a member: https://www.youtube.com/@Fega/join   \n\nMultistreaming ON \nTwitch: https://www.twitch.tv/fegaabsolute  \nKick: https://www.kick.com/fegaabsolute  \nTiktok: https://www.tiktok.com/fega  \n\n\u{1F53D} Watch My Best Videos \u{1F525}  \n\u{1F3AE} Old but Gold \u2013 Gaming Highlights & Reactions (Valorant, Fortnite,  Fall Guys, Outlast):  https://www.youtube.com/watch?v=GjYKMJdpESM&list=PLb2kk3HKq1SY6wAXPzbptMKqXULJulUmO    \n\n\u{1F4F2} Follow the Journey:  \n\u27A1 https://instagram.com/fegagaming \n\u27A1 https://twitter.com/FegaAbsolute   \n\n\u{1F3AE}Stream Setup  \nCamera | Sony ZVE10 - https://amzn.to/44QBgk7  \nLens | Vlog Lens (Sigma 18-35 lens) - https://amzn.to/4eX3oXm  \nMic | Blue Snowball - https://amzn.to/40ty3pw  \nElgato CamLink - https://amzn.to/4m1REVR  \nElgato Teleprompter - https://amzn.to/45a4Hit  \nGaming Mouse | Glorious Model O Wireless - https://amzn.to/453cwWe   \n\n\u2702\uFE0FMy Content & Editing Essentials  \nBEST Keyboard EVER | https://charachorder.com/FEGA  \nEditing Mouse | Master MX 3s - https://amzn.to/4kQ5D0j  \nNVME SSD Enclosure Casing - https://amzn.to/4nUunH9  \n2tb Samsung SSD - https://amzn.to/4lCtDFm   \n\n\u{1F4B8} All links above are affiliate links. \nPurchasing anything through them  helps support me. Thank you and God bless you!   \n\n${hashtag} shorts, ${hashtag} funny moments, ${hashtag} gameplay, funny gaming shorts, gaming shorts, funny gaming moments, funny clips, stream highlights, viral shorts, gaming content, gaming videos, gaming entertainment, ${hashtag} highlights, ${hashtag} fails, ${hashtag} clutch, Fega, YouTube Live, live gaming, live reaction\n\n#${hashtag} #gamingshorts #Fega`;
    setYtDescriptions((p) => ({ ...p, [gameName]: { desc: ytDesc } }));
    setNewGameExe(null);
    setShowAddGame(false);
  };
  const handleEditGame = (u) => setGamesDb((p) => p.map((g) => (g.name === u.name ? u : g)));

  // Called by RenameView after a file is renamed — persists dayCount + lastDayDate per game
  const handleGameDayUpdate = useCallback((tag, dayCount, lastDayDate) => {
    setGamesDb((prev) => prev.map((g) =>
      g.tag === tag ? { ...g, dayCount, lastDayDate } : g
    ));
  }, []);

  // Vizard project handlers
  const handleCreateProject = useCallback((project) => {
    setVizardProjects((prev) => [...prev, project]);
  }, []);

  const handleImportProject = useCallback((project) => {
    setVizardProjects((prev) => {
      if (prev.some((p) => String(p.id) === String(project.id))) return prev;
      return [...prev, project];
    });
  }, []);

  const handlePollProject = useCallback(async (projectId) => {
    if (!window.clipflow?.vizardQueryProject) return;
    try {
      const result = await window.clipflow.vizardQueryProject(projectId);
      if (result.error) {
        console.error("Vizard poll error:", result.error);
        return;
      }

      // Vizard API returns data at top level: { code, videos, projectName, projectId }
      if (result.code === 2000 && result.videos) {
        // Project complete — extract clips, deduplicate, preserve user edits
        setVizardProjects((prev) => prev.map((p) => {
          if (p.id !== String(projectId)) return p;
          const clips = mapVizardClips(result.videos, p.clips || []);
          return { ...p, status: "ready", clips, progress: 100 };
        }));
      } else if (result.code === 1000) {
        // Still processing
        const prog = result.progress || null;
        setVizardProjects((prev) => prev.map((p) =>
          p.id === String(projectId) ? { ...p, progress: prog || p.progress } : p
        ));
      } else if (result.code && result.code !== 200) {
        // Error
        setVizardProjects((prev) => prev.map((p) =>
          p.id === String(projectId) ? { ...p, status: "error", error: result.msg || "Unknown error" } : p
        ));
      }
    } catch (e) {
      console.error("Failed to poll project:", e);
    }
  }, []);

  const handleUpdateClip = useCallback((projectId, clipId, status) => {
    setVizardProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        clips: (p.clips || []).map((c) => (c.id === clipId ? { ...c, status } : c)),
      };
    }));
  }, []);

  const handleEditClipTitle = useCallback((projectId, clipId, title) => {
    setVizardProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        clips: (p.clips || []).map((c) => (c.id === clipId ? { ...c, title } : c)),
      };
    }));
  }, []);

  const handleResetUploads = useCallback(() => {
    setUploadedFiles({});
    persist("uploadedFiles", {});
  }, []);

  // Build allClips from vizardProjects for QueueView
  const allClips = {};
  vizardProjects.forEach((p) => {
    if (p.clips && p.clips.length > 0) {
      allClips[p.id] = p.clips;
    }
  });

  const scheduledClipIds = new Set(trackerData.map((t) => t.clipId).filter(Boolean));
  const scheduledTitles = new Set(trackerData.map((t) => t.title).filter(Boolean));
  const totalApproved = Object.values(allClips).flat().filter((c) => (c.status === "approved" || c.status === "ready") && hasHashtag(c.title) && !scheduledClipIds.has(c.id) && !scheduledTitles.has(c.title)).length;

  const nav = (id) => { setView(id); setSelProj(null); };

  const navItems = [
    { id: "rename", icon: "\u270f\ufe0f", label: "Rename" },
    { id: "upload", icon: "\u2b06\ufe0f", label: "Upload" },
    { id: "projects", icon: "\ud83d\udcc1", label: "Projects" },
    { id: "queue", icon: "\ud83d\udccb", label: "Queue", badge: totalApproved },
    { id: "captions", icon: "\ud83c\udff7\ufe0f", label: "Captions" },
    { id: "settings", icon: "\u2699\ufe0f", label: "Settings" },
  ];

  const renderView = () => {
    if (view === "rename") {
      return (
        <RenameView
          gamesDb={gamesDb}
          mainGameName={mainGame}
          pendingRenames={pendingRenames}
          setPendingRenames={setPendingRenames}
          renameHistory={renameHistory}
          setRenameHistory={setRenameHistory}
          onAddGame={() => setShowAddGame(true)}
          onGameDayUpdate={handleGameDayUpdate}
          managedFiles={managedFiles}
          setManagedFiles={setManagedFiles}
          watchFolder={watchFolder}
        />
      );
    }
    if (view === "upload") {
      return (
        <UploadView
          watchFolder={watchFolder}
          gamesDb={gamesDb}
          onCreateProject={handleCreateProject}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
        />
      );
    }
    if (view === "queue") {
      return (
        <QueueView
          allClips={allClips}
          mainGame={mainGame}
          mainGameTag={mainGameTag}
          platforms={platforms}
          trackerData={trackerData}
          setTrackerData={setTrackerData}
          weeklyTemplate={weeklyTemplate}
          setWeeklyTemplate={setWeeklyTemplate}
          weekTemplateOverrides={weekTemplateOverrides}
          setWeekTemplateOverrides={setWeekTemplateOverrides}
          savedTemplates={savedTemplates}
          setSavedTemplates={setSavedTemplates}
          ytDescriptions={ytDescriptions}
          captionTemplates={captionTemplates}
          gamesDb={gamesDb}
        />
      );
    }
    if (view === "captions") {
      return (
        <CaptionsView
          ytDescriptions={ytDescriptions}
          setYtDescriptions={setYtDescriptions}
          captionTemplates={captionTemplates}
          setCaptionTemplates={setCaptionTemplates}
        />
      );
    }
    if (view === "settings") {
      return (
        <SettingsView
          mainGame={mainGame}
          setMainGame={setMainGame}
          mainPool={mainPool}
          setMainPool={setMainPool}
          gamesDb={gamesDb}
          setGamesDb={setGamesDb}
          onEditGame={handleEditGame}
          watchFolder={watchFolder}
          setWatchFolder={setWatchFolder}
          platforms={platforms}
          setPlatforms={setPlatforms}
          r2Config={r2Config}
          setR2Config={setR2Config}
          vizardApiKey={vizardApiKey}
          setVizardApiKey={setVizardApiKey}
          downloadPath={downloadPath}
          setDownloadPath={setDownloadPath}
          vizardProjects={vizardProjects}
          onResetUploads={handleResetUploads}
          downloadedClips={downloadedClips}
          setDownloadedClips={setDownloadedClips}
          onRefreshProject={handlePollProject}
          anthropicApiKey={anthropicApiKey}
          setAnthropicApiKey={setAnthropicApiKey}
          styleGuide={styleGuide}
          setStyleGuide={setStyleGuide}
        />
      );
    }
    // Projects / Clips view
    if (view === "clips" && selProj) {
      const proj = vizardProjects.find((p) => p.id === selProj.id);
      if (!proj) {
        // Project not found, fall back to list
        return (
          <ProjectsListView
            vizardProjects={vizardProjects}
            onSelect={(p) => { setSelProj(p); setView("clips"); }}
            onPollProject={handlePollProject}
            onImportProject={handleImportProject}
            mainGame={mainGame}
            gamesDb={gamesDb}
          />
        );
      }
      return (
        <ClipBrowser
          project={proj}
          onBack={() => { setSelProj(null); setView("projects"); }}
          onUpdateClip={handleUpdateClip}
          onTranscript={setTranscript}
          onEditClipTitle={handleEditClipTitle}
          gamesDb={gamesDb}
          anthropicApiKey={anthropicApiKey}
          styleGuide={styleGuide}
        />
      );
    }
    return (
      <ProjectsListView
        vizardProjects={vizardProjects}
        onSelect={(p) => { setSelProj(p); setView("clips"); }}
        onPollProject={handlePollProject}
        onImportProject={handleImportProject}
        mainGame={mainGame}
        gamesDb={gamesDb}
      />
    );
  };

  return (
    <div style={{ background: T.bg, height: "100vh", overflow: "hidden", color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
      {/* Draggable title bar with logo */}
      <div className="titlebar-drag" style={{ height: 36, flexShrink: 0, background: "rgba(10,11,16,0.8)", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", paddingLeft: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, boxShadow: "0 1px 8px rgba(139,92,246,0.3)" }}>⚡</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, letterSpacing: "-0.2px" }}>ClipFlow</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "0 0 8px 8px" }}>
        <div style={{ flex: 1, overflow: "auto", scrollbarGutter: "stable" }}>
          <div style={{ padding: "32px 40px", maxWidth: view === "upload" ? "none" : 860, margin: "0 auto" }}>
            {renderView()}
          </div>
        </div>
        <Sidebar
          navItems={navItems}
          activeView={view === "clips" ? "projects" : view}
          onNavigate={nav}
        />
      </div>
      <TranscriptModal clip={transcript} onClose={() => setTranscript(null)} />
      {(newGameExe || showAddGame) && (
        <AddGameModal
          exe={newGameExe}
          onConfirm={handleNewGame}
          onDismiss={() => { setNewGameExe(null); setShowAddGame(false); }}
          onIgnore={newGameExe ? (exe) => { setIgnoredProcesses((p) => [...p, exe]); setNewGameExe(null); } : null}
        />
      )}
    </div>
  );
}
