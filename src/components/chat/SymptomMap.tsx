interface SymptomMapProps {
  symptoms?: string[];
  anchorSymptom?: string;
  cycleDay?: number;
  cycleLengthDays?: number;
  phase?: string;
}

const PHASES = [
  { name: "Menstruation", color: "#EF4444", startAngle: 0, span: 64 },
  { name: "Follicular", color: "#10B981", startAngle: 64, span: 103 },
  { name: "Ovulation", color: "#F59E0B", startAngle: 167, span: 39 },
  { name: "Luteal", color: "#8B5CF6", startAngle: 206, span: 154 },
];

const SYMPTOM_TIMING: Record<string, Record<string, number>> = {
  "Rage spikes":        { Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.9 },
  "Anxiety spikes":     { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.9 },
  "Short fuse":         { Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Sudden dread":       { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Feeling overwhelmed":{ Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.9 },
  "Low stress tolerance":{ Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Irritability":       { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.9 },
  "Brain fog":          { Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.7 },
  "Energy crashes":     { Menstruation: 0.8, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.7 },
  "Wired but tired":    { Menstruation: 0.3, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.8 },
  "Full body inflammation":{ Menstruation: 0.7, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.6 },
  "Nausea":             { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.3, Luteal: 0.4 },
  "Dizziness":          { Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.4 },
  "Migraines":          { Menstruation: 0.8, Follicular: 0.1, Ovulation: 0.3, Luteal: 0.7 },
  "Deep fatigue":       { Menstruation: 0.9, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.7 },
  "Knee pain":          { Menstruation: 0.6, Follicular: 0.2, Ovulation: 0.3, Luteal: 0.5 },
  "Chin or jaw acne breakouts":{ Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Random shame spiral":{ Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "One stinky armpit":  { Menstruation: 0.2, Follicular: 0.3, Ovulation: 0.7, Luteal: 0.5 },
  "Mood swings":        { Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.9 },
  "Cravings":           { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.9 },
  "Bloating":           { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.8 },
};

const DEFAULT_TIMING: Record<string, number> = {
  Menstruation: 0.5, Follicular: 0.2, Ovulation: 0.2, Luteal: 0.7,
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export const SymptomMap = ({ symptoms = [], anchorSymptom, cycleDay, phase }: SymptomMapProps) => {
  const targetSymptom = anchorSymptom || (symptoms.length > 0 ? symptoms[0] : null);
  const timing = targetSymptom ? (SYMPTOM_TIMING[targetSymptom] || DEFAULT_TIMING) : DEFAULT_TIMING;
  const peakPhase = Object.entries(timing).reduce((a, b) => b[1] > a[1] ? b : a, ["", 0]);

  const cx = 120, cy = 120;
  const outerR = 100;
  const minR = 40;

  return (
    <div className="rounded-xl bg-card border border-border p-3 space-y-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium text-center">
        {targetSymptom ? `When to expect: ${targetSymptom}` : "Symptom timing across your cycle"}
      </p>

      <svg viewBox="0 0 240 240" className="w-full max-w-[240px] mx-auto">
        {/* Phase arcs — thickness = intensity */}
        {PHASES.map(p => {
          const intensity = timing[p.name] || 0;
          const thickness = 8 + intensity * 30; // 8px min, 38px max
          const r = outerR - thickness / 2;
          const isCurrentPhase = phase === p.name;
          const isPeak = p.name === peakPhase[0];
          const gap = 2;

          return (
            <g key={p.name}>
              {/* Background track */}
              <path
                d={arcPath(cx, cy, outerR - 4, p.startAngle + gap, p.startAngle + p.span - gap)}
                fill="none"
                stroke={p.color}
                strokeWidth="3"
                opacity="0.1"
                strokeLinecap="round"
              />
              {/* Intensity arc */}
              <path
                d={arcPath(cx, cy, r, p.startAngle + gap, p.startAngle + p.span - gap)}
                fill="none"
                stroke={p.color}
                strokeWidth={thickness}
                opacity={0.15 + intensity * 0.55}
                strokeLinecap="round"
              />
              {/* Phase label */}
              {(() => {
                const midAngle = p.startAngle + p.span / 2;
                const labelR = outerR + 10;
                const pos = polarToCartesian(cx, cy, labelR, midAngle);
                return (
                  <text
                    x={pos.x}
                    y={pos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="7"
                    fontWeight={isCurrentPhase ? "700" : "500"}
                    fill={p.color}
                    opacity={isCurrentPhase ? 1 : 0.7}
                  >
                    {p.name}
                  </text>
                );
              })()}
              {/* Intensity label for significant phases */}
              {intensity >= 0.5 && (() => {
                const midAngle = p.startAngle + p.span / 2;
                const pos = polarToCartesian(cx, cy, r, midAngle);
                return (
                  <text
                    x={pos.x}
                    y={pos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="7"
                    fontWeight="700"
                    fill="white"
                  >
                    {isPeak ? "peak" : "high"}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {/* Current day marker */}
        {cycleDay && phase && (() => {
          const currentPhase = PHASES.find(p => p.name === phase);
          if (!currentPhase) return null;
          const phaseProgress = 0.5; // approximate middle of phase
          const angle = currentPhase.startAngle + currentPhase.span * phaseProgress;
          const pos = polarToCartesian(cx, cy, minR - 8, angle);
          return (
            <g>
              <circle cx={pos.x} cy={pos.y} r="3" fill={currentPhase.color} />
              <text
                x={pos.x}
                y={pos.y + 10}
                textAnchor="middle"
                fontSize="6"
                fill={currentPhase.color}
                fontWeight="600"
              >
                Day {cycleDay}
              </text>
            </g>
          );
        })()}

        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" className="text-foreground" opacity="0.8">
          {targetSymptom || "Your cycle"}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="7" fill="currentColor" className="text-muted-foreground" opacity="0.5">
          forecast
        </text>
      </svg>

      {targetSymptom && (
        <p className="text-[10px] text-muted-foreground text-center leading-snug">
          Thicker arc = stronger effect.{" "}
          {peakPhase[0] === "Luteal"
            ? `Peaks in the ~12 days before your period.`
            : peakPhase[0] === "Menstruation"
              ? `Usually peaks during your period, then eases.`
              : `Tends to peak during ${peakPhase[0]}.`}
        </p>
      )}
    </div>
  );
};
