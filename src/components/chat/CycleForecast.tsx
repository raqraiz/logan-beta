import { useState, useMemo, useRef, useEffect } from "react";
import { Zap, Shield, Moon, TrendingUp, TrendingDown, AlertTriangle, Heart, ChevronLeft, ChevronRight, X, Calendar } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, differenceInCalendarDays, parseISO, isValid } from "date-fns";

interface CycleForecastProps {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart: string;
  anchorSymptom?: string | null;
  onClose: () => void;
  embedded?: boolean;
}

function getPhaseForDay(day: number, cycleLength: number): string {
  const menEnd = 5;
  const ovDay = cycleLength - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;
  if (day <= menEnd) return "Menstruation";
  if (day < ovStart) return "Follicular";
  if (day <= ovEnd) return "Ovulation";
  return "Luteal";
}

const PHASE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Menstruation: { bg: "bg-phase-menstruation/20", text: "text-phase-menstruation", dot: "bg-phase-menstruation" },
  Follicular:   { bg: "bg-phase-follicular/20",   text: "text-phase-follicular",   dot: "bg-phase-follicular" },
  Ovulation:    { bg: "bg-phase-ovulation/20",     text: "text-phase-ovulation",     dot: "bg-phase-ovulation" },
  Luteal:       { bg: "bg-phase-luteal/20",         text: "text-phase-luteal",         dot: "bg-phase-luteal" },
};

