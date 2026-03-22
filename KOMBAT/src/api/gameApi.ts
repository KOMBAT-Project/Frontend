const BASE_URL = "/api";

export interface MinionSetup {
  defenseFactor: number;
  script: string;
}

export interface StartGamePayload {
  gameMode: string;
  config: {
    spawnCost: number;
    hexPurchaseCost: number;
    initBudget: number;
    initHp: number;
    turnBudget: number;
    maxBudget: number;
    interestPct: number;
    maxTurns: number;
    maxSpawns: number;
  };
  minionConfig: Record<number, MinionSetup>;
}

export const startGame = async (payload: StartGamePayload) => {
  const res = await fetch(`${BASE_URL}/game/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to start game");
  return res.json();
};

export const getGameState = async () => {
  const res = await fetch(`${BASE_URL}/game/state`);
  if (!res.ok) throw new Error("Failed to get game state");
  return res.json();
};