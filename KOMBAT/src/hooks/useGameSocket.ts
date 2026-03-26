import { useEffect, useRef, useState, useCallback } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

export interface MinionDTO {
  row: number;
  col: number;
  owner: number;
  hp: number;
  maxHp: number;
  nameTag: string;
}

export interface HexDTO {
  row: number;
  col: number;
}

export interface MinionConfigDTO {
  cost?: number;
  hp?: number;
  script?: string;
}

export interface ActionLogDTO {
  minionName: string;
  playerIndex: number;
  spawnOrder: number;
  type: "MOVE" | "SHOOT" | "DONE";
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  direction?: string;
  expenditure?: number;
}

export interface GameState {
  currentTurn: number;
  currentPlayerIndex: number;
  setupPhase: boolean
  gameOver: boolean;
  winnerMessage: string;
  players: {
    index: number;
    budget: number;
    totalHp: number;
    minionCount: number;
    spawnsLeft: number;
  }[];
  minions: MinionDTO[];
  p1Territory: HexDTO[];
  p2Territory: HexDTO[];
  actionLogs: ActionLogDTO[];
}

export const useGameSocket = () => {
  const clientRef = useRef<Client | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = new Client({
      // หมายเหตุ: หาก Backend รันอยู่คนละพอร์ต (เช่น 8080) อย่าลืมเปลี่ยนเป็น "http://localhost:8080/ws" หากคุณไม่ได้ทำ Proxy ไว้ครับ
      webSocketFactory: () => new SockJS("/ws"),
      onConnect: () => {
        setConnected(true);
        console.log("✅ Connected to Backend!");
        client.subscribe("/topic/game/state", (msg) => {
          setGameState(JSON.parse(msg.body));
        });
        client.subscribe("/topic/game/over", (msg) => {
          setGameState(JSON.parse(msg.body));
        });

        client.publish({ destination: "/app/action/requestState", body: "{}" });
      },
      onDisconnect: () => {
        setConnected(false);
        console.log("❌ Disconnected");
      },
      reconnectDelay: 3000,
    });

    client.activate();
    clientRef.current = client;

    return () => { client.deactivate(); };
  }, []);

  const sendAction = useCallback((payload: any) => {
    if (!clientRef.current?.connected) {
      console.warn("⚠️ [sendAction] ยังไม่ได้เชื่อมต่อ!", payload);
      return;
    }

    // 🟢 1. ดักจับคำสั่งโหมด AUTO ทันที (ให้ไปช่องทาง /app/action/auto)
    if (payload.actionType === "START_AUTO" || payload.actionType === "AUTO_STEP") {
      console.log("🤖 📤 [sendAction] AUTO MODE:", "/app/action/auto", payload);
      clientRef.current.publish({
        destination: "/app/action/auto",
        body: JSON.stringify(payload),
      });
      return; // ส่งเสร็จแล้วหยุดทำงานทันที ไม่ต้องไปต่อด้านล่าง
    }

    // 🟢 2. คำสั่งปกติของโหมดเล่นเอง (Manual Mode)
    const RACE_NAMES: Record<number, string> = {
      1: "HAMTARO",
      2: "CHONE",
      3: "TOR",
      4: "NOS",
      5: "THUNG",
    };

    let dest = "/app/action/endturn";
    let body: any = { playerIndex: payload.playerIndex };

    if (payload.actionType === "SPAWN") {
      dest = "/app/action/spawn";
      body = {
        playerIndex: payload.playerIndex,
        nameTag: RACE_NAMES[payload.unitId] ?? "HAMTARO",
        row: payload.row,
        col: payload.col,
      };
    } else if (payload.actionType === "PURCHASE_HEX") {
      dest = "/app/action/purchase";
      body = {
        playerIndex: payload.playerIndex,
        row: payload.row,
        col: payload.col,
      };
    }

    console.log("📤 [sendAction] MANUAL:", dest, body);
    clientRef.current.publish({
      destination: dest,
      body: JSON.stringify(body),
    });
  }, []);

  return { gameState, connected, sendAction };
};