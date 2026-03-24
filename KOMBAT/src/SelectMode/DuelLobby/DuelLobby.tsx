import React, { useState, useEffect, useRef } from "react";
import { useRoomSocket } from "../../hooks/useRoomSocket";
import "./DuelLobby.css";

interface DuelLobbyProps {
  onRoomReady: (roomCode: string, playerIndex: number) => void;
  onBack: () => void;
  role: "HOST" | "JOIN"; 
  // ── เพิ่ม Props สำหรับระบบ Sync กติกา ──
  hostConfig?: any; 
  onConfigSynced?: (data: any) => void; 
}

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const DuelLobby: React.FC<DuelLobbyProps> = ({ 
  onRoomReady, 
  onBack, 
  role, 
  hostConfig, 
  onConfigSynced 
}) => {
  // ดึง syncConfigData ออกมาใช้งานด้วย
  const { connected, roomState, createRoom, joinRoom, leaveRoom, syncConfigData } = useRoomSocket();

  const [view, setView] = useState<"HOST_WAITING" | "JOIN_INPUT">(
    role === "HOST" ? "HOST_WAITING" : "JOIN_INPUT"
  );
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [copied, setCopied]       = useState(false);
  const [dots, setDots]           = useState(".");
  const inputRef                  = useRef<HTMLInputElement>(null);

  // ── Auto-Create Room สำหรับ Host ────────────────────────
  useEffect(() => {
    if (role === "HOST" && connected && !roomState.roomCode) {
      createRoom();
    }
  }, [role, connected, roomState.roomCode, createRoom]);

  // animated waiting dots
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 500);
    return () => clearInterval(id);
  }, []);

  // ── React to roomState changes & Sync Config ────────────
  useEffect(() => {
    if (!roomState.event) return;

    // 1. HOST: ห้องพร้อม (คนครบ 2 คน)
    if (roomState.event === "ROOM_READY" && roomState.roomCode) {
      if (role === "HOST") {
        // Host: ส่งกติกาตัวเองผ่าน Socket ไปให้แขก
        if (hostConfig && syncConfigData) {
          syncConfigData(hostConfig);
        }
        
        // หน่วงเวลาให้เน็ตเวิร์คส่งข้อมูลเสร็จ แล้ววาร์ปเข้าเกม
        setTimeout(() => {
          // ✅ บังคับ Host เป็น Player 0 (COMMANDER 01) เสมอ
          onRoomReady(roomState.roomCode!, 0); 
        }, 300);
      }
      // Guest จะยังไม่เข้าเกมตอนนี้ ปล่อยให้รอรับ Event SYNC_CONFIG ก่อน
    }

    // 2. GUEST: แขกได้รับกติกาและ Deck จาก Host เรียบร้อยแล้ว
    if (roomState.event === "SYNC_CONFIG" && roomState.payload) {
      if (role === "JOIN" && onConfigSynced) {
        
        let parsedData = roomState.payload;
        
        // 👇 ---------------- เริ่มต้นส่วนที่ต้องแก้ ---------------- 👇
        try {
          if (typeof parsedData === "string") {
            try {
              // 1. ลองถอดรหัส Base64 (atob) ก่อนเลย
              const decodedString = atob(parsedData);
              parsedData = JSON.parse(decodedString);
            } catch (base64Err) {
              // 2. ถ้ามันไม่ได้เข้ารหัส Base64 มา (ถอดแล้วพัง) ก็ให้ลอง Parse แบบปกติ
              parsedData = JSON.parse(parsedData);
            }
          }
        } catch (e) {
          console.error("Payload Parse Error:", e);
        }

        console.log("📥 [GUEST] อัปเดตข้อมูลจาก Host:", parsedData);

        // Guest: อัปเดตข้อมูลกติกาให้ตรงกับ Host 
        onConfigSynced(parsedData);
        
        // ✅ บังคับ Guest เป็น Player 1 (COMMANDER 02) เสมอ (ไม่ต้องไปสนค่าจาก Socket)
        onRoomReady(roomState.roomCode!, 1); 
      }
    }

    if (roomState.event === "ROOM_NOT_FOUND") {
      setJoinError("⚠ ROOM NOT FOUND — CHECK YOUR CODE");
    }
    if (roomState.event === "ROOM_FULL") {
      setJoinError("⚠ ROOM IS ALREADY FULL");
    }
  }, [roomState, role, hostConfig, syncConfigData, onConfigSynced, onRoomReady]);

  const handleJoinRoom = () => {
    if (!connected || joinCode.trim().length < 4) return;
    setJoinError("");
    joinRoom(joinCode.trim());
  };

  const handleCopyCode = () => {
    if (!roomState.roomCode) return;
    navigator.clipboard.writeText(roomState.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleBack = () => {
    leaveRoom();
    onBack(); 
  };

  const formatCode = (raw: string) => raw.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6);

  return (
    <div className="duel-lobby">
      <div className="dl-grid-bg" />
      <div className="dl-scan-line" />

      <div className="dl-header">
        <div className="dl-header-accent" />
        <h1 className="dl-title">{role === "HOST" ? "HOST BATTLE" : "JOIN BATTLE"}</h1>
        <div className="dl-header-accent right" />
      </div>

      <div className="dl-content">
        {!connected && (
          <p className="dl-conn-warning" style={{ marginBottom: 20 }}>
            ⚠ CONNECTING TO SECURE SERVER{dots}
          </p>
        )}

        {/* ── HOST WAITING VIEW ─────────────────────────── */}
        {view === "HOST_WAITING" && (
          <div className="dl-host-view">
            <div className="dl-room-block">
              <p className="dl-room-label">YOUR ROOM CODE</p>
              <div className="dl-room-code-row">
                <div className="dl-room-code">
                  {(roomState.roomCode ?? "------").split("").map((ch, i) => (
                    <span key={i} className="dl-code-char">{ch}</span>
                  ))}
                </div>
                <button className="dl-copy-btn" onClick={handleCopyCode}>
                  <CopyIcon />
                  <span>{copied ? "COPIED!" : "COPY"}</span>
                </button>
              </div>
              <p className="dl-room-hint">Share this code with your opponent</p>
            </div>

            <div className="dl-player-slots">
              <div className="dl-slot filled">
                <div className="dl-slot-dot filled" />
                <span>COMMANDER 01 — YOU (HOST)</span>
              </div>
              <div className={`dl-slot ${roomState.playerCount >= 2 ? "filled" : "empty"}`}>
                <div className={`dl-slot-dot ${roomState.playerCount >= 2 ? "filled" : "empty"}`} />
                <span>
                  {roomState.playerCount >= 2 ? "COMMANDER 02 — CONNECTED" : `WAITING FOR OPPONENT${dots}`}
                </span>
              </div>
            </div>

            <div className="dl-start-block">
              {roomState.ready ? (
                <p className="dl-ready-msg">⚡ BOTH COMMANDERS READY — INITIATING...</p>
              ) : (
                <p className="dl-waiting-msg">Waiting for 2nd player to connect{dots}</p>
              )}
            </div>
          </div>
        )}

        {/* ── JOIN INPUT VIEW ───────────────────────────── */}
        {view === "JOIN_INPUT" && (
          <div className="dl-join-view">
            <p className="dl-instruction">ENTER ROOM CODE PROVIDED BY HOST</p>

            <div className="dl-code-input-block">
              <div className="dl-code-display">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span
                    key={i}
                    className={`dl-code-slot ${i < joinCode.length ? "filled" : "empty"} ${i === joinCode.length ? "cursor" : ""}`}
                  >
                    {joinCode[i] ?? ""}
                  </span>
                ))}
              </div>

              <input
                ref={inputRef}
                className="dl-hidden-input"
                value={joinCode}
                onChange={(e) => {
                  setJoinError("");
                  setJoinCode(formatCode(e.target.value));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && joinCode.length === 6) handleJoinRoom();
                }}
                maxLength={6}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {joinError && <p className="dl-error-msg">{joinError}</p>}

            {/* อัปเดต UI ตอนพิมพ์ถูกแล้วห้องพร้อม ให้โชว์คำว่า SYNCING PROTOCOLS แทน */}
            {roomState.event === "ROOM_JOINED" && (
              <div className="dl-player-slots">
                <div className="dl-slot filled">
                  <div className="dl-slot-dot filled" />
                  <span>COMMANDER 01 — HOST</span>
                </div>
                <div className="dl-slot filled">
                  <div className="dl-slot-dot filled" />
                  <span>COMMANDER 02 — YOU (GUEST)</span>
                </div>
                <p className="dl-ready-msg">⚡ BOTH READY — SYNCING PROTOCOLS...</p>
              </div>
            )}

            <div className="dl-join-actions">
              <button
                className="dl-confirm-btn"
                onClick={handleJoinRoom}
                disabled={joinCode.length < 6 || !connected || roomState.event === "ROOM_JOINED"}
              >
                ENTER BATTLEFIELD
              </button>
            </div>
          </div>
        )}
      </div>

      <button className="dl-footer-back" onClick={handleBack}>
        ← ABORT & RETURN
      </button>
    </div>
  );
};

export default DuelLobby;   