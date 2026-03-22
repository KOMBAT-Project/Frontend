import React from "react";
import "./AmountTypeMinion.css";

import CHAIN from "../assets/CHAIN.png";
import HAMTARO from "../assets/HAMTARO.png";
import NAS from "../assets/NAS.png";
import TENG from "../assets/TENG.png";
import TAE from "../assets/TAE.jpg";

const RACES = [
  { id: 1, name: "HAMTARO", image: HAMTARO, color: "#1331b4" },
  { id: 2, name: "CHONE", image: CHAIN, color: "#ff0055" },
  { id: 3, name: "TOR", image: TAE, color: "#2dadc7" },
  { id: 4, name: "NOS", image: NAS, color: "#00ffaa" },
  { id: 5, name: "THUNG", image: TENG, color: "#ff7215" },
];

interface SelectionTypeProps {
  selectedTeam: number[];
  setSelectedTeam: React.Dispatch<React.SetStateAction<number[]>>;
  onConfirm: () => void;
  onBack: () => void;
}

const AmountTypeMinion: React.FC<SelectionTypeProps> = ({
  selectedTeam,
  setSelectedTeam,
  onConfirm,
  onBack,
}) => {
  const toggleMinion = (id: number) => {
    if (selectedTeam.includes(id)) {
      setSelectedTeam(selectedTeam.filter((item) => item !== id));
    } else {
      if (selectedTeam.length < 5) {
        setSelectedTeam([...selectedTeam, id]);
      } else {
        alert("You can choose only 5 tribe!");
      }
    }
  };

  // --- ฟังก์ชันคำนวณ 3D Tilt Effect ตามตำแหน่งเมาส์ ---
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // ปรับตัวเลข 15 เพื่อเพิ่มหรือลดความเอียงของการ์ด
    const rotateX = ((y - centerY) / centerY) * -15; 
    const rotateY = ((x - centerX) / centerX) * 15;

    // ส่งองศาไปให้ CSS Variables
    card.style.setProperty("--rx", `${rotateX}deg`);
    card.style.setProperty("--ry", `${rotateY}deg`);
  };

  // --- ฟังก์ชันรีเซ็ตการ์ดกลับมาแบนราบเมื่อเอาเมาส์ออก ---
  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.setProperty("--rx", `0deg`);
    card.style.setProperty("--ry", `0deg`);
  };

  return (
    <div className="selection-screen">
      {/* Background Effect Elements (Optional) */}
      <div className="grid-overlay"></div>

      <button
        onClick={onBack}
        className="back-btn"
        style={{ position: "absolute", left: "40px", top: "40px", zIndex: 30 }}
      >
        &lt; ABORT MISSION
      </button>

      <div className="selection-content">
        <h1 className="selection-title">DEPLOY SQUAD</h1>
        <p className="selection-subtitle">
          SELECT 1-5 UNITS FOR BATTLEFIELD DEPLOYMENT
        </p>

        <div className="race-grid">
          {/* เพิ่ม parameter 'index' เพื่อเอาไปคำนวณเวลาหน่วงอนิเมชัน */}
          {RACES.map((race, index) => (
            <div
              key={race.id}
              className={`race-card ${selectedTeam.includes(race.id) ? "active" : ""}`}
              onClick={() => toggleMinion(race.id)}
              onMouseMove={handleMouseMove}    // เพิ่ม Event จับเมาส์
              onMouseLeave={handleMouseLeave}  // เพิ่ม Event ปล่อยเมาส์
              style={{ 
                "--race-color": race.color,
                "--deploy-delay": `${index * 0.15}s` // ส่งค่าเวลาให้ CSS (ไล่ใบละ 0.15 วิ)
              } as React.CSSProperties}
            >
              {/* ใส่รูป */}
              <img src={race.image} alt={race.name} className="race-img-full" />

              {/* Overlay และ ชื่อ */}
              <div className="card-overlay"></div>

              {/* ปรับเงา text-shadow ของชื่อตามสีเผ่า */}
              <h3
                className="race-name-label"
                style={{
                  textShadow: `0 0 10px ${race.color}, 0 0 20px ${race.color}`,
                }}
              >
                {race.name}
              </h3>

              {/* Badge เลขลำดับ */}
              {selectedTeam.includes(race.id) && (
                <div className="selection-badge">
                  {selectedTeam.indexOf(race.id) + 1}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="controls-panel">
        <div className="info-text">
          <h4>SYSTEM STATUS:</h4>
          <span
            style={{
              color: selectedTeam.length > 0 ? "#00ffaa" : "#555",
              fontFamily: "Kanit",
              fontSize: "1.2rem",
            }}
          >
            {selectedTeam.length > 0
              ? `READY: ${selectedTeam.length} / 5 UNITS`
              : "WAITING FOR SELECTION..."}
          </span>
        </div>

        <button
          className="confirm-btn"
          onClick={onConfirm}
          disabled={selectedTeam.length === 0}
        >
          INITIATE
        </button>
      </div>
    </div>
  );
};

export default AmountTypeMinion;