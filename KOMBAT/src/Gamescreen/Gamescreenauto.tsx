import React, { useState, useEffect, useRef } from "react";
import "./GameScreen.css";
import { type GameConfigData } from "../Gamesetting/GameSetting";

import CHAIN from "../assets/CHAIN.png";
import HAMTARO from "../assets/HAMTARO.png";
import NAS from "../assets/NAS.png";
import TENG from "../assets/TENG.png";
import TAE from "../assets/TAE.jpg";

import { useGameSocket } from "../hooks/useGameSocket";

const RANGE = [0, 1, 2, 3, 4, 5, 6, 7];

const DEFAULT_CONFIG: GameConfigData = {
  spawnCost: 100, hexPurchaseCost: 1000, initBudget: 10000,
  initHp: 100, turnBudget: 90, maxBudget: 23456,
  interestPct: 5, maxTurns: 69, maxSpawns: 47,
};

interface GameScreenProps {
  onLeave: () => void;
  onReturnLobby?: () => void;
  config?: GameConfigData;
  userDeck?: number[];
  minionConfig?: Record<number, { defenseFactor: number; script: string }>;
}

type GamePhase =
  | "SETUP_P1" | "SETUP_P2"
  | "P1_BUY_HEX" | "P1_SPAWN" | "P1_ACTION"
  | "P2_BUY_HEX" | "P2_SPAWN" | "P2_ACTION"
  | "GAME_OVER";

interface LogEntry {
  id: number;
  text: string;
  type: "info" | "attack" | "move" | "death" | "system";
}

interface PlacedUnit {
  unitId: number;
  owner: number;
  hp: number;
  maxHp: number;
  spawnId: number;
}

const RACES = [
  { id: 1, name: "HAMTARO", image: HAMTARO, color: "#1331b4" },
  { id: 2, name: "CHONE",   image: CHAIN,   color: "#ff0055" },
  { id: 3, name: "TOR",     image: TAE,     color: "#2dadc7" },
  { id: 4, name: "NOS",     image: NAS,     color: "#00ffaa" },
  { id: 5, name: "THUNG",   image: TENG,    color: "#ff7215" },
];

const SPEEDS = [
  { label: "0.5×", delay: 1600 },
  { label: "1×",   delay: 800  },
  { label: "2×",   delay: 400  },
  { label: "4×",   delay: 100  },
];

const NAMETAG_TO_ID: Record<string, number> = {
  HAMTARO: 1, CHONE: 2, TOR: 3, NOS: 4, THUNG: 5,
};

