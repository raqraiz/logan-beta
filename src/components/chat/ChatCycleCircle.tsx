
type LifeStage = "cycling" | "postpartum" | "menopause";

interface ChatCycleCircleProps {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  size?: "sm" | "md";
  lifeStage?: LifeStage;
  postpartumStartDate?: string;
}

const PHASE_STYLES: Record<string, { color: string; ringColor: string; hex: string }> = {
  Menstruation: {
    color: "text-phase-menstruation",
    ringColor: "stroke-phase-menstruation",
    hex: "#E05262",
  },
  Follicular: {
    color: "text-phase-follicular",
    ringColor: "stroke-phase-follicular",
    hex: "#3DBF8A",
  },
  Ovulation: {
    color: "text-phase-ovulation",
    ringColor: "stroke-phase-ovulation",
    hex: "#E8A830",
  },
  Luteal: {
    color: "text-phase-luteal",
    ringColor: "stroke-phase-luteal",
    hex: "#9B6DD7",
  },
  Postpartum: {
    color: "text-pink-400",
    ringColor: "stroke-pink-400",
    hex: "#F472B6",
  },
  Menopause: {
    color: "text-amber-400",
    ringColor: "stroke-amber-400",
    hex: "#FBBF24",
  },
};

function CycleRing({ cycleDay, phase, cycleLengthDays, ringSize, fontSize, labelSize, showPhase = false }: {
  cycleDay: number; phase: string; cycleLengthDays: number;
  ringSize: string; fontSize: string; labelSize: string; showPhase?: boolean;
}) {
  const styles = PHASE_STYLES[phase] || PHASE_STYLES.Follicular;
  const progress = (cycleDay / cycleLengthDays) * 100;
  const radius = 42;
  const trackWidth = 3;
  const arcWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={`relative ${ringSize} flex-shrink-0`}>
      {/* Outer glow shadow */}
      <div
        className="absolute inset-0 rounded-full opacity-20 blur-xl"
        style={{ backgroundColor: styles.hex }}
      />
      {/* Inner disc with subtle depth */}
      <div className="absolute inset-[6px] rounded-full bg-[hsl(220,10%,8%)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]" />
      {/* SVG ring */}
      <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 100 100">
        {/* Track */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          strokeWidth={trackWidth}
          stroke="hsl(220 10% 16%)"
        />
        {/* Progress arc */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          strokeWidth={arcWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          stroke={styles.hex}
          style={{
            filter: `drop-shadow(0 0 4px ${styles.hex}80)`,
            transition: "stroke-dashoffset 0.6s ease",
          }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <span className={`${fontSize} font-bold ${styles.color}`}>{cycleDay}</span>
        {showPhase ? (
          <span className={`${labelSize} font-medium ${styles.color} opacity-80`}>{phase}</span>
        ) : (
          <span className={`${labelSize} text-muted-foreground uppercase tracking-wide`}>Day</span>
        )}
      </div>
    </div>
  );
}

// Static badge for non-cycling life stages — now with week number like cycling users
function LifeStageBadge({ lifeStage, size, postpartumStartDate }: { lifeStage: "postpartum" | "menopause"; size: "sm" | "md"; postpartumStartDate?: string }) {
  const stageKey = lifeStage === "postpartum" ? "Postpartum" : "Menopause";
  const styles = PHASE_STYLES[stageKey];
  const label = lifeStage === "postpartum" ? "Postpartum" : "Menopause";

  // Calculate weeks postpartum (or a default number for menopause)
  let displayNumber = "—";
  let subLabel = lifeStage === "postpartum" ? "Recovery" : "Transition";
  if (lifeStage === "postpartum" && postpartumStartDate) {
    const start = new Date(postpartumStartDate + "T12:00:00Z");
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      displayNumber = "0";
      subLabel = "Week";
    } else if (diffDays < 7) {
      displayNumber = String(diffDays + 1);
      subLabel = "Day";
    } else {
      const weeks = Math.floor(diffDays / 7);
      displayNumber = String(weeks);
      subLabel = weeks === 1 ? "Week" : "Weeks";
    }
  } else if (lifeStage === "postpartum") {
    displayNumber = "—";
    subLabel = "Week";
  }

  // Perforated (dashed) ring style
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  if (size === "sm") {
    return (
      <div className="relative w-10 h-10 flex-shrink-0">
        <div className="absolute inset-0 rounded-full opacity-20 blur-xl" style={{ backgroundColor: styles.hex }} />
        <div className="absolute inset-[3px] rounded-full bg-[hsl(220,10%,8%)]" />
        <svg className="w-full h-full relative z-10" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth="3.5"
            stroke="hsl(var(--muted))"
            opacity="0.9"
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            stroke={styles.hex}
            strokeDasharray="12 8"
            opacity="0.95"
            style={{ filter: `drop-shadow(0 0 3px ${styles.hex}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className="text-[11px] font-bold leading-none" style={{ color: styles.hex }}>
            {displayNumber}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-4">
      <div className="relative w-56 h-56 flex-shrink-0">
        <div className="absolute inset-0 rounded-full opacity-20 blur-xl" style={{ backgroundColor: styles.hex }} />
        <div className="absolute inset-[6px] rounded-full bg-[hsl(220,10%,8%)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]" />
        <svg className="w-full h-full relative z-10" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth="5"
            stroke="hsl(var(--muted))"
            opacity="0.9"
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke={styles.hex}
            strokeDasharray="14 10"
            opacity="0.9"
            style={{ filter: `drop-shadow(0 0 6px ${styles.hex}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className="text-4xl font-bold leading-none" style={{ color: styles.hex }}>
            {displayNumber}
          </span>
          <span className="text-xs text-muted-foreground mt-1">{subLabel}</span>
          <span className="text-sm font-semibold mt-0.5" style={{ color: styles.hex }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

export function ChatCycleCircle({ cycleDay, phase, cycleLengthDays, size = "md", lifeStage = "cycling", postpartumStartDate }: ChatCycleCircleProps) {
  // Non-cycling users get a static badge
  if (lifeStage !== "cycling") {
    return <LifeStageBadge lifeStage={lifeStage} size={size} postpartumStartDate={postpartumStartDate} />;
  }

  const isSmall = size === "sm";

  if (isSmall) {
    const styles = PHASE_STYLES[phase] || PHASE_STYLES.Follicular;
    const progress = (cycleDay / cycleLengthDays) * 100;
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <div className="relative w-10 h-10 flex-shrink-0 group cursor-pointer transition-transform duration-200 hover:scale-110">
        <div className="absolute inset-[3px] rounded-full bg-[hsl(220,10%,8%)]" />
        <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="5" stroke="hsl(220 10% 16%)" />
          <circle
            cx="50" cy="50" r={radius} fill="none" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            stroke={styles.hex}
            style={{ filter: `drop-shadow(0 0 3px ${styles.hex}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className={`text-xs font-bold ${styles.color}`}>{cycleDay}</span>
        </div>
      </div>
    );
  }

  // Large centered circle
  return (
    <div className="flex items-center justify-center py-4">
      <CycleRing
        cycleDay={cycleDay}
        phase={phase}
        cycleLengthDays={cycleLengthDays}
        ringSize="w-56 h-56"
        fontSize="text-5xl"
        labelSize="text-sm"
        showPhase
      />
    </div>
  );
}

// Helper to calculate cycle info from dates — uses noon UTC to avoid timezone off-by-one
export function calculateCycleInfo(
  lastPeriodStart: string | null,
  cycleLengthDays: number | null,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
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
