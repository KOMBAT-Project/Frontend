import React from "react";
import "./Lobby.css";

interface LobbyProps {
  onStartGame: () => void;
  onOpenSettings?: () => void;
}

const Lobby: React.FC<LobbyProps> = ({ onStartGame, onOpenSettings }) => {
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