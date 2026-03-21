import { Zap, Shield, Moon, TrendingUp, Battery, Heart } from "lucide-react";

interface PhaseCheatSheetProps {
  phase: string;
  cycleDay: number;
  cycleLengthDays: number;
  anchorSymptom?: string | null;
}

type Level = "high" | "medium" | "low" | "variable";

interface DimensionInfo {
  level: Level;
  note: string;
}

interface PhaseData {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  tagline: string;
  energy: DimensionInfo;
  focus: DimensionInfo;
  emotions: DimensionInfo;
}

const PHASE_DATA: Record<string, PhaseData> = {
  Menstruation: {
    color: "text-phase-menstruation",
    bgColor: "bg-phase-menstruation/10",
    borderColor: "border-phase-menstruation/20",
    icon: <Moon className="w-4 h-4 text-phase-menstruation" />,
    tagline: "Reset & restore",
    energy: { level: "low", note: "Body is recovering — rest is productive" },
    focus: { level: "medium", note: "Surprisingly clear once cramps ease" },
    emotions: { level: "variable", note: "Relief mixed with low patience" },
  },
  Follicular: {
    color: "text-phase-follicular",
    bgColor: "bg-phase-follicular/10",
    borderColor: "border-phase-follicular/20",
    icon: <TrendingUp className="w-4 h-4 text-phase-follicular" />,
    tagline: "Build & create",
    energy: { level: "high", note: "Rising steadily — momentum feels natural" },
    focus: { level: "high", note: "Creative problem-solving at its best" },
    emotions: { level: "high", note: "Optimistic, resilient, open to challenge" },
  },
  Ovulation: {
    color: "text-phase-ovulation",
    bgColor: "bg-phase-ovulation/10",
    borderColor: "border-phase-ovulation/20",
    icon: <Zap className="w-4 h-4 text-phase-ovulation" />,
    tagline: "Peak performance",
    energy: { level: "high", note: "Peak strength and endurance" },
    focus: { level: "high", note: "Verbal fluency and confidence peak" },
    emotions: { level: "high", note: "Social, confident, expressive" },
  },
  Luteal: {
    color: "text-phase-luteal",
    bgColor: "bg-phase-luteal/10",
    borderColor: "border-phase-luteal/20",
    icon: <Shield className="w-4 h-4 text-phase-luteal" />,
    tagline: "Protect & prepare",
    energy: { level: "variable", note: "Drops mid-phase — not laziness, hormones" },
    focus: { level: "low", note: "Detail work over big-picture thinking" },
    emotions: { level: "variable", note: "Patience thins — things feel heavier" },
  },
};

const LEVEL_COLORS: Record<Level, string> = {
  high: "bg-phase-follicular",
  medium: "bg-phase-ovulation",
  low: "bg-phase-menstruation",
  variable: "bg-phase-luteal",
};

const LEVEL_TEXT: Record<Level, string> = {
  high: "text-phase-follicular",
  medium: "text-phase-ovulation",
  low: "text-phase-menstruation",
  variable: "text-phase-luteal",
};

function LevelDots({ level }: { level: Level }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : level === "low" ? 1 : 2;
  const color = LEVEL_COLORS[level];
  return (
    <div className="flex gap-0.5 items-center">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= filled ? color : "bg-muted/30"} ${level === "variable" && i <= filled ? "animate-pulse" : ""}`}
        />
      ))}
    </div>
  );
}

const DIMENSION_LABELS: Record<string, { icon: string; label: string }> = {
  energy: { icon: "⚡", label: "Energy" },
  focus: { icon: "🎯", label: "Focus" },
  emotions: { icon: "💭", label: "Emotions" },
};

export function PhaseCheatSheet({ phase, cycleDay, cycleLengthDays, anchorSymptom }: PhaseCheatSheetProps) {
  const data = PHASE_DATA[phase] || PHASE_DATA.Follicular;

  const menEnd = 5;
  const ovDay = cycleLengthDays - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;

  let daysLeft = 0;
  if (phase === "Menstruation") daysLeft = Math.max(menEnd - cycleDay + 1, 0);
  else if (phase === "Follicular") daysLeft = Math.max(ovStart - cycleDay, 0);
  else if (phase === "Ovulation") daysLeft = Math.max(ovEnd - cycleDay + 1, 0);
  else daysLeft = Math.max(cycleLengthDays - cycleDay + 1, 0);

  const dimensions = ["energy", "focus", "emotions"] as const;

  return (
    <div className={`rounded-xl border ${data.borderColor} ${data.bgColor} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border/20">
        <div className="flex items-center gap-2">
          {data.icon}
          <div>
            <h4 className={`text-sm font-semibold ${data.color}`}>{phase}</h4>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{data.tagline}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{daysLeft}d left</span>
      </div>

      {/* Dimensions */}
      <div className="divide-y divide-border/15">
        {dimensions.map((dim) => {
          const info = data[dim];
          const meta = DIMENSION_LABELS[dim];
          return (
            <div key={dim} className="px-4 py-2.5 flex items-start gap-3">
              <div className="flex items-center gap-1.5 w-20 shrink-0 pt-0.5">
                <span className="text-xs">{meta.icon}</span>
                <span className={`text-xs font-medium ${LEVEL_TEXT[info.level]}`}>{meta.label}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <LevelDots level={info.level} />
                  <span className={`text-[10px] uppercase tracking-wider ${LEVEL_TEXT[info.level]}`}>
                    {info.level}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{info.note}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Anchor symptom callout */}
      {anchorSymptom && (phase === "Luteal" || phase === "Menstruation") && (
        <div className="px-4 py-2 border-t border-border/15 flex items-center gap-2">
          <Heart className="w-3 h-3 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">Watch for {anchorSymptom.toLowerCase()}</span> — it tends to peak in this phase
          </p>
        </div>
      )}
    </div>
  );
}
