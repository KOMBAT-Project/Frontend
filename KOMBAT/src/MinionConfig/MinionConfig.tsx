import React, { useState, useEffect, useCallback } from "react";
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
// BACKEND VALIDATION
// ส่ง script ไปให้ Lexer + Parser จริงของ backend ตรวจ
// ============================================================
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

async function validateScriptWithBackend(script: string): Promise<ValidationResult> {
  if (!script.trim()) {
    return { valid: false, errors: ["Script is empty."] };
  }
  try {
    const res = await fetch("/api/game/validate-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script }),
    });
    if (!res.ok) throw new Error("Server error");
    const data = await res.json();
    return { valid: data.valid, errors: data.errors ?? [] };
  } catch {
    // ถ้า backend ไม่ตอบ ให้ผ่านไปก่อน (อย่าบล็อก UX)
    return { valid: true, errors: [] };
  }
}

// ============================================================
// PRESET SCRIPTS
// ============================================================
const SCRIPT_TEMPLATES: Record<string, { label: string; code: string }> = {
  hunter: {
    label: "⚔️ Berserker — บุกทะลุทุกอย่าง",
    code: `# BERSERKER — ไล่ตามศัตรูตลอด
op = opponent
if (op) then {
   dist = op / 10
   dir = op % 10
   if (dist - 1) then {
      if (dir - 1) then {
         if (dir - 2) then {
            if (dir - 3) then {
               if (dir - 4) then {
                  if (dir - 5) then move upleft else move downleft
               } else move down
            } else move downright
         } else move upright
      } else move up
   } else {
      if (dir - 1) then {
         if (dir - 2) then {
            if (dir - 3) then {
               if (dir - 4) then {
                  if (dir - 5) then shoot upleft 50 else shoot downleft 50
               } else shoot down 50
            } else shoot downright 50
         } else shoot upright 50
      } else shoot up 50
   }
} else {
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
done`,
  },

  defender: {
    label: "🛡️ Iron Wall — ป้อมที่เดินได้",
    code: `# IRON WALL — ยิงหนัก 30 แล้วถอยทิศตรงข้ามทันที
t = t + 1
m = 0
while (3 - m) {
  if (Budget - 100) then {
    opponentLoc = opponent
    if (opponentLoc / 10 - 1) then {
      if (opponentLoc % 10 - 5) then move downleft
      else if (opponentLoc % 10 - 4) then move down
      else if (opponentLoc % 10 - 3) then move downright
      else if (opponentLoc % 10 - 2) then move downright
      else if (opponentLoc % 10 - 1) then move upright
      else move up
    }
    else if (opponentLoc) then {
      if (opponentLoc % 10 - 5) then {
        cost = nearby upleft % 100 + 1
        if (Budget - cost) then shoot upleft cost else {}
      }
      else if (opponentLoc % 10 - 4) then {
        cost = nearby downleft % 100 + 1
        if (Budget - cost) then shoot downleft cost else {}
      }
      else if (opponentLoc % 10 - 3) then {
        cost = nearby down % 100 + 1
        if (Budget - cost) then shoot down cost else {}
      }
      else if (opponentLoc % 10 - 2) then {
        cost = nearby downright % 100 + 1
        if (Budget - cost) then shoot downright cost else {}
      }
      else if (opponentLoc % 10 - 1) then {
        cost = nearby upright % 100 + 1
        if (Budget - cost) then shoot upright cost else {}
      }
      else {
        cost = nearby up % 100 + 1
        if (Budget - cost) then shoot up cost else {}
      }
done
    }
    else {
      try = 0
      while (3 - try) {
        success = 1
        dir = random % 6
        if ((dir - 4) * (nearby upleft % 10 + 1) ^ 2) then move upleft
        else if ((dir - 3) * (nearby downleft % 10 + 1) ^ 2) then move downleft
        else if ((dir - 2) * (nearby down % 10 + 1) ^ 2) then move down
        else if ((dir - 1) * (nearby downright % 10 + 1) ^ 2) then move downright
        else if (dir * (nearby upright % 10 + 1) ^ 2) then move upright
        else if ((nearby up % 10 + 1) ^ 2) then move up
        else success = 0
        if (success) then try = 3 else try = try + 1
      }
      m = m + 1
    }
  }
  else done}
  `,
  },
};

// ============================================================
// GRAMMAR EXAMPLES
// ============================================================
const GRAMMAR_EXAMPLES = [
  { label: "Variable assignment", good: "x = 10",                                                    bad: "x == 10  ← ใช้ = ไม่ใช่ ==" },
  { label: "If statement",        good: "if (x) then move up",                                       bad: "if (x) move up  ← ขาด then" },
  { label: "If-else",             good: "if (x) then { shoot up 50 } else { move down }",            bad: "" },
  { label: "While loop",          good: "while (hp) { move up }",                                    bad: "" },
  { label: "Move",                good: "move up / move downleft",                                   bad: "move north  ← ไม่รู้จัก direction" },
  { label: "Shoot",               good: "shoot up 50",                                               bad: "shoot up  ← ขาด amount" },
  { label: "Nearby sensor",       good: "x = nearby upleft",                                         bad: "" },
  { label: "Ally / Opponent",     good: "loc = opponent",                                            bad: "" },
  { label: "Operators",           good: "+ - * / % ^",                                               bad: "== != >= <=  ← ไม่รองรับ" },
];

