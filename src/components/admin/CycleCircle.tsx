import { differenceInDays } from "date-fns";

interface CycleCircleProps {
  lastPeriodStart: string | null;
  cycleLengthDays: number | null;
  size?: "xs" | "sm" | "md";
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
  // Luteal phase is typically fixed at ~14 days before next period
  const menstruationEnd = 5;
  const ovulationDay = cycleLengthDays - 14; // Ovulation occurs ~14 days before next period
  const ovulationStart = ovulationDay - 1; // 1 day before ovulation
  const ovulationEnd = ovulationDay + 2; // 2 days after ovulation (fertile window)

  let phaseInfo: PhaseInfo;

  if (currentDay <= menstruationEnd) {
    phaseInfo = {
      phase: "Menstruation",
      color: "text-rose-600",
      bgColor: "from-rose-500/20 to-rose-600/20",
    };
  } else if (currentDay < ovulationStart) {
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

  const sizeClasses = {
    xs: "w-8 h-8",
    sm: "w-14 h-14",
    md: "w-20 h-20",
  };

  const dimensions = {
    xs: { svg: 32, r: 12, cx: 16, cy: 16 },
    sm: { svg: 56, r: 22, cx: 28, cy: 28 },
    md: { svg: 80, r: 32, cx: 40, cy: 40 },
  };

  if (!cycleInfo) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-muted flex items-center justify-center`}>
        <span className="text-[8px] text-muted-foreground">N/A</span>
      </div>
    );
  }

  const { day, phase } = cycleInfo;
  const progress = (day / (cycleLengthDays || 28)) * 100;
  const dim = dimensions[size];
  const circumference = 2 * Math.PI * dim.r;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const textSizes = {
    xs: "text-[10px]",
    sm: "text-base",
    md: "text-xl",
  };

  const labelSizes = {
    xs: "text-[8px]",
    sm: "text-[10px]",
    md: "text-xs",
  };

  return (
    <div className="relative flex flex-col items-center">
      <div className={`relative ${sizeClasses[size]}`}>
        {/* Background circle */}
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${dim.svg} ${dim.svg}`}>
          <circle
            cx={dim.cx}
            cy={dim.cy}
            r={dim.r}
            fill="none"
            stroke="currentColor"
            strokeWidth={size === "xs" ? 2 : 4}
            className="text-muted/30"
          />
          <circle
            cx={dim.cx}
            cy={dim.cy}
            r={dim.r}
            fill="none"
            stroke="currentColor"
            strokeWidth={size === "xs" ? 2 : 4}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={phase.color}
          />
        </svg>
        
        {/* Center content */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${phase.bgColor} rounded-full`}>
          <span className={`${textSizes[size]} font-bold ${phase.color}`}>
            {day}
          </span>
        </div>
      </div>
      
      {/* Phase label - hide for xs size */}
      {size !== "xs" && (
        <span className={`mt-1 ${labelSizes[size]} font-medium ${phase.color} text-center leading-tight`}>
          {phase.phase}
        </span>
      )}
    </div>
  );
}
