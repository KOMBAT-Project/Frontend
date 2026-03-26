import React, { useState, useEffect, useRef, useCallback } from "react";
import "./GameScreen.css";
import { type GameConfigData } from "../Gamesetting/GameSetting";

import CHAIN from "../assets/CHAIN.png";
import HAMTARO from "../assets/HAMTARO.png";
import NAS from "../assets/NAS.png";
import TENG from "../assets/TENG.png";
import TAE from "../assets/TAE.jpg";

import { useGameSocket, type ActionLogDTO } from "../hooks/useGameSocket";

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
}

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
  { label: "0.5×", delay: 1200 },
  { label: "1×",   delay: 600  },
  { label: "2×",   delay: 300  },
  { label: "4×",   delay: 80   },
];

const NAMETAG_TO_ID: Record<string, number> = {
  HAMTARO: 1, CHONE: 2, TOR: 3, NOS: 4, THUNG: 5,
};

const GameScreenAuto: React.FC<GameScreenProps> = ({
                                                     onLeave, onReturnLobby,
                                                     config = DEFAULT_CONFIG,
                                                   }) => {
  const activeConfig = config || DEFAULT_CONFIG;
  const { gameState, connected, sendAction } = useGameSocket();

  const [currentTurn, setCurrentTurn]     = useState(0);
  const [phase, setPhase]                 = useState<string>("WAITING_FOR_SERVER");
  const [placedUnits, setPlacedUnits]     = useState<Record<string, PlacedUnit>>({});

  const isPausedRef                       = useRef(false);
  const [isPausedDisplay, setIsPausedDisplay] = useState(false);
  const [speedIdx, setSpeedIdx]           = useState(1);
  const [isExecuting, setIsExecuting]     = useState(false);
  const [executingMinionKey, setExecutingMinionKey] = useState<string | null>(null);
  const [highlightKey, setHighlightKey]   = useState<string | null>(null);
  const [battleLog, setBattleLog]         = useState<LogEntry[]>([]);
  const logEndRef                         = useRef<HTMLDivElement>(null);

  const [p1Spawn, setP1Spawn] = useState<string[]>([]);
  const [p2Spawn, setP2Spawn] = useState<string[]>([]);
  const [gameOverData, setGameOverData]   = useState<any>(null);

  const lastProcessedStepRef = useRef<string>("");

  const p1Budget = gameState?.players?.[0]?.budget ?? activeConfig.initBudget;
  const p2Budget = gameState?.players?.[1]?.budget ?? activeConfig.initBudget;
  const p1SpawnsLeft = gameState?.players?.[0]?.spawnsLeft ?? activeConfig.maxSpawns;
  const p2SpawnsLeft = gameState?.players?.[1]?.spawnsLeft ?? activeConfig.maxSpawns;

  const baseDelay = SPEEDS[speedIdx].delay;

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [battleLog]);

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

  const addLog = (text: string, type: LogEntry["type"] = "info") => {
    setBattleLog(prev => [...prev.slice(-49), { id: Date.now() + Math.random(), text, type }]);
  };

  const delay = (ms: number) => new Promise<void>(res => {
    const check = () => {
      if (!isPausedRef.current) setTimeout(res, ms);
      else setTimeout(check, 200);
    };
    check();
  });

  const replayLogs = useCallback(async (
      logs: ActionLogDTO[],
      finalMinions: NonNullable<typeof gameState>["minions"],
      stepDelay: number,
      onComplete: () => void
  ) => {
    setIsExecuting(true);
    if (!logs || logs.length === 0) {
      setPlacedUnits(prev => {
        const next: Record<string, PlacedUnit> = {};
        finalMinions.forEach(m => {
          const key = `${m.col},${m.row}`;
          next[key] = { unitId: NAMETAG_TO_ID[m.nameTag] ?? 1, owner: m.owner, hp: m.hp, maxHp: activeConfig.initHp, spawnId: 0 };
        });
        return next;
      });
      setIsExecuting(false);
      onComplete();
      return;
    }

    const groups = new Map<number, ActionLogDTO[]>();
    for (const log of logs) {
      if (!groups.has(log.spawnOrder)) groups.set(log.spawnOrder, []);
      groups.get(log.spawnOrder)!.push(log);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);

    // 🟢 [แก้ไขจุดที่ 2]: PRE-SPAWN (ดักจับตัวที่เพิ่งเกิดใหม่ ให้มาวางบนกระดานก่อนเล่นแอนิเมชัน)
    setPlacedUnits(prev => {
      const next = { ...prev };
      sortedGroups.forEach(([, actions]) => {
        const firstAct = actions[0];
        const startKey = `${firstAct.fromCol},${firstAct.fromRow}`;
        // ถ้าจุดเริ่มต้นของแอนิเมชันนี้ ยังไม่มีตัวละครยืนอยู่ แสดงว่าเป็นตัวเพิ่งเกิด!
        if (!next[startKey]) {
          const baseName = firstAct.minionName.split("_")[0]; // เช่น "HAMTARO_1" ดึงมาแค่ "HAMTARO"
          next[startKey] = {
            unitId: NAMETAG_TO_ID[baseName] ?? 1,
            owner: firstAct.playerIndex + 1,
            hp: activeConfig.initHp,
            maxHp: activeConfig.initHp,
            spawnId: firstAct.spawnOrder
          };
        }
      });
      return next;
    });

    // ให้เวลา UI วาดตัวละครลงกระดานสักพักนึง ก่อนที่จะเริ่มขยับเดิน
    await delay(100);

    for (const [, actions] of sortedGroups) {
      const minionName = actions[0].minionName;
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
        await delay(60);
      }
      setExecutingMinionKey(null);
      await delay(Math.round(stepDelay * 0.3));
    }

    setExecutingMinionKey(null);
    setHighlightKey(null);

    setPlacedUnits(prev => {
      const next: Record<string, PlacedUnit> = {};
      finalMinions.forEach(m => {
        const key = `${m.col},${m.row}`;
        next[key] = { unitId: NAMETAG_TO_ID[m.nameTag] ?? 1, owner: m.owner, hp: m.hp, maxHp: activeConfig.initHp, spawnId: 0 };
      });
      return next;
    });

    setIsExecuting(false);
    onComplete();
  }, [baseDelay, activeConfig.initHp]);

  useEffect(() => {
    if (!gameState) return;

    if (gameState.p1Territory) setP1Spawn(gameState.p1Territory.map(h => `${h.col},${h.row}`));
    if (gameState.p2Territory) setP2Spawn(gameState.p2Territory.map(h => `${h.col},${h.row}`));
    setCurrentTurn(gameState.currentTurn);
    setPhase(`BOT ${gameState.currentPlayerIndex + 1} TURN`);

    if (gameState.gameOver) {
      setPhase("GAME_OVER");
      setGameOverData({
        title: "SIMULATION COMPLETE", winner: gameState.winnerMessage, reason: gameState.winnerMessage,
        p1Stats: { minions: gameState.players?.[0]?.minionCount ?? 0, hp: gameState.players?.[0]?.totalHp ?? 0, budget: gameState.players?.[0]?.budget ?? 0 },
        p2Stats: { minions: gameState.players?.[1]?.minionCount ?? 0, hp: gameState.players?.[1]?.totalHp ?? 0, budget: gameState.players?.[1]?.budget ?? 0 },
      });
      return;
    }

    const currentStepKey = `${gameState.currentTurn}-${gameState.currentPlayerIndex}`;

    if (currentStepKey !== lastProcessedStepRef.current) {
      lastProcessedStepRef.current = currentStepKey;

      replayLogs(gameState.actionLogs ?? [], gameState.minions, baseDelay, () => {
        sendAction({ actionType: "AUTO_STEP", destination: "/app/action/auto" });
      });
    }
  }, [gameState, baseDelay, replayLogs, sendAction]);

  // 🟢 [แก้ไขจุดที่ 1]: บังคับล้างกระดานและสถานะเก่าทิ้งทั้งหมด เมื่อกดปุ่ม Start
  const handleStartSimulation = () => {
    addLog("🚀 INITIALIZING AUTO SIMULATION...", "system");

    setPlacedUnits({});
    setBattleLog([]);
    setGameOverData(null);
    setExecutingMinionKey(null);
    setHighlightKey(null);
    lastProcessedStepRef.current = "";

    sendAction({ actionType: "START_AUTO", destination: "/app/action/auto" });
  };

  const getPhaseInstruction = () => {
    if (isPausedDisplay) return "⏸ SIMULATION PAUSED";
    if (isExecuting) return "⚡ EXECUTING SCRIPTS...";
    if (phase === "WAITING_FOR_SERVER") return "AWAITING START COMMAND";
    if (phase === "GAME_OVER") return "SIMULATION COMPLETE";
    return phase;
  };

  const isP1Phase = gameState?.currentPlayerIndex === 0;

  const renderGrid = () => RANGE.map(col => (
      <div key={`col-${col}`} className="hex-column">
        {RANGE.map(row => {
          const coordKey = `${col},${row}`;
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
                    className={["hex-cell", spawnClass, isExecutingThis ? "hex-executing" : "", isHighlighted ? "hex-highlight" : ""].join(" ")}
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
    const units = Object.entries(placedUnits).filter(([, u]) => u.owner === playerOwner);
    if (units.length === 0) return <p style={{ color: "#444", fontSize: "0.75rem", fontFamily: "Orbitron" }}>NO UNITS</p>;
    return (
        <div className="minion-list">
          {units.map(([key, u]) => {
            const race = RACES.find(r => r.id === u.unitId);
            const hpPct = (u.hp / u.maxHp) * 100;
            const isActive = executingMinionKey === key;
            return (
                <div key={key} className={`minion-list-item ${isActive ? "minion-list-active" : ""}`}>
                  <div className="minion-list-avatar">{race && <img src={race.image} alt={race.name} />}</div>
                  <div className="minion-list-info">
                    <div className="minion-list-name">{race?.name ?? "UNIT"}{isActive && <span className="minion-running-badge">▶ RUNNING</span>}</div>
                    <div className="minion-list-pos">({key})</div>
                    <div className="minion-list-hpbar"><div className={`minion-list-hpfill owner-${playerOwner}`} style={{ width: `${hpPct}%` }} /></div>
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
        {!connected && <div className="disconnected-banner">⚠️ DISCONNECTED FROM SERVER — Reconnecting...</div>}
        <div className="game-header">
          <h1 className="main-title">SIMULATION: AUTO MODE</h1>
          <p className="turn-counter">TURN {String(Math.max(0, currentTurn)).padStart(2, "0")} / {activeConfig.maxTurns}</p>
          <div className={`phase-indicator ${isExecuting ? "phase-executing" : ""}`}>{getPhaseInstruction()}</div>
        </div>
        <div className="game-body">
          <aside className="player-panel left" style={{ opacity: isP1Phase ? 1 : 0.5 }}>
            <div className={`info-card ${isP1Phase ? "neon-border-blue" : ""}`}>
              <h2 className="player-tag" style={{ color: "#00f2ff" }}>🤖 BOT 1</h2>
              <div className="stats">
                <p>BUDGET: <span className="val">{p1Budget.toLocaleString()} / {activeConfig.maxBudget}</span></p>
                <p>MINIONS: <span className="val">{p1SpawnsLeft} spawns left</span></p>
              </div>
            </div>
            <div className="minion-list-panel"><div className="minion-list-title">BOT 1 SQUAD</div>{renderMinionList(1)}</div>
          </aside>
          <main className="battle-arena"><div className="hex-grid">{renderGrid()}</div></main>
          <aside className="player-panel right" style={{ opacity: !isP1Phase ? 1 : 0.5 }}>
            <div className={`info-card ${!isP1Phase ? "neon-border-red" : ""}`}>
              <h2 className="player-tag" style={{ color: "#ff7700" }}>🤖 BOT 2</h2>
              <div className="stats">
                <p>BUDGET: <span className="val">{p2Budget.toLocaleString()} / {activeConfig.maxBudget}</span></p>
                <p>MINIONS: <span className="val">{p2SpawnsLeft} spawns left</span></p>
              </div>
            </div>
            <div className="minion-list-panel"><div className="minion-list-title">BOT 2 SQUAD</div>{renderMinionList(2)}</div>
          </aside>
        </div>

        <div className="battle-log-panel" id="battleLogPanel">
          <div className="battle-log-title" id="battleLogHeader">
            <span className="battle-log-title-text">⚡ SIMULATION LOG</span>
            <div className="battle-log-controls">
              <button className="battle-log-btn battle-log-btn-min" id="battleLogMin">−</button>
              <button className="battle-log-btn battle-log-btn-close" id="battleLogClose">×</button>
            </div>
          </div>
          <div className="battle-log-minimized-hint" id="battleLogHint">— MINIMIZED —</div>
          <div className="battle-log-entries" id="battleLogEntries">
            {battleLog.map(entry => <div key={entry.id} className={`log-entry log-${entry.type}`}>{entry.text}</div>)}
            <div ref={logEndRef} />
          </div>
          <div className="battle-log-resize" id="battleLogResize" />
        </div>

        <div className="arena-actions" style={{ flexDirection: "row", justifyContent: "center", gap: "12px", maxWidth: "600px" }}>
          {phase === "WAITING_FOR_SERVER" && (
              <button className="btn-space primary glow-btn" onClick={handleStartSimulation} style={{ padding: "12px 30px" }}>
                ▶ START AUTO SIMULATION
              </button>
          )}
          <button className="btn-space primary" style={{ width: "auto", padding: "12px 30px" }}
                  onClick={() => { isPausedRef.current = !isPausedRef.current; setIsPausedDisplay(isPausedRef.current); }}
                  disabled={phase === "GAME_OVER" || phase === "WAITING_FOR_SERVER"}>
            {isPausedDisplay ? "▶ RESUME" : "⏸ PAUSE"}
          </button>
          <div style={{ display: "flex", gap: "6px" }}>
            {SPEEDS.map((s, i) => (
                <button key={s.label} onClick={() => setSpeedIdx(i)} style={{
                  padding: "12px 16px", fontFamily: "Orbitron", fontSize: "0.75rem",
                  fontWeight: "bold", cursor: "pointer", border: "none",
                  background: speedIdx === i ? "#00f2ff" : "rgba(0,242,255,0.1)",
                  color: speedIdx === i ? "#000" : "#00f2ff",
                  clipPath: "polygon(5% 0, 95% 0, 100% 50%, 95% 100%, 5% 100%, 0% 50%)",
                  transition: "0.2s",
                }}>{s.label}</button>
            ))}
          </div>
          <button className="btn-space secondary" style={{ width: "auto", padding: "12px 20px" }} onClick={onLeave}>EXIT</button>
        </div>

        {phase === "GAME_OVER" && gameOverData && (
            <div className="game-over-overlay">
              <div className={`game-over-modal ${gameOverData.winner.includes("1") ? "win-p1" : gameOverData.winner.includes("2") ? "win-p2" : "draw"}`}>
                <h1 className="glitch-text">{gameOverData.title}</h1>
                <h2 className="winner-text">WINNER: {gameOverData.winner}</h2>
                <p className="win-reason">({gameOverData.reason})</p>
                <div className="stats-comparison">
                  <div className="stat-box p1"><h3>🤖 BOT 1</h3><p>MINIONS: <span>{gameOverData.p1Stats.minions}</span></p><p>TOTAL HP: <span>{gameOverData.p1Stats.hp}</span></p><p>BUDGET: <span>{gameOverData.p1Stats.budget}</span></p></div>
                  <div className="stat-divider">VS</div>
                  <div className="stat-box p2"><h3>🤖 BOT 2</h3><p>MINIONS: <span>{gameOverData.p2Stats.minions}</span></p><p>TOTAL HP: <span>{gameOverData.p2Stats.hp}</span></p><p>BUDGET: <span>{gameOverData.p2Stats.budget}</span></p></div>
                </div>
                <button className="btn-space primary large glow-btn" onClick={onReturnLobby || onLeave}>RETURN TO BASE</button>
              </div>
            </div>
        )}
      </div>
  );
};

export default GameScreenAuto;