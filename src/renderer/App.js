import React, { useState } from "react";
import T from "./styles/theme";
import Sidebar from "./components/Sidebar";
import RenameView from "./views/RenameView";
import PlaceholderView from "./views/PlaceholderView";

// Default data — will be replaced with electron-store persistence
const INITIAL_GAMES = [
  { name: "Arc Raiders", tag: "AR", exe: ["ArcRaiders.exe"], color: "#ff6b35", dayCount: 24, hashtag: "arcraiders" },
  { name: "Rocket League", tag: "RL", exe: ["RocketLeague.exe"], color: "#00b4d8", dayCount: 31, hashtag: "rocketleague" },
  { name: "Valorant", tag: "Val", exe: ["VALORANT-Win64-Shipping.exe"], color: "#ff4655", dayCount: 42, hashtag: "valorant" },
  { name: "Egging On", tag: "EO", exe: ["EggingOn.exe"], color: "#ffd23f", dayCount: 3, hashtag: "eggingon" },
  { name: "Deadline Delivery", tag: "DD", exe: ["DeadlineDelivery.exe"], color: "#fca311", dayCount: 14, hashtag: "deadlinedelivery" },
  { name: "Bionic Bay", tag: "BB", exe: ["BionicBay.exe"], color: "#06d6a0", dayCount: 7, hashtag: "bionicbay" },
  { name: "Prince of Persia", tag: "PoP", exe: ["PrinceOfPersia.exe"], color: "#9b5de5", dayCount: 8, hashtag: "princeofpersia" },
];

export default function App() {
  const [view, setView] = useState("rename");
  const [mainGame, setMainGame] = useState("Arc Raiders");
  const [gamesDb, setGamesDb] = useState(INITIAL_GAMES);

  const navItems = [
    { id: "rename", icon: "✏️", label: "Rename" },
    { id: "upload", icon: "⬆️", label: "Upload" },
    { id: "projects", icon: "📁", label: "Projects" },
    { id: "queue", icon: "📋", label: "Queue" },
    { id: "captions", icon: "🏷️", label: "Captions" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  const renderView = () => {
    switch (view) {
      case "rename":
        return (
          <RenameView
            gamesDb={gamesDb}
            onAddGame={(game) => setGamesDb((prev) => [...prev, game])}
          />
        );
      case "upload":
        return <PlaceholderView title="Upload & Clip" subtitle="Coming next — upload to R2, send to Vizard AI" />;
      case "projects":
        return <PlaceholderView title="Projects" subtitle="Coming next — browse Vizard projects and review clips" />;
      case "queue":
        return <PlaceholderView title="Queue & Schedule" subtitle="Coming next — schedule clips, tracker, CSV import/export" />;
      case "captions":
        return <PlaceholderView title="Captions & Descriptions" subtitle="Coming next — YouTube descriptions, platform templates" />;
      case "settings":
        return <PlaceholderView title="Settings" subtitle="Coming next — game library, platforms, watch folder config" />;
      default:
        return <PlaceholderView title="ClipFlow" subtitle="Select a tab" />;
    }
  };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: T.font, display: "flex" }}>
      <Sidebar
        navItems={navItems}
        activeView={view}
        onNavigate={setView}
        mainGame={mainGame}
      />
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
          {renderView()}
        </div>
      </div>
    </div>
  );
}