// ============================================================
// TYPES
// ============================================================
interface MinionConfigData {
  [id: number]: {
    defenseFactor: number | string;
    script: string;
    validation: ValidationResult;
    validating: boolean;
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
  const [grammarPulse, setGrammarPulse] = useState(false);

  // Validation state ใน modal (live ขณะพิมพ์ — debounced)
  const [modalValidation, setModalValidation] = useState<ValidationResult>({ valid: true, errors: [] });
  const [modalValidating, setModalValidating] = useState(false);

  useEffect(() => {
    const initialConfig: MinionConfigData = {};
    selectedTeam.forEach((id) => {
      initialConfig[id] = {
        defenseFactor: "",
        script: "",
        validation: { valid: true, errors: [] },
        validating: false,
      };
    });
    setConfig(initialConfig);
  }, [selectedTeam]);

  // ── Live validate ใน modal (debounce 600ms เพื่อไม่ spam backend) ──
  useEffect(() => {
    if (!isModalOpen) return;
    if (!tempText.trim()) {
      setModalValidation({ valid: false, errors: ["Script is empty."] });
      setModalValidating(false);
      return;
    }

    setModalValidating(true);
    const timer = setTimeout(async () => {
      const result = await validateScriptWithBackend(tempText);
      setModalValidation(result);
      setModalValidating(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [tempText, isModalOpen]);

  // ── Validate script ที่ผูกกับ unit หลัง save (เพื่ออัปเดต badge) ──
  const validateAndSaveToUnit = useCallback(async (id: number, script: string) => {
    setConfig(prev => ({
      ...prev,
      [id]: { ...prev[id], script, validating: true },
    }));
    const result = await validateScriptWithBackend(script);
    setConfig(prev => ({
      ...prev,
      [id]: { ...prev[id], validation: result, validating: false },
    }));
  }, []);

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
      const script = SCRIPT_TEMPLATES[templateKey].code;
      validateAndSaveToUnit(id, script);
    }
  };

  const openEditor = (id: number, initialScript?: string) => {
    setActiveUnitId(id);
    const txt = initialScript !== undefined ? initialScript : (config[id]?.script || "");
    setTempText(txt);
    setModalValidation({ valid: true, errors: [] });
    setModalValidating(false);
    setIsModalOpen(true);
  };

  const handleSaveScript = () => {
    if (activeUnitId !== null) {
      validateAndSaveToUnit(activeUnitId, tempText);
      setErrorMessage("");

      // ถ้า validation ยังไม่ valid → pulse syntax guide หลัง modal ปิด
      if (!modalValidation.valid && tempText.trim()) {
        setTimeout(() => {
          setGrammarPulse(true);
          setTimeout(() => setGrammarPulse(false), 2000); // 1.8s animation + buffer
        }, 300); // รอให้ modal ปิดก่อน
      }
    }
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveUnitId(null);
    setTempText("");
    setModalValidation({ valid: true, errors: [] });
    setModalValidating(false);
  };

  const handleDeploy = async () => {
    // ตรวจทุก unit ก่อน deploy
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

      // Re-validate กับ backend ก่อน deploy เสมอ
      const result = await validateScriptWithBackend(unit.script);
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
      };
    });
    onConfirm(finalConfig);
  };

  // ── Status badge ──
  const getScriptStatus = (id: number): "empty" | "preset" | "validating" | "valid" | "error" => {
    const unit = config[id];
    if (!unit) return "empty";
    if (!unit.script.trim()) return "empty";
    if (unit.validating) return "validating";
    const isPreset = Object.values(SCRIPT_TEMPLATES).some(t => t.code === unit.script);
    if (isPreset) return "preset";
    return unit.validation.valid ? "valid" : "error";
  };

  const STATUS_COLORS: Record<string, string> = {
    empty:      "#555",
    preset:     "#00d4ff",
    validating: "#ffaa00",
    valid:      "#00ff88",
    error:      "#ff3e3e",
  };
  const STATUS_LABELS: Record<string, string> = {
    empty:      "NO SCRIPT",
    preset:     "PRESET LOADED",
    validating: "CHECKING...",
    valid:      "SCRIPT VALID ✓",
    error:      "SYNTAX ERROR ✗",
  };

  return (
    <div className="config-screen">
      <div className="hud-scanline"></div>

      <div className="config-header">
        <h1 className="config-title">TACTICAL SCRIPTING</h1>
        <button
          className={`grammar-toggle-btn ${grammarPulse ? "grammar-btn-pulse" : ""}`}
          onClick={() => {
            setShowGrammar(v => !v);
            setGrammarPulse(false); // หยุด pulse เมื่อคลิก
          }}
        >
  {showGrammar ? "▲ HIDE SYNTAX GUIDE" : "▼ SHOW SYNTAX GUIDE"}
</button>
      </div>

      {/* GRAMMAR REFERENCE PANEL */}
      {showGrammar && (
        <div className={`grammar-panel ${grammarPulse ? "grammar-panel-pulse" : ""}`}>
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

      {/* UNIT CONFIG CARDS */}
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

      {/* ACTION BAR */}
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

      {/* CODE EDITOR MODAL */}
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
              className={`modal-textarea code-font ${!modalValidation.valid && tempText.trim() && !modalValidating ? "has-error" : ""}`}
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
              ) : modalValidating ? (
                <span className="val-checking">⟳ Checking syntax...</span>
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
                className={`modal-btn save ${!modalValidation.valid && tempText.trim() && !modalValidating ? "save-warn" : ""}`}
                onClick={handleSaveScript}
              >
                {!modalValidation.valid && tempText.trim() && !modalValidating ? "SAVE ANYWAY ⚠" : "SAVE SCRIPT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MinionConfig;