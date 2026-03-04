import React, { useState } from "react";
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

// ============ INITIAL DATA ============
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

export default function App() {
  // Navigation
  const [view, setView] = useState("rename");
  const [selProj, setSelProj] = useState(null);

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
  const [ytDescriptions, setYtDescriptions] = useState({
    "Arc Raiders": { desc: "🔴Live every day 5PM\nFunniest Arc Raiders moments😂" },
    "Rocket League": { desc: "🔴Live every day 5PM\nFunniest Rocket League moments😂" },
    "Valorant": { desc: "🔴Live every day 5PM\nFunniest Valorant moments😂" },
    "Egging On": { desc: "🔴Live every day 5PM\nFunniest Egging On moments😂" },
    "Deadline Delivery": { desc: "🔴Live every day 5PM\nFunniest Deadline Delivery moments😂" },
    "Bionic Bay": { desc: "🔴Live every day 5PM\nFunniest Bionic Bay moments😂" },
  });

  // Handlers
  const handleNewGame = (gd) => {
    setGamesDb((p) => [...p, { ...gd, dayCount: 1 }]);
    setYtDescriptions((p) => ({ ...p, [gd.name]: { desc: `🔴Live every day 5PM\nFunniest ${gd.name} moments😂` } }));
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
    if (view === "upload") return <UploadView />;
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
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: T.font, display: "flex" }}>
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
