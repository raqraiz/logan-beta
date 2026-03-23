

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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

function CycleRing({ cycleDay, phase, cycleLengthDays, ringSize, fontSize, labelSize }: {
  cycleDay: number; phase: string; cycleLengthDays: number;
  ringSize: string; fontSize: string; labelSize: string;
}) {
  const styles = PHASE_STYLES[phase] || PHASE_STYLES.Follicular;
  const progress = (cycleDay / cycleLengthDays) * 100;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={`relative ${ringSize} flex-shrink-0`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="3" className="stroke-muted/20" />
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className={styles.ringColor} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${fontSize} font-bold ${styles.color}`}>{cycleDay}</span>
        <span className={`${labelSize} text-muted-foreground uppercase tracking-wide`}>Day</span>
      </div>
    </div>
  );
}

export function ChatCycleCircle({ cycleDay, phase, cycleLengthDays, size = "md" }: ChatCycleCircleProps) {
  const [expanded, setExpanded] = useState(false);
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
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="4"
            className="stroke-muted/20 transition-all duration-200 group-hover:stroke-muted/40" />
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            className={`${styles.ringColor} transition-all duration-200 group-hover:drop-shadow-[0_0_6px_currentColor]`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xs font-bold ${styles.color} transition-all duration-200 group-hover:scale-110`}>{cycleDay}</span>
        </div>
      </div>
    );
  }

  // Phase details for expanded view
  const menEnd = 5;
  const ovDay = cycleLengthDays - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;
  const phases = [
    { name: "Menstruation", start: 1, end: menEnd },
    { name: "Follicular", start: menEnd + 1, end: ovStart - 1 },
    { name: "Ovulation", start: ovStart, end: ovEnd },
    { name: "Luteal", start: ovEnd + 1, end: cycleLengthDays },
  ];

  return (
    <>
      {/* Tappable card — larger on mobile */}
      <div
        onClick={() => setExpanded(true)}
        className="flex items-center gap-4 p-4 rounded-xl bg-[#1C1E22] border border-border/30 cursor-pointer active:scale-[0.98] transition-transform"
      >
        <CycleRing cycleDay={cycleDay} phase={phase} cycleLengthDays={cycleLengthDays}
          ringSize="w-28 h-28 sm:w-24 sm:h-24" fontSize="text-3xl sm:text-2xl" labelSize="text-[11px] sm:text-[10px]" />
        <div className="flex flex-col">
          <span className={`text-xl sm:text-lg font-semibold ${styles.color}`}>{phase}</span>
          <span className="text-xs text-muted-foreground">Current phase</span>
          <span className="text-[10px] text-muted-foreground/50 mt-1">Tap to expand</span>
        </div>
      </div>

      {/* Expanded dialog */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-sm bg-[#1C1E22] border-border/30 p-6">
          <div className="flex flex-col items-center gap-5">
            <CycleRing cycleDay={cycleDay} phase={phase} cycleLengthDays={cycleLengthDays}
              ringSize="w-44 h-44" fontSize="text-5xl" labelSize="text-sm" />
            <div className="text-center">
              <h3 className={`text-2xl font-bold ${styles.color}`}>{phase}</h3>
              <p className="text-sm text-muted-foreground mt-1">Day {cycleDay} of {cycleLengthDays}</p>
            </div>
            {/* Phase timeline */}
            <div className="w-full space-y-1.5 pt-2">
              {phases.map((p) => {
                const isActive = phase === p.name;
                const pStyles = PHASE_STYLES[p.name] || PHASE_STYLES.Follicular;
                return (
                  <div key={p.name} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${isActive ? "bg-white/5" : ""}`}>
                    <span className={`${isActive ? pStyles.color + " font-semibold" : "text-muted-foreground"}`}>{p.name}</span>
                    <span className="text-xs text-muted-foreground">Days {p.start}–{p.end}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
