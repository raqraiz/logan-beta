import { differenceInDays } from "date-fns";

interface CycleCircleProps {
  lastPeriodStart: string | null;
  cycleLengthDays: number | null;
  size?: "sm" | "md";
}

type CyclePhase = "Menstruation" | "Follicular" | "Ovulation" | "Luteal";

interface PhaseInfo {
  phase: CyclePhase;
  color: string;
  bgColor: string;
}

function getCycleInfo(lastPeriodStart: string | null, cycleLengthDays: number | null): { day: number; phase: PhaseInfo } | null {
  if (!lastPeriodStart || !cycleLengthDays) return null;

  const today = new Date();
  const periodStart = new Date(lastPeriodStart);
  const daysSinceStart = differenceInDays(today, periodStart);
  
  // Calculate current day in cycle (1-indexed, wrapping around)
  const currentDay = ((daysSinceStart % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;

  // Determine phase based on typical cycle phases
  const menstruationEnd = 5;
  const follicularEnd = Math.floor(cycleLengthDays * 0.45);
  const ovulationEnd = Math.floor(cycleLengthDays * 0.55);

  let phaseInfo: PhaseInfo;

  if (currentDay <= menstruationEnd) {
    phaseInfo = {
      phase: "Menstruation",
      color: "text-rose-600",
      bgColor: "from-rose-500/20 to-rose-600/20",
    };
  } else if (currentDay <= follicularEnd) {
    phaseInfo = {
      phase: "Follicular",
      color: "text-emerald-600",
      bgColor: "from-emerald-500/20 to-emerald-600/20",
    };
  } else if (currentDay <= ovulationEnd) {
    phaseInfo = {
      phase: "Ovulation",
      color: "text-amber-600",
      bgColor: "from-amber-500/20 to-amber-600/20",
    };
  } else {
    phaseInfo = {
      phase: "Luteal",
      color: "text-violet-600",
      bgColor: "from-violet-500/20 to-violet-600/20",
    };
  }

  return { day: currentDay, phase: phaseInfo };
}

export function CycleCircle({ lastPeriodStart, cycleLengthDays, size = "sm" }: CycleCircleProps) {
  const cycleInfo = getCycleInfo(lastPeriodStart, cycleLengthDays);

  if (!cycleInfo) {
    return (
      <div className={`${size === "sm" ? "w-14 h-14" : "w-20 h-20"} rounded-full bg-muted flex items-center justify-center`}>
        <span className="text-xs text-muted-foreground">N/A</span>
      </div>
    );
  }

  const { day, phase } = cycleInfo;
  const progress = (day / (cycleLengthDays || 28)) * 100;
  const circumference = 2 * Math.PI * (size === "sm" ? 22 : 32);
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const dimensions = size === "sm" ? { svg: 56, r: 22, cx: 28, cy: 28 } : { svg: 80, r: 32, cx: 40, cy: 40 };

  return (
    <div className="relative flex flex-col items-center">
      <div className={`relative ${size === "sm" ? "w-14 h-14" : "w-20 h-20"}`}>
        {/* Background circle */}
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${dimensions.svg} ${dimensions.svg}`}>
          <circle
            cx={dimensions.cx}
            cy={dimensions.cy}
            r={dimensions.r}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-muted/30"
          />
          <circle
            cx={dimensions.cx}
            cy={dimensions.cy}
            r={dimensions.r}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={phase.color}
          />
        </svg>
        
        {/* Center content */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${phase.bgColor} rounded-full`}>
          <span className={`${size === "sm" ? "text-base" : "text-xl"} font-bold ${phase.color}`}>
            {day}
          </span>
        </div>
      </div>
      
      {/* Phase label */}
      <span className={`mt-1 ${size === "sm" ? "text-[10px]" : "text-xs"} font-medium ${phase.color} text-center leading-tight`}>
        {phase.phase}
      </span>
    </div>
  );
}
