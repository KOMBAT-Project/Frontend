import { useEffect, useRef, useState, useCallback } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

export type RoomEvent =
  | "ROOM_CREATED"
  | "ROOM_JOINED"
  | "PLAYER_LEFT"
  | "ROOM_READY"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ERROR"
  | "SYNC_CONFIG";

export interface RoomState {
  event: RoomEvent;
  roomCode: string | null;
  playerCount: number;
  playerIndex: number; // 0 = host, 1 = guest
  ready: boolean;
  message: string;
  payload?: any;
}

const INITIAL_STATE: RoomState = {
  event: "ERROR",
  roomCode: null,
  playerCount: 0,
  playerIndex: -1,
  ready: false,
  message: "",
};

export const useRoomSocket = () => {
  const clientRef    = useRef<Client | null>(null);
  const sessionIdRef = useRef<string | null>(null); // sessionId ที่ได้จาก backend
  const subRef       = useRef<any>(null);

  const [connected,  setConnected]  = useState(false);
  const [roomState,  setRoomState]  = useState<RoomState>(INITIAL_STATE);
  const [sessionId,  setSessionId]  = useState<string | null>(null);

  // ── Connect ──────────────────────────────────────────────

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS("/ws"),

      onConnect: (frame) => {
        setConnected(true);

        // ดึง sessionId จาก STOMP connect frame header
        // Spring SockJS จะส่ง session ใน header "heart-beat" หรือ custom header
        // วิธีที่ reliable ที่สุดคือให้ backend ส่งกลับมาใน ROOM_CREATED/JOINED
        // แต่ก่อนนั้น เราต้องรู้ sessionId เพื่อ subscribe topic ของเรา
        //
        // SockJS sessionId จะอยู่ใน URL pattern: /ws/{serverId}/{sessionId}/...
        // ดึงจาก frame.headers หรือ sockjs internal
        const rawSessionId = extractSessionId(client);
        sessionIdRef.current = rawSessionId;

        console.log("🟢Connected! Session ID:", rawSessionId);
        setSessionId(rawSessionId);

        if (rawSessionId) {
          // Subscribe /topic/room/{sessionId} เพื่อรับ private message
          subRef.current = client.subscribe(
            `/topic/room/${rawSessionId}`,
            (msg) => {
              const dto: RoomState = JSON.parse(msg.body);
              setRoomState(prevState => ({
                 ...prevState, 
                 ...dto,
                 // ป้องกันกรณีที่ Backend ส่ง playerIndex เป็น 0 มาทับตอน Sync
                 playerIndex: dto.event === "SYNC_CONFIG" ? prevState.playerIndex : dto.playerIndex 
              }));
            }
          );
        }
      },

      onDisconnect: () => {
        setConnected(false);
        sessionIdRef.current = null;
        setSessionId(null);
      },

      reconnectDelay: 3000,
    });

    client.activate();
    clientRef.current = client;

    return () => {
      subRef.current?.unsubscribe();
      client.deactivate();
    };
  }, []);

  // ── Actions ───────────────────────────────────────────────

  const createRoom = useCallback(() => {
    clientRef.current?.publish({
      destination: "/app/room/create",
      body: JSON.stringify({}),
    });
  }, []);

  const joinRoom = useCallback((roomCode: string) => {
    clientRef.current?.publish({
      destination: "/app/room/join",
      body: JSON.stringify({ roomCode: roomCode.toUpperCase() }),
    });
  }, []);

  const leaveRoom = useCallback(() => {
    clientRef.current?.publish({
      destination: "/app/room/leave",
      body: JSON.stringify({}),
    });
    setRoomState(INITIAL_STATE);
  }, []);

  const syncConfigData = useCallback((data: any) => {
    clientRef.current?.publish({
      destination: "/app/room/sync",
      body: JSON.stringify(data),
    });
  }, []);

  return {
    connected,
    sessionId,
    roomState,
    createRoom,
    joinRoom,
    leaveRoom,
    syncConfigData
  };
};



// ── Helper: ดึง SockJS sessionId ──────────────────────────
function extractSessionId(client: any): string | null {
  try {
    const ws = client.webSocket || client._webSocket;
    if (!ws) return null;

    // 1. ดึงจาก _transport.url ก่อนเสมอ (เพราะมันซ่อน URL จริงๆ ไว้ในนี้)
    // หน้าตาของมันจะเป็นประมาน: ws://localhost:8080/ws/123/abcd5678/websocket
    const transportUrl = ws._transport?.url || ws.url || "";
    
    // 2. ใช้ Regex จับเฉพาะส่วนที่เป็น session_id (ก้อนอักขระที่อยู่หลังตัวเลข)
    const match = transportUrl.match(/\/ws\/\d+\/([a-zA-Z0-9_-]+)\//i);
    
    if (match && match[1]) {
      return match[1]; // จะได้ค่าที่ถูกต้องเช่น 'abcd5678'
    }

    return null; // ถ้าหาไม่เจอให้เป็น null ปลอดภัยกว่าครับ
  } catch (err) {
    console.error("Socket ID Extraction Error:", err);
    return null;
  }
}