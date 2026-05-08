import { useState } from "react";
import { AnnotatedText } from "./CycleGlossary";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface HormoneChartProps {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
}

const PHASE_CSS_VARS: Record<string, string> = {
  Menstruation: "--phase-menstruation",
  Follicular: "--phase-follicular",
  Ovulation: "--phase-ovulation",
  Luteal: "--phase-luteal",
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

function HormoneChartSVG({ cycleDay, phase, cycleLengthDays, w, h }: HormoneChartProps & { w: number; h: number }) {
  const cssVar = PHASE_CSS_VARS[phase] || PHASE_CSS_VARS.Follicular;
  const color = `hsl(var(${cssVar}))`;

  const menEnd = 5;
  const ovDay = cycleLengthDays - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;
  const xPos = (cycleDay - 1) / (cycleLengthDays - 1);

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
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {phases.map((p, i) => {
        const x1 = padX + (p.start / cycleLengthDays) * chartW;
        const x2 = padX + (p.end / cycleLengthDays) * chartW;
        const isActive = phase === p.label;
        return (
          <g key={i}>
            <rect x={x1} y={padTop} width={isActive ? 1.5 : 0} height={chartH} fill={color} rx={1} />
            <text x={(x1 + x2) / 2} y={h - 18} textAnchor="middle" className="fill-muted-foreground"
              fontSize="10" fontFamily="inherit" opacity={isActive ? 1 : 0.45} fontWeight={isActive ? 600 : 400}>
              {p.label}
            </text>
          </g>
        );
      })}
      <line x1={padX} y1={padTop + chartH} x2={padX + chartW} y2={padTop + chartH}
        stroke="hsl(var(--border))" strokeWidth="0.5" opacity={0.2} />
      {HORMONES.map((hormone, i) => (
        <path key={hormone.key} d={hormonePaths[i]} fill="none" stroke={hormone.color}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      ))}
      <line x1={markerX} y1={padTop} x2={markerX} y2={padTop + chartH}
        stroke={color} strokeWidth="0.25" strokeDasharray="2 3" opacity={0.35} />
      <text x={markerX} y={padTop - 6} textAnchor="middle" fill={color}
        fontSize="9" fontWeight="500" fontFamily="inherit" opacity={0.8}>Day {cycleDay}</text>
      <text x={markerX} y={padTop + chartH + 12} textAnchor="middle" fill={color}
        fontSize="7" fontFamily="inherit" opacity={0.4}>▲ you</text>
      {HORMONES.map((hormone, i) => {
        const lx = padX + i * 95;
        return (
          <g key={hormone.key}>
            <line x1={lx} y1={h - 4} x2={lx + 12} y2={h - 4} stroke={hormone.color} strokeWidth="1.5" strokeLinecap="round" />
            <text x={lx + 16} y={h - 1} fontSize="9" className="fill-muted-foreground" fontFamily="inherit">{hormone.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function HormoneChart({ cycleDay, phase, cycleLengthDays }: HormoneChartProps) {
  const [expanded, setExpanded] = useState(false);
  const cssVar = PHASE_CSS_VARS[phase] || PHASE_CSS_VARS.Follicular;
  const color = `hsl(var(${cssVar}))`;
  const tip = PHASE_TIPS[phase] || PHASE_TIPS.Follicular;

  return (
    <>
      <div
        onClick={() => setExpanded(true)}
        className="rounded-xl bg-[hsl(var(--logan-graphite))] border border-border/30 p-3 sm:p-3 p-4 space-y-2 cursor-pointer active:scale-[0.98] transition-transform"
      >
        <HormoneChartSVG cycleDay={cycleDay} phase={phase} cycleLengthDays={cycleLengthDays} w={400} h={180} />
        <p className="text-xs sm:text-xs text-sm text-muted-foreground leading-relaxed px-1">
          <span className="font-medium" style={{ color }}>{phase}</span>
          {" "}— <AnnotatedText text={tip} />
        </p>
        <p className="text-[10px] text-muted-foreground/50 text-center">Tap to expand</p>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-lg bg-[hsl(var(--logan-graphite))] border-border/30 p-4 max-h-[90vh] overflow-y-auto">
          <div className="space-y-3">
            <HormoneChartSVG cycleDay={cycleDay} phase={phase} cycleLengthDays={cycleLengthDays} w={500} h={260} />
            <p className="text-sm text-muted-foreground leading-relaxed px-1">
              <span className="font-medium" style={{ color }}>{phase}</span>
              {" "}— <AnnotatedText text={tip} />
            </p>
            {/* Hormone descriptions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              {HORMONES.map((h) => (
                <div key={h.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: h.color }} />
                  <span className="text-xs text-muted-foreground">{h.label}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
