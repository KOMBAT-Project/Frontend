import { useState } from "react";
import Lobby from "./Lobby/Lobby";
import AmountTypeMinion from "./AmountTypeMinions/AmountTypeMinion";
import MinionConfig from "./MinionConfig/MinionConfig";
import ModeSelect from "../src/SelectMode/SelectMode";
import GameScreenDuel from "./Gamescreen/GameScreenduel";
import GameScreenSolitaire from "./Gamescreen/Gamescreensolitaire";
import GameScreenAuto from "./Gamescreen/Gamescreenauto";
import DuelLobby from "./SelectMode/DuelLobby/DuelLobby";
import { startGame } from "./api/gameApi";
import GameSettings, { type GameConfigData } from "./Gamesetting/GameSetting";

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

type ScreenState =
  | "LOBBY"
  | "SELECT_MINIONS"
  | "CONFIG_MINIONS"
  | "SELECTMODE"
  | "DUEL_LOBBY"
  | "DUEL"
  | "SOLITAIRE"
  | "AUTO";

function App() {
  const [screen, setScreen]           = useState<ScreenState>("LOBBY");
  const [gameConfig, setGameConfig]   = useState<GameConfigData>(DEFAULT_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTeam, setSelectedTeam]     = useState<number[]>([]);
  const [teamConfig, setTeamConfig]         = useState<any>({});
  const [gameMode, setGameMode]             = useState<string>("");

  // เก็บ playerIndex จาก DuelLobby (0 = host, 1 = guest)
  const [myPlayerIndex, setMyPlayerIndex]   = useState<number>(0);
  
  // ── เพิ่ม State เพื่อจำว่าเข้า DuelLobby มาด้วยโหมดไหน (HOST หรือ JOIN)
  const [duelRole, setDuelRole] = useState<"HOST" | "JOIN">("HOST");

  // ── เรียก startGame และไปหน้าเกม ──────────────────────────
  const handleConfirmMode = async (mode: string) => {
    try {
      // สำหรับโหมด Duel (HOST), Solitaire, Auto ต้องเรียก API startGame ก่อน
      if (mode !== "join") {
        await startGame({
          gameMode: mode,
          config: gameConfig,
          minionConfig: teamConfig,
        });
        setGameMode(mode);
      }

      if (mode === "duel") {
        setDuelRole("HOST");
        setScreen("DUEL_LOBBY");
      } else if (mode === "solitaire") {
        setScreen("SOLITAIRE");
      } else if (mode === "auto") {
        setScreen("AUTO");
      }
    } catch (err) {
      console.error("❌ Failed to start game:", err);
      alert("ไม่สามารถเชื่อมต่อ Backend ได้!");
    }
  };

  // ── เมื่อห้อง DUEL เต็ม 2 คน ─────────────────────────────
  const handleRoomReady = (roomCode: string, playerIndex: number) => {
    console.log(`✅ Room ${roomCode} ready — I am Player ${playerIndex}`);
    setMyPlayerIndex(playerIndex);
    // บังคับเซ็ต gameMode เป็น duel เพื่อให้เงื่อนไขการเรนเดอร์ GameScreenDuel ผ่าน
    setGameMode("duel"); 
    setScreen("DUEL");
  };

  return (
    <div className="game-wrapper">
      <GameSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentConfig={gameConfig}
        onSave={(newConfig) => setGameConfig(newConfig)}
      />

      {/* 1. LOBBY */}
      {screen === "LOBBY" && (
        <>
          <Lobby
            onStartGame={() => setScreen("SELECT_MINIONS")}
            // ── เพิ่ม onJoinGame เพื่อพุ่งไปหน้า DuelLobby (โหมด JOIN) ทันที ──
            onJoinGame={() => {
              setDuelRole("JOIN");
              setScreen("DUEL_LOBBY");
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
          {/* <button
            style={{ position: "fixed", top: 10, right: 10, zIndex: 100, padding: "10px", cursor: "pointer" }}
            onClick={() => setIsSettingsOpen(true)}
          >
            ⚙️ CONFIG
          </button> */}
        </>
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

      {/* 3. CONFIG MINIONS */}
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

      {/* 4. MODE SELECT */}
      {screen === "SELECTMODE" && (
        <ModeSelect
          currentConfig={gameConfig}
          onConfigUpdate={(newConfig) => setGameConfig(newConfig)}
          // onConfirm จะถูกเรียกเมื่อกดการ์ดโหมด (ถ้าเป็นการ์ด DUEL ให้ส่ง "duel")
          onConfirm={handleConfirmMode}
          onBack={() => setScreen("CONFIG_MINIONS")}
        />
      )}

      {/* 5. DUEL LOBBY — แยก Role HOST/JOIN ชัดเจน */}
      {screen === "DUEL_LOBBY" && (
        <DuelLobby
          role={duelRole}
          
          // ── เพิ่มเติม: ส่งการตั้งค่าของคนที่ตั้งห้องเข้าไป ──
          hostConfig={{ 
            gameConfig: gameConfig, 
            teamConfig: teamConfig, 
            selectedTeam: selectedTeam 
          }}
          
          // ── เพิ่มเติม: สำหรับคนที่เข้ามา Join จะโดนอัปเดตค่าทุกอย่างทับด้วยข้อมูลด้านบน ──
          onConfigSynced={(syncedData) => {
            console.log("📥 Received Host Protocol:", syncedData);
            setGameConfig(syncedData.gameConfig);
            setTeamConfig(syncedData.teamConfig);
            setSelectedTeam(syncedData.selectedTeam);
          }}

          onRoomReady={handleRoomReady}
          onBack={() => setScreen(duelRole === "JOIN" ? "LOBBY" : "SELECTMODE")}
        />
      )}

      {/* 6. GAME SCREENS */}
      {screen === "DUEL" && gameMode === "duel" && (
        <GameScreenDuel
          gameMode={gameMode}
          config={gameConfig}
          userDeck={selectedTeam}
          minionConfig={teamConfig}
          myPlayerIndex={myPlayerIndex}
          onLeave={() => setScreen("SELECTMODE")}
          onReturnLobby={() => setScreen("LOBBY")}
        />
      )}
      {screen === "SOLITAIRE" && gameMode === "solitaire" && (
        <GameScreenSolitaire
          config={gameConfig}
          userDeck={selectedTeam}
          minionConfig={teamConfig}
          onLeave={() => setScreen("SELECTMODE")}
          onReturnLobby={() => setScreen("LOBBY")}
        />
      )}
      {screen === "AUTO" && gameMode === "auto" && (
        <GameScreenAuto
          config={gameConfig}
          userDeck={selectedTeam}
          minionConfig={teamConfig}
          onLeave={() => setScreen("SELECTMODE")}
          onReturnLobby={() => setScreen("LOBBY")}
        />
      )}
    </div>
  );
}

export default App;