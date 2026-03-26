import React, { useState, useEffect, useRef, useCallback } from "react";
import "./GameScreen.css";
import { type GameConfigData } from "../Gamesetting/GameSetting";

import CHAIN from "../assets/CHAIN.png";
import HAMTARO from "../assets/HAMTARO.png";
import NAS from "../assets/NAS.png";
import TENG from "../assets/TENG.png";
import TAE from "../assets/TAE.jpg";

import { useGameSocket, type ActionLogDTO } from "../hooks/useGameSocket";

interface HexCoord { q: number; r: number; }
const RANGE = [1, 2, 3, 4, 5, 6, 7, 8];

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
}

type GamePhase =
    | "WAITING_FOR_SERVER"
    | "SETUP_P1"
    | "P1_BUY_HEX" | "P1_SPAWN" | "P1_ACTION"
    | "BOT_TURN"
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
                                                        }) => {
  const activeConfig = config || DEFAULT_CONFIG;
  const { gameState, connected, sendAction } = useGameSocket();

  const [currentTurn, setCurrentTurn]           = useState(0);
  const [phase, setPhase]                       = useState<GamePhase>("WAITING_FOR_SERVER");
  const [spawnCounter, setSpawnCounter]         = useState(0);
  const [actionCompleted, setActionCompleted]   = useState(false);
  const [selectedHex, setSelectedHex]           = useState<HexCoord | null>(null);
  const [selectedShopUnit, setSelectedShopUnit] = useState<number | null>(null);
  const [placedUnits, setPlacedUnits]           = useState<Record<string, PlacedUnit>>({});
  const [unitSkinMap, setUnitSkinMap]           = useState<Record<string, number>>({});
  const [waitingForBackend, setWaitingForBackend] = useState(false);
  const [isExecuting, setIsExecuting]           = useState(false);
  const [executingMinionKey, setExecutingMinionKey] = useState<string | null>(null);
  const [highlightKey, setHighlightKey]         = useState<string | null>(null);
  const [battleLog, setBattleLog]               = useState<LogEntry[]>([]);
  const logEndRef                               = useRef<HTMLDivElement>(null);

  const lastProcessedStepRef = useRef<string>("");

  const p1Budget = gameState?.players?.[0]?.budget ?? activeConfig.initBudget;
  const p2Budget = gameState?.players?.[1]?.budget ?? activeConfig.initBudget;
  const p1SpawnsLeft = gameState?.players?.[0]?.spawnsLeft ?? activeConfig.maxSpawns;
  const p2SpawnsLeft = gameState?.players?.[1]?.spawnsLeft ?? activeConfig.maxSpawns;

  const [p1Spawn, setP1Spawn] = useState<string[]>([]);
  const [p2Spawn, setP2Spawn] = useState<string[]>([]);

  const p1SpawnRef = useRef<string[]>([]);
  const p2SpawnRef = useRef<string[]>([]);

  const [gameOverData, setGameOverData] = useState<any>(null);

  const playerDeckUnits = userDeck.length > 0
      ? RACES.filter(u => userDeck.includes(u.id))
      : RACES;

  const baseDelay = 600;

  useEffect(() => {
    const panel   = document.getElementById('battleLogPanel');
    const header  = document.getElementById('battleLogHeader');
    const btnMin  = document.getElementById('battleLogMin');
    const btnClose= document.getElementById('battleLogClose');
    const entries = document.getElementById('battleLogEntries');
    const hint    = document.getElementById('battleLogHint');
    const resize  = document.getElementById('battleLogResize');
    if (!panel || !header) return;

    let isDragging = false, isResizing = false;
    let dragOffX = 0, dragOffY = 0;
    let startY = 0, startH = 0;
    let isMinimized = false;

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const parent = panel.parentElement!.getBoundingClientRect();
        let x = e.clientX - parent.left - dragOffX;
        let y = e.clientY - parent.top  - dragOffY;
        x = Math.max(0, Math.min(parent.width  - panel.offsetWidth,  x));
        y = Math.max(0, Math.min(parent.height - panel.offsetHeight, y));
        panel.style.right  = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left   = x + 'px';
        panel.style.top    = y + 'px';
      }
      if (isResizing && entries) {
        const newH = Math.max(80, Math.min(400, startH + (e.clientY - startY)));
        entries.style.height = newH + 'px';
        entries.style.flex   = 'none';
      }
    };

    const onMouseUp = () => { isDragging = false; isResizing = false; };

    header.addEventListener('mousedown', (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t === btnMin || t === btnClose) return;
      if (isMinimized) return;
      isDragging = true;
      const r = panel.getBoundingClientRect();
      const p = panel.parentElement!.getBoundingClientRect();
      dragOffX = e.clientX - (r.left - p.left);
      dragOffY = e.clientY - (r.top  - p.top);
    });

    btnMin?.addEventListener('click', () => {
      isMinimized = !isMinimized;
      entries?.classList.toggle('minimized', isMinimized);
      hint?.classList.toggle('visible', isMinimized);
      if (btnMin) btnMin.textContent = isMinimized ? '+' : '−';
      if (resize) resize.style.display = isMinimized ? 'none' : '';
    });

    btnClose?.addEventListener('click', () => { panel.style.display = 'none'; });

    resize?.addEventListener('mousedown', (e: MouseEvent) => {
      isResizing = true;
      startY = e.clientY;
      startH = entries?.offsetHeight ?? 200;
    });

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [battleLog]);

  const addLog = (text: string, type: LogEntry["type"] = "info") => {
    setBattleLog(prev => [...prev.slice(-49), { id: Date.now() + Math.random(), text, type }]);
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // ── Animation Replay ฉบับดักแอนิเมชันวาร์ป ────────────────────────────────────────
  const replayLogs = useCallback(async (
      logs: ActionLogDTO[],
      finalMinions: NonNullable<typeof gameState>["minions"],
      newP1Territory: string[],
      newP2Territory: string[],
      stepDelay: number,
      onComplete: () => void
  ) => {
    setIsExecuting(true);
    const safeLogs = logs || [];
    const safeMinions = finalMinions || [];

    // 1. จัดการแสดงผลการซื้อพื้นที่ (TERRITORY DIFFING)
    let terrainUpdated = false;
    const p1Diff = newP1Territory.filter(h => !p1SpawnRef.current.includes(h));
    const p2Diff = newP2Territory.filter(h => !p2SpawnRef.current.includes(h));

    if (p1Diff.length > 0) {
      setP1Spawn(newP1Territory); p1SpawnRef.current = newP1Territory;
      addLog(`COMMANDER 01 bought hex at (${p1Diff.join(", ")})`, "info");
      terrainUpdated = true;
    }
    if (p2Diff.length > 0) {
      setP2Spawn(newP2Territory); p2SpawnRef.current = newP2Territory;
      addLog(`🤖 BOT expanded territory to (${p2Diff.join(", ")})`, "info");
      terrainUpdated = true;
    }
    if (terrainUpdated) await delay(800);

    const groups = new Map<number, ActionLogDTO[]>();
    for (const log of safeLogs) {
      if (!groups.has(log.spawnOrder)) groups.set(log.spawnOrder, []);
      groups.get(log.spawnOrder)!.push(log);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);

    // 🟢 2. รวบรวม "พิกัดปลายทาง" ของทุกตัวที่เดิน เพื่อป้องกันการวาดตัวใหม่ซ้อนทับ
    const finalKeysOfActors = new Set<string>();
    sortedGroups.forEach(([, actions]) => {
      let finalCol = actions[0].fromCol;
      let finalRow = actions[0].fromRow;
      for (const act of actions) {
        if (act.type === "MOVE") {
          finalCol = act.toCol;
          finalRow = act.toRow;
        }
      }
      finalKeysOfActors.add(`${finalCol},${finalRow}`);
    });

    // 🟢 3. จัดการแสดงผลการวางมินเนี่ยนตัวใหม่ (PRE-SPAWN แบบเช็คปลายทาง)
    let newlySpawnedCount = 0;
    setPlacedUnits(prev => {
      const next = { ...prev };

      // 3.1 ดักจับตัวที่เพิ่งวางปุ๊บแล้วเดินปั๊บ (มี Action Log)
      sortedGroups.forEach(([, actions]) => {
        const firstAct = actions[0];
        const startKey = `${firstAct.fromCol},${firstAct.fromRow}`;
        if (!next[startKey] && !prev[startKey] && firstAct.minionName) {
          newlySpawnedCount++;
          const baseName = firstAct.minionName.split("_")[0];
          next[startKey] = {
            unitId: NAMETAG_TO_ID[baseName] ?? 1,
            owner: firstAct.playerIndex + 1,
            hp: activeConfig.initHp,
            maxHp: activeConfig.initHp,
            spawnId: firstAct.spawnOrder
          };
          const ownerName = firstAct.playerIndex === 0 ? "COMMANDER 01" : "🤖 BOT";
          addLog(`${ownerName} deployed ${baseName} at (${startKey})`, "info");
        }
      });

      // 3.2 ดักจับตัวที่เพิ่งวางใหม่แต่ "ไม่ได้ขยับไปไหนเลย" (ไม่มี Action Log)
      safeMinions.forEach(m => {
        const key = `${m.col},${m.row}`;
        // ตรวจสอบ: ต้องไม่มีในเฟรมก่อนหน้า + ต้องไม่ใช้พิกัดปลายทางที่ตัวอื่นกำลังจะเดินมา!
        if (!prev[key] && !next[key] && !finalKeysOfActors.has(key)) {
          newlySpawnedCount++;
          next[key] = {
            unitId: NAMETAG_TO_ID[m.nameTag] ?? 1,
            owner: m.owner,
            hp: activeConfig.initHp,
            maxHp: activeConfig.initHp,
            spawnId: Date.now()
          };
          const ownerName = m.owner === 1 ? "COMMANDER 01" : "🤖 BOT";
          addLog(`${ownerName} deployed ${m.nameTag} at (${key})`, "info");
        }
      });
      return next;
    });

    if (newlySpawnedCount > 0) await delay(800);

    // 4. เริ่มแอนิเมชันเดิน/ยิง
    for (const [, actions] of sortedGroups) {
      const minionName = actions[0].minionName || "UNKNOWN";
      addLog(`── ${minionName} ──`, "system");

      for (const log of actions) {
        const fromKey = `${log.fromCol},${log.fromRow}`;
        const toKey   = `${log.toCol},${log.toRow}`;

        if (log.type === "MOVE") {
          setExecutingMinionKey(fromKey);
          setHighlightKey(fromKey);
          addLog(`↳ ${minionName} (${fromKey}) → (${toKey})`, "move");
          await delay(stepDelay);

          setPlacedUnits(prev => {
            const next = { ...prev };
            const unit = next[fromKey];
            if (unit) { delete next[fromKey]; next[toKey] = { ...unit }; }
            return next;
          });

          setExecutingMinionKey(toKey);
          setHighlightKey(toKey);
          await delay(Math.round(stepDelay * 0.4));
        } else if (log.type === "SHOOT") {
          setExecutingMinionKey(fromKey);
          setHighlightKey(fromKey);
          addLog(`💥 ${minionName} shot ${log.direction} (${log.expenditure})`, "attack");
          await delay(Math.round(stepDelay * 0.8));
        }
        setHighlightKey(null);
        await delay(80);
      }
      setExecutingMinionKey(null);
      await delay(Math.round(stepDelay * 0.3));
    }

    setExecutingMinionKey(null);
    setHighlightKey(null);

    // 5. อัปเดตเลือดตอนจบเทิร์น
    setPlacedUnits(prev => {
      const next: Record<string, PlacedUnit> = {};
      safeMinions.forEach(m => {
        const key = `${m.col},${m.row}`;
        next[key] = { unitId: NAMETAG_TO_ID[m.nameTag] ?? prev[key]?.unitId ?? 1, owner: m.owner, hp: m.hp, maxHp: activeConfig.initHp, spawnId: prev[key]?.spawnId ?? 0 };
      });
      return next;
    });

    setIsExecuting(false);
    onComplete();
  }, [activeConfig.initHp]);

  // ── Sync การสลับเทิร์นกับ Backend ─────────────────────────────────
  useEffect(() => {
    if (!gameState) return;

    const newP1Territory = gameState.p1Territory?.map(h => `${h.col},${h.row}`) || [];
    const newP2Territory = gameState.p2Territory?.map(h => `${h.col},${h.row}`) || [];

    setCurrentTurn(gameState.currentTurn || 0);

    if (gameState.gameOver) {
      setPhase("GAME_OVER");
      setGameOverData({
        title: "MISSION COMPLETE",
        winner: gameState.winnerMessage || "Unknown",
        reason: gameState.winnerMessage || "No reason provided",
        p1Stats: { minions: gameState.players?.[0]?.minionCount ?? 0, hp: gameState.players?.[0]?.totalHp ?? 0, budget: gameState.players?.[0]?.budget ?? 0 },
        p2Stats: { minions: gameState.players?.[1]?.minionCount ?? 0, hp: gameState.players?.[1]?.totalHp ?? 0, budget: gameState.players?.[1]?.budget ?? 0 },
      });
      return;
    }

    const currentStepKey = `${gameState.currentTurn}-${gameState.currentPlayerIndex}`;

    if (currentStepKey !== lastProcessedStepRef.current) {
      const isFirstLoad = lastProcessedStepRef.current === "";
      lastProcessedStepRef.current = currentStepKey;

      if (isFirstLoad) {
        setP1Spawn(newP1Territory); p1SpawnRef.current = newP1Territory;
        setP2Spawn(newP2Territory); p2SpawnRef.current = newP2Territory;
      }

      replayLogs(gameState.actionLogs || [], gameState.minions || [], newP1Territory, newP2Territory, baseDelay, () => {
        setWaitingForBackend(false);
        setActionCompleted(false);

        if (gameState.currentPlayerIndex === 1) {
          setPhase("BOT_TURN");
          sendAction({ actionType: "AUTO_STEP", destination: "/app/action/auto" });
        } else {
          if (gameState.currentTurn === 1) {
            setPhase("SETUP_P1");
          } else {
            setPhase("P1_BUY_HEX");
          }
        }
      });
    }
  }, [gameState, baseDelay, replayLogs, sendAction]);

  const getAdjacentHexes = (col: number, row: number) => {
    const isEvenCol = col % 2 === 0;
    return isEvenCol
        ? [`${col},${row-1}`,`${col},${row+1}`,`${col-1},${row-1}`,`${col+1},${row-1}`,`${col-1},${row}`,`${col+1},${row}`]
        : [`${col},${row-1}`,`${col},${row+1}`,`${col-1},${row}`,`${col+1},${row}`,`${col-1},${row+1}`,`${col+1},${row+1}`];
  };

  const isAdjacentToZone = (q: number, r: number, zone: string[]) =>
      getAdjacentHexes(q, r).some(n => zone.includes(n));

  const getPurchasableHexes = () => {
    if (phase !== "P1_BUY_HEX" || actionCompleted) return [];
    const purchasable = new Set<string>();
    p1Spawn.forEach(hex => {
      const [q, r] = hex.split(",").map(Number);
      getAdjacentHexes(q, r).forEach(n => {
        const [nCol, nRow] = n.split(",").map(Number);
        if (nCol >= 1 && nCol <= 8 && nRow >= 1 && nRow <= 8)
          if (!p1Spawn.includes(n) && !p2Spawn.includes(n) && !placedUnits[n])
            purchasable.add(n);
      });
    });
    return Array.from(purchasable);
  };

  const getSpawnableHexes = () => {
    if (actionCompleted || !selectedShopUnit) return [];
    if (phase !== "SETUP_P1" && phase !== "P1_SPAWN") return [];

    const isSetup = phase === "SETUP_P1";
    if (!isSetup && p1Budget < activeConfig.spawnCost) return [];
    if (phase === "P1_SPAWN") {
      const count = Object.values(placedUnits).filter(u => u.owner === 1).length;
      if (count >= activeConfig.maxSpawns) return [];
    }
    return p1Spawn.filter(hex => !placedUnits[hex]);
  };

  const handleHexClick = (q: number, r: number) => {
    if (isExecuting || phase === "BOT_TURN" || waitingForBackend) return;

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
      setActionCompleted(true);
      setWaitingForBackend(false); // 🟢 ให้ผู้เล่นกดปุ่ม Confirm & Next ส่งเอง
      sendAction({ playerIndex: 0, actionType: "SPAWN", row: r, col: q, unitId: selectedShopUnit });
      setSelectedShopUnit(null);

    } else if (phase === "P1_BUY_HEX") {
      if (actionCompleted) { alert("PURCHASE LIMIT REACHED."); return; }
      if (!isAdjacentToZone(q, r, p1Spawn)) { alert("MUST BE ADJACENT TO EXISTING SPAWN ZONE."); return; }
      if (p1Spawn.includes(coordKey) || p2Spawn.includes(coordKey)) { alert("ALREADY BELONGS TO A SPAWN ZONE."); return; }
      if (isOccupied) { alert("CANNOT BUY HEX. A MINION IS BLOCKING."); return; }
      if (p1Budget < activeConfig.hexPurchaseCost) { alert("INSUFFICIENT FUNDS."); return; }

      setP1Spawn(prev => {
        const next = [...prev, coordKey];
        p1SpawnRef.current = next;
        return next;
      });
      sendAction({ playerIndex: 0, actionType: "PURCHASE_HEX", row: r, col: q });
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
      sendAction({ playerIndex: 0, actionType: "SPAWN", row: r, col: q, unitId: selectedShopUnit });
      setSpawnCounter(c => c + 1);
      setSelectedShopUnit(null);
      setActionCompleted(true);
      setTimeout(() => handleNextPhase(true), 300);
    }
  };

  const executeScripts = async (playerIndex: 0 | 1) => {
    setIsExecuting(true);
    addLog(`── COMMANDER 01 EXECUTING SCRIPTS ──`, "system");
    await delay(500);
    setWaitingForBackend(true);
    sendAction({ playerIndex, actionType: "END_TURN" });
  };

  // 🟢 แก้ไขปุ่มกดข้าม ให้ส่งคำสั่งข้ามเทิร์นตอนจบ Setup P1 อย่างถูกต้อง
  const handleNextPhase = (isAutoAdvance = false) => {
    setActionCompleted(false);
    setSelectedShopUnit(null);
    setSelectedHex(null);
    switch (phase) {
      case "SETUP_P1":   executeScripts(0); break; // ส่งไม้ต่อให้บอท
      case "P1_BUY_HEX": setPhase("P1_SPAWN"); break;
      case "P1_SPAWN":   setPhase("P1_ACTION"); break;
      case "P1_ACTION":  executeScripts(0); break;
    }
  };

  const isP1Active    = phase.startsWith("P1") || phase === "SETUP_P1";
  const isActionPhase = phase === "P1_ACTION";

  const getPhaseInstruction = () => {
    if (waitingForBackend) return "⚡ SYNCING WITH SERVER...";
    if (isExecuting) return "⚡ EXECUTING BATTLE SCRIPTS...";
    switch (phase) {
      case "SETUP_P1":    return "P1 SETUP: PLACE 1 STARTING MINION (FREE)";
      case "P1_BUY_HEX":  return "P1: BUY 1 ADJACENT HEX OR SKIP";
      case "P1_SPAWN":    return "P1: DEPLOY 1 MINION OR SKIP";
      case "P1_ACTION":   return "P1: READY TO EXECUTE SCRIPTS";
      case "BOT_TURN":    return "🤖 BOT IS THINKING / EXECUTING...";
      case "GAME_OVER":   return "GAME FINISHED";
      default:            return phase;
    }
  };

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
            const isHighlighted   = highlightKey === coordKey;
            let spawnClass = "";
            if (p1Spawn.includes(coordKey)) spawnClass = "spawn-p1";
            if (p2Spawn.includes(coordKey)) spawnClass = "spawn-p2";
            return (
                <div key={`row-${row}`} className="hex-row">
                  <div
                      className={[
                        "hex-cell",
                        isSelected      ? "active"         : "",
                        spawnClass,
                        purchasableHexes.includes(coordKey) ? "highlight-buy"   : "",
                        spawnableHexes.includes(coordKey)   ? "highlight-spawn" : "",
                        isExecutingThis ? "hex-executing"   : "",
                        isHighlighted   ? "hex-highlight"   : "",
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
          <p className="turn-counter">TURN {String(Math.max(0, currentTurn)).padStart(2, "0")} / {activeConfig.maxTurns}</p>
          <div className={`phase-indicator ${isExecuting ? "phase-executing" : ""}`}>
            {getPhaseInstruction()}
          </div>
        </div>
        <div className="game-body">
          <aside className="player-panel left" style={{ opacity: isP1Active ? 1 : 0.5 }}>
            <div className={`info-card ${isP1Active ? "neon-border-blue" : ""}`}>
              <h2 className="player-tag">COMMANDER 01</h2>
              <div className="stats">
                <p>BUDGET: <span className="val">{p1Budget.toLocaleString()} / {activeConfig.maxBudget}</span></p>
                <p>MINIONS: <span className="val">{p1SpawnsLeft} spawns left</span></p>
              </div>
            </div>
            <div className="minion-list-panel">
              <div className="minion-list-title">SQUAD STATUS</div>
              {renderMinionList(1)}
            </div>
            {!isActionPhase && phase !== "BOT_TURN" && (
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
          <main className="battle-arena">
            <div className="hex-grid">{renderGrid()}</div>
          </main>
          <aside className="player-panel right" style={{ opacity: phase === "BOT_TURN" ? 1 : 0.5 }}>
            <div className={`info-card ${phase === "BOT_TURN" ? "neon-border-red" : ""}`}>
              <h2 className="player-tag" style={{ color: "#ff7700" }}>🤖 BOT</h2>
              <div className="stats">
                <p>BUDGET: <span className="val">{p2Budget.toLocaleString()} / {activeConfig.maxBudget}</span></p>
                <p>MINIONS: <span className="val">{p2SpawnsLeft} spawns left</span></p>
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
              {phase === "BOT_TURN" ? "⚡ PROCESSING..." : "🤖 AI CONTROLLED"}
            </div>
          </aside>
        </div>

        <div className="battle-log-panel" id="battleLogPanel" style={{ display: battleLog.length > 0 ? "flex" : "none" }}>
          <div className="battle-log-title" id="battleLogHeader">
            <span className="battle-log-title-text">⚡ BATTLE LOG</span>
            <div className="battle-log-controls">
              <button className="battle-log-btn battle-log-btn-min" id="battleLogMin">−</button>
              <button className="battle-log-btn battle-log-btn-close" id="battleLogClose">×</button>
            </div>
          </div>
          <div className="battle-log-minimized-hint" id="battleLogHint">— MINIMIZED —</div>
          <div className="battle-log-entries" id="battleLogEntries">
            {battleLog.map(entry => (
                <div key={entry.id} className={`log-entry log-${entry.type}`}>{entry.text}</div>
            ))}
            <div ref={logEndRef} />
          </div>
          <div className="battle-log-resize" id="battleLogResize" />
        </div>

        <div className="arena-actions">
          {phase !== "BOT_TURN" && (() => {
            const isSetupPhase = phase === "SETUP_P1";
            const isDisabled = phase === "GAME_OVER" || (isSetupPhase && !actionCompleted) || isExecuting || waitingForBackend;
            let buttonText = "SKIP THIS ACTION";
            let btnClass = "btn-space primary";

            if (isSetupPhase && actionCompleted) {
              buttonText = "▶ CONFIRM DEPLOYMENT & END TURN";
              btnClass = "btn-space execute";
            }
            else if (isActionPhase) {
              buttonText = isExecuting ? "EXECUTING..." : "▶ EXECUTE BATTLE SCRIPTS";
              btnClass = "btn-space execute";
            }
            else if (waitingForBackend) buttonText = "⚡ REPLAYING...";
            else if (actionCompleted)   buttonText = "CONFIRM & NEXT";
            else if (isSetupPhase)      buttonText = "DEPLOYMENT REQUIRED";

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

          {phase === "BOT_TURN" && (
              <button className="btn-space primary" disabled style={{ opacity: 0.4 }}>
                🤖 BOT IS THINKING...
              </button>
          )}

          <button className="btn-space secondary" onClick={onLeave} disabled={isExecuting || waitingForBackend}>
            ABORT MISSION
          </button>
        </div>

        {phase === "GAME_OVER" && gameOverData && (
            <div className="game-over-overlay">
              <div className={`game-over-modal ${
                  gameOverData.winner?.includes("1") ? "win-p1"
                      : gameOverData.winner?.includes("2") ? "win-p2"
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