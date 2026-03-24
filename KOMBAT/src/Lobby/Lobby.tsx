import React from "react";
import "./Lobby.css";

interface LobbyProps {
  onStartGame: () => void;
  onJoinGame?: () => void; // ── เพิ่ม Prop สำหรับปุ่ม Join ──
  onOpenSettings?: () => void;
}

const Lobby: React.FC<LobbyProps> = ({ onStartGame, onJoinGame, onOpenSettings }) => {
  return (
    <div className="lobby-container">
      <div className="stars-layer"></div>
      <div className="overlay"></div>

      <div className="lobby-content" style={{ zIndex: 2 }}>
        <h1 className="game-title">KOMBAT</h1>
        <div className="menu-options" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          <button className="menu-btn start" onClick={onStartGame}>
            START
          </button>

          {/* ── ปุ่ม JOIN BATTLE ── */}
          {onJoinGame && (
            <button 
              className="menu-btn join" 
              onClick={onJoinGame}
              style={{ color: "#ff6060", borderColor: "rgba(255, 60, 60, 0.5)", textShadow: "0 0 10px rgba(255, 60, 60, 0.5)" }}
            >
              JOIN BATTLE
            </button>
          )}

          {onOpenSettings && (
            <button className="menu-btn settings" onClick={onOpenSettings}>
              ⚙ SETTINGS
            </button>
          )}

        </div>
      </div>
    </div>
  );
};

export default Lobby;