const PHASE_SOLID: Record<string, string> = {
  Menstruation: "bg-phase-menstruation",
  Follicular:   "bg-phase-follicular",
  Ovulation:    "bg-phase-ovulation",
  Luteal:       "bg-phase-luteal",
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

const PHASE_TIPS: Record<string, { expect: string[]; doThis: string[]; skip: string[] }> = {
  Menstruation: {
    expect: ["Lower energy, especially days 1-2", "Cramps, fatigue, or brain fog", "Craving comfort and quiet"],
    doThis: ["Light movement: walks, stretching", "Protect your calendar", "Iron-rich foods, warm meals"],
    skip: ["New high-stakes projects", "Intense HIIT or heavy lifting", "Over-scheduling"],
  },
  Follicular: {
    expect: ["Rising energy and optimism", "Sharper thinking and creativity", "Better stress tolerance"],
    doThis: ["Start new projects", "Push harder in workouts", "Brainstorm and problem-solve"],
    skip: ["Playing it safe", "Ignoring the energy window", "Assuming every week feels this good"],
  },
  Ovulation: {
    expect: ["Peak confidence and verbal fluency", "Peak physical performance", "Stronger social drive"],
    doThis: ["Presentations, negotiations", "PR attempts in the gym", "Important conversations"],
    skip: ["Admin tasks during peak hours", "Ignoring mid-cycle dip after", "Over-committing"],
  },
  Luteal: {
    expect: ["Declining energy after mid-phase", "Lower patience and stress tolerance", "Cravings, bloating, mood shifts"],
    doThis: ["Front-load hard tasks early", "Increase magnesium and complex carbs", "More recovery and downtime"],
    skip: ["Big decisions in late luteal", "Ignoring early warning signs", "Pushing through fatigue"],
  },
};

function EnergyBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${value * 100}%` }} />
    </div>
  );
}

export function CycleForecast({ cycleDay, phase, cycleLengthDays, lastPeriodStart, anchorSymptom, onClose }: CycleForecastProps) {
  const today = useMemo(() => new Date(), []);
  const periodStart = useMemo(() => {
    const parsed = parseISO(lastPeriodStart);
    return isValid(parsed) ? parsed : today;
  }, [lastPeriodStart, today]);

  const [currentMonth, setCurrentMonth] = useState(today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(today);
  const insightsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to insights on mobile when a day is selected
  useEffect(() => {
    if (selectedDate && insightsRef.current) {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        insightsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [selectedDate]);

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calStart, end: calEnd });

  // Map a calendar date to cycle day (wrapping across cycles)
  function getCycleDayForDate(date: Date): number {
    const diff = differenceInCalendarDays(date, periodStart);
    if (!Number.isFinite(diff)) return cycleDay;

    const mod = ((diff % cycleLengthDays) + cycleLengthDays) % cycleLengthDays;
    return mod === 0 ? cycleLengthDays : mod;
  }

  // Selected day info
  const selectedCycleDay = selectedDate ? getCycleDayForDate(selectedDate) : null;
  const hasValidSelectedCycleDay = selectedCycleDay !== null && Number.isFinite(selectedCycleDay);
  const selectedPhase = hasValidSelectedCycleDay ? getPhaseForDay(selectedCycleDay, cycleLengthDays) : null;
  const selectedMetrics = hasValidSelectedCycleDay ? getDayMetrics(selectedCycleDay, cycleLengthDays) : null;
  const selectedColors = selectedPhase ? PHASE_COLORS[selectedPhase] : null;
  const selectedTips = selectedPhase ? PHASE_TIPS[selectedPhase] : null;

  const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const PHASES = ["Menstruation", "Follicular", "Ovulation", "Luteal"] as const;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <h2 className="font-display font-semibold text-sm">Cycle Forecast</h2>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Disclaimer - prominent at top */}
        <div className="max-w-4xl mx-auto px-4 md:px-6 pt-3 pb-1">
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              This forecast is an estimate based on your cycle length and may vary with natural fluctuations. It is not medical advice.
            </p>
          </div>
        </div>
        <div className="max-w-4xl mx-auto md:flex md:gap-6 md:px-6 md:py-4">
          {/* LEFT: Calendar */}
          <div className="md:w-[340px] md:shrink-0">
            {/* Title + Legend */}
            <div className="px-4 md:px-0 pt-4 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-5 h-5 text-primary" />
                <h3 className="font-display font-semibold text-base text-foreground">Cycle Forecast</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Tap any date to see insights for that day</p>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                {PHASES.map((p) => (
                  <div key={p} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${PHASE_SOLID[p]}`} />
                    <span className="text-xs text-muted-foreground">{p}</span>
                  </div>
                ))}
              </div>
              <div className="border-b border-border/30" />
            </div>

            {/* Month navigation */}
            <div className="px-4 md:px-0 py-2 flex items-center justify-between">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-display font-semibold text-sm text-foreground">{format(currentMonth, "MMMM yyyy")}</span>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Weekday headers + grid */}
            <div className="px-4 md:px-0">
              <div className="grid grid-cols-7 gap-1.5 mb-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((date) => {
                  const inMonth = isSameMonth(date, currentMonth);
                  const isToday = isSameDay(date, today);
                  const isSelected = selectedDate && isSameDay(date, selectedDate);
                  const cd = getCycleDayForDate(date);
                  const ph = getPhaseForDay(cd, cycleLengthDays);
                  const colors = PHASE_COLORS[ph];

                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => setSelectedDate(isSelected ? null : date)}
                      className={`
                        aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all duration-150
                        ${!inMonth ? "opacity-30" : ""}
                        ${isSelected ? `ring-2 ring-primary scale-110 ${colors.bg}` : ""}
                        ${isToday && !isSelected ? "ring-2 ring-primary/60 bg-primary/10" : ""}
                        ${!isSelected && !isToday && inMonth ? colors.bg : ""}
                        hover:scale-105 active:scale-95
                      `}
                    >
                      <span className={isToday ? "text-primary font-bold" : colors.text}>{format(date, "d")}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Insights */}
          <div ref={insightsRef} className="md:flex-1 md:min-w-0 md:sticky md:top-0 md:self-start">
            {selectedDate && selectedPhase && selectedMetrics && selectedColors && selectedTips && hasValidSelectedCycleDay ? (
              <div className="px-4 md:px-0 py-4 animate-in slide-in-from-bottom-4 md:slide-in-from-right-4 duration-200">
                {/* Date + phase + cycle day summary */}
                <div className={`rounded-xl border border-border/30 ${selectedColors.bg} overflow-hidden mb-3`}>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{format(selectedDate, "EEEE, MMM d")}</p>
                      <p className={`text-lg font-display font-bold ${selectedColors.text}`}>{selectedPhase}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-display font-bold ${selectedColors.text}`}>{selectedCycleDay}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Day</p>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden mb-3">
                  <div className="px-4 py-3 flex items-center gap-2 border-b border-border/20">
                    <Zap className="w-4 h-4 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">Day {selectedCycleDay} Insights</h4>
                  </div>
                  <div className="px-4 py-3 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-16">Energy</span>
                      <EnergyBar value={selectedMetrics.energy} color="bg-phase-follicular" />
                      <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(selectedMetrics.energy * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-16">Focus</span>
                      <EnergyBar value={selectedMetrics.focus} color="bg-phase-ovulation" />
                      <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(selectedMetrics.focus * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-16">Symptom</span>
                      <EnergyBar value={selectedMetrics.symptomRisk} color="bg-phase-menstruation" />
                      <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(selectedMetrics.symptomRisk * 100)}%</span>
                    </div>
                  </div>
                </div>

                {/* Cheat sheet */}
                <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-border/15">
                    <div className="px-3 py-2.5 border-b md:border-b-0 border-border/15">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Expect
                      </p>
                      <ul className="space-y-1">
                        {selectedTips.expect.map((item, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                            <span className={`mt-1 w-1 h-1 rounded-full shrink-0 ${selectedColors.dot}`} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="px-3 py-2.5 border-b md:border-b-0 border-border/15">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Do this
                      </p>
                      <ul className="space-y-1">
                        {selectedTips.doThis.map((item, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                            <span className="mt-1 w-1 h-1 rounded-full shrink-0 bg-phase-follicular" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" /> Skip
                      </p>
                      <ul className="space-y-1">
                        {selectedTips.skip.map((item, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                            <span className="mt-1 w-1 h-1 rounded-full shrink-0 bg-phase-menstruation/60" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {anchorSymptom && selectedMetrics.symptomRisk > 0.5 && (
                    <div className="px-3 py-2 border-t border-border/15 flex items-center gap-2">
                      <Heart className="w-3 h-3 text-phase-menstruation shrink-0" />
                      <p className="text-[11px] text-muted-foreground">
                        <span className="text-foreground font-medium">{anchorSymptom}</span> risk is elevated — plan ahead
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-4 md:px-0 py-4">
                <div className="rounded-xl border border-border/30 bg-card/50 p-6 text-center">
                  <p className="text-sm text-muted-foreground">Tap any day to see your forecast</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Energy, focus, symptom risk, and what to do</p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
