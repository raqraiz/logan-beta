import { Zap, Brain, Shield, Moon, TrendingUp, TrendingDown, AlertTriangle, Heart } from "lucide-react";

interface PhaseCheatSheetProps {
  phase: string;
  cycleDay: number;
  cycleLengthDays: number;
  anchorSymptom?: string | null;
}

interface PhaseData {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  tagline: string;
  energy: "high" | "medium" | "low" | "variable";
  expect: string[];
  doThis: string[];
  avoid: string[];
}

const PHASE_DATA: Record<string, PhaseData> = {
  Menstruation: {
    color: "text-phase-menstruation",
    bgColor: "bg-phase-menstruation/10",
    borderColor: "border-phase-menstruation/20",
    icon: <Moon className="w-4 h-4 text-phase-menstruation" />,
    tagline: "Reset & restore",
    energy: "low",
    expect: [
      "Lower energy — not laziness, it's hormonal",
      "Emotions feel heavier; irritability is normal",
      "Cravings spike — your body needs more fuel",
    ],
    doThis: [
      "Walks, gentle yoga, or stretching only",
      "Eat what feels good — chocolate is fine",
      "Name the feeling out loud instead of pushing through",
    ],
    avoid: [
      "Forcing a normal pace on Day 1-2",
      "Guilt about resting or eating more",
      "Making big decisions while emotionally flooded",
    ],
  },
  Follicular: {
    color: "text-phase-follicular",
    bgColor: "bg-phase-follicular/10",
    borderColor: "border-phase-follicular/20",
    icon: <TrendingUp className="w-4 h-4 text-phase-follicular" />,
    tagline: "Build & create",
    energy: "high",
    expect: [
      "Energy returns — motivation feels natural",
      "Appetite may dip; lighter meals feel right",
      "Mood lifts, creativity and focus sharpen",
    ],
    doThis: [
      "Try new workouts or increase intensity",
      "Start projects, tackle hard conversations",
      "Ride the momentum — this window is real",
    ],
    avoid: [
      "Playing it safe when your body is ready",
      "Assuming every week will feel this good",
      "Skipping meals because appetite is lower",
    ],
  },
  Ovulation: {
    color: "text-phase-ovulation",
    bgColor: "bg-phase-ovulation/10",
    borderColor: "border-phase-ovulation/20",
    icon: <Zap className="w-4 h-4 text-phase-ovulation" />,
    tagline: "Peak performance",
    energy: "high",
    expect: [
      "Highest confidence, verbal fluency, and drive",
      "Peak strength — your body can handle more",
      "Appetite stays moderate; energy is steady",
    ],
    doThis: [
      "Go for PRs, HIIT, or challenging workouts",
      "Presentations, networking, hard asks",
      "Fuel performance — eat enough protein and carbs",
    ],
    avoid: [
      "Wasting this window on low-value tasks",
      "Over-committing because you feel invincible",
      "Ignoring the energy dip that follows",
    ],
  },
  Luteal: {
    color: "text-phase-luteal",
    bgColor: "bg-phase-luteal/10",
    borderColor: "border-phase-luteal/20",
    icon: <Shield className="w-4 h-4 text-phase-luteal" />,
    tagline: "Protect & prepare",
    energy: "variable",
    expect: [
      "Energy drops mid-phase — this is the shift",
      "Hunger and cravings increase (progesterone needs fuel)",
      "Patience thins; things that didn't bother you now do",
    ],
    doThis: [
      "Swap HIIT for strength, Pilates, or steady cardio",
      "Honor cravings with complex carbs, dark chocolate, fats",
      "Journal or talk it out — don't bottle the mood shift",
    ],
    avoid: [
      "Pushing through fatigue like it's weakness",
      "Restricting food when your body needs more",
      "Making permanent decisions from a temporary feeling",
    ],
  },
};
const ENERGY_DISPLAY = {
  high: { label: "High", color: "text-phase-follicular", bars: 3 },
  medium: { label: "Medium", color: "text-phase-ovulation", bars: 2 },
  low: { label: "Low", color: "text-phase-menstruation", bars: 1 },
  variable: { label: "Variable", color: "text-phase-luteal", bars: 2 },
};

const ENERGY_BAR_COLORS = {
  high: "bg-phase-follicular",
  medium: "bg-phase-ovulation",
  low: "bg-phase-menstruation",
  variable: "bg-phase-luteal",
};

function EnergyBars({ level }: { level: "high" | "medium" | "low" | "variable" }) {
  const { bars } = ENERGY_DISPLAY[level];
  const barColor = ENERGY_BAR_COLORS[level];
  return (
    <div className="flex gap-0.5 items-end">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-full ${i <= bars ? barColor : "bg-muted/30"}`}
          style={{ height: `${8 + i * 4}px` }}
        />
      ))}
    </div>
  );
}

const PHASE_DOT_COLORS: Record<string, string> = {
  Menstruation: "bg-phase-menstruation",
  Follicular: "bg-phase-follicular",
  Ovulation: "bg-phase-ovulation",
  Luteal: "bg-phase-luteal",
};

export function PhaseCheatSheet({ phase, cycleDay, cycleLengthDays, anchorSymptom }: PhaseCheatSheetProps) {
  const data = PHASE_DATA[phase] || PHASE_DATA.Follicular;
  const energyInfo = ENERGY_DISPLAY[data.energy];

  // Calculate days remaining in current phase
  const menEnd = 5;
  const ovDay = cycleLengthDays - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;
  
  let daysLeft = 0;
  if (phase === "Menstruation") daysLeft = Math.max(menEnd - cycleDay + 1, 0);
  else if (phase === "Follicular") daysLeft = Math.max(ovStart - cycleDay, 0);
  else if (phase === "Ovulation") daysLeft = Math.max(ovEnd - cycleDay + 1, 0);
  else daysLeft = Math.max(cycleLengthDays - cycleDay + 1, 0);

  const dotColor = PHASE_DOT_COLORS[phase] || PHASE_DOT_COLORS.Follicular;

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
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <EnergyBars level={data.energy} />
            <span className={energyInfo.color}>{energyInfo.label}</span>
          </div>
          <span>{daysLeft}d left</span>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/15">
        {/* What to expect */}
        <div className="px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Expect
          </p>
          <ul className="space-y-1">
            {data.expect.map((item, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                <span className={`mt-1 w-1 h-1 rounded-full shrink-0 ${dotColor}`} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Do this */}
        <div className="px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Do this
          </p>
          <ul className="space-y-1">
            {data.doThis.map((item, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                <span className="mt-1 w-1 h-1 rounded-full shrink-0 bg-phase-follicular" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Avoid */}
        <div className="px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> Skip
          </p>
          <ul className="space-y-1">
            {data.avoid.map((item, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                <span className="mt-1 w-1 h-1 rounded-full shrink-0 bg-phase-menstruation/60" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Anchor symptom callout */}
      {anchorSymptom && (phase === "Luteal" || phase === "Menstruation") && (
        <div className="px-3 py-2 border-t border-border/15 flex items-center gap-2">
          <Heart className="w-3 h-3 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">Watch for {anchorSymptom.toLowerCase()}</span> — it tends to peak in this phase
          </p>
        </div>
      )}
    </div>
  );
}
