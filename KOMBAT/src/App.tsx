import { useState } from "react";
import Lobby from "./Lobby/Lobby";
import AmountTypeMinion from "./AmountTypeMinions/AmountTypeMinion";
import MinionConfig from "./MinionConfig/MinionConfig";
import ModeSelect from "../src/SelectMode/SelectMode";
import GameScreenDuel from "./Gamescreen/GameScreenduel";
import GameScreenSolitaire from "./Gamescreen/Gamescreensolitaire";
import GameScreenAuto from "./Gamescreen/Gamescreenauto";
import { startGame } from "./api/gameApi";

// Import Settings และ Type
import GameSettings, { type GameConfigData } from "./Gamesetting/GameSetting";

// ค่า Default เริ่มต้น
const DEFAULT_CONFIG: GameConfigData = {
  spawnCost: 100,
  hexPurchaseCost: 1000,
  initBudget: 10000,
  initHp: 100,
  turnBudget: 90,
  maxBudget: 23456,
  interestPct: 5,
  maxTurns: 69,
  maxSpawns: 47,
};

// ยุบ GAME1, GAME2, GAME3 ให้เหลือแค่ GAME เดียว
type ScreenState =
  | "LOBBY"
  | "SELECT_MINIONS"
  | "CONFIG_MINIONS"
  | "SELECTMODE"
  | "DUEL"
  | "SOLITAIRE"
  | "AUTO";

function App() {
  const [screen, setScreen] = useState<ScreenState>("LOBBY");

  // State สำหรับ System Config
  const [gameConfig, setGameConfig] = useState<GameConfigData>(DEFAULT_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // State สำหรับเก็บทีมที่เลือก
  const [selectedTeam, setSelectedTeam] = useState<number[]>([]);

  const [teamConfig, setTeamConfig] = useState<any>({});
  const [gameMode, setGameMode] = useState<string>("");

  // const handleAbortMission = () => {
  //   setScreen("LOBBY");
  //   setSelectedTeam([]);
  //   setTeamConfig({});
  //   setGameMode("");
  // };

  // const handleBackToModeSelect = () => {
  //   setScreen("SELECTMODE");
  //   setGameMode("");
  // };

  const handleConfirmMode = async (mode: string) => {
    console.log("🚀 handleConfirmMode called with mode:", mode); // เพิ่ม
    console.log("📦 teamConfig:", teamConfig); // เพิ่ม
    console.log("⚙️ gameConfig:", gameConfig); // เพิ่ม
    try {
      const result = await startGame({
        gameMode: mode,
        config: gameConfig,
        minionConfig: teamConfig,
      });
      console.log("✅ startGame success:", result);
      setGameMode(mode);
      if (mode === "duel") setScreen("DUEL");
      else if (mode === "solitaire") setScreen("SOLITAIRE");
      else if (mode === "auto") setScreen("AUTO");
    } catch (err) {
      console.error("❌ Failed to start game:", err);
      alert("ไม่สามารถเชื่อมต่อ Backend ได้!");
    }
  };

  return (
    <div className="game-wrapper">
      {/* Settings Modal */}
      <GameSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentConfig={gameConfig}
        onSave={(newConfig) => {
          setGameConfig(newConfig);
          console.log("System Config Updated:", newConfig);
        }}
      />

      {/* 1. LOBBY */}
      {screen === "LOBBY" && (
        <Lobby
          onStartGame={() => setScreen("SELECT_MINIONS")}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}

      {/* ปุ่มเปิด Settings แบบลอย (เผื่อ Lobby ยังไม่มีปุ่ม) */}
      {screen === "LOBBY" && (
        <button
          style={{
            position: "fixed",
            top: 10,
            right: 10,
            zIndex: 100,
            padding: "10px",
            cursor: "pointer",
          }}
          onClick={() => setIsSettingsOpen(true)}
        >
          ⚙️ CONFIG
        </button>
      )}

      {/* 2. SELECT MINIONS */}
      {screen === "SELECT_MINIONS" && (
        <AmountTypeMinion
          selectedTeam={selectedTeam}
          setSelectedTeam={setSelectedTeam}
          onConfirm={() => setScreen("CONFIG_MINIONS")}
          onBack={() => setScreen("LOBBY")}
        />
      )}

      {/* 3. CONFIGURATION */}
      {screen === "CONFIG_MINIONS" && (
        <MinionConfig
          selectedTeam={selectedTeam}
          onConfirm={(config) => {
            setTeamConfig(config);
            setScreen("SELECTMODE");
          }}
          onBack={() => setScreen("SELECT_MINIONS")}
        />
      )}

      {/* 4. MODE SELECTION */}
      {screen === "SELECTMODE" && (
        <ModeSelect
          currentConfig={gameConfig} // <--- ส่งค่าให้ SelectMode
          onConfigUpdate={(newConfig) => {
            setGameConfig(newConfig); // <--- อัปเดต State หลักเมื่อ Save จากหน้านี้
            console.log("System Config Updated from Mode Select:", newConfig);
          }}
          onConfirm={handleConfirmMode} //<--from top
          onBack={() => setScreen("CONFIG_MINIONS")}
        />
      )}
      {/* 5. GAME SCREEN */}
      {screen === "DUEL" && gameMode === "duel"      && <GameScreenDuel      gameMode={gameMode} config={gameConfig} userDeck={selectedTeam} minionConfig={teamConfig} onLeave={() => setScreen("SELECTMODE")} onReturnLobby={() => setScreen("LOBBY")} />}
      {screen === "SOLITAIRE" && gameMode === "solitaire" && <GameScreenSolitaire config={gameConfig} userDeck={selectedTeam} minionConfig={teamConfig} onLeave={() => setScreen("SELECTMODE")} onReturnLobby={() => setScreen("LOBBY")} />}
      {screen === "AUTO" && gameMode === "auto"      && <GameScreenAuto      config={gameConfig} userDeck={selectedTeam} minionConfig={teamConfig} onLeave={() => setScreen("SELECTMODE")} onReturnLobby={() => setScreen("LOBBY")} />}
    </div>
  );
}

export default App;
