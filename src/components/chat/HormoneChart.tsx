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

export function HormoneChart({ cycleDay, phase, cycleLengthDays }: HormoneChartProps) {
  const color = PHASE_COLORS[phase] || PHASE_COLORS.Follicular;
  const tip = PHASE_TIPS[phase] || PHASE_TIPS.Follicular;

  // Phase boundaries
  const menEnd = 5;
  const ovDay = cycleLengthDays - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;

  // Normalize x position (0-1)
  const xPos = (cycleDay - 1) / (cycleLengthDays - 1);

  // SVG dimensions
  const w = 320;
  const h = 100;
  const padX = 16;
  const padTop = 12;
  const padBot = 24;
  const chartW = w - padX * 2;
  const chartH = h - padTop - padBot;

  // Build estrogen curve (rises in follicular, peaks at ovulation, drops in luteal)
  // Build progesterone curve (low until after ovulation, peaks mid-luteal, drops)
  const points = 60;
  const estrogenPath: string[] = [];
  const progesteronePath: string[] = [];

  for (let i = 0; i <= points; i++) {
    const t = i / points; // 0..1 across cycle
    const dayAt = t * cycleLengthDays;
    const x = padX + t * chartW;

    // Estrogen: rises during follicular, peaks at ovulation, moderate in luteal
    let estrogen: number;
    if (dayAt <= menEnd) {
      estrogen = 0.15 + (dayAt / menEnd) * 0.1;
    } else if (dayAt <= ovStart) {
      const follicularProgress = (dayAt - menEnd) / (ovStart - menEnd);
      estrogen = 0.25 + follicularProgress * 0.7;
    } else if (dayAt <= ovEnd) {
      const ovProgress = (dayAt - ovStart) / (ovEnd - ovStart);
      estrogen = 0.95 - ovProgress * 0.35;
    } else {
      const lutealProgress = (dayAt - ovEnd) / (cycleLengthDays - ovEnd);
      estrogen = 0.6 - lutealProgress * 0.45;
    }

    // Progesterone: very low until after ovulation, then rises and falls
    let progesterone: number;
    if (dayAt <= ovEnd) {
      progesterone = 0.08;
    } else {
      const lutealProgress = (dayAt - ovEnd) / (cycleLengthDays - ovEnd);
      // Bell-ish curve peaking around mid-luteal
      progesterone = 0.08 + 0.7 * Math.sin(lutealProgress * Math.PI);
    }

    const ey = padTop + chartH * (1 - estrogen);
    const py = padTop + chartH * (1 - progesterone);

    if (i === 0) {
      estrogenPath.push(`M ${x} ${ey}`);
      progesteronePath.push(`M ${x} ${py}`);
    } else {
      estrogenPath.push(`L ${x} ${ey}`);
      progesteronePath.push(`L ${x} ${py}`);
    }
  }

  // "You are here" marker position
  const markerX = padX + xPos * chartW;

  // Get estrogen Y at current day for marker
  let markerEstrogen: number;
  if (cycleDay <= menEnd) {
    markerEstrogen = 0.15 + (cycleDay / menEnd) * 0.1;
  } else if (cycleDay <= ovStart) {
    const fp = (cycleDay - menEnd) / (ovStart - menEnd);
    markerEstrogen = 0.25 + fp * 0.7;
  } else if (cycleDay <= ovEnd) {
    const op = (cycleDay - ovStart) / (ovEnd - ovStart);
    markerEstrogen = 0.95 - op * 0.35;
  } else {
    const lp = (cycleDay - ovEnd) / (cycleLengthDays - ovEnd);
    markerEstrogen = 0.6 - lp * 0.45;
  }
  const markerY = padTop + chartH * (1 - markerEstrogen);

  // Phase label positions (centered in each phase region)
  const phases = [
    { label: "Period", start: 0, end: menEnd },
    { label: "Follicular", start: menEnd, end: ovStart },
    { label: "Ovulation", start: ovStart, end: ovEnd },
    { label: "Luteal", start: ovEnd, end: cycleLengthDays },
  ];

  return (
    <div className="rounded-xl bg-[hsl(var(--logan-graphite))] border border-border/30 p-3 space-y-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ maxHeight: 120 }}
      >
        {/* Phase background bands */}
        {phases.map((p, i) => {
          const x1 = padX + (p.start / cycleLengthDays) * chartW;
          const x2 = padX + (p.end / cycleLengthDays) * chartW;
          return (
            <g key={i}>
              <rect
                x={x1}
                y={padTop}
                width={x2 - x1}
                height={chartH}
                fill={phase === p.label || (phase === "Menstruation" && p.label === "Period")
                  ? `${color}10`
                  : "transparent"
                }
                rx={2}
              />
              <text
                x={(x1 + x2) / 2}
                y={h - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="7"
                fontFamily="inherit"
              >
                {p.label}
              </text>
            </g>
          );
        })}

        {/* Estrogen line */}
        <path
          d={estrogenPath.join(" ")}
          fill="none"
          stroke="hsl(187, 100%, 42%)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />

        {/* Progesterone line */}
        <path
          d={progesteronePath.join(" ")}
          fill="none"
          stroke="hsl(270, 60%, 65%)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />

        {/* "You are here" marker */}
        <line
          x1={markerX}
          y1={padTop}
          x2={markerX}
          y2={padTop + chartH}
          stroke={color}
          strokeWidth="1"
          strokeDasharray="3 2"
          opacity={0.5}
        />
        <circle
          cx={markerX}
          cy={markerY}
          r={4}
          fill={color}
          stroke="hsl(var(--background))"
          strokeWidth="2"
        />
        <text
          x={markerX}
          y={padTop - 2}
          textAnchor="middle"
          fill={color}
          fontSize="7"
          fontWeight="600"
          fontFamily="inherit"
        >
          Day {cycleDay}
        </text>

        {/* Legend */}
        <circle cx={padX + 2} cy={h - 7} r={2.5} fill="hsl(187, 100%, 42%)" />
        <text x={padX + 8} y={h - 4} fontSize="6" className="fill-muted-foreground" fontFamily="inherit">
          Estrogen
        </text>
        <circle cx={padX + 48} cy={h - 7} r={2.5} fill="hsl(270, 60%, 65%)" />
        <text x={padX + 54} y={h - 4} fontSize="6" className="fill-muted-foreground" fontFamily="inherit">
          Progesterone
        </text>
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
