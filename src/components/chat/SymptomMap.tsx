import { useState } from "react";

interface SymptomMapProps {
  symptoms?: string[];
}

const PHASE_CONFIG = [
  { key: "menstrual", label: "Menstruation", color: "#e74c6f", angle: 0, span: 90 },
  { key: "follicular", label: "Follicular", color: "#60a5fa", angle: 90, span: 90 },
  { key: "ovulatory", label: "Ovulation", color: "#a78bfa", angle: 180, span: 45 },
  { key: "luteal", label: "Luteal", color: "#f59e42", angle: 225, span: 135 },
];

// Maps symptoms to phases with intensity (0-1)
const SYMPTOM_PHASE_MAP: Record<string, { phase: string; intensity: number }[]> = {
  // Physical
  "Cramps": [{ phase: "menstrual", intensity: 1 }, { phase: "luteal", intensity: 0.5 }],
  "Bloating": [{ phase: "luteal", intensity: 0.9 }, { phase: "menstrual", intensity: 0.6 }],
  "Headaches": [{ phase: "menstrual", intensity: 0.7 }, { phase: "luteal", intensity: 0.8 }],
  "Fatigue": [{ phase: "menstrual", intensity: 0.9 }, { phase: "luteal", intensity: 0.7 }],
  "Breast tenderness": [{ phase: "luteal", intensity: 0.9 }, { phase: "ovulatory", intensity: 0.3 }],
  "Back pain": [{ phase: "menstrual", intensity: 0.8 }, { phase: "luteal", intensity: 0.5 }],
  "Joint pain": [{ phase: "menstrual", intensity: 0.6 }, { phase: "luteal", intensity: 0.4 }],
  "Acne": [{ phase: "luteal", intensity: 0.8 }, { phase: "menstrual", intensity: 0.5 }],
  "Nausea": [{ phase: "menstrual", intensity: 0.5 }, { phase: "luteal", intensity: 0.4 }],
  "Hot flashes": [{ phase: "ovulatory", intensity: 0.6 }, { phase: "luteal", intensity: 0.4 }],
  // Emotional
  "Mood swings": [{ phase: "luteal", intensity: 1 }, { phase: "menstrual", intensity: 0.6 }],
  "Irritability": [{ phase: "luteal", intensity: 0.9 }, { phase: "menstrual", intensity: 0.5 }],
  "Anxiety": [{ phase: "luteal", intensity: 0.8 }, { phase: "menstrual", intensity: 0.5 }],
  "Sadness": [{ phase: "menstrual", intensity: 0.7 }, { phase: "luteal", intensity: 0.8 }],
  "Brain fog": [{ phase: "luteal", intensity: 0.7 }, { phase: "menstrual", intensity: 0.6 }],
  "Low motivation": [{ phase: "menstrual", intensity: 0.8 }, { phase: "luteal", intensity: 0.7 }],
  "Emotional sensitivity": [{ phase: "luteal", intensity: 0.9 }, { phase: "menstrual", intensity: 0.5 }],
  // Quirky
  "Cravings": [{ phase: "luteal", intensity: 1 }, { phase: "menstrual", intensity: 0.5 }],
  "Insomnia": [{ phase: "luteal", intensity: 0.8 }, { phase: "menstrual", intensity: 0.4 }],
  "Vivid dreams": [{ phase: "luteal", intensity: 0.7 }],
  "Clumsiness": [{ phase: "luteal", intensity: 0.5 }, { phase: "menstrual", intensity: 0.4 }],
  "Increased appetite": [{ phase: "luteal", intensity: 0.9 }, { phase: "follicular", intensity: 0.3 }],
  "Sensitivity to smell": [{ phase: "ovulatory", intensity: 0.8 }, { phase: "follicular", intensity: 0.4 }],
  "Libido changes": [{ phase: "ovulatory", intensity: 0.9 }, { phase: "follicular", intensity: 0.6 }],
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

export const SymptomMap = ({ symptoms = [] }: SymptomMapProps) => {
  const [hoveredSymptom, setHoveredSymptom] = useState<string | null>(null);

  const cx = 140, cy = 140, outerR = 110, innerR = 60;
  const displaySymptoms = symptoms.length > 0 ? symptoms : Object.keys(SYMPTOM_PHASE_MAP).slice(0, 5);

  // Build per-phase aggregated intensity from user symptoms
  const phaseIntensity: Record<string, number> = {};
  PHASE_CONFIG.forEach(p => { phaseIntensity[p.key] = 0; });

  displaySymptoms.forEach(s => {
    const mapping = SYMPTOM_PHASE_MAP[s];
    if (mapping) {
      mapping.forEach(m => {
        phaseIntensity[m.phase] = Math.max(phaseIntensity[m.phase], m.intensity);
      });
    }
  });

  // Position symptoms around the ring based on their primary phase
  const symptomPositions = displaySymptoms.map((s, i) => {
    const mapping = SYMPTOM_PHASE_MAP[s];
    const primaryPhase = mapping?.[0]?.phase || "menstrual";
    const phase = PHASE_CONFIG.find(p => p.key === primaryPhase) || PHASE_CONFIG[0];
    // Spread symptoms within the phase arc
    const samePhaseSymptoms = displaySymptoms.filter(ds => {
      const m = SYMPTOM_PHASE_MAP[ds];
      return (m?.[0]?.phase || "menstrual") === primaryPhase;
    });
    const idx = samePhaseSymptoms.indexOf(s);
    const spreadAngle = phase.span / (samePhaseSymptoms.length + 1);
    const angle = phase.angle + spreadAngle * (idx + 1);
    const r = outerR + 22 + (idx % 2) * 14;
    const pos = polarToCartesian(cx, cy, r, angle);
    const intensity = mapping?.[0]?.intensity || 0.5;
    return { name: s, ...pos, intensity, phase: primaryPhase, angle };
  });

  // Highlight connections when hovering
  const hoveredMapping = hoveredSymptom ? SYMPTOM_PHASE_MAP[hoveredSymptom] : null;

  return (
    <div className="rounded-xl overflow-hidden bg-card border border-border p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium text-center mb-2">
        Your symptom map
      </p>
      <svg viewBox="0 0 280 280" className="w-full max-w-[280px] mx-auto">
        {/* Phase ring segments */}
        {PHASE_CONFIG.map(phase => {
          const intensity = phaseIntensity[phase.key];
          const isHighlighted = hoveredMapping?.some(m => m.phase === phase.key);
          return (
            <g key={phase.key}>
              <path
                d={arcPath(cx, cy, outerR, phase.angle, phase.angle + phase.span)}
                fill="none"
                stroke={phase.color}
                strokeWidth={isHighlighted ? 18 : 14}
                strokeLinecap="round"
                opacity={hoveredSymptom ? (isHighlighted ? 0.95 : 0.2) : 0.25 + intensity * 0.65}
                style={{ transition: "all 0.3s ease" }}
              />
              {/* Phase label */}
              {(() => {
                const mid = phase.angle + phase.span / 2;
                const labelPos = polarToCartesian(cx, cy, innerR - 12, mid);
                return (
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="8"
                    fill={phase.color}
                    fontWeight="600"
                    opacity={hoveredSymptom ? (isHighlighted ? 1 : 0.3) : 0.8}
                    style={{ transition: "opacity 0.3s" }}
                  >
                    {phase.label}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {/* Connection lines from hovered symptom to affected phases */}
        {hoveredSymptom && hoveredMapping && symptomPositions
          .filter(sp => sp.name === hoveredSymptom)
          .map(sp => 
            hoveredMapping.map(m => {
              const phase = PHASE_CONFIG.find(p => p.key === m.phase)!;
              const midAngle = phase.angle + phase.span / 2;
              const target = polarToCartesian(cx, cy, outerR - 8, midAngle);
              return (
                <line
                  key={`${sp.name}-${m.phase}`}
                  x1={sp.x} y1={sp.y}
                  x2={target.x} y2={target.y}
                  stroke={phase.color}
                  strokeWidth="1.5"
                  strokeDasharray="3,3"
                  opacity="0.6"
                />
              );
            })
          )}

        {/* Symptom dots */}
        {symptomPositions.map(sp => {
          const isHovered = hoveredSymptom === sp.name;
          const dimmed = hoveredSymptom && !isHovered;
          const phase = PHASE_CONFIG.find(p => p.key === sp.phase);
          const dotR = 4 + sp.intensity * 4;
          return (
            <g
              key={sp.name}
              onMouseEnter={() => setHoveredSymptom(sp.name)}
              onMouseLeave={() => setHoveredSymptom(null)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={sp.x} cy={sp.y} r={dotR + 4}
                fill="transparent"
              />
              <circle
                cx={sp.x} cy={sp.y} r={dotR}
                fill={phase?.color || "#888"}
                opacity={dimmed ? 0.2 : 0.85}
                stroke={isHovered ? phase?.color : "none"}
                strokeWidth={isHovered ? 2 : 0}
                style={{ transition: "all 0.2s ease" }}
              />
              <text
                x={sp.x}
                y={sp.y + dotR + 9}
                textAnchor="middle"
                fontSize="6.5"
                fill="currentColor"
                className="text-foreground"
                opacity={dimmed ? 0.15 : 0.75}
                style={{ transition: "opacity 0.2s" }}
              >
                {sp.name.length > 12 ? sp.name.slice(0, 11) + "…" : sp.name}
              </text>
            </g>
          );
        })}

        {/* Center label */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" className="text-foreground" opacity="0.7">
          You
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="6.5" fill="currentColor" className="text-muted-foreground" opacity="0.5">
          {displaySymptoms.length} symptom{displaySymptoms.length !== 1 ? "s" : ""}
        </text>
      </svg>
    </div>
  );
};
