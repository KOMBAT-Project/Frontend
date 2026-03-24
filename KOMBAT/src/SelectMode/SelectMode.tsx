import React, { useState } from "react";
import "./SelectMode.css";
import GameSettings, { type GameConfigData } from "../Gamesetting/GameSetting"; 

// --- Icons Components (SVG) ---
const IconDuel = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mode-icon-svg"
  >
    <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
    <path d="M13 19l6-6" />
    <path d="M16 16l4 4" />
    <path d="M19 21l2-2" />
  </svg>
);

const IconSolitaire = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mode-icon-svg"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconAuto = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mode-icon-svg"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <path d="M10 9l2 2 4-4" />
  </svg>
);

const IconSetting = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mode-icon-svg"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// --- Interface Props ---
interface ModeSelectProps {
  onConfirm: (mode: string) => void;
  onBack: () => void;
  onConfigUpdate?: (config: GameConfigData) => void;
  currentConfig: GameConfigData;
}

interface ModeData {
  id: "duel" | "solitaire" | "auto" | "setting";
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
}

const ModeSelect: React.FC<ModeSelectProps> = ({
  onConfirm,
  onBack,
  onConfigUpdate,
  currentConfig,
}) => {
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const modes: ModeData[] = [
    {
      id: "duel",
      title: "HOST DUEL",
      subtitle: "CREATE PvP ROOM",
      description: "Generate a secure room code and wait an opponent to your battlefield.",
      icon: <IconDuel />,
    },
    {
      id: "solitaire",
      title: "SOLITAIRE",
      subtitle: "SINGLE PLAYER",
      description: "Test your strategy against the environment alone.",
      icon: <IconSolitaire />,
    },
    {
      id: "auto",
      title: "AUTO",
      subtitle: "SIMULATION",
      description: "Let the AI command your troops in a simulated battle.",
      icon: <IconAuto />,
    },
    {
      id: "setting",
      title: "SETTING",
      subtitle: "SYSTEM CONFIG",
      description: "Adjust system parameters and economy protocols.",
      icon: <IconSetting />,
    },
  ];

  const handleActionClick = (modeId: string) => {
    if (modeId === "setting") {
      setIsSettingsOpen(true);
    } else {
      onConfirm(modeId); // ── เมื่อกด duel ส่งไป App.tsx จะกลายเป็น Role HOST อัตโนมัติ ──
    }
  };

  const handleSaveConfig = (newConfig: GameConfigData) => {
    console.log("Configuration Updated:", newConfig);
    if (onConfigUpdate) {
      onConfigUpdate(newConfig);
    }
  };

  return (
    <div className="mode-screen">
      <div className="mode-header">
        <h1 className="mode-title">SELECT GAME MODE</h1>
        <p className="mode-subtitle">CHOOSE YOUR BATTLEFIELD PROTOCOL</p>
      </div>

      <div className="mode-container">
        {modes.map((mode) => (
          <div
            key={mode.id}
            className={`mode-card ${mode.id} ${selectedMode === mode.id ? "active" : ""}`}
            onClick={() => setSelectedMode(mode.id)}
          >
            <div className="mode-icon-wrapper">{mode.icon}</div>
            <h2 className="mode-name">{mode.title}</h2>
            <span className="mode-type">{mode.subtitle}</span>
            <p className="mode-desc">{mode.description}</p>

            <button
              className="mode-btn"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMode(mode.id);
                handleActionClick(mode.id);
              }}
            >
              {mode.id === "setting"
                ? "CONFIGURE"
                : selectedMode === mode.id
                  ? "CONFIRM"
                  : "SELECT"}
            </button>

            <div className="card-deco-top"></div>
            <div className="card-deco-bottom"></div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "40px", zIndex: 20, display: "flex", gap: "20px" }}>
        <button className="back-btn" onClick={onBack}>
          &lt; BACK TO CONFIG
        </button>
      </div>

      {/* --- Setting Modal --- */}
      <GameSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveConfig}
        currentConfig={currentConfig}
      />
    </div>
  );
};

export default ModeSelect;