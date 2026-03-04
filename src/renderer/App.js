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
  { name: "Arc Raiders", tag: "AR", exe: ["ArcRaiders.exe"], color: "#ff6b35", dayCount: 24, hashtag: "arcraiders" },
  { name: "Rocket League", tag: "RL", exe: ["RocketLeague.exe"], color: "#00b4d8", dayCount: 31, hashtag: "rocketleague" },
  { name: "Valorant", tag: "Val", exe: ["VALORANT-Win64-Shipping.exe"], color: "#ff4655", dayCount: 42, hashtag: "valorant" },
  { name: "Egging On", tag: "EO", exe: ["EggingOn.exe"], color: "#ffd23f", dayCount: 3, hashtag: "eggingon" },
  { name: "Deadline Delivery", tag: "DD", exe: ["DeadlineDelivery.exe"], color: "#fca311", dayCount: 14, hashtag: "deadlinedelivery" },
  { name: "Bionic Bay", tag: "BB", exe: ["BionicBay.exe"], color: "#06d6a0", dayCount: 7, hashtag: "bionicbay" },
  { name: "Prince of Persia", tag: "PoP", exe: ["PrinceOfPersia.exe"], color: "#9b5de5", dayCount: 8, hashtag: "princeofpersia" },
];
const INITIAL_MAIN_POOL = ["Arc Raiders", "Rocket League", "Valorant"];
const INITIAL_IGNORED = ["explorer.exe", "steamwebhelper.exe", "dwm.exe", "ShellExperienceHost.exe", "zen.exe"];
const PUBLISH_ORDER_INIT = [
  { key: "youtube1", platform: "YouTube", abbr: "YT", name: "Fega", connected: true },
  { key: "instagram", platform: "Instagram", abbr: "IG", name: "fegagaming", connected: true },
  { key: "facebook", platform: "Facebook", abbr: "FB", name: "Fega Gaming", connected: true },
  { key: "tiktok1", platform: "TikTok", abbr: "TT", name: "fega", connected: true },
  { key: "youtube2", platform: "YouTube", abbr: "YT", name: "ThatGuy", connected: true },
  { key: "tiktok2", platform: "TikTok", abbr: "TT", name: "thatguyfega", connected: true },
];
const DEFAULT_TEMPLATE = {
  Monday: ["main","main","main","main","main","main","main","main"],
  Tuesday: ["main","other","main","other","main","other","main","main"],
  Wednesday: ["main","other","other","main","other","other","other","main"],
  Thursday: ["main","other","other","main","other","other","main","main"],
  Friday: ["main","other","other","main","other","other","other","main"],
  Saturday: ["main","other","main","other","main","other","main","main"],
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

const MOCK_PENDING = [
  { id: "r1", fileName: "2026-03-03 17-02-33.mp4", detectedExe: "ArcRaiders.exe", game: "Arc Raiders", tag: "AR", day: 25, part: 1, color: "#ff6b35", createdAt: "2026-03-03T17:02:33" },
  { id: "r2", fileName: "2026-03-03 17-32-33.mp4", detectedExe: "ArcRaiders.exe", game: "Arc Raiders", tag: "AR", day: 25, part: 2, color: "#ff6b35", createdAt: "2026-03-03T17:32:33" },
  { id: "r3", fileName: "2026-03-03 18-02-33.mp4", detectedExe: "ArcRaiders.exe", game: "Arc Raiders", tag: "AR", day: 25, part: 3, color: "#ff6b35", createdAt: "2026-03-03T18:02:33" },
];
const MOCK_HISTORY = [
  { id: "h1", oldName: "2026-03-02 17-05-12.mp4", newName: "2026-03-02 AR Day24 Pt1.mp4", game: "Arc Raiders", tag: "AR", color: "#ff6b35", day: 24, part: 1, time: "5:05 PM", undone: false },
  { id: "h2", oldName: "2026-03-02 17-35-12.mp4", newName: "2026-03-02 AR Day24 Pt2.mp4", game: "Arc Raiders", tag: "AR", color: "#ff6b35", day: 24, part: 2, time: "5:35 PM", undone: false },
  { id: "h3", oldName: "2026-03-01 17-00-45.mp4", newName: "2026-03-01 RL Day31 Pt1.mp4", game: "Rocket League", tag: "RL", color: "#00b4d8", day: 31, part: 1, time: "5:00 PM", undone: false },
];
const MOCK_MANAGED = [
  { id: "m1", name: "2026-02-04 AR Day19 Pt1.mp4", tag: "AR", game: "Arc Raiders", color: "#ff6b35", day: 19, part: 1, folder: "2026-02", createdAt: "2026-02-04T17:00:00" },
  { id: "m2", name: "2026-02-04 AR Day19 Pt2.mp4", tag: "AR", game: "Arc Raiders", color: "#ff6b35", day: 19, part: 2, folder: "2026-02", createdAt: "2026-02-04T17:30:00" },
  { id: "m3", name: "2026-02-04 AR Day19 Pt3.mp4", tag: "AR", game: "Arc Raiders", color: "#ff6b35", day: 19, part: 3, folder: "2026-02", createdAt: "2026-02-04T18:00:00" },
  { id: "m4", name: "2026-02-05 AR Day20 Pt1.mp4", tag: "AR", game: "Arc Raiders", color: "#ff6b35", day: 20, part: 1, folder: "2026-02", createdAt: "2026-02-05T17:00:00" },
];
const MOCK_CLIPS = {
  p1: [
    { id: "c1", title: "The Shoot First Strategy Paid Off! #arcraiders", viralScore: 10, duration: 42, transcript: "Think first, shoot later...", status: "none", game: "Arc Raiders" },
    { id: "c2", title: "I Lost 12 Games of Chess in One Night... #arcraiders", viralScore: 7.9, duration: 31, transcript: "Let's go...", status: "approved", game: "Arc Raiders" },
    { id: "c3", title: "The Ammo Heist That Changed Everything #arcraiders", viralScore: 8.4, duration: 38, transcript: "Alright...", status: "approved", game: "Arc Raiders" },
    { id: "c4", title: "When Your Teammate Steals Your Loot #arcraiders", viralScore: 8.7, duration: 35, transcript: "Yo cover me...", status: "none", game: "Arc Raiders" },
    { id: "c5", title: "untitled clip", viralScore: 6.1, duration: 38, transcript: "Walking...", status: "rejected", game: "Arc Raiders" },
  ],
  p2: [
    { id: "c6", title: "NO WAY That Grenade Worked #arcraiders", viralScore: 9.0, duration: 37, transcript: "No way...", status: "approved", game: "Arc Raiders" },
    { id: "c7", title: "The Panic Extract #arcraiders", viralScore: 8.6, duration: 31, transcript: "THEY'RE...", status: "none", game: "Arc Raiders" },
    { id: "c8", title: "betrayed by my own teammate #arcraiders", viralScore: 8.3, duration: 45, transcript: "Bro...", status: "none", game: "Arc Raiders" },
  ],
  p3: [
    { id: "c9", title: "calculated. #rocketleague", viralScore: 8.9, duration: 28, transcript: "BOOM!", status: "approved", game: "Rocket League" },
    { id: "c10", title: "my own goal was so bad #rocketleague", viralScore: 8.5, duration: 33, transcript: "Easy...", status: "none", game: "Rocket League" },
  ],
};

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

  // Rename state
  const [pendingRenames, setPendingRenames] = useState(MOCK_PENDING);
  const [renameHistory, setRenameHistory] = useState(MOCK_HISTORY);
  const [managedFiles, setManagedFiles] = useState(MOCK_MANAGED);

  // Projects / Clips
  const [clips, setClips] = useState(MOCK_CLIPS);
  const [transcript, setTranscript] = useState(null);

  // Add Game modal
  const [showAddGame, setShowAddGame] = useState(false);
  const [newGameExe, setNewGameExe] = useState(null);

  // Settings
  const [ignoredProcesses, setIgnoredProcesses] = useState(INITIAL_IGNORED);
  const [watchFolder, setWatchFolder] = useState("W:\\YouTube Gaming Recordings Onward\\Vertical Recordings Onwards");
  const [platforms, setPlatforms] = useState(PUBLISH_ORDER_INIT);

  // Queue / Tracker
  const [weeklyTemplate, setWeeklyTemplate] = useState(JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)));
  const [trackerData, setTrackerData] = useState([]);

  // Captions
  const [captionTemplates, setCaptionTemplates] = useState({
    tiktok: "{title} #{gametitle} #fyp #gamingontiktok #fega",
    instagram: "{title} #{gametitle} #reels #gamingreels #fega",
    facebook: "{title} #{gametitle} #gaming #fbreels #fega",
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
        if (all.platforms) setPlatforms(all.platforms);
        if (all.weeklyTemplate) setWeeklyTemplate(all.weeklyTemplate);
        if (all.trackerData) setTrackerData(all.trackerData);
        if (all.captionTemplates) setCaptionTemplates(all.captionTemplates);
        // For ytDescriptions: merge real defaults with any saved overrides
        if (all.ytDescriptions && Object.keys(all.ytDescriptions).length > 0) {
          setYtDescriptions({ ...REAL_YT_DESCRIPTIONS, ...all.ytDescriptions });
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
      setLoaded(true);
    };
    load();
  }, []);

  // ============ AUTO-SAVE TO ELECTRON-STORE ============
  // Use a ref to track if we've loaded, to avoid saving defaults on first render
  const hasLoaded = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (!hasLoaded.current) { hasLoaded.current = true; return; }
    persist("watchFolder", watchFolder);
  }, [watchFolder, loaded]);
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist("mainGame", mainGame);
  }, [mainGame]);
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist("mainPool", mainPool);
  }, [mainPool]);
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist("gamesDb", gamesDb);
  }, [gamesDb]);
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist("ignoredProcesses", ignoredProcesses);
  }, [ignoredProcesses]);
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist("platforms", platforms);
  }, [platforms]);
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist("weeklyTemplate", weeklyTemplate);
  }, [weeklyTemplate]);
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist("trackerData", trackerData);
  }, [trackerData]);
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist("captionTemplates", captionTemplates);
  }, [captionTemplates]);
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist("ytDescriptions", ytDescriptions);
  }, [ytDescriptions]);

  // Handlers
  const handleNewGame = (gd) => {
    setGamesDb((p) => [...p, { ...gd, dayCount: 1 }]);
    setYtDescriptions((p) => ({ ...p, [gd.name]: { desc: `\u{1F534}Live every day 5PM\nFunniest ${gd.name} moments\u{1F602}` } }));
    setNewGameExe(null);
    setShowAddGame(false);
  };
  const handleEditGame = (u) => setGamesDb((p) => p.map((g) => (g.name === u.name ? u : g)));
  const updateClip = (id, status) => setClips((p) => {
    const n = {};
    for (const [k, v] of Object.entries(p)) n[k] = v.map((c) => (c.id === id ? { ...c, status } : c));
    return n;
  });
  const editTitle = (id, title) => setClips((p) => {
    const n = {};
    for (const [k, v] of Object.entries(p)) n[k] = v.map((c) => (c.id === id ? { ...c, title } : c));
    return n;
  });

  const totalApproved = Object.values(clips).flat().filter((c) => (c.status === "approved" || c.status === "ready") && hasHashtag(c.title)).length;

  const nav = (id) => { setView(id); setSelProj(null); };

  const navItems = [
    { id: "rename", icon: "✏️", label: "Rename" },
    { id: "upload", icon: "⬆️", label: "Upload" },
    { id: "projects", icon: "📁", label: "Projects" },
    { id: "queue", icon: "📋", label: "Queue", badge: totalApproved },
    { id: "captions", icon: "🏷️", label: "Captions" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  const renderView = () => {
    if (view === "rename") {
      return (
        <RenameView
          gamesDb={gamesDb}
          pendingRenames={pendingRenames}
          setPendingRenames={setPendingRenames}
          renameHistory={renameHistory}
          setRenameHistory={setRenameHistory}
          onAddGame={() => setShowAddGame(true)}
          managedFiles={managedFiles}
          setManagedFiles={setManagedFiles}
          watchFolder={watchFolder}
        />
      );
    }
    if (view === "upload") return <UploadView watchFolder={watchFolder} gamesDb={gamesDb} />;
    if (view === "queue") {
      return (
        <QueueView
          allClips={clips}
          mainGame={mainGame}
          mainGameTag={mainGameTag}
          platforms={platforms}
          trackerData={trackerData}
          setTrackerData={setTrackerData}
          weeklyTemplate={weeklyTemplate}
          setWeeklyTemplate={setWeeklyTemplate}
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
          ignoredProcesses={ignoredProcesses}
          setIgnoredProcesses={setIgnoredProcesses}
          platforms={platforms}
          setPlatforms={setPlatforms}
        />
      );
    }
    if (selProj && clips[selProj.id]) {
      return (
        <ClipBrowser
          project={selProj}
          clips={clips[selProj.id]}
          onBack={() => { setSelProj(null); setView("projects"); }}
          onUpdate={updateClip}
          onTranscript={setTranscript}
          onEditTitle={editTitle}
        />
      );
    }
    return (
      <ProjectsListView
        onSelect={(p) => { setSelProj(p); setView("clips"); }}
        clips={clips}
        mainGame={mainGame}
      />
    );
  };

  return (
    <div style={{ background: T.bg, height: "100vh", overflow: "hidden", color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Draggable title bar */}
      <div className="titlebar-drag" style={{ height: 36, flexShrink: 0, background: "rgba(10,11,16,0.8)" }} />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar
          navItems={navItems}
          activeView={view === "clips" ? "projects" : view}
          onNavigate={nav}
          mainGame={mainGame}
        />
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
            {renderView()}
          </div>
        </div>
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
