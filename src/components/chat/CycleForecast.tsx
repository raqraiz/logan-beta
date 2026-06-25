import { useState, useMemo, useRef, useEffect } from "react";
import { useTrackFeature } from "@/hooks/useTrackFeature";
import { Zap, Shield, Users, Moon, TrendingUp, TrendingDown, AlertTriangle, Heart, ChevronLeft, ChevronRight, ChevronDown, X, Calendar, Pencil } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, differenceInCalendarDays, parseISO, isValid, addDays } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

interface CycleForecastProps {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart: string;
  currentPeriodEndDate?: string | null;
  anchorSymptom?: string | null;
  onClose: () => void;
  embedded?: boolean;
  onPeriodUpdate?: (date: Date) => Promise<void> | void;
  postpartumStartDate?: string;
}

function getPhaseForDay(day: number, cycleLength: number, menstruationEnd: number = 5): string {
  const menEnd = Math.max(1, Math.min(menstruationEnd, cycleLength - 1));
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

function getDayMetrics(day: number, cycleLength: number, menstruationEnd: number = 5) {
  const menEnd = Math.max(2, Math.min(menstruationEnd, cycleLength - 1));
  const ovDay = cycleLength - 14;

  let energy = 0.5;
  if (day <= 2) energy = 0.2;
  else if (day <= menEnd) energy = 0.3 + (day - 2) * (0.25 / Math.max(1, menEnd - 2));
  else if (day < ovDay - 1) energy = 0.55 + (day - menEnd) / Math.max(1, ovDay - menEnd - 1) * 0.35;
  else if (day <= ovDay + 2) energy = 0.9;
  else energy = Math.max(0.3, 0.85 - (day - ovDay - 2) / (cycleLength - ovDay - 2) * 0.55);

  let focus = 0.5;
  if (day <= 2) focus = 0.3;
  else if (day <= menEnd) focus = 0.35 + (day - 2) * (0.2 / Math.max(1, menEnd - 2));
  else if (day < ovDay - 1) focus = 0.6 + (day - menEnd) / Math.max(1, ovDay - menEnd - 1) * 0.25;
  else if (day <= ovDay + 2) focus = 0.85;
  else focus = Math.max(0.25, 0.8 - (day - ovDay - 2) / (cycleLength - ovDay - 2) * 0.55);

  let symptomRisk = 0.2;
  if (day <= 3) symptomRisk = 0.7 - (day - 1) * 0.15;
  else if (day <= menEnd) symptomRisk = 0.3;
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

const PHASE_TIPS: Record<string, string[]> = {
  Menstruation: [
    "Don't schedule anything you can cancel tomorrow — you'll want to.",
    "Skip the intense workout. A walk counts. Your body is recovering.",
    "Eat warm, iron-rich food. Now is not the time for a salad cleanse.",
    "If someone irritates you, wait 24 hours before responding.",
    "Go to bed 30 minutes earlier than you think you need to.",
  ],
  Follicular: [
    "Don't waste this energy on busywork — tackle the hard thing first.",
    "Say yes to the social plan. You actually have the bandwidth right now.",
    "Start the project you've been putting off. Motivation is real today.",
    "Eat enough protein — your muscles recover faster this week.",
    "Don't overcommit for next week. Luteal-you will not have this energy.",
  ],
  Ovulation: [
    "Have the hard conversation today — you'll handle it with grace.",
    "Push for the PR or the big presentation. You're at peak performance.",
    "Don't make long-term commitments based on how invincible you feel.",
    "Stay hydrated — the estrogen surge can cause subtle dehydration.",
    "Warm up properly. Ligament injury risk is quietly elevated right now.",
  ],
  Luteal: [
    "Lower the bar on purpose. 'Good enough' is the goal today.",
    "Don't send the emotional text. Write it, sleep on it, revisit tomorrow.",
    "Eat the carbs. Your brain needs serotonin and fighting cravings backfires.",
    "Cancel the optional plans without guilt. Protect your energy.",
    "When you feel like everything is falling apart — it's progesterone, not reality.",
  ],
};

const PARTNER_TIPS: Record<string, string[]> = {
  Menstruation: [
    "Don't ask 'what's wrong?' — just bring her tea and a blanket.",
    "Take one thing off her plate without being asked. Dishes, kids, dinner — pick one.",
    "She's not being dramatic. Her pain is real and her patience is gone. Don't test it.",
    "Don't suggest she 'just take a painkiller and push through.' Read the room.",
    "If she snaps at you, don't take it personally. She'll feel guilty about it later without your help.",
  ],
  Follicular: [
    "She's got energy again — match it. Plan something fun together.",
    "This is your window to bring up the thing you've been sitting on. She can handle it now.",
    "Don't coast just because she's in a good mood. Show up — she notices.",
    "Support the new idea or project she's excited about. Her confidence is climbing.",
    "If you've been meaning to apologize for something, now's the time. She's receptive.",
  ],
  Ovulation: [
    "She's at her sharpest and most social. Don't be boring — step up.",
    "Plan the date night. She's feeling herself and wants to connect.",
    "If you disagree on something, bring it up now — she'll debate fairly, not emotionally.",
    "Don't be intimidated by her confidence. Hype her up, not down.",
    "Pay attention. She's giving you her best self right now — notice it and say something.",
  ],
  Luteal: [
    "She's not picking fights — her brain is literally wired to notice threats right now.",
    "Don't say 'is it that time of the month?' Ever. Just don't.",
    "Bring her comfort food without commentary. No diet advice. No jokes.",
    "Handle bedtime or the morning routine without being asked. She's running on fumes.",
    "When she says 'I'm fine' — she's not. Sit with her. You don't have to fix it.",
  ],
};

function EnergyBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${value * 100}%` }} />
    </div>
  );
}

export function CycleForecast({ cycleDay, phase, cycleLengthDays, lastPeriodStart, currentPeriodEndDate, anchorSymptom, onClose, embedded = false, onPeriodUpdate, postpartumStartDate }: CycleForecastProps) {
  useTrackFeature("cycle_forecast");
  const today = useMemo(() => new Date(), []);
  // Parse YYYY-MM-DD as noon UTC to match calculateCycleInfo and avoid timezone off-by-one
  const periodStart = useMemo(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
      const [y, m, d] = lastPeriodStart.split("-").map(Number);
      return new Date(y, m - 1, d); // local midnight — safe for differenceInCalendarDays
    }
    const parsed = parseISO(lastPeriodStart);
    return isValid(parsed) ? parsed : today;
  }, [lastPeriodStart, today]);

  // Menstruation end day (1-indexed cycle day) derived from optional reported end date.
  const menstruationEndDay = useMemo(() => {
    if (!currentPeriodEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(currentPeriodEndDate)) return 5;
    const [ey, em, ed] = currentPeriodEndDate.split("-").map(Number);
    const endDate = new Date(ey, em - 1, ed);
    const diff = differenceInCalendarDays(endDate, periodStart) + 1;
    if (diff >= 1 && diff <= 14) return diff;
    return 5;
  }, [currentPeriodEndDate, periodStart]);

  const [currentMonth, setCurrentMonth] = useState(today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(today);
  const insightsRef = useRef<HTMLDivElement>(null);
  const [showEditPeriod, setShowEditPeriod] = useState(false);
  const [editPeriodDate, setEditPeriodDate] = useState<Date | undefined>(periodStart);
  const [isSavingPeriod, setIsSavingPeriod] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);


  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calStart, end: calEnd });

  // Map a calendar date to cycle day. Matches calculateCycleInfo: don't wrap an
  // overdue cycle to Day 1 until the next period is actually logged. Predict the
  // next period from today (one day from now if already overdue, otherwise
  // periodStart + cycleLength) and only wrap dates on/after that.
  const todayDiff = differenceInCalendarDays(today, periodStart);
  const currentCycleDayUnwrapped = todayDiff + 1;
  const nextPeriodStart =
    currentCycleDayUnwrapped > cycleLengthDays
      ? addDays(today, 1)
      : addDays(periodStart, cycleLengthDays);

  function getCycleDayForDate(date: Date): number {
    const diffFromNext = differenceInCalendarDays(date, nextPeriodStart);
    if (diffFromNext < 0) {
      const diffFromCurrent = differenceInCalendarDays(date, periodStart);
      if (!Number.isFinite(diffFromCurrent)) return cycleDay;
      if (diffFromCurrent >= 0) return diffFromCurrent + 1;
      const mod = ((diffFromCurrent % cycleLengthDays) + cycleLengthDays) % cycleLengthDays;
      return mod + 1;
    }
    const mod = ((diffFromNext % cycleLengthDays) + cycleLengthDays) % cycleLengthDays;
    return mod + 1;
  }

  // Selected day info
  const selectedCycleDay = selectedDate ? getCycleDayForDate(selectedDate) : null;
  const hasValidSelectedCycleDay = selectedCycleDay !== null && Number.isFinite(selectedCycleDay);
  const selectedPhase = hasValidSelectedCycleDay ? getPhaseForDay(selectedCycleDay, cycleLengthDays, menstruationEndDay) : null;
  const selectedMetrics = hasValidSelectedCycleDay ? getDayMetrics(selectedCycleDay, cycleLengthDays, menstruationEndDay) : null;
  const selectedColors = selectedPhase ? PHASE_COLORS[selectedPhase] : null;
  const selectedTips = selectedPhase ? PHASE_TIPS[selectedPhase] : null;
  const selectedPartnerTips = selectedPhase ? PARTNER_TIPS[selectedPhase] : null;

  const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const PHASES = ["Menstruation", "Follicular", "Ovulation", "Luteal"] as const;

  const editPeriodDialog = onPeriodUpdate ? (
    <Dialog open={showEditPeriod} onOpenChange={setShowEditPeriod}>
      <DialogContent className="max-w-sm rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>When did your last period start?</DialogTitle>
          <DialogDescription>
            Pick the first day of your most recent period so we can recalculate your cycle.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          <CalendarPicker
            mode="single"
            selected={editPeriodDate}
            onSelect={setEditPeriodDate}
            disabled={(d) => d > new Date()}
            className="p-3 pointer-events-auto"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setShowEditPeriod(false)}>Cancel</Button>
          <Button
            onClick={async () => {
              if (!editPeriodDate || !onPeriodUpdate) return;
              setIsSavingPeriod(true);
              try {
                await onPeriodUpdate(editPeriodDate);
                setShowEditPeriod(false);
              } finally {
                setIsSavingPeriod(false);
              }
            }}
            disabled={!editPeriodDate || isSavingPeriod}
          >
            {isSavingPeriod ? "Updating…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  if (embedded) {
    // Inline version without the fixed overlay and header
    return (
      <div>
        {editPeriodDialog}
        <div className="max-w-4xl mx-auto md:flex md:gap-6 md:px-6 md:py-4">
          {/* Calendar */}
          <div className="md:w-[340px] md:shrink-0">
            <div className="px-4 md:px-0 pt-4 pb-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <h3 className="font-display font-semibold text-base text-foreground">Cycle Forecast</h3>
                </div>
                {onPeriodUpdate && (
                  <button
                    onClick={() => { setEditPeriodDate(periodStart); setShowEditPeriod(true); }}
                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md border border-primary/30 hover:bg-primary/5"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit period date
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Tap any date to see insights for that day
                {lastPeriodStart && (
                  <> · Last period: <span className="text-foreground/70">{format(periodStart, "MMM d, yyyy")}</span></>
                )}
                {postpartumStartDate && (
                  <> · Baby's birth date: <span className="text-foreground/70">{format(new Date(postpartumStartDate + "T12:00:00Z"), "MMM d, yyyy")}</span></>
                )}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                {PHASES.map((p) => (
                  <div key={p} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${PHASE_SOLID[p]}`} />
                    <span className="text-xs text-muted-foreground">{p}</span>
                  </div>
                ))}
              </div>
              {/* Disclaimer */}
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 mb-3">
                <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  This forecast is an estimate based on your cycle length and may vary with natural fluctuations. It is not medical advice.
                </p>
              </div>
              <div className="border-b border-border/30" />
            </div>
            <div className="px-4 md:px-0 py-2 flex items-center justify-between">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-display font-semibold text-sm text-foreground">{format(currentMonth, "MMMM yyyy")}</span>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
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
                  const ph = getPhaseForDay(cd, cycleLengthDays, menstruationEndDay);
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

          {/* Insights */}
          <div ref={insightsRef} className="md:flex-1 md:min-w-0 md:sticky md:top-0 md:self-start">
            {selectedDate && selectedPhase && selectedMetrics && selectedColors && selectedTips && hasValidSelectedCycleDay ? (
              <div className="px-4 md:px-0 py-4 animate-in slide-in-from-bottom-4 md:slide-in-from-right-4 duration-200">
                <div className={`rounded-xl border border-border/30 ${selectedColors.bg} backdrop-blur-md overflow-hidden mb-3`}>
                  <button
                    type="button"
                    onClick={() => setShowInsights((v) => !v)}
                    aria-expanded={showInsights}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                  >
                    <div>
                      <p className="text-sm text-muted-foreground">{format(selectedDate, "EEEE, MMM d")}</p>
                      <p className={`text-lg font-display font-bold ${selectedColors.text}`}>{selectedPhase}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-2xl font-display font-bold ${selectedColors.text}`}>{selectedCycleDay}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Day</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showInsights ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  <p className="px-4 pb-2 text-[11px] text-muted-foreground/70">
                    {showInsights ? "Tap to hide insights" : "Tap to show insights"}
                  </p>
                </div>
                {showInsights && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
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
                    <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
                      <div className="px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Shield className="w-3 h-3" /> How not to mess up today
                        </p>
                        <ul className="space-y-1.5">
                          {(selectedTips || []).map((tip, i) => (
                            <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${selectedColors.dot}`} />
                              {tip}
                            </li>
                          ))}
                        </ul>
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
                    <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
                      <div className="px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Users className="w-3 h-3" /> For him — how not to mess up today
                        </p>
                        <ul className="space-y-1.5">
                          {(selectedPartnerTips || []).map((tip, i) => (
                            <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                              <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-primary/50" />
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 md:px-0 py-4">
                <div className="rounded-xl border border-border/30 bg-card/50 p-6 text-center">
                  <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Select a date to see phase insights</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
              {/* Disclaimer */}
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 mb-3">
                <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  This forecast is an estimate based on your cycle length and may vary with natural fluctuations. It is not medical advice.
                </p>
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
                  const ph = getPhaseForDay(cd, cycleLengthDays, menstruationEndDay);
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
                  <div className="px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> How not to mess up today
                    </p>
                    <ul className="space-y-1.5">
                      {(selectedTips || []).map((tip, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                          <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${selectedColors.dot}`} />
                          {tip}
                        </li>
                      ))}
                    </ul>
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
                <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
                  <div className="px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Users className="w-3 h-3" /> For him — how not to mess up today
                    </p>
                    <ul className="space-y-1.5">
                      {(selectedPartnerTips || []).map((tip, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-primary/50" />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
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
