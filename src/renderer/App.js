import React, { useState, useEffect, useCallback, useRef } from "react";
import posthog from "posthog-js";
import T from "./styles/theme";
import Sidebar from "./components/Sidebar";
import UpdateBanner from "./components/UpdateBanner";
import { AddGameModal, TranscriptModal } from "./components/modals";
import AudioCalibrationModal from "./components/AudioCalibrationModal";
import RenameView from "./views/RenameView";
import RecordingsView from "./views/UploadView";
import { ProjectsListView, ClipBrowser } from "./views/ProjectsView";
import QueueView from "./views/QueueView";
import CaptionsView from "./views/CaptionsView";
import TrackerView from "./views/TrackerView";
import SettingsView from "./views/SettingsView";
import EditorView from "./editor/EditorView";
import OnboardingView from "./views/OnboardingView";
import { evaluateRollover, localISO } from "./utils/trackerEngine";

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
const PUBLISH_ORDER_INIT = [];
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

// No more mock data — file metadata stored in SQLite, renameHistory is persisted

// ============ PERSIST HELPER ============
const persist = (key, value) => {
  if (window.clipflow?.storeSet) window.clipflow.storeSet(key, value);
};

// #175 aftermath: the pre-alpha.2 fake undo left History entries claiming
// renames were undone when the files were never touched, plus "renames" of
// ghost rows whose files never existed on disk. One pass at load reconciles
// legacy undone entries (no historyId — DB-backed entries are authoritative)
// against the watch tree: file still at its renamed name → the rename stands,
// un-mark; gone under both names → ghost, drop; back at its raw name →
// genuinely undone, keep.
const reconcileRenameHistory = async (entries, watchFolder, testWatchFolder) => {
  if (!watchFolder || !window.clipflow?.fileExists) return entries;
  const onDisk = async (name, isTest) => {
    if (!name) return false;
    const root = isTest ? (testWatchFolder || `${watchFolder}\\Test`) : watchFolder;
    const month = (name.match(/\d{4}-\d{2}-\d{2}/) || [])[0]?.slice(0, 7);
    const candidates = month ? [`${root}\\${month}\\${name}`, `${root}\\${name}`] : [`${root}\\${name}`];
    for (const p of candidates) {
      if (await window.clipflow.fileExists(p)) return true;
    }
    return false;
  };
  const out = [];
  for (const h of entries) {
    if (!h.undone || h.historyId) { out.push(h); continue; }
    if (await onDisk(h.newName, h.isTest)) out.push({ ...h, undone: false });
    else if (await onDisk(h.oldName, h.isTest)) out.push(h);
  }
  return out;
};

