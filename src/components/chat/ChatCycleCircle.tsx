

interface ChatCycleCircleProps {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  size?: "sm" | "md";
}

const PHASE_STYLES: Record<string, { color: string; ringColor: string }> = {
  Menstruation: {
    color: "text-phase-menstruation",
    ringColor: "stroke-phase-menstruation",
  },
  Follicular: {
    color: "text-phase-follicular",
    ringColor: "stroke-phase-follicular",
  },
  Ovulation: {
    color: "text-phase-ovulation",
    ringColor: "stroke-phase-ovulation",
  },
  Luteal: {
    color: "text-phase-luteal",
    ringColor: "stroke-phase-luteal",
  },
};

export function ChatCycleCircle({ cycleDay, phase, cycleLengthDays, size = "md" }: ChatCycleCircleProps) {
  const styles = PHASE_STYLES[phase] || PHASE_STYLES.Follicular;
  const progress = (cycleDay / cycleLengthDays) * 100;
  
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const isSmall = size === "sm";

  if (isSmall) {
    return (
      <div className="relative w-10 h-10 flex-shrink-0 group cursor-pointer transition-transform duration-200 hover:scale-110">
        <svg className="w-full h-full -rotate-90 transition-all duration-200" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="4"
            className="stroke-muted/20 transition-all duration-200 group-hover:stroke-muted/40"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={`${styles.ringColor} transition-all duration-200 group-hover:drop-shadow-[0_0_6px_currentColor]`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xs font-bold ${styles.color} transition-all duration-200 group-hover:scale-110`}>
            {cycleDay}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-[#1C1E22] border border-border/30">
      {/* Cycle Circle */}
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background ring */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="3"
            className="stroke-muted/20"
          />
          {/* Progress ring */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={styles.ringColor}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${styles.color}`}>
            {cycleDay}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Day
          </span>
        </div>
      </div>

      {/* Phase label */}
      <div className="flex flex-col">
        <span className={`text-lg font-semibold ${styles.color}`}>
          {phase}
        </span>
        <span className="text-xs text-muted-foreground">
          Current phase
        </span>
      </div>
    </div>
  );
}

// Helper to calculate cycle info from dates — uses noon UTC to avoid timezone off-by-one
export function calculateCycleInfo(
  lastPeriodStart: string | null,
  cycleLengthDays: number | null,
  timezone: string = "Asia/Jerusalem"
): { cycleDay: number; phase: string } | null {
  if (!lastPeriodStart || !cycleLengthDays) return null;

  // Parse date-only string safely: treat YYYY-MM-DD as noon UTC to avoid timezone shift
  let periodStart: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
    const [year, month, day] = lastPeriodStart.split("-").map(Number);
    periodStart = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  } else {
    periodStart = new Date(lastPeriodStart);
  }

  // Get today's date in the user's timezone for accurate day calculation
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));

  const diffTime = today.getTime() - periodStart.getTime();
  const daysSinceStart = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // Calculate current day in cycle (1-indexed, wrapping around)
  const cycleDay = ((daysSinceStart % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;

  // Determine phase using biological model
  const menstruationEnd = 5;
  const ovulationDay = cycleLengthDays - 14;
  const ovulationStart = ovulationDay - 1;
  const ovulationEnd = ovulationDay + 2;

  let phase: string;

  if (cycleDay <= menstruationEnd) {
    phase = "Menstruation";
  } else if (cycleDay < ovulationStart) {
    phase = "Follicular";
  } else if (cycleDay <= ovulationEnd) {
    phase = "Ovulation";
  } else {
    phase = "Luteal";
  }

  return { cycleDay, phase };
}
