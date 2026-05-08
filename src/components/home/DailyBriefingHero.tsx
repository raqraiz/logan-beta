import { format } from "date-fns";
import { Zap, Brain, AlertTriangle } from "lucide-react";
import { ChatCycleCircle } from "@/components/chat/ChatCycleCircle";

interface DailyBriefingHeroProps {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lifeStage?: "cycling" | "irregular" | "postpartum" | "menopause";
  postpartumStartDate?: string;
  onCircleClick?: () => void;
}

const PHASE_TEXT: Record<string, string> = {
  Menstruation: "text-phase-menstruation",
  Follicular: "text-phase-follicular",
  Ovulation: "text-phase-ovulation",
  Luteal: "text-phase-luteal",
  Postpartum: "text-pink-400",
  Menopause: "text-amber-400",
};

const PHASE_BG: Record<string, string> = {
  Menstruation: "bg-phase-menstruation/15",
  Follicular: "bg-phase-follicular/15",
  Ovulation: "bg-phase-ovulation/15",
  Luteal: "bg-phase-luteal/15",
  Postpartum: "bg-pink-400/15",
  Menopause: "bg-amber-400/15",
};

const PHASE_ACCENT: Record<string, string> = {
  Menstruation: "from-phase-menstruation/10 via-transparent to-transparent",
  Follicular: "from-phase-follicular/10 via-transparent to-transparent",
  Ovulation: "from-phase-ovulation/10 via-transparent to-transparent",
  Luteal: "from-phase-luteal/10 via-transparent to-transparent",
  Postpartum: "from-pink-400/10 via-transparent to-transparent",
  Menopause: "from-amber-400/10 via-transparent to-transparent",
};

const PHASE_HEADLINE: Record<string, string> = {
  Menstruation: "Slow down. Your body is doing the work.",
  Follicular: "Energy is building. Tackle the hard thing.",
  Ovulation: "Peak performance. Show up fully today.",
  Luteal: "Lower the bar. Finish, don't start.",
  Postpartum: "Healing in progress. Be gentle with yourself.",
  Menopause: "A new chapter. Strength and clarity ahead.",
};

function getDayMetrics(day: number, cycleLength: number) {
  const ovDay = cycleLength - 14;
  let energy = 0.5;
  if (day <= 2) energy = 0.2;
  else if (day <= 5) energy = 0.3 + (day - 2) * 0.05;
  else if (day < ovDay - 1) energy = 0.5 + (day - 5) / (ovDay - 6) * 0.4;
  else if (day <= ovDay + 2) energy = 0.9;
  else energy = Math.max(0.3, 0.85 - (day - ovDay - 2) / (cycleLength - ovDay - 2) * 0.55);

  let focus = 0.5;
  if (day <= 2) focus = 0.3;
  else if (day <= 5) focus = 0.35 + (day - 2) * 0.05;
  else if (day < ovDay - 1) focus = 0.55 + (day - 5) / (ovDay - 6) * 0.35;
  else if (day <= ovDay + 2) focus = 0.85;
  else focus = Math.max(0.25, 0.8 - (day - ovDay - 2) / (cycleLength - ovDay - 2) * 0.55);

  let symptomRisk = 0.2;
  if (day <= 3) symptomRisk = 0.7 - (day - 1) * 0.15;
  else if (day <= 5) symptomRisk = 0.3;
  else if (day < ovDay - 1) symptomRisk = 0.15;
  else if (day <= ovDay + 2) symptomRisk = 0.2;
  else {
    const daysIntoLuteal = day - (ovDay + 2);
    const lutealLength = cycleLength - (ovDay + 2);
    symptomRisk = 0.2 + (daysIntoLuteal / lutealLength) * 0.7;
  }
  return {
    energy: Math.min(1, Math.max(0, energy)),
    focus: Math.min(1, Math.max(0, focus)),
    symptomRisk: Math.min(1, Math.max(0, symptomRisk)),
  };
}

function MetricBar({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={`h-full rounded-full bg-current ${color} transition-all duration-500`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground/70 w-8 text-right tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function DailyBriefingHero({
  cycleDay,
  phase,
  cycleLengthDays,
  lifeStage,
  postpartumStartDate,
  onCircleClick,
}: DailyBriefingHeroProps) {
  const isNonCycling = lifeStage && lifeStage !== "cycling";
  const phaseText = PHASE_TEXT[phase] || "text-primary";
  const phaseBg = PHASE_BG[phase] || "bg-primary/15";
  const phaseAccent = PHASE_ACCENT[phase] || "from-primary/10 via-transparent to-transparent";
  const headline = PHASE_HEADLINE[phase] || "Your day, your rhythm.";
  const metrics = !isNonCycling ? getDayMetrics(cycleDay, cycleLengthDays) : null;

  return (
    <div className="w-full max-w-sm">
      <div className="relative rounded-2xl border border-border/30 bg-card/40 backdrop-blur-sm overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${phaseAccent} pointer-events-none`} />

        <div className="relative px-5 pt-5 pb-4">
          {/* Date strip */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
              Today's Briefing
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              {format(new Date(), "EEE, MMM d")}
            </p>
          </div>

          {/* Cycle circle + phase headline */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={onCircleClick}
              disabled={!onCircleClick || isNonCycling}
              className="transition-transform duration-200 active:scale-95 hover:scale-[1.02] disabled:hover:scale-100"
            >
              <ChatCycleCircle
                cycleDay={cycleDay}
                phase={phase}
                cycleLengthDays={cycleLengthDays}
                size="md"
                lifeStage={lifeStage}
                postpartumStartDate={postpartumStartDate}
              />
            </button>

            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${phaseBg}`}>
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${phaseText}`} />
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${phaseText}`}>
                {isNonCycling ? (lifeStage === "postpartum" ? "Postpartum" : "Menopause") : phase}
              </span>
            </div>

            <p className="text-sm text-foreground/85 text-center leading-relaxed max-w-[260px]">
              {headline}
            </p>
          </div>

          {/* Metrics */}
          {metrics && (
            <div className="mt-5 pt-4 border-t border-border/20 space-y-2">
              <MetricBar icon={Zap} label="Energy" value={metrics.energy} color="text-phase-follicular" />
              <MetricBar icon={Brain} label="Focus" value={metrics.focus} color="text-phase-ovulation" />
              <MetricBar icon={AlertTriangle} label="Risk" value={metrics.symptomRisk} color="text-phase-menstruation" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