export default function App() {
  // Navigation
  const [view, setView] = useState("rename");
  const [selProj, setSelProj] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Project folders
  const [projectFolders, setProjectFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);

  // Core data
  const [mainGame, setMainGame] = useState("Arc Raiders");
  const [mainPool, setMainPool] = useState(INITIAL_MAIN_POOL);
  const [gamesDb, setGamesDb] = useState(INITIAL_GAMES);
  // Short game tag ("AR", "RL") — clip.gameTag stores the lowercased short tag, so
  // consumers comparing against clips must use tag, not hashtag (#tracker-main-count).
  const mainGameTag = (gamesDb.find((g) => g.name === mainGame)?.tag) || "AR";

  // Rename state — renameHistory from electron-store
  const [pendingRenames, setPendingRenames] = useState([]);
  const [renameHistory, setRenameHistory] = useState([]);

  // Local projects
  const [localProjects, setLocalProjects] = useState([]);

  // Transcript modal
  const [transcript, setTranscript] = useState(null);

  // Editor context — which project/clip to open
  const [editorContext, setEditorContext] = useState(null); // { projectId, clipId }
  const [returnClipId, setReturnClipId] = useState(null); // clip to scroll to when returning from the editor

  // Add Game modal — null or "game" or "content"
  const [showAddGame, setShowAddGame] = useState(null);
  const [newGameExe, setNewGameExe] = useState(null);

  // Pipeline ask-degrade modal (Issue #72 Phase 1).
  // Mounted at App level so the user can switch tabs while waiting to decide.
  // Shape: { requestId, failed: [{ signal, failureReason }, ...] } or null.
  const [degradeAsk, setDegradeAsk] = useState(null);

  useEffect(() => {
    if (!window.clipflow?.onPipelineAskDegrade) return;
    window.clipflow.onPipelineAskDegrade((data) => setDegradeAsk(data));
    return () => { window.clipflow?.removePipelineAskDegradeListener?.(); };
  }, []);

  const respondDegrade = useCallback(async (answer) => {
    const id = degradeAsk?.requestId;
    setDegradeAsk(null);
    if (id && window.clipflow?.pipelineDegradeAnswer) {
      try { await window.clipflow.pipelineDegradeAnswer(id, answer ? "yes" : "no"); } catch (_) {}
    }
  }, [degradeAsk]);

  // Audio track calibration wizard (#169) — main fires the event when a
  // multi-track file hits the pipeline without a matching saved setup.
  // Mounted at App level (same reason as the degrade modal).
  // Shape: { requestId, filePath, trackCount, hasExisting } or null.
  const [audioCalAsk, setAudioCalAsk] = useState(null);

  useEffect(() => {
    if (!window.clipflow?.onAudioCalibrationNeeded) return;
    window.clipflow.onAudioCalibrationNeeded((data) => setAudioCalAsk(data));
    return () => { window.clipflow?.removeAudioCalibrationListener?.(); };
  }, []);

  const respondAudioCal = useCallback(async (setup) => {
    const id = audioCalAsk?.requestId;
    setAudioCalAsk(null);
    if (!id) return;
    try {
      if (setup) {
        // Save FIRST — main re-checks the store after the answer resolves.
        const saved = await window.clipflow.audioSaveCalibration(setup);
        await window.clipflow.audioCalibrationAnswer(id, !!saved?.success);
      } else {
        await window.clipflow.audioCalibrationAnswer(id, false);
      }
    } catch (_) {
      try { await window.clipflow.audioCalibrationAnswer(id, false); } catch (_) {}
    }
  }, [audioCalAsk]);

  // Settings
  const [ignoredProcesses, setIgnoredProcesses] = useState(INITIAL_IGNORED);
  // #167: no hardcoded folder — pre-settings-load state must be empty or the
  // Rename watcher races the async load and scans a folder the user never chose.
  const [watchFolder, setWatchFolder] = useState("");
  const [testWatchFolder, setTestWatchFolder] = useState("");
  const [platforms, setPlatforms] = useState(PUBLISH_ORDER_INIT);
  const [outputFolder, setOutputFolder] = useState("");
  const [sfxFolder, setSfxFolder] = useState("");

  // Settings section collapse state — persists across tab switches, resets on app launch
  const [settingsCollapsed, setSettingsCollapsed] = useState({
    files: true, content: true, aiStyle: true, publishing: true, tools: true, diagnostics: true,
  });

  // Queue / Tracker
  const [weeklyTemplate, setWeeklyTemplate] = useState(JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)));
  const [trackerData, setTrackerData] = useState([]);
  const [weeklyTarget, setWeeklyTarget] = useState(48);
  const [weekMeta, setWeekMeta] = useState({});
  const [xpLedger, setXpLedger] = useState([]);
  const [streakState, setStreakState] = useState({ evaluatedThroughMondayISO: null, current: 0, best: 0 });
  const [weekTemplateOverrides, setWeekTemplateOverrides] = useState({}); // { "2026-03-02": template }
  const [savedTemplates, setSavedTemplates] = useState([]); // [{ name, template }]
  const [mainGameHistory, setMainGameHistory] = useState([]); // [{ date, from, to }]

  // AI Title & Caption Generator
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [gatewayAuthToken, setGatewayAuthToken] = useState("");
  const [styleGuide, setStyleGuide] = useState("");

  // YouTube OAuth 2.0
  const [youtubeClientId, setYoutubeClientId] = useState("");
  const [youtubeClientSecret, setYoutubeClientSecret] = useState("");

  // Meta (Facebook Pages)
  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  // Instagram (separate app — Instagram Business Login)
  const [instagramAppId, setInstagramAppId] = useState("");
  const [instagramAppSecret, setInstagramAppSecret] = useState("");

  // TikTok
  const [tiktokClientKey, setTiktokClientKey] = useState("");
  const [tiktokClientSecret, setTiktokClientSecret] = useState("");

  // Onboarding
  const [onboardingComplete, setOnboardingComplete] = useState(null); // null = loading, true/false = resolved

  // Queue settings
  const [requireHashtagInTitle, setRequireHashtagInTitle] = useState(true);

  // Captions
  const [platformOptions, setPlatformOptions] = useState({ tiktokPostMode: "direct_post" });
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
        if (all.testWatchFolder !== undefined) setTestWatchFolder(all.testWatchFolder || "");
        if (all.mainGame) setMainGame(all.mainGame);
        if (all.mainPool) setMainPool(all.mainPool);
        if (all.gamesDb) setGamesDb(all.gamesDb);
        if (all.ignoredProcesses) setIgnoredProcesses(all.ignoredProcesses);
        // Load platforms: merge stored manual platforms with OAuth-connected accounts
        if (all.platforms) setPlatforms(all.platforms);
        if (window.clipflow?.oauthGetAccounts) {
          try {
            const oauthAccounts = await window.clipflow.oauthGetAccounts();
            if (oauthAccounts && oauthAccounts.length > 0) {
              setPlatforms((prev) => {
                // Merge: keep existing manual entries, add/update OAuth accounts
                const merged = [...prev];
                for (const acct of oauthAccounts) {
                  const idx = merged.findIndex((p) => p.key === acct.key);
                  if (idx >= 0) {
                    merged[idx] = { ...merged[idx], ...acct };
                  } else {
                    merged.push(acct);
                  }
                }
                return merged;
              });
            }
          } catch (e) {
            console.error("Failed to load OAuth accounts:", e);
          }
        }
        if (all.weeklyTemplate) setWeeklyTemplate(migrateTemplate(all.weeklyTemplate));
        if (all.trackerData) setTrackerData(all.trackerData);
        if (all.weeklyTarget !== undefined) setWeeklyTarget(all.weeklyTarget);
        if (all.weekMeta) setWeekMeta(all.weekMeta);
        if (all.xpLedger) setXpLedger(all.xpLedger);
        if (all.streakState) setStreakState(all.streakState);
        if (all.weekTemplateOverrides) {
          // Migrate each override
          const migrated = {};
          for (const [k, v] of Object.entries(all.weekTemplateOverrides)) migrated[k] = migrateTemplate(v);
          setWeekTemplateOverrides(migrated);
        }
        if (all.savedTemplates) setSavedTemplates(all.savedTemplates.map((p) => ({ ...p, template: migrateTemplate(p.template) })));
        if (all.mainGameHistory) setMainGameHistory(all.mainGameHistory);
        if (all.captionTemplates) setCaptionTemplates(all.captionTemplates);
        if (all.platformOptions) setPlatformOptions((p) => ({ ...p, ...all.platformOptions }));
        // Load projects from disk (file-based), fall back to store
        if (window.clipflow?.projectList) {
          const projResult = await window.clipflow.projectList();
          if (projResult?.projects?.length > 0) {
            setLocalProjects(projResult.projects);
          } else if (all.localProjects) {
            setLocalProjects(all.localProjects);
          }
        } else if (all.localProjects) {
          setLocalProjects(all.localProjects);
        }
        // Load project folders
        if (window.clipflow?.folderList) {
          const folderResult = await window.clipflow.folderList();
          if (folderResult?.folders) setProjectFolders(folderResult.folders);
        }
        if (all.outputFolder) setOutputFolder(all.outputFolder);
        if (all.sfxFolder) setSfxFolder(all.sfxFolder);
        if (all.renameHistory) {
          const reconciled = await reconcileRenameHistory(all.renameHistory, all.watchFolder, all.testWatchFolder);
          // Persist immediately when the pass corrected anything — the auto-save
          // effect only fires on later changes, and the cleanup should stick.
          if (reconciled.length !== all.renameHistory.length || reconciled.some((h, i) => h !== all.renameHistory[i])) {
            persist("renameHistory", reconciled);
          }
          setRenameHistory(reconciled);
        }
        if (all.anthropicApiKey) setAnthropicApiKey(all.anthropicApiKey);
        if (all.gatewayUrl) setGatewayUrl(all.gatewayUrl);
        if (all.gatewayAuthToken) setGatewayAuthToken(all.gatewayAuthToken);
        if (all.youtubeClientId) setYoutubeClientId(all.youtubeClientId);
        if (all.youtubeClientSecret) setYoutubeClientSecret(all.youtubeClientSecret);
        if (all.metaAppId) setMetaAppId(all.metaAppId);
        if (all.metaAppSecret) setMetaAppSecret(all.metaAppSecret);
        if (all.instagramAppId) setInstagramAppId(all.instagramAppId);
        if (all.instagramAppSecret) setInstagramAppSecret(all.instagramAppSecret);
        if (all.tiktokClientKey) setTiktokClientKey(all.tiktokClientKey);
        if (all.tiktokClientSecret) setTiktokClientSecret(all.tiktokClientSecret);
        if (all.styleGuide) setStyleGuide(all.styleGuide);
        if (all.requireHashtagInTitle !== undefined) setRequireHashtagInTitle(all.requireHashtagInTitle);
        // Onboarding flag
        setOnboardingComplete(!!all.onboardingComplete);
        // For ytDescriptions: merge real defaults with any saved overrides
        if (all.ytDescriptions && Object.keys(all.ytDescriptions).length > 0) {
          setYtDescriptions({ ...REAL_YT_DESCRIPTIONS, ...all.ytDescriptions });
        }

        // dayCount migration: initialize from SQLite file_metadata for games with dayCount 0
        if (window.clipflow.fileMetadataSearch) {
          const games = all.gamesDb || INITIAL_GAMES;
          const needsMigration = games.filter((g) => !g.dayCount || g.dayCount === 0);
          if (needsMigration.length > 0) {
            const allFiles = await window.clipflow.fileMetadataSearch({ type: "allRenamed" });
            if (Array.isArray(allFiles) && allFiles.length > 0) {
              const migrated = games.map((g) => {
                if (g.dayCount && g.dayCount > 0) return g;
                const gameFiles = allFiles.filter((f) => f.tag === g.tag);
                if (gameFiles.length === 0) return g;
                const uniqueDates = new Set(gameFiles.map((f) => f.date).filter(Boolean));
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

  // ============ AUTO-SAVE TO ELECTRON-STORE ============
  const hasLoaded = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (!hasLoaded.current) { hasLoaded.current = true; return; }
    persist("watchFolder", watchFolder);
  }, [watchFolder, loaded]);
  useEffect(() => {
    if (!loaded) return;
    if (!hasLoaded.current) return;
    persist("testWatchFolder", testWatchFolder);
  }, [testWatchFolder, loaded]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mainGame", mainGame); }, [mainGame]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mainPool", mainPool); }, [mainPool]);
  useEffect(() => { if (!hasLoaded.current) return; persist("gamesDb", gamesDb); }, [gamesDb]);
  // Day-counter repair (#170) happens in the main process during reconcile —
  // sync it into renderer state, or the next rename would compute from (and
  // persist back) the stale counter this component loaded at boot.
  useEffect(() => {
    if (!window.clipflow?.onGamesDbChanged) return;
    window.clipflow.onGamesDbChanged((games) => {
      if (Array.isArray(games) && games.length > 0) setGamesDb(games);
    });
    return () => { window.clipflow?.removeGamesDbChangedListener?.(); };
  }, []);
  useEffect(() => { if (!hasLoaded.current) return; persist("ignoredProcesses", ignoredProcesses); }, [ignoredProcesses]);
  useEffect(() => { if (!hasLoaded.current) return; persist("platforms", platforms); }, [platforms]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weeklyTemplate", weeklyTemplate); }, [weeklyTemplate]);
  useEffect(() => { if (!hasLoaded.current) return; persist("trackerData", trackerData); }, [trackerData]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weeklyTarget", weeklyTarget); }, [weeklyTarget]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weekMeta", weekMeta); }, [weekMeta]);
  useEffect(() => { if (!hasLoaded.current) return; persist("xpLedger", xpLedger); }, [xpLedger]);
  useEffect(() => { if (!hasLoaded.current) return; persist("streakState", streakState); }, [streakState]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weekTemplateOverrides", weekTemplateOverrides); }, [weekTemplateOverrides]);
  useEffect(() => { if (!hasLoaded.current) return; persist("savedTemplates", savedTemplates); }, [savedTemplates]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mainGameHistory", mainGameHistory); }, [mainGameHistory]);
  useEffect(() => { if (!hasLoaded.current) return; persist("captionTemplates", captionTemplates); }, [captionTemplates]);
  useEffect(() => { if (!hasLoaded.current) return; persist("platformOptions", platformOptions); }, [platformOptions]);
  useEffect(() => { if (!hasLoaded.current) return; persist("ytDescriptions", ytDescriptions); }, [ytDescriptions]);
  useEffect(() => { if (!hasLoaded.current) return; persist("localProjects", localProjects); }, [localProjects]);
  useEffect(() => { if (!hasLoaded.current) return; persist("outputFolder", outputFolder); }, [outputFolder]);
  useEffect(() => { if (!hasLoaded.current) return; persist("sfxFolder", sfxFolder); }, [sfxFolder]);
  useEffect(() => { if (!hasLoaded.current) return; persist("renameHistory", renameHistory); }, [renameHistory]);
  useEffect(() => { if (!hasLoaded.current) return; persist("anthropicApiKey", anthropicApiKey); }, [anthropicApiKey]);
  useEffect(() => { if (!hasLoaded.current) return; persist("gatewayUrl", gatewayUrl); }, [gatewayUrl]);
  useEffect(() => { if (!hasLoaded.current) return; persist("gatewayAuthToken", gatewayAuthToken); }, [gatewayAuthToken]);
  useEffect(() => { if (!hasLoaded.current) return; persist("youtubeClientId", youtubeClientId); }, [youtubeClientId]);
  useEffect(() => { if (!hasLoaded.current) return; persist("youtubeClientSecret", youtubeClientSecret); }, [youtubeClientSecret]);
  useEffect(() => { if (!hasLoaded.current) return; persist("metaAppId", metaAppId); }, [metaAppId]);
  useEffect(() => { if (!hasLoaded.current) return; persist("metaAppSecret", metaAppSecret); }, [metaAppSecret]);
  useEffect(() => { if (!hasLoaded.current) return; persist("instagramAppId", instagramAppId); }, [instagramAppId]);
  useEffect(() => { if (!hasLoaded.current) return; persist("instagramAppSecret", instagramAppSecret); }, [instagramAppSecret]);
  useEffect(() => { if (!hasLoaded.current) return; persist("tiktokClientKey", tiktokClientKey); }, [tiktokClientKey]);
  useEffect(() => { if (!hasLoaded.current) return; persist("tiktokClientSecret", tiktokClientSecret); }, [tiktokClientSecret]);
  useEffect(() => { if (!hasLoaded.current) return; persist("styleGuide", styleGuide); }, [styleGuide]);
  useEffect(() => { if (!hasLoaded.current) return; persist("requireHashtagInTitle", requireHashtagInTitle); }, [requireHashtagInTitle]);

  // XP ledger append with idempotency — nothing is ever double-banked or removed (rank only climbs).
  const awardXp = useCallback((key, amount, reason, dateISO) => {
    setXpLedger((prev) => (prev.some((e) => e.key === key) ? prev : [...prev, { key, amount, reason, dateISO }]));
  }, []);

  // Lazy week rollover: evaluate completed weeks (goal bonus, streak, frozen recaps) on
  // launch and whenever tracker data changes. evaluateRollover is pure and returns
  // changed:false once stable, so this effect terminates.
  useEffect(() => {
    if (!loaded) return;
    const res = evaluateRollover({ trackerData, weekMeta, xpLedger, streakState, weeklyTarget, mainGame, today: new Date() });
    if (!res.changed) return;
    setWeekMeta(res.weekMeta);
    setStreakState(res.streakState);
    if (res.ledgerAppends.length > 0) {
      setXpLedger((prev) => {
        const have = new Set(prev.map((e) => e.key));
        const fresh = res.ledgerAppends.filter((e) => !have.has(e.key));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    }
  }, [loaded, trackerData, weekMeta, xpLedger, streakState, weeklyTarget, mainGame]);

  // ============ MAIN GAME SWITCH LOGGING ============
  const prevMainGame = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    if (prevMainGame.current === null) { prevMainGame.current = mainGame; return; }
    if (mainGame !== prevMainGame.current) {
      setMainGameHistory((prev) => [...prev, {
        date: localISO(new Date()),
        from: prevMainGame.current,
        to: mainGame,
      }]);
      prevMainGame.current = mainGame;
    }
  }, [mainGame, loaded]);

  // ============ HANDLERS ============
  const handleNewGame = (gd) => {
    setGamesDb((p) => [...p, { ...gd, entryType: gd.entryType || showAddGame || "game", dayCount: gd.entryType === "content" || showAddGame === "content" ? 0 : 1 }]);
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

  const handleUpdateClip = useCallback((projectId, clipId, status) => {
    const updateClips = (p) => ({
      ...p,
      clips: (p.clips || []).map((c) => (c.id === clipId ? { ...c, status } : c)),
    });
    setLocalProjects((prev) => prev.map((p) => p.id !== projectId ? p : updateClips(p)));
    // Also update selProj so ClipBrowser re-renders immediately
    setSelProj((prev) => prev && prev.id === projectId ? updateClips(prev) : prev);
    // Persist to project JSON on disk
    window.clipflow?.projectUpdateClip?.(projectId, clipId, { status }).catch(() => {});
  }, []);

  const handleEditClipTitle = useCallback((projectId, clipId, title) => {
    const updateClips = (p) => ({
      ...p,
      clips: (p.clips || []).map((c) => (c.id === clipId ? { ...c, title } : c)),
    });
    setLocalProjects((prev) => prev.map((p) => p.id !== projectId ? p : updateClips(p)));
    setSelProj((prev) => prev && prev.id === projectId ? updateClips(prev) : prev);
    // Persist to project JSON on disk
    window.clipflow?.projectUpdateClip?.(projectId, clipId, { title }).catch(() => {});
  }, []);

  const handleOpenInEditor = useCallback((projectId, clipId) => {
    setEditorContext({ projectId, clipId });
    setView("editor");
  }, []);

  // #125: open a raw recording in the editor (watch-only source-preview, no project/clip)
  const handleOpenSourcePreview = useCallback((path, label) => {
    setEditorContext({ sourcePreviewPath: path, label });
    setView("editor");
  }, []);

  // Refresh folder list from store (call after any folder mutation or project deletion)
  const refreshFolders = useCallback(async () => {
    const result = await window.clipflow.folderList();
    if (result?.folders) setProjectFolders(result.folders);
  }, []);

  // Delete projects by IDs
  const handleDeleteProjects = useCallback(async (projectIds) => {
    for (const id of projectIds) {
      try { await window.clipflow.projectDelete(id); } catch (_) { /* ignore */ }
    }
    setLocalProjects((prev) => prev.filter((p) => !projectIds.includes(p.id)));
    // If currently viewing a deleted project's clips, go back to list
    if (selProj && projectIds.includes(selProj.id)) {
      setSelProj(null);
      setView("projects");
    }
    // Reconcile folder references for deleted projects
    refreshFolders();
  }, [selProj, refreshFolders]);

  // Load full project data (with transcription + clips) when entering ClipBrowser
  const handleSelectProject = useCallback(async (project) => {
    let loaded = project; // fallback to summary
    try {
      const full = await window.clipflow.projectLoad(project.id);
      if (full && !full.error && full.project) {
        loaded = full.project;
        setLocalProjects((prev) => prev.map((p) => (p.id === project.id ? full.project : p)));
      }
    } catch (e) { /* use summary data as fallback */ }
    setSelProj(loaded);
    setView("clips");
  }, []);

  // Build allClips for QueueView — derived from localProjects (rendered clips)
  const allClips = React.useMemo(() => {
    const result = {};
    for (const proj of localProjects) {
      const rendered = (proj.clips || []).filter((c) => c.renderStatus === "rendered");
      if (rendered.length > 0) result[proj.id] = rendered;
    }
    return result;
  }, [localProjects]);

  // Scheduled clips for the Tracker Calendar's read-only future preview. scheduledAt is a local
  // ISO string "YYYY-MM-DDTHH:MM:00", so date/time slice without any UTC conversion.
  const scheduledClips = React.useMemo(() => {
    const to12h = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      const ap = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
    };
    return Object.values(allClips).flat()
      .filter((c) => c.scheduledAt)
      .map((c) => ({
        date: c.scheduledAt.slice(0, 10),
        time: to12h(c.scheduledAt.slice(11, 16)),
        title: c.title,
        // Lowercased to match gamesDb hashtags, same as QueueView's logPost does at publish.
        game: (c.gameTag || "").toLowerCase() || null,
      }));
  }, [allClips]);

  // Queue badge count: show unscheduled count (needs attention) — Phase 5 badge distinction.
  // Mirror QueueView's list filter (QueueView.js:505-535): exclude clips already
  // published/scheduled (tracked in trackerData by clipId or title) so the badge matches
  // the list (#139). Publishing never flips status out of "approved", so without this the
  // badge keeps counting already-published clips and inflates past the list count.
  const totalApproved = React.useMemo(() => {
    const trackedIds = new Set(trackerData.map((t) => t.clipId).filter(Boolean));
    const trackedTitles = new Set(trackerData.map((t) => t.title).filter(Boolean));
    return Object.values(allClips).flat().filter((c) =>
      (c.status === "approved" || c.status === "ready")
      && !c.scheduledAt
      && !trackedIds.has(c.id)
      && !trackedTitles.has(c.title)
    ).length;
  }, [allClips, trackerData]);

  const nav = (id) => { setView(id); setSelProj(null); try { posthog.capture("clipflow_tab_changed", { tab_name: id }); } catch (_) {} };

  const navItems = [
    { id: "rename", icon: "\u270f\ufe0f", label: "Rename" },
    { id: "recordings", icon: "\u2b06\ufe0f", label: "Recordings" },
    { id: "projects", icon: "\ud83d\udcc1", label: "Projects" },
    { id: "editor", icon: "\ud83c\udfac", label: "Editor" },
    { id: "queue", icon: "\ud83d\udccb", label: "Queue", badge: totalApproved },
    { id: "tracker", icon: "\ud83d\udcca", label: "Tracker" },
    { id: "settings", icon: "\u2699\ufe0f", label: "Settings" },
  ];

  // ClipBrowser is rendered conditionally because it's per-project — entering a
  // different project mounts a fresh tree, which is the right behavior. Every
  // other persistent tab is always-mounted in its own scroll container below
  // to preserve scrollTop across tab switches (#33).
  const renderClipBrowser = () => {
    if (view !== "clips" || !selProj) return null;
    const fromList = localProjects.find((p) => p.id === selProj.id);
    const proj = (selProj.clips?.length > 0) ? selProj : (fromList?.clips?.length > 0 ? fromList : selProj);
    if (!proj) return null;
    return (
      <ClipBrowser
        project={proj}
        onBack={() => { setSelProj(null); setView("projects"); }}
        onUpdateClip={handleUpdateClip}
        onTranscript={setTranscript}
        onEditClipTitle={handleEditClipTitle}
        onOpenInEditor={handleOpenInEditor}
        onBatchRender={async (projectId) => {
          try {
            const full = await window.clipflow.projectLoad(projectId);
            if (full?.project) setSelProj(full.project);
          } catch (e) { /* ignore */ }
        }}
        onDeleteClip={async (projectId, clipId) => {
          try {
            const r = await window.clipflow.projectDeleteClip(projectId, clipId);
            if (r?.error) { console.error("Delete clip failed:", r.error); return; }
            const full = await window.clipflow.projectLoad(projectId);
            if (full?.project) {
              setLocalProjects((prev) => prev.map((p) => p.id === projectId ? full.project : p));
              setSelProj((prev) => prev && prev.id === projectId ? full.project : prev);
            }
          } catch (e) { console.error("Delete clip failed:", e); }
        }}
        gamesDb={gamesDb}
        scrollToClipId={returnClipId}
      />
    );
  };

  // Helper: per-tab scroll container style. flex:1 + display:block when active,
  // collapsed when inactive. display:none preserves scrollTop in Chromium.
  const tabPaneStyle = (active) => ({
    flex: active ? 1 : "0 0 0",
    overflow: "auto",
    scrollbarGutter: "stable",
    display: active ? "block" : "none",
  });
  const showProjectsList = view === "projects" || (view === "clips" && !selProj);
  const showClipBrowser = view === "clips" && !!selProj;

  return (
    <div style={{ background: T.bg, height: "100vh", overflow: "hidden", color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
      {/* Draggable title bar with logo */}
      <div className="titlebar-drag" style={{ height: 36, flexShrink: 0, background: "rgba(10,11,16,0.8)", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", paddingLeft: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, boxShadow: "0 1px 8px rgba(139,92,246,0.3)" }}>⚡</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, letterSpacing: "-0.2px" }}>ClipFlow</span>
          {window.clipflow?.profile === "dev" && (
            <span style={{ fontSize: 9, fontWeight: 800, color: "#ff9500", background: "rgba(255,149,0,0.15)", border: "1px solid rgba(255,149,0,0.5)", padding: "1px 5px", borderRadius: 3, letterSpacing: "0.5px", marginLeft: 4 }}>DEV</span>
          )}
        </div>
      </div>
      <UpdateBanner />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "0 0 8px 8px" }}>
        {/* Each persistent tab is always-mounted with its OWN scroll container so
            scrollTop is preserved per-tab across switches (#33). display:none keeps
            scrollTop in Chromium. Editor is the only conditional non-clip view —
            it's heavy and per-clip. ClipBrowser is per-project and resets each entry. */}
        <div style={tabPaneStyle(view === "rename")}>
          <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
            <RenameView
              gamesDb={gamesDb}
              mainGameName={mainGame}
              pendingRenames={pendingRenames}
              setPendingRenames={setPendingRenames}
              renameHistory={renameHistory}
              setRenameHistory={setRenameHistory}
              onAddGame={(entryType) => setShowAddGame(entryType || "game")}
              onGameDayUpdate={handleGameDayUpdate}
              watchFolder={watchFolder}
              testWatchFolder={testWatchFolder}
            />
          </div>
        </div>
        <div style={tabPaneStyle(view === "recordings")}>
          <div style={{ padding: "32px 40px", margin: "0 auto" }}>
            <RecordingsView
              gamesDb={gamesDb}
              localProjects={localProjects}
              testWatchFolder={testWatchFolder}
              onOpenSourcePreview={handleOpenSourcePreview}
              onProjectCreated={(projectId) => {
                window.clipflow?.projectList().then((result) => {
                  if (result?.projects) setLocalProjects(result.projects);
                });
              }}
            />
          </div>
        </div>
        <div style={tabPaneStyle(view === "queue")}>
          <div style={{ padding: "32px 40px", maxWidth: 1120, margin: "0 auto" }}>
            <QueueView
              allClips={allClips}
              localProjects={localProjects}
              setLocalProjects={setLocalProjects}
              mainGame={mainGame}
              mainGameTag={mainGameTag}
              platforms={platforms}
              trackerData={trackerData}
              setTrackerData={setTrackerData}
              weeklyTemplate={weeklyTemplate}
              weekTemplateOverrides={weekTemplateOverrides}
              ytDescriptions={ytDescriptions}
              setYtDescriptions={setYtDescriptions}
              captionTemplates={captionTemplates}
              setCaptionTemplates={setCaptionTemplates}
              platformOptions={platformOptions}
              setPlatformOptions={setPlatformOptions}
              gamesDb={gamesDb}
              awardXp={awardXp}
            />
          </div>
        </div>
        <div style={tabPaneStyle(view === "tracker")}>
          <div style={{ padding: "32px 40px", maxWidth: 960, margin: "0 auto" }}>
            <TrackerView
              mainGame={mainGame}
              setMainGame={setMainGame}
              mainGameTag={mainGameTag}
              trackerData={trackerData}
              setTrackerData={setTrackerData}
              weeklyTemplate={weeklyTemplate}
              setWeeklyTemplate={setWeeklyTemplate}
              weekTemplateOverrides={weekTemplateOverrides}
              setWeekTemplateOverrides={setWeekTemplateOverrides}
              savedTemplates={savedTemplates}
              setSavedTemplates={setSavedTemplates}
              gamesDb={gamesDb}
              weeklyTarget={weeklyTarget}
              setWeeklyTarget={setWeeklyTarget}
              weekMeta={weekMeta}
              setWeekMeta={setWeekMeta}
              xpLedger={xpLedger}
              awardXp={awardXp}
              streakState={streakState}
              scheduledClips={scheduledClips}
            />
          </div>
        </div>
        <div style={tabPaneStyle(view === "settings")}>
          <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
            <SettingsView
              mainGame={mainGame}
              setMainGame={setMainGame}
              mainPool={mainPool}
              setMainPool={setMainPool}
              gamesDb={gamesDb}
              setGamesDb={setGamesDb}
              onEditGame={handleEditGame}
              onAddGame={(entryType) => setShowAddGame(entryType || "game")}
              watchFolder={watchFolder}
              setWatchFolder={setWatchFolder}
              testWatchFolder={testWatchFolder}
              setTestWatchFolder={setTestWatchFolder}
              platforms={platforms}
              setPlatforms={setPlatforms}
              outputFolder={outputFolder}
              setOutputFolder={setOutputFolder}
              sfxFolder={sfxFolder}
              setSfxFolder={setSfxFolder}
              anthropicApiKey={anthropicApiKey}
              setAnthropicApiKey={setAnthropicApiKey}
              gatewayUrl={gatewayUrl}
              setGatewayUrl={setGatewayUrl}
              gatewayAuthToken={gatewayAuthToken}
              setGatewayAuthToken={setGatewayAuthToken}
              youtubeClientId={youtubeClientId}
              setYoutubeClientId={setYoutubeClientId}
              youtubeClientSecret={youtubeClientSecret}
              setYoutubeClientSecret={setYoutubeClientSecret}
              metaAppId={metaAppId}
              setMetaAppId={setMetaAppId}
              metaAppSecret={metaAppSecret}
              setMetaAppSecret={setMetaAppSecret}
              instagramAppId={instagramAppId}
              setInstagramAppId={setInstagramAppId}
              instagramAppSecret={instagramAppSecret}
              setInstagramAppSecret={setInstagramAppSecret}
              tiktokClientKey={tiktokClientKey}
              setTiktokClientKey={setTiktokClientKey}
              tiktokClientSecret={tiktokClientSecret}
              setTiktokClientSecret={setTiktokClientSecret}
              styleGuide={styleGuide}
              setStyleGuide={setStyleGuide}
              requireHashtagInTitle={requireHashtagInTitle}
              setRequireHashtagInTitle={setRequireHashtagInTitle}
              collapsedGroups={settingsCollapsed}
              setCollapsedGroups={setSettingsCollapsed}
              isActive={view === "settings"}
            />
          </div>
        </div>
        <div style={tabPaneStyle(showProjectsList)}>
          <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
            <ProjectsListView
              localProjects={localProjects}
              setLocalProjects={setLocalProjects}
              projectFolders={projectFolders}
              activeFolder={activeFolder}
              onSelectFolder={setActiveFolder}
              onFoldersChanged={refreshFolders}
              onSelect={handleSelectProject}
              onDeleteProjects={handleDeleteProjects}
              mainGame={mainGame}
              gamesDb={gamesDb}
            />
          </div>
        </div>
        {/* ClipBrowser — per-project; conditional render so each project is fresh */}
        {showClipBrowser && (
          <div style={{ flex: 1, overflow: "auto", scrollbarGutter: "stable" }}>
            <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
              {renderClipBrowser()}
            </div>
          </div>
        )}
        {/* Editor — full-pane sibling, only mounted when active */}
        {view === "editor" && (
          <div style={{ flex: 1, overflow: "hidden", height: "100%" }}>
            <EditorView gamesDb={gamesDb} editorContext={editorContext} localProjects={localProjects} anthropicApiKey={anthropicApiKey} styleGuide={styleGuide} requireHashtagInTitle={requireHashtagInTitle} onBack={async () => {
              if (editorContext?.projectId) {
                try {
                  const full = await window.clipflow.projectLoad(editorContext.projectId);
                  if (full?.project) {
                    setLocalProjects((prev) => prev.map((p) => p.id === editorContext.projectId ? full.project : p));
                    setSelProj((prev) => prev && prev.id === editorContext.projectId ? full.project : prev);
                  }
                } catch (e) { console.error("Failed to refresh project after editor:", e); }
              }
              // #125: source-preview opened from Recordings → return there, not Clips
              const backTo = editorContext?.sourcePreviewPath ? "recordings" : "clips";
              setReturnClipId(editorContext?.clipId || null); // land the clip list on this clip
              setEditorContext(null); setView(backTo);
            }} onClipRendered={async (projectId) => {
              try {
                const full = await window.clipflow.projectLoad(projectId);
                if (full?.project) {
                  setLocalProjects((prev) => prev.map((p) => p.id === projectId ? full.project : p));
                  setSelProj((prev) => prev && prev.id === projectId ? full.project : prev);
                }
              } catch (e) { console.error("Failed to refresh project after render:", e); }
            }} />
          </div>
        )}
        <Sidebar
          navItems={navItems}
          activeView={view === "clips" ? "projects" : view}
          onNavigate={nav}
        />
      </div>
      {onboardingComplete === false && (
        <OnboardingView onComplete={(profile) => {
          setOnboardingComplete(true);
        }} />
      )}
      <TranscriptModal clip={transcript} onClose={() => setTranscript(null)} />
      {(newGameExe || showAddGame) && (
        <AddGameModal
          exe={newGameExe}
          entryType={showAddGame || "game"}
          onConfirm={handleNewGame}
          onDismiss={() => { setNewGameExe(null); setShowAddGame(null); }}
          onIgnore={newGameExe ? (exe) => { setIgnoredProcesses((p) => [...p, exe]); setNewGameExe(null); } : null}
        />
      )}
      {audioCalAsk && (
        <AudioCalibrationModal
          filePath={audioCalAsk.filePath}
          trackCount={audioCalAsk.trackCount}
          hasExisting={audioCalAsk.hasExisting}
          onComplete={(setup) => respondAudioCal(setup)}
          onCancel={() => respondAudioCal(null)}
        />
      )}
      {degradeAsk && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius?.md || 10, padding: 24, maxWidth: 520, width: "90%", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ color: T.text, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              ⚠️ Signal extraction failed
            </div>
            <div style={{ color: T.textSecondary, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
              {degradeAsk.failed.length} of 5 signal{degradeAsk.failed.length === 1 ? "" : "s"} failed during extraction. Generating clips now will rely on the surviving signals only — quality may degrade.
            </div>
            <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", marginBottom: 16, fontSize: 12, fontFamily: T.mono, color: T.textTertiary, maxHeight: 140, overflowY: "auto" }}>
              {degradeAsk.failed.map((f, i) => (
                <div key={i} style={{ padding: "2px 0" }}>
                  <span style={{ color: T.red }}>❌</span>{" "}
                  <span style={{ color: T.text }}>{f.signal}</span>
                  <span style={{ color: T.textTertiary }}> &mdash; {f.failureReason}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => respondDegrade(false)}
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
              >
                Cancel pipeline
              </button>
              <button
                onClick={() => respondDegrade(true)}
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid rgba(250,204,21,0.4)`, background: "rgba(250,204,21,0.16)", color: "#facc15", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}
              >
                Generate clips anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
