import React, { useState, useEffect, useRef } from "react";
import "./GameScreen.css";
import { type GameConfigData } from "../Gamesetting/GameSetting";

import CHAIN from "../assets/CHAIN.png";
import HAMTARO from "../assets/HAMTARO.png";
import NAS from "../assets/NAS.png";
import TENG from "../assets/TENG.png";
import TAE from "../assets/TAE.jpg";

import { useGameSocket } from "../hooks/useGameSocket";

interface HexCoord { q: number; r: number; }
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


const NAMETAG_TO_ID: Record<string, number> = {
  HAMTARO: 1, CHONE: 2, TOR: 3, NOS: 4, THUNG: 5,
};

const GameScreenSolitaire: React.FC<GameScreenProps> = ({
  onLeave, onReturnLobby,
  config = DEFAULT_CONFIG, userDeck = [],
  minionConfig: _minionConfig = {},
}) => {
  const activeConfig = config || DEFAULT_CONFIG;
  const { gameState, connected, sendAction } = useGameSocket();

  const [currentTurn, setCurrentTurn]           = useState(0);
  const [phase, setPhase]                       = useState<GamePhase>("SETUP_P1");
  const [spawnCounter, setSpawnCounter]         = useState(0);
  const [actionCompleted, setActionCompleted]   = useState(false);
  const [selectedHex, setSelectedHex]           = useState<HexCoord | null>(null);
  const [selectedShopUnit, setSelectedShopUnit] = useState<number | null>(null);
  const [placedUnits, setPlacedUnits]           = useState<Record<string, PlacedUnit>>({});
  const [unitSkinMap, setUnitSkinMap]           = useState<Record<string, number>>({});

  // ── ✅ เพิ่ม waitingForBackend
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

  const isP2BotTurn = phase.startsWith("P2") || phase === "SETUP_P2";

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [battleLog]);

  // ── Sync state จาก backend ──────────────────────────
  useEffect(() => {
    if (!gameState) return;

    // อัปเดต placedUnits จาก backend จริง
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

    // ── ✅ ถ้ากำลังรอ backend ให้ใช้ผลจาก backend เพื่อเดินหน้า phase
    if (waitingForBackend) {
      setWaitingForBackend(false);
      setActionCompleted(false);
      setSelectedShopUnit(null);
      setSelectedHex(null);

      if (gameState.gameOver) {
        setPhase("GAME_OVER");
        setGameOverData({
          title: "MISSION COMPLETE",
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

      // เดินหน้า phase ตาม currentPlayerIndex ของ backend
      setCurrentTurn(gameState.currentTurn);
      if (gameState.currentPlayerIndex === 0) {
        setPhase("P1_BUY_HEX");
      } else {
        setPhase("P2_BUY_HEX");
      }
      return;
    }

    // game over จาก backend โดยไม่ได้ผ่าน waitingForBackend
    if (gameState.gameOver && phase !== "GAME_OVER") {
      setPhase("GAME_OVER");
      setGameOverData({
        title: "MISSION COMPLETE",
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

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  const getAdjacentHexes = (col: number, row: number) => {
    const isOddCol = col % 2 !== 0;
    return isOddCol
      ? [`${col},${row-1}`,`${col},${row+1}`,`${col-1},${row-1}`,`${col+1},${row-1}`,`${col-1},${row}`,`${col+1},${row}`]
      : [`${col},${row-1}`,`${col},${row+1}`,`${col-1},${row}`,`${col+1},${row}`,`${col-1},${row+1}`,`${col+1},${row+1}`];
  };

  const isAdjacentToZone = (q: number, r: number, zone: string[]) =>
    getAdjacentHexes(q, r).some(n => zone.includes(n));

  const getPurchasableHexes = () => {
    if ((phase !== "P1_BUY_HEX" && phase !== "P2_BUY_HEX") || actionCompleted) return [];
    const isP1 = phase === "P1_BUY_HEX";
    const myZone = isP1 ? p1Spawn : p2Spawn;
    const enemyZone = isP1 ? p2Spawn : p1Spawn;
    const purchasable = new Set<string>();
    myZone.forEach(hex => {
      const [q, r] = hex.split(",").map(Number);
      getAdjacentHexes(q, r).forEach(n => {
        const [nCol, nRow] = n.split(",").map(Number);
        if (nCol >= 0 && nCol <= 7 && nRow >= 0 && nRow <= 7)
          if (!myZone.includes(n) && !enemyZone.includes(n) && !placedUnits[n])
            purchasable.add(n);
      });
    });
    return Array.from(purchasable);
  };

  const getSpawnableHexes = () => {
    if (actionCompleted || !selectedShopUnit) return [];
    const isP1 = phase === "SETUP_P1" || phase === "P1_SPAWN";
    const isP2 = phase === "SETUP_P2" || phase === "P2_SPAWN";
    if (!isP1 && !isP2) return [];
    const myZone = isP1 ? p1Spawn : p2Spawn;
    const budget = isP1 ? p1Budget : p2Budget;
    const isSetup = phase === "SETUP_P1" || phase === "SETUP_P2";
    if (!isSetup && budget < activeConfig.spawnCost) return [];
    if (phase === "P1_SPAWN" || phase === "P2_SPAWN") {
      const count = Object.values(placedUnits).filter(u => u.owner === (isP1 ? 1 : 2)).length;
      if (count >= activeConfig.maxSpawns) return [];
    }
    return myZone.filter(hex => !placedUnits[hex]);
  };

  const handleHexClick = (q: number, r: number) => {
    if (isExecuting || isP2BotTurn) return;

    const coordKey = `${q},${r}`;
    const isOccupied = !!placedUnits[coordKey];

    if (phase === "SETUP_P1") {
      if (actionCompleted) { alert("ALREADY DEPLOYED YOUR STARTER UNIT."); return; }
      if (!selectedShopUnit) { setSelectedHex({ q, r }); return; }
      if (isOccupied) { alert("HEX IS ALREADY OCCUPIED."); return; }
      if (!p1Spawn.includes(coordKey)) { alert("MUST DEPLOY WITHIN YOUR SPAWN ZONE."); return; }
      setUnitSkinMap(prev => ({ ...prev, [coordKey]: selectedShopUnit! }));
      setPlacedUnits(prev => ({
        ...prev,
        [coordKey]: { unitId: selectedShopUnit, owner: 1, hp: activeConfig.initHp, maxHp: activeConfig.initHp, spawnId: spawnCounter },
      }));
      setSpawnCounter(c => c + 1);
      sendAction({ playerIndex: 0, actionType: "SPAWN", row: r + 1, col: q + 1, unitId: selectedShopUnit });
      setSelectedShopUnit(null);
      setActionCompleted(true);
      setTimeout(() => handleNextPhase(true), 300);

    } else if (phase === "P1_BUY_HEX") {
      if (actionCompleted) { alert("PURCHASE LIMIT REACHED."); return; }
      if (!isAdjacentToZone(q, r, p1Spawn)) { alert("MUST BE ADJACENT TO EXISTING SPAWN ZONE."); return; }
      if (p1Spawn.includes(coordKey) || p2Spawn.includes(coordKey)) { alert("ALREADY BELONGS TO A SPAWN ZONE."); return; }
      if (isOccupied) { alert("CANNOT BUY HEX. A MINION IS BLOCKING."); return; }
      if (p1Budget < activeConfig.hexPurchaseCost) { alert("INSUFFICIENT FUNDS."); return; }
      setP1Spawn(prev => [...prev, coordKey]);
      sendAction({ playerIndex: 0, actionType: "PURCHASE_HEX", row: r + 1, col: q + 1 });
      setActionCompleted(true);
      setTimeout(() => handleNextPhase(true), 300);

    } else if (phase === "P1_SPAWN") {
      if (actionCompleted) { alert("DEPLOYMENT LIMIT REACHED."); return; }
      if (!selectedShopUnit) { setSelectedHex({ q, r }); return; }
      if (isOccupied) { alert("HEX IS ALREADY OCCUPIED."); return; }
      if (!p1Spawn.includes(coordKey)) { alert("MUST DEPLOY WITHIN YOUR SPAWN ZONE."); return; }
      const count = Object.values(placedUnits).filter(u => u.owner === 1).length;
      if (count >= activeConfig.maxSpawns) { alert("MAX LIMIT REACHED."); return; }
      if (p1Budget < activeConfig.spawnCost) { alert("INSUFFICIENT FUNDS."); return; }
      setUnitSkinMap(prev => ({ ...prev, [coordKey]: selectedShopUnit! }));
      setPlacedUnits(prev => ({
        ...prev,
        [coordKey]: { unitId: selectedShopUnit, owner: 1, hp: activeConfig.initHp, maxHp: activeConfig.initHp, spawnId: spawnCounter },
      }));
      sendAction({ playerIndex: 0, actionType: "SPAWN", row: r + 1, col: q + 1, unitId: selectedShopUnit });
      setSpawnCounter(c => c + 1);
      setSelectedShopUnit(null);
      setActionCompleted(true);
      setTimeout(() => handleNextPhase(true), 300);
    }
  };

  // ── ✅ executeScripts — ส่ง END_TURN แล้วรอ backend ตอบกลับ
  const executeScripts = async (playerIndex: 0 | 1) => {
    setIsExecuting(true);
    const ownerNum = playerIndex + 1;
    addLog(`── P${ownerNum} EXECUTING SCRIPTS ──`, "system");
    await delay(800);
    sendAction({ playerIndex, actionType: "END_TURN" });
    addLog(`── P${ownerNum} WAITING FOR RESULT... ──`, "system");
    setWaitingForBackend(true); // ✅ รอ backend ตอบ — phase จะถูก set ใน useEffect ด้านบน
    setExecutingMinionKey(null);
    setIsExecuting(false);
    // ❌ ลบ handleNextPhaseAfterAction ออกแล้ว
  };

  // ── Bot (P2 only) ─────────────────────────────────────
  const simulateBotTurn = async (playerIdx: number) => {
    const myZone    = p2Spawn;
    const enemyZone = p1Spawn;
    const budget    = p2Budget;
    const shouldBuyHex = Math.random() < 0.3;
    const shouldSpawn  = Math.random() < 0.6;

    addLog(`🤖 BOT P2 thinking...`, "system");
    await delay(800);

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
        setP2Spawn(prev => [...prev, pick]);
        addLog(`🤖 BOT bought hex (${pick})`, "info");
        await delay(500);
      }
    }

    const currentCount = Object.values(placedUnits).filter(u => u.owner === 2).length;
    if (budget >= activeConfig.spawnCost && currentCount < activeConfig.maxSpawns && shouldSpawn) {
      const emptyHexes = myZone.filter(h => !placedUnits[h]);
      if (emptyHexes.length > 0 && playerDeckUnits.length > 0) {
        const pick = emptyHexes[Math.floor(Math.random() * emptyHexes.length)];
        const [col, row] = pick.split(",").map(Number);
        const unit = playerDeckUnits[Math.floor(Math.random() * playerDeckUnits.length)];
        setUnitSkinMap(prev => ({ ...prev, [pick]: unit.id }));
        setPlacedUnits(prev => ({
          ...prev,
          [pick]: { unitId: unit.id, owner: 2, hp: activeConfig.initHp, maxHp: activeConfig.initHp, spawnId: spawnCounter },
        }));
        setSpawnCounter(c => c + 1);
        sendAction({ playerIndex: playerIdx, actionType: "SPAWN", row: row + 1, col: col + 1, unitId: unit.id });
        addLog(`🤖 BOT deployed ${unit.name} at (${pick})`, "info");
        await delay(600);
      }
    }
    await executeScripts(1);
  };

  // ── Bot setup turn ────────────────────────────────────
  const simulateBotSetup = async () => {
    addLog(`🤖 BOT P2 deploying starter...`, "system");
    await delay(800);
    const emptyHexes = p2Spawn.filter(h => !placedUnits[h]);
    if (emptyHexes.length > 0 && playerDeckUnits.length > 0) {
      const pick = emptyHexes[Math.floor(Math.random() * emptyHexes.length)];
      const [col, row] = pick.split(",").map(Number);
      const unit = playerDeckUnits[Math.floor(Math.random() * playerDeckUnits.length)];
      setUnitSkinMap(prev => ({ ...prev, [pick]: unit.id }));
      setPlacedUnits(prev => ({
        ...prev,
        [pick]: { unitId: unit.id, owner: 2, hp: activeConfig.initHp, maxHp: activeConfig.initHp, spawnId: spawnCounter },
      }));
      setSpawnCounter(c => c + 1);
      sendAction({ playerIndex: 1, actionType: "SPAWN", row: row + 1, col: col + 1, unitId: unit.id });
      addLog(`🤖 BOT deployed ${unit.name} at (${pick})`, "info");
    }
    await delay(400);
    setCurrentTurn(1);
    setPhase("P1_BUY_HEX");
    setActionCompleted(false);
  };

  // ── Auto-trigger bot phases ───────────────────────────
  useEffect(() => {
    if (isExecuting || waitingForBackend) return;
    if (phase === "SETUP_P2") {
      simulateBotSetup();
    } else if (phase === "P2_BUY_HEX" || phase === "P2_SPAWN") {
      setTimeout(() => handleNextPhase(true), 300);
    } else if (phase === "P2_ACTION") {
      simulateBotTurn(1);
    }
  }, [phase]);

  const handleNextPhase = (isAutoAdvance = false) => {
    const isSetupPhase = phase === "SETUP_P1";
    if (isSetupPhase && !actionCompleted && !isAutoAdvance) {
      alert("YOU MUST DEPLOY A STARTER MINION.");
      return;
    }
    setActionCompleted(false);
    setSelectedShopUnit(null);
    setSelectedHex(null);
    switch (phase) {
      case "SETUP_P1":    setPhase("SETUP_P2"); break;
      case "P1_BUY_HEX": setPhase("P1_SPAWN"); break;
      case "P1_SPAWN":    setPhase("P1_ACTION"); break;
      case "P1_ACTION":   executeScripts(0); break;
      case "P2_BUY_HEX": setPhase("P2_SPAWN"); break;
      case "P2_SPAWN":    setPhase("P2_ACTION"); break;
      case "P2_ACTION":   executeScripts(1); break;
    }
  };

  const isP1Active    = phase.startsWith("P1") || phase === "SETUP_P1";
  const isActionPhase = phase === "P1_ACTION" || phase === "P2_ACTION";

  const getPhaseInstruction = () => {
    if (waitingForBackend) return "⏳ WAITING FOR SERVER RESULT...";
    if (isExecuting) return "⚡ EXECUTING BATTLE SCRIPTS...";
    switch (phase) {
      case "SETUP_P1":    return "P1 SETUP: PLACE 1 STARTING MINION (FREE)";
      case "SETUP_P2":    return "🤖 BOT SETTING UP...";
      case "P1_BUY_HEX": return "P1: BUY 1 ADJACENT HEX OR SKIP";
      case "P1_SPAWN":    return "P1: DEPLOY 1 MINION OR SKIP";
      case "P1_ACTION":   return "P1: READY TO EXECUTE SCRIPTS";
      case "P2_BUY_HEX": return "🤖 BOT BUYING HEX...";
      case "P2_SPAWN":    return "🤖 BOT DEPLOYING...";
      case "P2_ACTION":   return "🤖 BOT EXECUTING SCRIPTS...";
      case "GAME_OVER":   return "GAME FINISHED";
    }
  };

  const p1Minions = Object.values(placedUnits).filter(u => u.owner === 1).length;
  const p2Minions = Object.values(placedUnits).filter(u => u.owner === 2).length;

  const renderGrid = () => {
    const purchasableHexes = getPurchasableHexes();
    const spawnableHexes   = getSpawnableHexes();
    return RANGE.map(col => (
      <div key={`col-${col}`} className="hex-column">
        {RANGE.map(row => {
          const coordKey = `${col},${row}`;
          const isSelected = selectedHex?.q === col && selectedHex?.r === row;
          const unit = placedUnits[coordKey];
          const unitData = unit ? RACES.find(u => u.id === unit.unitId) : null;
          const isExecutingThis = executingMinionKey === coordKey;
          let spawnClass = "";
          if (p1Spawn.includes(coordKey)) spawnClass = "spawn-p1";
          if (p2Spawn.includes(coordKey)) spawnClass = "spawn-p2";
          return (
            <div key={`row-${row}`} className="hex-row">
              <div
                className={[
                  "hex-cell", isSelected ? "active" : "", spawnClass,
                  purchasableHexes.includes(coordKey) ? "highlight-buy" : "",
                  spawnableHexes.includes(coordKey) ? "highlight-spawn" : "",
                  isExecutingThis ? "hex-executing" : "",
                ].join(" ")}
                onClick={() => handleHexClick(col, row)}
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
  };

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
        <h1 className="main-title">MISSION: SOLITAIRE MODE</h1>
        <p className="turn-counter">TURN {String(currentTurn).padStart(2, "0")} / {activeConfig.maxTurns}</p>
        <div className={`phase-indicator ${isExecuting ? "phase-executing" : ""}`}>
          {getPhaseInstruction()}
        </div>
      </div>

      <div className="game-body">
        {/* LEFT: P1 (Human) */}
        <aside className="player-panel left" style={{ opacity: isP1Active ? 1 : 0.5 }}>
          <div className={`info-card ${isP1Active ? "neon-border-blue" : ""}`}>
            <h2 className="player-tag">COMMANDER 01</h2>
            <div className="stats">
              <p>BUDGET: <span className="val">{p1Budget.toLocaleString()} / {activeConfig.maxBudget}</span></p>
              <p>MINIONS: <span className="val">{p1Minions} / {activeConfig.maxSpawns}</span></p>
            </div>
          </div>
          <div className="minion-list-panel">
            <div className="minion-list-title">SQUAD STATUS</div>
            {renderMinionList(1)}
          </div>
          {!isActionPhase && (
            <div className="unit-selector">
              <div className="unit-grid">
                {playerDeckUnits.map(unit => (
                  <button
                    key={unit.id}
                    className={`unit-node ${selectedShopUnit === unit.id ? "active" : ""}`}
                    style={{ "--unit-color": unit.color } as React.CSSProperties}
                    onClick={() => isP1Active && setSelectedShopUnit(unit.id)}
                    disabled={!isP1Active || phase === "P1_BUY_HEX"}
                  >
                    <img src={unit.image} alt={unit.name} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* CENTER: GRID */}
        <main className="battle-arena">
          <div className="hex-grid">{renderGrid()}</div>
        </main>

        {/* RIGHT: P2 (Bot) */}
        <aside className="player-panel right" style={{ opacity: isP2BotTurn ? 1 : 0.5 }}>
          <div className={`info-card ${isP2BotTurn ? "neon-border-red" : ""}`}>
            <h2 className="player-tag" style={{ color: "#ff7700" }}>🤖 BOT</h2>
            <div className="stats">
              <p>BUDGET: <span className="val">{p2Budget.toLocaleString()} / {activeConfig.maxBudget}</span></p>
              <p>MINIONS: <span className="val">{p2Minions} / {activeConfig.maxSpawns}</span></p>
            </div>
          </div>
          <div className="minion-list-panel">
            <div className="minion-list-title">BOT SQUAD</div>
            {renderMinionList(2)}
          </div>
          <div style={{
            background: "rgba(255,119,0,0.08)", border: "1px solid rgba(255,119,0,0.2)",
            padding: "12px", borderRadius: "4px", textAlign: "center",
            fontFamily: "Orbitron", fontSize: "0.7rem", color: "#ff7700", letterSpacing: "2px",
          }}>
            {isP2BotTurn && isExecuting ? "⚡ PROCESSING..." : "🤖 AI CONTROLLED"}
          </div>
        </aside>
      </div>

      {/* Battle Log */}
      {(isActionPhase || isExecuting || waitingForBackend) && (
        <div className="battle-log-panel">
          <div className="battle-log-title">⚡ BATTLE LOG</div>
          <div className="battle-log-entries">
            {battleLog.map(entry => (
              <div key={entry.id} className={`log-entry log-${entry.type}`}>{entry.text}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="arena-actions">
        {!isP2BotTurn && (() => {
          const isSetupPhase = phase === "SETUP_P1";
          const isDisabled   = phase === "GAME_OVER" || (isSetupPhase && !actionCompleted) || isExecuting || waitingForBackend;
          let buttonText = "SKIP THIS ACTION";
          let btnClass   = "btn-space primary";
          if (isActionPhase)         { buttonText = isExecuting ? "EXECUTING..." : "▶ EXECUTE BATTLE SCRIPTS"; btnClass = "btn-space execute"; }
          else if (waitingForBackend){ buttonText = "⏳ WAITING..."; }
          else if (actionCompleted)    buttonText = "CONFIRM & NEXT";
          else if (isSetupPhase)       buttonText = "DEPLOYMENT REQUIRED";
          return (
            <button
              className={`${btnClass} ${isDisabled ? "disabled-btn" : ""}`}
              onClick={() => handleNextPhase(false)}
              disabled={isDisabled}
              style={{ opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? "not-allowed" : "pointer" }}
            >
              {buttonText}
            </button>
          );
        })()}
        {isP2BotTurn && (
          <button className="btn-space primary" disabled style={{ opacity: 0.4 }}>
            🤖 BOT IS THINKING...
          </button>
        )}
        <button className="btn-space secondary" onClick={onLeave} disabled={isExecuting || waitingForBackend}>
          ABORT MISSION
        </button>
      </div>

      {/* Game Over Modal */}
      {phase === "GAME_OVER" && gameOverData && (
        <div className="game-over-overlay">
          <div className={`game-over-modal ${
            gameOverData.winner.includes("01") ? "win-p1"
            : gameOverData.winner.includes("BOT") ? "win-p2"
            : "draw"
          }`}>
            <h1 className="glitch-text">{gameOverData.title}</h1>
            <h2 className="winner-text">WINNER: {gameOverData.winner}</h2>
            <p className="win-reason">({gameOverData.reason})</p>
            <div className="stats-comparison">
              <div className="stat-box p1">
                <h3>COM 01</h3>
                <p>MINIONS: <span>{gameOverData.p1Stats.minions}</span></p>
                <p>TOTAL HP: <span>{gameOverData.p1Stats.hp}</span></p>
                <p>BUDGET: <span>{gameOverData.p1Stats.budget}</span></p>
              </div>
              <div className="stat-divider">VS</div>
              <div className="stat-box p2">
                <h3>🤖 BOT</h3>
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

export default GameScreenSolitaire;