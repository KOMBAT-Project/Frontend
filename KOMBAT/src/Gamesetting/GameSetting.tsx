import React, { useState, useEffect } from "react"; // เพิ่ม useEffect
import "./GameSetting.css";

export interface GameConfigData {
  spawnCost: number;
  hexPurchaseCost: number;
  initBudget: number;
  initHp: number;
  turnBudget: number;
  maxBudget: number;
  interestPct: number;
  maxTurns: number;
  maxSpawns: number;
}

interface GameSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: GameConfigData) => void;
  currentConfig: GameConfigData; // <--- เพิ่ม Prop นี้เพื่อรับค่าล่าสุด
}

const GameSettings: React.FC<GameSettingsProps> = ({ isOpen, onClose, onSave, currentConfig }) => {
  // ดึงค่าเริ่มต้นจาก currentConfig แทนการ Hardcode
  const [formData, setFormData] = useState<GameConfigData>(currentConfig);

  // อัปเดต formData ทุกครั้งที่ currentConfig เปลี่ยนแปลง หรือเปิด Modal ใหม่
  useEffect(() => {
    setFormData(currentConfig);
  }, [currentConfig, isOpen]);

  if (!isOpen) return null;

  const handleChange = (key: keyof GameConfigData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [key]: Number(value),
    }));
  };

  const handleSaveClick = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        {/* ... (โค้ด HTML ด้านในเหมือนเดิมทั้งหมด) ... */}
        <div className="settings-header">
          <h2>SYSTEM CONFIGURATION</h2>
          <div className="header-line"></div>
        </div>

        <div className="settings-body">
          {/* --- Column 1: Economy Protocols --- */}
          <div className="settings-column">
            <h3 className="column-title">ECONOMY PROTOCOLS</h3>
            
            <div className="input-group">
              <label>START BUDGET</label>
              <input
                type="number"
                value={formData.initBudget}
                onChange={(e) => handleChange("initBudget", e.target.value)}
              />
            </div>
            
            <div className="input-group">
              <label>ROUND INCOME</label>
              <input
                type="number"
                value={formData.turnBudget}
                onChange={(e) => handleChange("turnBudget", e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>MAX BUDGET</label>
              <input
                type="number"
                value={formData.maxBudget}
                onChange={(e) => handleChange("maxBudget", e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>INTEREST RATE (%)</label>
              <input
                type="number"
                value={formData.interestPct}
                onChange={(e) => handleChange("interestPct", e.target.value)}
              />
            </div>
          </div>

          {/* --- Column 2: Engagement Rules --- */}
          <div className="settings-column">
            <h3 className="column-title">ENGAGEMENT RULES</h3>
            
            <div className="input-group">
              <label>MINION HEALTH (HP MINION)</label>
              <input
                type="number"
                value={formData.initHp}
                onChange={(e) => handleChange("initHp", e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>OPERATION LIMIT (TURNS)</label>
              <input
                type="number"
                value={formData.maxTurns}
                onChange={(e) => handleChange("maxTurns", e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>MAX DEPLOYMENT (UNITS)</label>
              <input
                type="number"
                value={formData.maxSpawns}
                onChange={(e) => handleChange("maxSpawns", e.target.value)}
              />
            </div>

             <div className="separator"></div>

             <h3 className="column-title">MARKET COSTS</h3>
             
             <div className="row-group">
                <div className="input-group half">
                  <label>UNIT COST</label>
                  <input
                    type="number"
                    value={formData.spawnCost}
                    onChange={(e) => handleChange("spawnCost", e.target.value)}
                  />
                </div>
                <div className="input-group half">
                  <label>SPAWN AREA COST</label>
                  <input
                    type="number"
                    value={formData.hexPurchaseCost}
                    onChange={(e) => handleChange("hexPurchaseCost", e.target.value)}
                  />
                </div>
             </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn-cancel" onClick={onClose}>DISCARD</button>
          <button className="btn-save" onClick={handleSaveClick}>APPLY CHANGES</button>
        </div>
      </div>
    </div>
  );
};

export default GameSettings;