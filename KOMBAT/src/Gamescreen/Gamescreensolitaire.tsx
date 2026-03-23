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

  const [currentTurn, setCurrentTurn]           = useState(1);
  const [phase, setPhase]                       = useState<GamePhase>("SETUP_P1");
  const [spawnCounter, setSpawnCounter]         = useState(0);
  const [actionCompleted, setActionCompleted]   = useState(false);
  const [selectedHex, setSelectedHex]           = useState<HexCoord | null>(null);
  const [selectedShopUnit, setSelectedShopUnit] = useState<number | null>(null);
  const [placedUnits, setPlacedUnits]           = useState<Record<string, PlacedUnit>>({});
  const [unitSkinMap, setUnitSkinMap]           = useState<Record<string, number>>({});
  const [waitingForBackend, setWaitingForBackend] = useState(false);
  const [isExecuting, setIsExecuting]           = useState(false);
  const [executingMinionKey, setExecutingMinionKey] = useState<string | null>(null);
  const [highlightKey, setHighlightKey]         = useState<string | null>(null); // ✅ animation highlight
  const [battleLog, setBattleLog]               = useState<LogEntry[]>([]);
  const [logCounter, setLogCounter]             = useState(0);
  const logEndRef                               = useRef<HTMLDivElement>(null);

  // ✅ ref เก็บ pending state จาก backend เพื่อ apply หลัง replay จบ
  const pendingPhaseRef = useRef<GamePhase | null>(null);
  const pendingTurnRef  = useRef<number | null>(null);
  const pendingGameOverRef = useRef<{
    title: string; winner: string; reason: string;
    p1Stats: { minions: number; hp: number; budget: number };
    p2Stats: { minions: number; hp: number; budget: number };
  } | null>(null);

  const p1Budget = gameState?.players?.[0]?.budget ?? activeConfig.initBudget;
  const p2Budget = gameState?.players?.[1]?.budget ?? activeConfig.initBudget;

  const [p1Spawn, setP1Spawn] = useState<string[]>(["1,1","2,1","3,1","1,2","2,2"]);
  const [p2Spawn, setP2Spawn] = useState<string[]>(["6,8","7,8","8,8","7,7","8,7"]);

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

  // ── Animation Replay ────────────────────────────────────────
  // - ไม่ sync placedUnits ก่อน replay
  // - ขยับ minion ทีละ step ด้วย setPlacedUnits เอง
  // - หลัง replay จบค่อย sync final state จาก backend
  const replayLogs = useCallback(async (
    logs: ActionLogDTO[],
    finalMinions: typeof gameState extends null ? never : NonNullable<typeof gameState>["minions"],
    stepDelay: number,
    onComplete: () => void,
    addLogFn: (text: string, type: LogEntry["type"]) => void
  ) => {
    if (!logs || logs.length === 0) {
      // ✅ merge กับ prev แทน replace ทั้งหมด เพื่อรักษา minion ที่ frontend เพิ่มไว้
      setPlacedUnits(prev => {
        const next: Record<string, PlacedUnit> = { ...prev };
        finalMinions.forEach(m => {
          const key = `${m.col},${m.row}`;
          next[key] = { unitId: NAMETAG_TO_ID[m.nameTag] ?? prev[key]?.unitId ?? 1, owner: m.owner, hp: m.hp, maxHp: m.maxHp, spawnId: prev[key]?.spawnId ?? 0 };
        });
        return next;
      });
      onComplete();
      return;
    }

    // Group by spawnOrder รักษาลำดับ action ของแต่ละ minion
    const groups = new Map<number, ActionLogDTO[]>();
    for (const log of logs) {
      if (!groups.has(log.spawnOrder)) groups.set(log.spawnOrder, []);
      groups.get(log.spawnOrder)!.push(log);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);

    // replay ทีละ minion (ทีละ group)
    for (const [, actions] of sortedGroups) {
      const minionName = actions[0].minionName;
      addLogFn(`── ${minionName} ──`, "system");

      for (const log of actions) {
        const fromKey = `${log.fromCol},${log.fromRow}`;
        const toKey   = `${log.toCol},${log.toRow}`;

        if (log.type === "MOVE") {
          // highlight ช่องต้นทาง
          setExecutingMinionKey(fromKey);
          setHighlightKey(fromKey);
          addLogFn(`↳ ${minionName} (${fromKey}) → (${toKey})`, "move");
          await new Promise(res => setTimeout(res, stepDelay));

          // ✅ ขยับ minion จริงๆ ใน placedUnits
          setPlacedUnits(prev => {
            const next = { ...prev };
            const unit = next[fromKey];
            if (unit) {
              delete next[fromKey];
              next[toKey] = { ...unit };
            }
            return next;
          });

          // highlight ช่องปลายทาง
          setExecutingMinionKey(toKey);
          setHighlightKey(toKey);
          await new Promise(res => setTimeout(res, Math.round(stepDelay * 0.4)));

        } else if (log.type === "SHOOT") {
          setExecutingMinionKey(fromKey);
          setHighlightKey(fromKey);
          addLogFn(`💥 ${minionName} shot ${log.direction} (${log.expenditure})`, "attack");
          await new Promise(res => setTimeout(res, Math.round(stepDelay * 0.8)));
        }

        setHighlightKey(null);
        await new Promise(res => setTimeout(res, 80));
      }

      setExecutingMinionKey(null);
      await new Promise(res => setTimeout(res, Math.round(stepDelay * 0.3)));
    }

    setExecutingMinionKey(null);
    setHighlightKey(null);

    // ✅ merge final state จาก backend หลัง replay จบ (HP ที่ถูกต้อง, minion ที่ตาย)
    // ใช้ merge ไม่ใช่ replace เพื่อรักษา minion ที่ frontend เพิ่มไว้
    setPlacedUnits(prev => {
      // เริ่มจาก prev แล้ว update เฉพาะตัวที่ backend รู้จัก
      const next: Record<string, PlacedUnit> = {};
      // ใส่เฉพาะที่ backend ยังมีชีวิต (minion ที่ตายจะไม่อยู่ใน finalMinions)
      finalMinions.forEach(m => {
        const key = `${m.col},${m.row}`;
        next[key] = { unitId: NAMETAG_TO_ID[m.nameTag] ?? prev[key]?.unitId ?? 1, owner: m.owner, hp: m.hp, maxHp: m.maxHp, spawnId: prev[key]?.spawnId ?? 0 };
      });
      return next;
    });

    onComplete();
  }, []);

  // ── Sync จาก backend ─────────────────────────────────
  useEffect(() => {
    if (!gameState) return;

    // sync territory
    if (gameState.p1Territory?.length > 0)
      setP1Spawn(gameState.p1Territory.map(h => `${h.col},${h.row}`));
    if (gameState.p2Territory?.length > 0)
      setP2Spawn(gameState.p2Territory.map(h => `${h.col},${h.row}`));

    if (waitingForBackend) {
      // ❌ ไม่ sync placedUnits ตรงนี้ — replayLogs จะขยับ minion เองทีละ step

      // เก็บ pending state
      if (gameState.gameOver) {
        pendingGameOverRef.current = {
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
        };
        pendingPhaseRef.current = "GAME_OVER";
      } else {
        pendingTurnRef.current = gameState.currentTurn;
        pendingPhaseRef.current = gameState.currentPlayerIndex === 0 ? "P1_BUY_HEX" : "P2_BUY_HEX";
      }

      // ✅ ส่ง finalMinions เข้าไปด้วย เพื่อ sync หลัง replay จบ
      const logs = gameState.actionLogs ?? [];
      replayLogs(logs, gameState.minions, 600, () => {
        // apply pending state หลัง replay จบ
        setWaitingForBackend(false);
        setActionCompleted(false);
        setSelectedShopUnit(null);
        setSelectedHex(null);

        if (pendingGameOverRef.current) {
          setGameOverData(pendingGameOverRef.current);
          setPhase("GAME_OVER");
          pendingGameOverRef.current = null;
        } else {
          if (pendingTurnRef.current !== null) setCurrentTurn(pendingTurnRef.current);
          if (pendingPhaseRef.current !== null) setPhase(pendingPhaseRef.current);
          pendingTurnRef.current  = null;
          pendingPhaseRef.current = null;
        }
      }, addLog);
      return;
    }

    // sync เฉพาะ non-setup phases ปกติ
    if (phase !== "SETUP_P1" && phase !== "SETUP_P2") {
      setPlacedUnits(prev => {
        const next: Record<string, PlacedUnit> = {};
        gameState.minions.forEach(m => {
          const key = `${m.col},${m.row}`;
          next[key] = {
            unitId: NAMETAG_TO_ID[m.nameTag] ?? prev[key]?.unitId ?? 1,
            owner: m.owner, hp: m.hp, maxHp: m.maxHp,
            spawnId: prev[key]?.spawnId ?? 0,
          };
        });
        return next;
      });
    }

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
    setBattleLog(prev => [...prev.slice(-49), { id: Date.now() + Math.random(), text, type }]);
    setLogCounter(c => c + 1);
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  const getAdjacentHexes = (col: number, row: number) => {
    const isEvenCol = col % 2 === 0;
    return isEvenCol
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
        if (nCol >= 1 && nCol <= 8 && nRow >= 1 && nRow <= 8)
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
    if (isExecuting || isP2BotTurn || waitingForBackend) return;

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
      sendAction({ playerIndex: 0, actionType: "SPAWN", row: r, col: q, unitId: selectedShopUnit });
      setSelectedShopUnit(null);
      setActionCompleted(true);
      setWaitingForBackend(true);

    } else if (phase === "P1_BUY_HEX") {
      if (actionCompleted) { alert("PURCHASE LIMIT REACHED."); return; }
      if (!isAdjacentToZone(q, r, p1Spawn)) { alert("MUST BE ADJACENT TO EXISTING SPAWN ZONE."); return; }
      if (p1Spawn.includes(coordKey) || p2Spawn.includes(coordKey)) { alert("ALREADY BELONGS TO A SPAWN ZONE."); return; }
      if (isOccupied) { alert("CANNOT BUY HEX. A MINION IS BLOCKING."); return; }
      if (p1Budget < activeConfig.hexPurchaseCost) { alert("INSUFFICIENT FUNDS."); return; }
      setP1Spawn(prev => [...prev, coordKey]);
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
    addLog(`── P${playerIndex + 1} EXECUTING SCRIPTS ──`, "system");
    await delay(800);
    sendAction({ playerIndex, actionType: "END_TURN" });
    addLog(`── P${playerIndex + 1} WAITING FOR RESULT... ──`, "system");
    setWaitingForBackend(true);
    setExecutingMinionKey(null);
    setIsExecuting(false);
  };

  const p1SpawnsLeft = gameState?.players?.[0]?.spawnsLeft ?? activeConfig.maxSpawns;
  const p2SpawnsLeft = gameState?.players?.[1]?.spawnsLeft ?? activeConfig.maxSpawns;

  const simulateBotTurn = async (playerIdx: number) => {
    const myZone    = p2Spawn;
    const enemyZone = p1Spawn;
    const budget    = p2Budget;

    addLog(`🤖 BOT P2 thinking...`, "system");
    await delay(800);

    if (budget >= activeConfig.hexPurchaseCost && Math.random() < 0.3) {
      const purchasable = myZone.flatMap(hex => {
        const [q, r] = hex.split(",").map(Number);
        return getAdjacentHexes(q, r).filter(n => {
          const [nc, nr] = n.split(",").map(Number);
          return nc >= 1 && nc <= 8 && nr >= 1 && nr <= 8
            && !myZone.includes(n) && !enemyZone.includes(n) && !placedUnits[n];
        });
      });
      if (purchasable.length > 0) {
        const pick = purchasable[Math.floor(Math.random() * purchasable.length)];
        const [col, row] = pick.split(",").map(Number);
        sendAction({ playerIndex: playerIdx, actionType: "PURCHASE_HEX", row, col });
        setP2Spawn(prev => [...prev, pick]);
        addLog(`🤖 BOT bought hex (${pick})`, "info");
        await delay(500);
      }
    }

    if (budget >= activeConfig.spawnCost && p2SpawnsLeft > 0 && Math.random() < 0.6) {
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
        sendAction({ playerIndex: playerIdx, actionType: "SPAWN", row, col, unitId: unit.id });
        addLog(`🤖 BOT deployed ${unit.name} at (${pick})`, "info");
        await delay(600);
      }
    }
    await executeScripts(1);
  };

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
      sendAction({ playerIndex: 1, actionType: "SPAWN", row, col, unitId: unit.id });
      addLog(`🤖 BOT deployed ${unit.name} at (${pick})`, "info");
    }
    setWaitingForBackend(true);
  };

  useEffect(() => {
    if (isExecuting || waitingForBackend) return;
    if (phase === "SETUP_P2") {
      simulateBotSetup();
    } else if (phase === "P2_BUY_HEX" || phase === "P2_SPAWN") {
      setTimeout(() => handleNextPhase(true), 300);
    } else if (phase === "P2_ACTION") {
      simulateBotTurn(1);
    }
  }, [phase, waitingForBackend]);

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
    if (waitingForBackend) return "⚡ REPLAYING ACTIONS...";
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
          const isHighlighted   = highlightKey === coordKey; // ✅ animation highlight
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
                  isHighlighted   ? "hex-highlight"   : "", // ✅
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
        <main className="battle-arena">
          <div className="hex-grid">{renderGrid()}</div>
        </main>
        <aside className="player-panel right" style={{ opacity: isP2BotTurn ? 1 : 0.5 }}>
          <div className={`info-card ${isP2BotTurn ? "neon-border-red" : ""}`}>
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
            {isP2BotTurn && isExecuting ? "⚡ PROCESSING..." : "🤖 AI CONTROLLED"}
          </div>
        </aside>
      </div>
      {(isActionPhase || isExecuting || waitingForBackend) && (
        
        <div className="battle-log-panel" id="battleLogPanel">
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
      )}
      <div className="arena-actions">
        {!isP2BotTurn && (() => {
          const isSetupPhase = phase === "SETUP_P1";
          const isDisabled = phase === "GAME_OVER" || (isSetupPhase && !actionCompleted) || isExecuting || waitingForBackend;
          let buttonText = "SKIP THIS ACTION";
          let btnClass = "btn-space primary";
          if (isActionPhase)        { buttonText = isExecuting ? "EXECUTING..." : "▶ EXECUTE BATTLE SCRIPTS"; btnClass = "btn-space execute"; }
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
        {isP2BotTurn && (
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
            gameOverData.winner.includes("1") ? "win-p1"
            : gameOverData.winner.includes("2") ? "win-p2"
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