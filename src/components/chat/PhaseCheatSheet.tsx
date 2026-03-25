import { Zap, Shield, Moon, TrendingUp, Heart } from "lucide-react";

interface DimensionData {
  level: Level;
  note: string;
}

interface PhaseCheatSheetProps {
  phase: string;
  cycleDay: number;
  cycleLengthDays: number;
  anchorSymptom?: string | null;
  personalizedData?: {
    energy?: DimensionData;
    focus?: DimensionData;
    emotions?: DimensionData;
    nutrition?: DimensionData;
  } | null;
}

type Level = "high" | "medium" | "low" | "variable";

interface PhaseDefaults {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  tagline: string;
  energy: DimensionData;
  focus: DimensionData;
  emotions: DimensionData;
  nutrition: DimensionData;
}

const PHASE_DEFAULTS: Record<string, PhaseDefaults> = {
  Menstruation: {
    color: "text-phase-menstruation",
    bgColor: "bg-phase-menstruation/10",
    borderColor: "border-phase-menstruation/20",
    icon: <Moon className="w-4 h-4 text-phase-menstruation" />,
    tagline: "Reset & restore",
    energy: { level: "low", note: "How's your body holding up today?" },
    focus: { level: "medium", note: "Noticing any mental clarity or fog?" },
    emotions: { level: "variable", note: "What's your mood like right now?" },
    nutrition: { level: "high", note: "Craving anything warm or iron-rich?" },
  },
  Follicular: {
    color: "text-phase-follicular",
    bgColor: "bg-phase-follicular/10",
    borderColor: "border-phase-follicular/20",
    icon: <TrendingUp className="w-4 h-4 text-phase-follicular" />,
    tagline: "Build & create",
    energy: { level: "high", note: "Feeling any momentum building?" },
    focus: { level: "high", note: "How's your creative flow today?" },
    emotions: { level: "high", note: "Noticing a shift in your outlook?" },
    nutrition: { level: "medium", note: "Drawn to lighter, fresh foods?" },
  },
  Ovulation: {
    color: "text-phase-ovulation",
    bgColor: "bg-phase-ovulation/10",
    borderColor: "border-phase-ovulation/20",
    icon: <Zap className="w-4 h-4 text-phase-ovulation" />,
    tagline: "Peak performance",
    energy: { level: "high", note: "How's your energy feeling today?" },
    focus: { level: "high", note: "Words coming easily or not so much?" },
    emotions: { level: "high", note: "Feeling social or more inward?" },
    nutrition: { level: "medium", note: "Body fueling well on its own?" },
  },
  Luteal: {
    color: "text-phase-luteal",
    bgColor: "bg-phase-luteal/10",
    borderColor: "border-phase-luteal/20",
    icon: <Shield className="w-4 h-4 text-phase-luteal" />,
    tagline: "Protect & prepare",
    energy: { level: "variable", note: "How's your energy shifting?" },
    focus: { level: "low", note: "Big picture or detail mode today?" },
    emotions: { level: "variable", note: "Anything feeling heavier than usual?" },
    nutrition: { level: "high", note: "Noticing stronger cravings kicking in?" },
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
  nutrition: { icon: "🍽️", label: "Nutrition" },
};

function validateLevel(level: string | undefined): Level {
  if (level === "high" || level === "medium" || level === "low" || level === "variable") return level;
  return "medium";
}

export function PhaseCheatSheet({ phase, cycleDay, cycleLengthDays, anchorSymptom, personalizedData }: PhaseCheatSheetProps) {
  const defaults = PHASE_DEFAULTS[phase] || PHASE_DEFAULTS.Follicular;

  const menEnd = 5;
  const ovDay = cycleLengthDays - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;

  let daysLeft = 0;
  if (phase === "Menstruation") daysLeft = Math.max(menEnd - cycleDay + 1, 0);
  else if (phase === "Follicular") daysLeft = Math.max(ovStart - cycleDay, 0);
  else if (phase === "Ovulation") daysLeft = Math.max(ovEnd - cycleDay + 1, 0);
  else daysLeft = Math.max(cycleLengthDays - cycleDay + 1, 0);

  const dimensions = ["energy", "focus", "emotions", "nutrition"] as const;

  // Merge: AI-personalized data takes priority, fall back to static defaults
  const getDimension = (dim: "energy" | "focus" | "emotions" | "nutrition"): DimensionData => {
    const personalized = personalizedData?.[dim];
    if (personalized?.note && personalized?.level) {
      return { level: validateLevel(personalized.level), note: personalized.note };
    }
    return defaults[dim];
  };

  return (
    <div className={`rounded-xl border ${defaults.borderColor} ${defaults.bgColor} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border/20">
        <div className="flex items-center gap-2">
          {defaults.icon}
          <div>
            <h4 className={`text-sm font-semibold ${defaults.color}`}>{phase}</h4>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{defaults.tagline}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{daysLeft}d left</span>
      </div>

      {/* Dimensions */}
      <div className="divide-y divide-border/15">
        {dimensions.map((dim) => {
          const info = getDimension(dim);
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