const GameScreenAuto: React.FC<GameScreenProps> = ({
  onLeave, onReturnLobby,
  config = DEFAULT_CONFIG, userDeck = [],
  minionConfig: _minionConfig = {},
}) => {
  const activeConfig = config || DEFAULT_CONFIG;
  const { gameState, connected, sendAction } = useGameSocket();

  const [currentTurn, setCurrentTurn]     = useState(0);
  const [phase, setPhase]                 = useState<GamePhase>("SETUP_P1");
  const [spawnCounter, setSpawnCounter]   = useState(0);
  const [placedUnits, setPlacedUnits]     = useState<Record<string, PlacedUnit>>({});
  const [unitSkinMap, setUnitSkinMap]     = useState<Record<string, number>>({});
  const isPausedRef                       = useRef(false);
  const [isPausedDisplay, setIsPausedDisplay] = useState(false);
  const [speedIdx, setSpeedIdx]           = useState(1);

  // ✅ เพิ่ม waitingForBackend
  const [waitingForBackend, setWaitingForBackend] = useState(false);

  const [isExecuting, setIsExecuting]               = useState(false);
  const [executingMinionKey, setExecutingMinionKey] = useState<string | null>(null);
  const [battleLog, setBattleLog]                   = useState<LogEntry[]>([]);
  const [logCounter, setLogCounter]                 = useState(0);
  const logEndRef                                   = useRef<HTMLDivElement>(null);

  const p1Budget = gameState?.players?.[0]?.budget ?? activeConfig.initBudget;
  const p2Budget = gameState?.players?.[1]?.budget ?? activeConfig.initBudget;

  const [p1Spawn, setP1Spawn] = useState<string[]>(["0,0","1,0","0,1","1,1","2,0"]);
  const [p2Spawn, setP2Spawn] = useState<string[]>(["7,7","6,7","7,6","6,6","5,7"]);

  const [gameOverData, setGameOverData] = useState<{
    title: string; winner: string; reason: string;
    p1Stats: { minions: number; hp: number; budget: number };
    p2Stats: { minions: number; hp: number; budget: number };
  } | null>(null);

  const playerDeckUnits = userDeck.length > 0
    ? RACES.filter(u => userDeck.includes(u.id))
    : RACES;

  const baseDelay = SPEEDS[speedIdx].delay;

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [battleLog]);

  // ── Sync จาก backend ─────────────────────────────────
  useEffect(() => {
    if (!gameState) return;

    if (phase !== "SETUP_P1" && phase !== "SETUP_P2") {
      setPlacedUnits(prev => {
        const next: Record<string, PlacedUnit> = {};
        gameState.minions.forEach(m => {
          const key = `${m.col - 1},${m.row - 1}`;
          next[key] = {
            unitId: NAMETAG_TO_ID[m.nameTag] ?? prev[key]?.unitId ?? 1,
            owner: m.owner, hp: m.hp, maxHp: m.maxHp,
            spawnId: prev[key]?.spawnId ?? 0,
          };
        });
        return next;
      });
    }

    if (gameState.p1Territory?.length > 0)
      setP1Spawn(gameState.p1Territory.map(h => `${h.col - 1},${h.row - 1}`));
    if (gameState.p2Territory?.length > 0)
      setP2Spawn(gameState.p2Territory.map(h => `${h.col - 1},${h.row - 1}`));

    // ✅ รับผลจาก backend หลัง END_TURN แล้วเดินหน้า phase
    if (waitingForBackend) {
      setWaitingForBackend(false);

      if (gameState.gameOver) {
        setPhase("GAME_OVER");
        setGameOverData({
          title: "SIMULATION COMPLETE",
          winner: gameState.winnerMessage,
          reason: gameState.winnerMessage,
          p1Stats: {
            minions: gameState.players?.[0]?.minionCount ?? 0,
            hp: gameState.players?.[0]?.totalHp ?? 0,
            budget: gameState.players?.[0]?.budget ?? 0,
          },
          p2Stats: {
            minions: gameState.players?.[1]?.minionCount ?? 0,
            hp: gameState.players?.[1]?.totalHp ?? 0,
            budget: gameState.players?.[1]?.budget ?? 0,
          },
        });
        return;
      }

      // เดินหน้า phase ตาม backend
      setCurrentTurn(gameState.currentTurn);
      if (gameState.currentPlayerIndex === 0) {
        setPhase("P1_BUY_HEX");
      } else {
        setPhase("P2_BUY_HEX");
      }
      return;
    }

    // game over จาก backend โดยตรง
    if (gameState.gameOver && phase !== "GAME_OVER") {
      setPhase("GAME_OVER");
      setGameOverData({
        title: "SIMULATION COMPLETE",
        winner: gameState.winnerMessage,
        reason: gameState.winnerMessage,
        p1Stats: {
          minions: gameState.players?.[0]?.minionCount ?? 0,
          hp: gameState.players?.[0]?.totalHp ?? 0,
          budget: gameState.players?.[0]?.budget ?? 0,
        },
        p2Stats: {
          minions: gameState.players?.[1]?.minionCount ?? 0,
          hp: gameState.players?.[1]?.totalHp ?? 0,
          budget: gameState.players?.[1]?.budget ?? 0,
        },
      });
    }
  }, [gameState]);

  const addLog = (text: string, type: LogEntry["type"] = "info") => {
    setBattleLog(prev => [...prev.slice(-49), { id: logCounter, text, type }]);
    setLogCounter(c => c + 1);
  };

  const delay = (ms: number) => new Promise<void>(res => {
  const check = () => {
    if (!isPausedRef.current) { setTimeout(res, ms); }
    else { setTimeout(check, 200); }
  };
  check();
  });

  const getAdjacentHexes = (col: number, row: number) => {
    const isOddCol = col % 2 !== 0;
    return isOddCol
      ? [`${col},${row-1}`,`${col},${row+1}`,`${col-1},${row-1}`,`${col+1},${row-1}`,`${col-1},${row}`,`${col+1},${row}`]
      : [`${col},${row-1}`,`${col},${row+1}`,`${col-1},${row}`,`${col+1},${row}`,`${col-1},${row+1}`,`${col+1},${row+1}`];
  };

  // ✅ executeScripts — ส่ง END_TURN แล้วรอ backend ตอบกลับ
  const executeScripts = async (playerIndex: 0 | 1) => {
    setIsExecuting(true);
    const ownerNum = playerIndex + 1;
    addLog(`── BOT${ownerNum} EXECUTING ──`, "system");
    await delay(baseDelay);
    sendAction({ playerIndex, actionType: "END_TURN" });
    addLog(`── BOT${ownerNum} WAITING FOR RESULT... ──`, "system");
    setWaitingForBackend(true); // ✅ รอ backend — phase จะถูก set ใน useEffect
    setExecutingMinionKey(null);
    setIsExecuting(false);
    // ❌ ลบ if/else setPhase ออกแล้ว
  };

  const simulateBotTurn = async (playerIdx: 0 | 1) => {
    const isP1      = playerIdx === 0;
    const myZone    = isP1 ? p1Spawn : p2Spawn;
    const enemyZone = isP1 ? p2Spawn : p1Spawn;
    const budget    = isP1 ? p1Budget : p2Budget;
    const shouldBuyHex = Math.random() < 0.3;
    const shouldSpawn  = Math.random() < 0.6;

    addLog(`🤖 BOT${playerIdx + 1} thinking...`, "system");
    await delay(baseDelay);

    if (budget >= activeConfig.hexPurchaseCost && shouldBuyHex) {
      const purchasable = myZone.flatMap(hex => {
        const [q, r] = hex.split(",").map(Number);
        return getAdjacentHexes(q, r).filter(n => {
          const [nc, nr] = n.split(",").map(Number);
          return nc >= 0 && nc <= 7 && nr >= 0 && nr <= 7
            && !myZone.includes(n) && !enemyZone.includes(n) && !placedUnits[n];
        });
      });
      if (purchasable.length > 0) {
        const pick = purchasable[Math.floor(Math.random() * purchasable.length)];
        const [col, row] = pick.split(",").map(Number);
        sendAction({ playerIndex: playerIdx, actionType: "PURCHASE_HEX", row: row + 1, col: col + 1 });
        if (isP1) setP1Spawn(prev => [...prev, pick]);
        else      setP2Spawn(prev => [...prev, pick]);
        addLog(`🤖 BOT${playerIdx + 1} bought (${pick})`, "info");
        await delay(baseDelay * 0.6);
      }
    }

    const currentCount = Object.values(placedUnits).filter(u => u.owner === playerIdx + 1).length;
    if (budget >= activeConfig.spawnCost && currentCount < activeConfig.maxSpawns && shouldSpawn) {
      const emptyHexes = myZone.filter(h => !placedUnits[h]);
      if (emptyHexes.length > 0 && playerDeckUnits.length > 0) {
        const pick = emptyHexes[Math.floor(Math.random() * emptyHexes.length)];
        const [col, row] = pick.split(",").map(Number);
        const unit = playerDeckUnits[Math.floor(Math.random() * playerDeckUnits.length)];
        setUnitSkinMap(prev => ({ ...prev, [pick]: unit.id }));
        setPlacedUnits(prev => ({
          ...prev,
          [pick]: { unitId: unit.id, owner: playerIdx + 1, hp: activeConfig.initHp, maxHp: activeConfig.initHp, spawnId: spawnCounter },
        }));
        setSpawnCounter(c => c + 1);
        sendAction({ playerIndex: playerIdx, actionType: "SPAWN", row: row + 1, col: col + 1, unitId: unit.id });
        addLog(`🤖 BOT${playerIdx + 1} deployed ${unit.name} at (${pick})`, "info");
        await delay(baseDelay * 0.75);
      }
    }
    await executeScripts(playerIdx);
  };

  const simulateBotSetup = async (playerIdx: 0 | 1) => {
    const myZone = playerIdx === 0 ? p1Spawn : p2Spawn;
    addLog(`🤖 BOT${playerIdx + 1} deploying starter...`, "system");
    await delay(baseDelay);
    const emptyHexes = myZone.filter(h => !placedUnits[h]);
    if (emptyHexes.length > 0 && playerDeckUnits.length > 0) {
      const pick = emptyHexes[Math.floor(Math.random() * emptyHexes.length)];
      const [col, row] = pick.split(",").map(Number);
      const unit = playerDeckUnits[Math.floor(Math.random() * playerDeckUnits.length)];
      setUnitSkinMap(prev => ({ ...prev, [pick]: unit.id }));
      setPlacedUnits(prev => ({
        ...prev,
        [pick]: { unitId: unit.id, owner: playerIdx + 1, hp: activeConfig.initHp, maxHp: activeConfig.initHp, spawnId: spawnCounter },
      }));
      setSpawnCounter(c => c + 1);
      sendAction({ playerIndex: playerIdx, actionType: "SPAWN", row: row + 1, col: col + 1, unitId: unit.id });
    }
    await delay(baseDelay * 0.5);
  };

  // ✅ Auto-trigger — เพิ่ม waitingForBackend ใน guard
  useEffect(() => {
    if (isExecuting || isPausedRef.current || waitingForBackend) return;
    const run = async () => {
      switch (phase) {
        case "SETUP_P1":
          await simulateBotSetup(0);
          setPhase("SETUP_P2");
          break;
        case "SETUP_P2":
          await simulateBotSetup(1);
          setCurrentTurn(1);
          setPhase("P1_BUY_HEX");
          break;
        case "P1_BUY_HEX": await delay(200); setPhase("P1_SPAWN"); break;
        case "P1_SPAWN":   await delay(200); setPhase("P1_ACTION"); break;
        case "P1_ACTION":  await simulateBotTurn(0); break;
        case "P2_BUY_HEX": await delay(200); setPhase("P2_SPAWN"); break;
        case "P2_SPAWN":   await delay(200); setPhase("P2_ACTION"); break;
        case "P2_ACTION":  await simulateBotTurn(1); break;
      }
    };
    if (phase !== "GAME_OVER") run();
  }, [phase, isPausedDisplay, waitingForBackend]);

  const getPhaseInstruction = () => {
    if (isPausedDisplay) return "⏸ SIMULATION PAUSED";
    if (waitingForBackend) return "⏳ WAITING FOR SERVER RESULT...";
    switch (phase) {
      case "SETUP_P1":    return "🤖 BOT1 SETTING UP...";
      case "SETUP_P2":    return "🤖 BOT2 SETTING UP...";
      case "P1_BUY_HEX":
      case "P1_SPAWN":    return "🤖 BOT1 PREPARING...";
      case "P1_ACTION":   return "🤖 BOT1 EXECUTING SCRIPTS...";
      case "P2_BUY_HEX":
      case "P2_SPAWN":    return "🤖 BOT2 PREPARING...";
      case "P2_ACTION":   return "🤖 BOT2 EXECUTING SCRIPTS...";
      case "GAME_OVER":   return "SIMULATION COMPLETE";
    }
  };

  const p1Minions = Object.values(placedUnits).filter(u => u.owner === 1).length;
  const p2Minions = Object.values(placedUnits).filter(u => u.owner === 2).length;
  const isP1Phase = phase.startsWith("P1") || phase === "SETUP_P1";

  const renderGrid = () => RANGE.map(col => (
    <div key={`col-${col}`} className="hex-column">
      {RANGE.map(row => {
        const coordKey = `${col},${row}`;
        const unit = placedUnits[coordKey];
        const unitData = unit ? RACES.find(u => u.id === unit.unitId) : null;
        const isExecutingThis = executingMinionKey === coordKey;
        let spawnClass = "";
        if (p1Spawn.includes(coordKey)) spawnClass = "spawn-p1";
        if (p2Spawn.includes(coordKey)) spawnClass = "spawn-p2";
        return (
          <div key={`row-${row}`} className="hex-row">
            <div
              className={["hex-cell", spawnClass, isExecutingThis ? "hex-executing" : ""].join(" ")}
              style={{ cursor: "default" }}
            >
              <div className="hex-inner">
                {unitData && (
                  <div className={`unit-on-grid owner-${unit.owner} ${isExecutingThis ? "unit-active-pulse" : ""}`}>
                    <img src={unitData.image} alt="minion" />
                    <div className="hp-bar-container">
                      <div className={`hp-bar-fill hp-owner-${unit.owner}`} style={{ width: `${(unit.hp / unit.maxHp) * 100}%` }} />
                      <span className="hp-text">{unit.hp}</span>
                    </div>
                  </div>
                )}
                <span className="hex-coords">{col},{row}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ));

  const renderMinionList = (playerOwner: 1 | 2) => {
    const units = Object.entries(placedUnits)
      .filter(([, u]) => u.owner === playerOwner)
      .sort((a, b) => a[1].spawnId - b[1].spawnId);
    if (units.length === 0)
      return <p style={{ color: "#444", fontSize: "0.75rem", fontFamily: "Orbitron" }}>NO UNITS</p>;
    return (
      <div className="minion-list">
        {units.map(([key, u]) => {
          const race = RACES.find(r => r.id === u.unitId);
          const hpPct = (u.hp / u.maxHp) * 100;
          const isActive = executingMinionKey === key;
          return (
            <div key={key} className={`minion-list-item ${isActive ? "minion-list-active" : ""}`}>
              <div className="minion-list-avatar">
                {race && <img src={race.image} alt={race.name} />}
              </div>
              <div className="minion-list-info">
                <div className="minion-list-name">
                  {race?.name ?? "UNIT"}
                  {isActive && <span className="minion-running-badge">▶ RUNNING</span>}
                </div>
                <div className="minion-list-pos">({key})</div>
                <div className="minion-list-hpbar">
                  <div className={`minion-list-hpfill owner-${playerOwner}`} style={{ width: `${hpPct}%` }} />
                </div>
                <div className="minion-list-hp">{u.hp} / {u.maxHp} HP</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="game-screen-container space-theme">
      <div className="stars"></div>
      {!connected && (
        <div className="disconnected-banner">⚠️ DISCONNECTED FROM SERVER — Reconnecting...</div>
      )}

      <div className="game-header">
        <h1 className="main-title">SIMULATION: AUTO MODE</h1>
        <p className="turn-counter">TURN {String(currentTurn).padStart(2, "0")} / {activeConfig.maxTurns}</p>
        <div className={`phase-indicator ${isExecuting ? "phase-executing" : ""}`}>
          {getPhaseInstruction()}
        </div>
      </div>

      <div className="game-body">
        {/* BOT 1 */}
        <aside className="player-panel left" style={{ opacity: isP1Phase ? 1 : 0.5 }}>
          <div className={`info-card ${isP1Phase ? "neon-border-blue" : ""}`}>
            <h2 className="player-tag" style={{ color: "#00f2ff" }}>🤖 BOT 1</h2>
            <div className="stats">
              <p>BUDGET: <span className="val">{p1Budget.toLocaleString()} / {activeConfig.maxBudget}</span></p>
              <p>MINIONS: <span className="val">{p1Minions} / {activeConfig.maxSpawns}</span></p>
            </div>
          </div>
          <div className="minion-list-panel">
            <div className="minion-list-title">BOT 1 SQUAD</div>
            {renderMinionList(1)}
          </div>
        </aside>

        {/* CENTER GRID */}
        <main className="battle-arena">
          <div className="hex-grid">{renderGrid()}</div>
        </main>

        {/* BOT 2 */}
        <aside className="player-panel right" style={{ opacity: !isP1Phase ? 1 : 0.5 }}>
          <div className={`info-card ${!isP1Phase ? "neon-border-red" : ""}`}>
            <h2 className="player-tag" style={{ color: "#ff7700" }}>🤖 BOT 2</h2>
            <div className="stats">
              <p>BUDGET: <span className="val">{p2Budget.toLocaleString()} / {activeConfig.maxBudget}</span></p>
              <p>MINIONS: <span className="val">{p2Minions} / {activeConfig.maxSpawns}</span></p>
            </div>
          </div>
          <div className="minion-list-panel">
            <div className="minion-list-title">BOT 2 SQUAD</div>
            {renderMinionList(2)}
          </div>
        </aside>
      </div>

      {/* Battle Log */}
      <div className="battle-log-panel">
        <div className="battle-log-title">⚡ SIMULATION LOG</div>
        <div className="battle-log-entries">
          {battleLog.map(entry => (
            <div key={entry.id} className={`log-entry log-${entry.type}`}>{entry.text}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Control Bar */}
      <div className="arena-actions" style={{ flexDirection: "row", justifyContent: "center", gap: "12px", maxWidth: "600px" }}>
        <button
          className="btn-space primary"
          style={{ width: "auto", padding: "12px 30px" }}
          onClick={() => {
          isPausedRef.current = !isPausedRef.current;
          setIsPausedDisplay(isPausedRef.current);
          }}
          disabled={phase === "GAME_OVER"}
        >
          {isPausedDisplay ? "▶ RESUME" : "⏸ PAUSE"}
        </button>

        <div style={{ display: "flex", gap: "6px" }}>
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setSpeedIdx(i)}
              style={{
                padding: "12px 16px", fontFamily: "Orbitron", fontSize: "0.75rem",
                fontWeight: "bold", cursor: "pointer", border: "none",
                background: speedIdx === i ? "#00f2ff" : "rgba(0,242,255,0.1)",
                color: speedIdx === i ? "#000" : "#00f2ff",
                clipPath: "polygon(5% 0, 95% 0, 100% 50%, 95% 100%, 5% 100%, 0% 50%)",
                transition: "0.2s",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button className="btn-space secondary" style={{ width: "auto", padding: "12px 20px" }} onClick={onLeave}>
          EXIT
        </button>
      </div>

      {/* Game Over */}
      {phase === "GAME_OVER" && gameOverData && (
        <div className="game-over-overlay">
          <div className={`game-over-modal ${
            gameOverData.winner.includes("1") ? "win-p1"
            : gameOverData.winner.includes("2") ? "win-p2"
            : "draw"
          }`}>
            <h1 className="glitch-text">{gameOverData.title}</h1>
            <h2 className="winner-text">WINNER: {gameOverData.winner}</h2>
            <p className="win-reason">({gameOverData.reason})</p>
            <div className="stats-comparison">
              <div className="stat-box p1">
                <h3>🤖 BOT 1</h3>
                <p>MINIONS: <span>{gameOverData.p1Stats.minions}</span></p>
                <p>TOTAL HP: <span>{gameOverData.p1Stats.hp}</span></p>
                <p>BUDGET: <span>{gameOverData.p1Stats.budget}</span></p>
              </div>
              <div className="stat-divider">VS</div>
              <div className="stat-box p2">
                <h3>🤖 BOT 2</h3>
                <p>MINIONS: <span>{gameOverData.p2Stats.minions}</span></p>
                <p>TOTAL HP: <span>{gameOverData.p2Stats.hp}</span></p>
                <p>BUDGET: <span>{gameOverData.p2Stats.budget}</span></p>
              </div>
            </div>
            <button className="btn-space primary large glow-btn" onClick={onReturnLobby || onLeave}>
              RETURN TO BASE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameScreenAuto;