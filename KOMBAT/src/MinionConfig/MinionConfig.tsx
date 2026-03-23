import React, { useState, useEffect } from "react";
import "./MinionConfig.css";

import CHAIN from "../assets/CHAIN.png";
import HAMTARO from "../assets/HAMTARO.png";
import NAS from "../assets/NAS.png";
import TENG from "../assets/TENG.png";
import TAE from "../assets/TAE.jpg";

const RACES = [
  { id: 1, name: "HAMTARO", image: HAMTARO, color: "#1331b4" },
  { id: 2, name: "CHONE",   image: CHAIN,   color: "#ff0055" },
  { id: 3, name: "TOR",     image: TAE,     color: "#2dadc7" },
  { id: 4, name: "NOS",     image: NAS,     color: "#00ffaa" },
  { id: 5, name: "THUNG",   image: TENG,    color: "#ff7215" },
];

// ============================================================
// SCRIPT VALIDATOR
// ตรวจ syntax ให้ตรงกับ grammar ของ Lexer/Parser ใน Backend
// ============================================================
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateScript(script: string): ValidationResult {
  const errors: string[] = [];
  if (!script.trim()) {
    return { valid: false, errors: ["Script is empty."] };
  }

  // Tokenizer แบบง่ายเพื่อ validate
  const KEYWORDS = new Set([
    "if","then","else","while","done","move","shoot",
    "up","down","upleft","upright","downleft","downright",
    "ally","opponent","nearby",
  ]);
  const DIRECTIONS = new Set(["up","down","upleft","upright","downleft","downright"]);
  const OPERATORS  = new Set(["+","-","*","/","%","^","=","(",")","{","}"]);

  // Remove comments
  const cleaned = script.replace(/#[^\n]*/g, "").trim();
  if (!cleaned) return { valid: true, errors: [] };

  // Basic checks
  const lines = cleaned.split("\n");
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // ห้ามใช้ == หรือ != หรือ >=
    if (/==|!=|>=|<=/.test(trimmed)) {
      errors.push(`Line ${idx+1}: Comparison operators (==, !=, >=, <=) are not supported. Use arithmetic expressions only.`);
    }

    // if ต้องมี then
    if (/^\s*if\s*\(/.test(trimmed) && !/then/.test(trimmed)) {
      // ตรวจข้ามหลาย line ไม่ได้ในวิธีนี้ แต่ถ้า if อยู่บรรทัดเดียวแล้วไม่มี then แจ้งเตือน
      const restOfScript = lines.slice(idx).join(" ");
      if (!/then/.test(restOfScript.split(/\{|\}/)[0])) {
        errors.push(`Line ${idx+1}: 'if' requires 'then' keyword. Example: if (x) then { ... }`);
      }
    }

    // move ต้องตามด้วย direction
    const moveMatch = trimmed.match(/^move\s+(\S+)/);
    if (moveMatch) {
      if (!DIRECTIONS.has(moveMatch[1].toLowerCase())) {
        errors.push(`Line ${idx+1}: Invalid direction '${moveMatch[1]}'. Valid: up, down, upleft, upright, downleft, downright`);
      }
    } else if (/^move\s*$/.test(trimmed)) {
      errors.push(`Line ${idx+1}: 'move' requires a direction. Example: move up`);
    }

    // shoot ต้องตามด้วย direction และ expression
    const shootMatch = trimmed.match(/^shoot\s+(\S+)\s*(.*)/);
    if (shootMatch) {
      if (!DIRECTIONS.has(shootMatch[1].toLowerCase())) {
        errors.push(`Line ${idx+1}: Invalid direction '${shootMatch[1]}'. Valid: up, down, upleft, upright, downleft, downright`);
      }
      if (!shootMatch[2].trim()) {
        errors.push(`Line ${idx+1}: 'shoot' requires an amount. Example: shoot up 50`);
      }
    } else if (/^shoot\s*$/.test(trimmed)) {
      errors.push(`Line ${idx+1}: 'shoot' requires direction and amount. Example: shoot up 50`);
    }

    // nearby ต้องตามด้วย direction
    const nearbyMatch = trimmed.match(/nearby\s+(\S+)/);
    if (nearbyMatch) {
      const dir = nearbyMatch[1].replace(/[^a-z]/gi,"").toLowerCase();
      if (!DIRECTIONS.has(dir)) {
        errors.push(`Line ${idx+1}: Invalid direction '${nearbyMatch[1]}' after 'nearby'. Valid: up, down, upleft, upright, downleft, downright`);
      }
    }

    // ห้ามใช้ direction เดี่ยวๆ ที่ไม่ตามหลัง move/shoot/nearby
    const dirAlone = trimmed.match(/^(up|down|upleft|upright|downleft|downright)\s*$/i);
    if (dirAlone) {
      errors.push(`Line ${idx+1}: Direction '${dirAlone[1]}' must follow 'move', 'shoot', or 'nearby'.`);
    }
  });

  // ตรวจ parentheses balance
  let depth = 0;
  for (const ch of cleaned) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) { errors.push("Unmatched closing parenthesis ')'."); break; }
  }
  if (depth > 0) errors.push("Unclosed parenthesis '('. Make sure every '(' has a matching ')'."); 

  // ตรวจ braces balance
  let bdepth = 0;
  for (const ch of cleaned) {
    if (ch === "{") bdepth++;
    if (ch === "}") bdepth--;
    if (bdepth < 0) { errors.push("Unmatched closing brace '}'."); break; }
  }
  if (bdepth > 0) errors.push("Unclosed brace '{'. Make sure every '{' has a matching '}'.");

  return { valid: errors.length === 0, errors };
}

// ============================================================
// PRESET SCRIPTS (สอดคล้องกับ Grammar ของ Backend)
// ============================================================
const SCRIPT_TEMPLATES: Record<string, { label: string; code: string }> = {
      hunter: {
        label: "⚔️ Berserker — บุกทะลุทุกอย่าง",
        code: `# BERSERKER — ไล่ตามศัตรูตลอด
if (nearby up) then shoot up 50
else if (nearby upright) then shoot upright 50
else if (nearby downright) then shoot downright 50
else if (nearby down) then shoot down 50
else if (nearby downleft) then shoot downleft 50
else if (nearby upleft) then shoot upleft 50
else {
  opLoc = opponent
  if (opLoc) then {
    dir = opLoc % 10
    if (dir - 1) then {
       if (dir - 2) then {
          if (dir - 3) then {
             if (dir - 4) then {
                if (dir - 5) then move upleft else move downleft
             } else move down
          } else move downright
       } else move upright
    } else move up
  } 
  else {
    r = random % 6
    if (r) then {
       if (r - 1) then {
          if (r - 2) then {
             if (r - 3) then {
                if (r - 4) then move upleft else move downleft
             } else move down
          } else move downright
       } else move upright
    } else move up
  }
}
done`,
      },

      defender: {
        label: "🛡️ Iron Wall — ป้อมที่เดินได้",
        code: `# IRON WALL — ยิงหนัก 30 แล้วถอยทิศตรงข้ามทันที
# เทิร์นเดียวได้ทั้ง damage + ระยะปลอดภัย
if (nearby up) then { 
  shoot up 30 
  move down 
} else if (nearby upright) then { 
  shoot upright 30 
  move downleft 
} else if (nearby downright) then { 
  shoot downright 30 
  move upleft 
} else if (nearby down) then { 
  shoot down 30 
  move up 
} else if (nearby downleft) then { 
  shoot downleft 30 
  move upright 
} else if (nearby upleft) then { 
  shoot upleft 30 
  move downright 
} 
else {
  opLoc = opponent
  if (opLoc) then {
    dir = opLoc % 10
    # ตรวจสอบทิศทางจากหลักหน่วย (1=Up, 2=Upright, ..., 6=Upleft)
    if (dir - 1) then {
      if (dir - 2) then {
        if (dir - 3) then {
          if (dir - 4) then {
            if (dir - 5) then move upleft else move downleft
          } else move down
        } else move downright
      } else move upright
    } else move up
  }
}
done`,
  },
};
// ============================================================
// EXAMPLE LABEL CONTENT
// ============================================================
const GRAMMAR_EXAMPLES = [
  { label: "Variable assignment", good: "x = 10", bad: "x == 10  ← ใช้ = ไม่ใช่ ==" },
  { label: "If statement",        good: "if (x) then move up", bad: "if (x) move up  ← ขาด then" },
  { label: "If-else",             good: "if (x) then { shoot up 50 } else { move down }", bad: "" },
  { label: "While loop",          good: "while (hp) { move up }", bad: "" },
  { label: "Move",                good: "move up / move downleft", bad: "move north  ← ไม่รู้จัก direction" },
  { label: "Shoot",               good: "shoot up 50", bad: "shoot up  ← ขาด amount" },
  { label: "Nearby sensor",       good: "x = nearby upleft", bad: "" },
  { label: "Ally / Opponent",     good: "loc = opponent", bad: "" },
  { label: "Operators",           good: "+ - * / % ^", bad: "== != >= <=  ← ไม่รองรับ" },
];

// ============================================================
// TYPES
// ============================================================
interface MinionConfigData {
  [id: number]: {
    defenseFactor: number | string;
    script: string;
  };
}

interface Props {
  selectedTeam: number[];
  onConfirm: (config: any) => void;
  onBack: () => void;
}

// ============================================================
// COMPONENT
// ============================================================
const MinionConfig: React.FC<Props> = ({ selectedTeam, onConfirm, onBack }) => {
  const [config, setConfig] = useState<MinionConfigData>({});
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [activeUnitId, setActiveUnitId] = useState<number | null>(null);
  const [tempText, setTempText]         = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showGrammar, setShowGrammar]   = useState(false);

  // Validation state per unit (เก็บ error ของแต่ละ modal ขณะพิมพ์)
  const [modalValidation, setModalValidation] = useState<ValidationResult>({ valid: true, errors: [] });

  useEffect(() => {
    const initialConfig: MinionConfigData = {};
    selectedTeam.forEach((id) => {
      initialConfig[id] = { defenseFactor: "", script: "" };
    });
    setConfig(initialConfig);
  }, [selectedTeam]);

  // Live validate ขณะพิมพ์ใน modal
  useEffect(() => {
    if (isModalOpen) {
      setModalValidation(validateScript(tempText));
    }
  }, [tempText, isModalOpen]);

  const handleDefenseChange = (id: number, value: string) => {
    setErrorMessage("");
    if (value === "") {
      setConfig(prev => ({ ...prev, [id]: { ...prev[id], defenseFactor: "" } }));
      return;
    }
    let numValue = Number(value);
    if (isNaN(numValue)) return;
    if (numValue < 0)   numValue = 0;
    if (numValue > 100) numValue = 100;
    setConfig(prev => ({ ...prev, [id]: { ...prev[id], defenseFactor: numValue } }));
  };

  const loadTemplate = (id: number, templateKey: string) => {
    setErrorMessage("");
    if (templateKey === "custom") {
      openEditor(id, config[id]?.script || "");
    } else if (SCRIPT_TEMPLATES[templateKey]) {
      setConfig(prev => ({
        ...prev,
        [id]: { ...prev[id], script: SCRIPT_TEMPLATES[templateKey].code }
      }));
    }
  };

  const openEditor = (id: number, initialScript?: string) => {
    setActiveUnitId(id);
    const txt = initialScript !== undefined ? initialScript : (config[id]?.script || "");
    setTempText(txt);
    setModalValidation(validateScript(txt));
    setIsModalOpen(true);
  };

  const handleSaveScript = () => {
    const result = validateScript(tempText);
    if (!result.valid) {
      // ยังให้ save ได้ แต่แจ้งเตือน
      setModalValidation(result);
    }
    if (activeUnitId !== null) {
      setConfig(prev => ({
        ...prev,
        [activeUnitId]: { ...prev[activeUnitId], script: tempText }
      }));
      setErrorMessage("");
    }
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveUnitId(null);
    setTempText("");
    setModalValidation({ valid: true, errors: [] });
  };

  const handleDeploy = () => {
    for (const id of selectedTeam) {
      const unit = config[id];
      const raceName = RACES.find(r => r.id === id)?.name;
      if (
        unit.defenseFactor === "" ||
        Number(unit.defenseFactor) < 0 ||
        Number(unit.defenseFactor) > 100 ||
        unit.script.trim() === ""
      ) {
        setErrorMessage(`SYSTEM ALERT: [${raceName}] — Defense (0–100) and Script must be set.`);
        return;
      }
      // Validate script ก่อน deploy
      const result = validateScript(unit.script);
      if (!result.valid) {
        setErrorMessage(`SCRIPT ERROR in [${raceName}]: ${result.errors[0]}`);
        return;
      }
    }
    const finalConfig: any = {};
    Object.keys(config).forEach(key => {
      const numKey = Number(key);
      finalConfig[numKey] = {
        nameTag: RACES.find(r => r.id === numKey)?.name ?? "",
        defenseFactor: Number(config[numKey].defenseFactor),
        script: config[numKey].script,
      }; //เชื่อม minion with backend
    });
    onConfirm(finalConfig);
  };

  const getScriptStatus = (id: number): "empty" | "preset" | "valid" | "error" => {
    const script = config[id]?.script || "";
    if (!script.trim()) return "empty";
    const isPreset = Object.values(SCRIPT_TEMPLATES).some(t => t.code === script);
    if (isPreset) return "preset";
    const result = validateScript(script);
    return result.valid ? "valid" : "error";
  };

  const STATUS_COLORS: Record<string, string> = {
    empty:  "#555",
    preset: "#00d4ff",
    valid:  "#00ff88",
    error:  "#ff3e3e",
  };
  const STATUS_LABELS: Record<string, string> = {
    empty:  "NO SCRIPT",
    preset: "PRESET LOADED",
    valid:  "SCRIPT VALID ✓",
    error:  "SYNTAX ERROR ✗",
  };

  return (
    <div className="config-screen">
      <div className="hud-scanline"></div>

      <div className="config-header">
        <h1 className="config-title">TACTICAL SCRIPTING</h1>
        <button
          className="grammar-toggle-btn"
          onClick={() => setShowGrammar(v => !v)}
        >
          {showGrammar ? "▲ HIDE SYNTAX GUIDE" : "▼ SHOW SYNTAX GUIDE"}
        </button>
      </div>

      {/* =========================================
          GRAMMAR REFERENCE PANEL
      ========================================= */}
      {showGrammar && (
        <div className="grammar-panel">
          <div className="grammar-panel-header">
            <span className="grammar-title">📡 SCRIPT SYNTAX REFERENCE</span>
            <span className="grammar-subtitle">Valid keywords and patterns for your minion AI</span>
          </div>
          <div className="grammar-grid">
            {GRAMMAR_EXAMPLES.map((ex, i) => (
              <div key={i} className="grammar-item">
                <div className="grammar-label">{ex.label}</div>
                <div className="grammar-good">✅ {ex.good}</div>
                {ex.bad && <div className="grammar-bad">❌ {ex.bad}</div>}
              </div>
            ))}
          </div>
          <div className="grammar-keywords">
            <span className="kw-group">
              <span className="kw-cat">Control:</span>
              {["if","then","else","while","done"].map(k => <code key={k}>{k}</code>)}
            </span>
            <span className="kw-group">
              <span className="kw-cat">Actions:</span>
              {["move","shoot"].map(k => <code key={k}>{k}</code>)}
            </span>
            <span className="kw-group">
              <span className="kw-cat">Directions:</span>
              {["up","down","upleft","upright","downleft","downright"].map(k => <code key={k}>{k}</code>)}
            </span>
            <span className="kw-group">
              <span className="kw-cat">Sensors:</span>
              {["ally","opponent","nearby","random","Budget","row","col"].map(k => <code key={k}>{k}</code>)}
            </span>
          </div>
        </div>
      )}

      {/* =========================================
          UNIT CONFIG CARDS
      ========================================= */}
      <div className="config-grid-container">
        {selectedTeam.map((id) => {
          const race = RACES.find(r => r.id === id);
          const unit = config[id];
          if (!race || !unit) return null;

          const status = getScriptStatus(id);
          const isMissingConfig = errorMessage.includes(`[${race.name}]`);

          return (
            <div
              key={id}
              className="unit-config-card"
              style={{
                "--unit-color": race.color,
                borderColor: isMissingConfig ? "#ff3e3e" : undefined,
                boxShadow: isMissingConfig ? "0 0 15px rgba(255,62,62,0.3)" : undefined,
              } as React.CSSProperties}
            >
              <div className="unit-preview">
                <div className="img-wrapper">
                  <img src={race.image} alt={race.name} />
                </div>
                <div className="unit-name">{race.name}</div>
              </div>

              <div className="unit-inputs">
                {/* Defense Factor */}
                <div className="input-group">
                  <label>DEFENSE FACTOR [0–100]</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="e.g. 10"
                    value={unit.defenseFactor}
                    onChange={e => handleDefenseChange(id, e.target.value)}
                  />
                  <span className="input-hint">
                    Damage reduced = defense × factor. Higher = tankier.
                  </span>
                </div>

                {/* Script Selector */}
                <div className="input-group">
                  <label>
                    AI BEHAVIOR SCRIPT
                    <span
                      className="script-status-badge"
                      style={{ color: STATUS_COLORS[status] }}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </label>

                  <div className="script-controls">
                    <select
                      onChange={e => loadTemplate(id, e.target.value)}
                      value={
                        unit.script === ""
                          ? ""
                          : Object.entries(SCRIPT_TEMPLATES).find(
                              ([, t]) => t.code === unit.script
                            )?.[0] ?? "custom"
                      }
                    >
                      <option value="" disabled>— Load Preset —</option>
                      {Object.entries(SCRIPT_TEMPLATES).map(([key, t]) => (
                        <option key={key} value={key}>{t.label}</option>
                      ))}
                      <option value="custom">⚙️ Custom Override...</option>
                    </select>

                    <button
                      className="edit-script-btn"
                      onClick={() => openEditor(id)}
                    >
                      &lt;/&gt; EDIT
                    </button>
                  </div>

                  <div className="script-preview">
                    {unit.script
                      ? unit.script.replace(/#[^\n]*/g,"").trim().split("\n").find(l => l.trim()) + " ..."
                      : "// Awaiting instructions..."}
                  </div>

                  {/* Inline error hint ถ้า script มี error */}
                  {status === "error" && (
                    <div className="inline-script-error">
                      ⚠ Script has syntax errors — click &lt;/&gt; EDIT to fix
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* =========================================
          ACTION BAR
      ========================================= */}
      <div className="action-bar" style={{ flexDirection: "column", gap: "10px" }}>
        {errorMessage && (
          <div className="deploy-error">{errorMessage}</div>
        )}
        <div style={{ display: "flex", gap: "30px", alignItems: "center" }}>
          <button className="hud-btn back-btn" onClick={onBack}>ABORT</button>
          <div className="action-divider"></div>
          <button className="hud-btn deploy-btn" onClick={handleDeploy}>
            COMPILE &amp; DEPLOY
          </button>
        </div>
      </div>

      {/* =========================================
          CODE EDITOR MODAL
      ========================================= */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="strategy-modal code-editor-modal">
            <div className="modal-deco-line"></div>

            <div className="modal-header-row">
              <p className="modal-prompt">
                TERMINAL: {RACES.find(r => r.id === activeUnitId)?.name} — OVERRIDE PROTOCOL
              </p>
              <button className="modal-grammar-link" onClick={() => setShowGrammar(v => !v)}>
                ? SYNTAX GUIDE
              </button>
            </div>

            <textarea
              className={`modal-textarea code-font ${!modalValidation.valid && tempText.trim() ? "has-error" : ""}`}
              value={tempText}
              onChange={e => setTempText(e.target.value)}
              placeholder={`# Write your strategy here\n# Example:\nwhile (1) {\n  if (nearby up) then shoot up 30\n  else move up\n}`}
              autoFocus
              spellCheck={false}
            />

            {/* Live Validation Feedback */}
            <div className="validation-panel">
              {tempText.trim() === "" ? (
                <span className="val-empty">⬡ Awaiting input...</span>
              ) : modalValidation.valid ? (
                <span className="val-ok">✓ Syntax OK — Script is valid</span>
              ) : (
                <div className="val-errors">
                  {modalValidation.errors.slice(0, 3).map((err, i) => (
                    <div key={i} className="val-error-item">⚠ {err}</div>
                  ))}
                  {modalValidation.errors.length > 3 && (
                    <div className="val-error-item muted">
                      +{modalValidation.errors.length - 3} more errors...
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={closeModal}>DISCARD</button>
              <button
                className={`modal-btn save ${!modalValidation.valid && tempText.trim() ? "save-warn" : ""}`}
                onClick={handleSaveScript}
              >
                {!modalValidation.valid && tempText.trim() ? "SAVE ANYWAY ⚠" : "SAVE SCRIPT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MinionConfig;