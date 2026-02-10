interface HormoneChartProps {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
}

const PHASE_COLORS: Record<string, string> = {
  Menstruation: "hsl(355, 79%, 56%)",
  Follicular: "hsl(152, 60%, 52%)",
  Ovulation: "hsl(40, 90%, 60%)",
  Luteal: "hsl(270, 60%, 65%)",
};

const PHASE_TIPS: Record<string, string> = {
  Menstruation: "Energy is at its lowest. Rest harder now so you can push harder later.",
  Follicular: "Estrogen is climbing. Your brain and body are primed for new challenges.",
  Ovulation: "Peak performance window. Use this energy for the things that matter most.",
  Luteal: "Progesterone is rising. Shift from pushing to protecting your capacity.",
};

const HORMONES = [
  { key: "estrogen", label: "Estrogen", color: "hsl(187, 100%, 42%)" },
  { key: "progesterone", label: "Progesterone", color: "hsl(270, 60%, 65%)" },
  { key: "fsh", label: "FSH", color: "hsl(40, 85%, 55%)" },
  { key: "lh", label: "LH", color: "hsl(355, 75%, 60%)" },
];

function smoothPath(rawPoints: { x: number; y: number }[]): string {
  if (rawPoints.length < 2) return "";
  const pts = rawPoints;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function getHormoneValue(hormone: string, dayAt: number, cycleLengthDays: number, menEnd: number, ovDay: number, ovStart: number, ovEnd: number): number {
  switch (hormone) {
    case "estrogen": {
      if (dayAt <= menEnd) return 0.12 + (dayAt / menEnd) * 0.08;
      if (dayAt <= ovStart) return 0.20 + ((dayAt - menEnd) / (ovStart - menEnd)) * 0.72;
      if (dayAt <= ovEnd) return 0.92 - ((dayAt - ovStart) / (ovEnd - ovStart)) * 0.30;
      const lp = (dayAt - ovEnd) / (cycleLengthDays - ovEnd);
      return 0.62 - lp * 0.48;
    }
    case "progesterone": {
      if (dayAt <= ovEnd) return 0.06;
      const lp = (dayAt - ovEnd) / (cycleLengthDays - ovEnd);
      return 0.06 + 0.72 * Math.sin(lp * Math.PI);
    }
    case "fsh": {
      if (dayAt <= menEnd) {
        const p = dayAt / menEnd;
        return 0.25 + p * 0.30;
      }
      if (dayAt <= ovStart) {
        const p = (dayAt - menEnd) / (ovStart - menEnd);
        return 0.55 - p * 0.25;
      }
      if (dayAt <= ovEnd) {
        const p = (dayAt - ovStart) / (ovEnd - ovStart);
        return 0.30 + p * 0.35 * Math.sin(p * Math.PI);
      }
      return 0.10 + 0.05 * Math.sin(((dayAt - ovEnd) / (cycleLengthDays - ovEnd)) * Math.PI * 0.5);
    }
    case "lh": {
      if (dayAt < ovStart - 1) return 0.08;
      if (dayAt <= ovDay) {
        const p = (dayAt - (ovStart - 1)) / (ovDay - (ovStart - 1));
        return 0.08 + 0.87 * Math.pow(p, 1.5);
      }
      if (dayAt <= ovEnd + 1) {
        const p = (dayAt - ovDay) / (ovEnd + 1 - ovDay);
        return 0.95 - p * 0.82;
      }
      return 0.08 + 0.05 * Math.sin(((dayAt - ovEnd) / (cycleLengthDays - ovEnd)) * Math.PI * 0.3);
    }
    default:
      return 0;
  }
}

export function HormoneChart({ cycleDay, phase, cycleLengthDays }: HormoneChartProps) {
  const color = PHASE_COLORS[phase] || PHASE_COLORS.Follicular;
  const tip = PHASE_TIPS[phase] || PHASE_TIPS.Follicular;

  const menEnd = 5;
  const ovDay = cycleLengthDays - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;

  const xPos = (cycleDay - 1) / (cycleLengthDays - 1);

  const w = 400;
  const h = 180;
  const padX = 14;
  const padTop = 24;
  const padBot = 40;
  const chartW = w - padX * 2;
  const chartH = h - padTop - padBot;

  const numPoints = 80;

  const hormonePaths = HORMONES.map(({ key }) => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const dayAt = t * cycleLengthDays;
      const x = padX + t * chartW;
      const val = getHormoneValue(key, dayAt, cycleLengthDays, menEnd, ovDay, ovStart, ovEnd);
      const y = padTop + chartH * (1 - val);
      pts.push({ x, y });
    }
    return smoothPath(pts);
  });

  const markerX = padX + xPos * chartW;

  const phases = [
    { label: "Menstruation", start: 0, end: menEnd },
    { label: "Follicular", start: menEnd, end: ovStart },
    { label: "Ovulation", start: ovStart, end: ovEnd },
    { label: "Luteal", start: ovEnd, end: cycleLengthDays },
  ];

  return (
    <div className="rounded-xl bg-[hsl(var(--logan-graphite))] border border-border/30 p-3 space-y-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {/* Phase background bands */}
        {phases.map((p, i) => {
          const x1 = padX + (p.start / cycleLengthDays) * chartW;
          const x2 = padX + (p.end / cycleLengthDays) * chartW;
          const isActive = phase === p.label;
          return (
            <g key={i}>
              <rect
                x={x1}
                y={padTop}
                width={x2 - x1}
                height={chartH}
                fill={isActive ? `${color}` : "transparent"}
                fillOpacity={isActive ? 0.04 : 0}
                rx={3}
              />
              <text
                x={(x1 + x2) / 2}
                y={h - 18}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="10"
                fontFamily="inherit"
                opacity={isActive ? 1 : 0.45}
                fontWeight={isActive ? 600 : 400}
              >
                {p.label}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line
          x1={padX}
          y1={padTop + chartH}
          x2={padX + chartW}
          y2={padTop + chartH}
          stroke="hsl(var(--border))"
          strokeWidth="0.5"
          opacity={0.2}
        />

        {/* Hormone curves */}
        {HORMONES.map((hormone, i) => (
          <path
            key={hormone.key}
            d={hormonePaths[i]}
            fill="none"
            stroke={hormone.color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        ))}

        {/* "You are here" marker — hairline */}
        <line
          x1={markerX}
          y1={padTop}
          x2={markerX}
          y2={padTop + chartH}
          stroke={color}
          strokeWidth="0.25"
          strokeDasharray="2 3"
          opacity={0.35}
        />

        {/* Day label */}
        <text
          x={markerX}
          y={padTop - 6}
          textAnchor="middle"
          fill={color}
          fontSize="9"
          fontWeight="500"
          fontFamily="inherit"
          opacity={0.8}
        >
          Day {cycleDay}
        </text>
        <text
          x={markerX}
          y={padTop + chartH + 12}
          textAnchor="middle"
          fill={color}
          fontSize="7"
          fontFamily="inherit"
          opacity={0.4}
        >
          ▲ you
        </text>

        {/* Legend row */}
        {HORMONES.map((hormone, i) => {
          const lx = padX + i * 95;
          return (
            <g key={hormone.key}>
              <line
                x1={lx}
                y1={h - 4}
                x2={lx + 12}
                y2={h - 4}
                stroke={hormone.color}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <text
                x={lx + 16}
                y={h - 1}
                fontSize="9"
                className="fill-muted-foreground"
                fontFamily="inherit"
              >
                {hormone.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Bite-size tip */}
      <p className="text-xs text-muted-foreground leading-relaxed px-1">
        <span className="font-medium" style={{ color }}>
          {phase}
        </span>
        {" "}— {tip}
      </p>
    </div>
  );
}
