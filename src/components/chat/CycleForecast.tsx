import { useState } from "react";
import { Zap, Brain, Shield, Moon, TrendingUp, TrendingDown, AlertTriangle, Heart, ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CycleForecastProps {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  anchorSymptom?: string | null;
  onClose: () => void;
}

// Phase boundaries
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

const PHASE_COLORS: Record<string, { bg: string; text: string; ring: string; dot: string; bgSolid: string }> = {
  Menstruation: { bg: "bg-phase-menstruation/15", text: "text-phase-menstruation", ring: "ring-phase-menstruation", dot: "bg-phase-menstruation", bgSolid: "bg-phase-menstruation" },
  Follicular: { bg: "bg-phase-follicular/15", text: "text-phase-follicular", ring: "ring-phase-follicular", dot: "bg-phase-follicular", bgSolid: "bg-phase-follicular" },
  Ovulation: { bg: "bg-phase-ovulation/15", text: "text-phase-ovulation", ring: "ring-phase-ovulation", dot: "bg-phase-ovulation", bgSolid: "bg-phase-ovulation" },
  Luteal: { bg: "bg-phase-luteal/15", text: "text-phase-luteal", ring: "ring-phase-luteal", dot: "bg-phase-luteal", bgSolid: "bg-phase-luteal" },
};

const PHASE_ICONS: Record<string, React.ReactNode> = {
  Menstruation: <Moon className="w-4 h-4" />,
  Follicular: <TrendingUp className="w-4 h-4" />,
  Ovulation: <Zap className="w-4 h-4" />,
  Luteal: <Shield className="w-4 h-4" />,
};

interface DayData {
  day: number;
  phase: string;
  energy: number; // 0-1
  focus: number;  // 0-1
  symptomRisk: number; // 0-1
}

function getDayData(day: number, cycleLength: number, anchorSymptom?: string | null): DayData {
  const phase = getPhaseForDay(day, cycleLength);
  const ovDay = cycleLength - 14;
  
  // Energy curve: peaks around ovulation, lowest during menstruation
  let energy = 0.5;
  if (day <= 2) energy = 0.2;
  else if (day <= 5) energy = 0.3 + (day - 2) * 0.05;
  else if (day < ovDay - 1) energy = 0.5 + (day - 5) / (ovDay - 6) * 0.4;
  else if (day <= ovDay + 2) energy = 0.9;
  else energy = Math.max(0.3, 0.85 - (day - ovDay - 2) / (cycleLength - ovDay - 2) * 0.55);

  // Focus curve: similar to energy but peaks slightly earlier
  let focus = 0.5;
  if (day <= 2) focus = 0.3;
  else if (day <= 5) focus = 0.35 + (day - 2) * 0.05;
  else if (day < ovDay - 1) focus = 0.55 + (day - 5) / (ovDay - 6) * 0.35;
  else if (day <= ovDay + 2) focus = 0.85;
  else focus = Math.max(0.25, 0.8 - (day - ovDay - 2) / (cycleLength - ovDay - 2) * 0.55);

  // Symptom risk: highest in late luteal and early menstruation
  let symptomRisk = 0.2;
  if (day <= 3) symptomRisk = 0.7 - (day - 1) * 0.15;
  else if (day <= 5) symptomRisk = 0.3;
  else if (day < ovDay - 1) symptomRisk = 0.15;
  else if (day <= ovDay + 2) symptomRisk = 0.2;
  else {
    const daysIntolLuteal = day - (ovDay + 2);
    const lutealLength = cycleLength - (ovDay + 2);
    symptomRisk = 0.2 + (daysIntolLuteal / lutealLength) * 0.7;
  }

  return { day, phase, energy: Math.min(1, Math.max(0, energy)), focus: Math.min(1, Math.max(0, focus)), symptomRisk: Math.min(1, Math.max(0, symptomRisk)) };
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
      <div
        className={`h-full rounded-full ${color} transition-all duration-300`}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  );
}

export function CycleForecast({ cycleDay, phase, cycleLengthDays, anchorSymptom, onClose }: CycleForecastProps) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const allDays: DayData[] = [];
  for (let d = 1; d <= cycleLengthDays; d++) {
    allDays.push(getDayData(d, cycleLengthDays, anchorSymptom));
  }

  const selectedDayData = selectedDay ? getDayData(selectedDay, cycleLengthDays, anchorSymptom) : null;
  const selectedPhase = selectedDayData?.phase || phase;
  const selectedColors = PHASE_COLORS[selectedPhase] || PHASE_COLORS.Follicular;
  const selectedTips = PHASE_TIPS[selectedPhase] || PHASE_TIPS.Follicular;

  // Group days by phase for the legend
  const phases: { name: string; start: number; end: number }[] = [];
  let currentPhase = allDays[0].phase;
  let phaseStart = 1;
  for (let i = 1; i < allDays.length; i++) {
    if (allDays[i].phase !== currentPhase) {
      phases.push({ name: currentPhase, start: phaseStart, end: i });
      currentPhase = allDays[i].phase;
      phaseStart = i + 1;
    }
  }
  phases.push({ name: currentPhase, start: phaseStart, end: cycleLengthDays });

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <h2 className="font-display font-semibold text-sm">Cycle Forecast</h2>
        <div className="w-12" /> {/* Spacer */}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Phase legend */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex gap-1 rounded-xl overflow-hidden">
            {phases.map((p) => {
              const colors = PHASE_COLORS[p.name];
              const width = ((p.end - p.start + 1) / cycleLengthDays) * 100;
              return (
                <div
                  key={p.name}
                  className={`${colors.bgSolid} py-1.5 flex items-center justify-center gap-1 transition-opacity`}
                  style={{ width: `${width}%`, opacity: selectedDay && getPhaseForDay(selectedDay, cycleLengthDays) !== p.name ? 0.3 : 1 }}
                >
                  <span className="text-[9px] font-medium text-white/90 truncate px-1">
                    {p.name === "Menstruation" ? "🩸" : p.name === "Follicular" ? "🌱" : p.name === "Ovulation" ? "🌕" : "🍂"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day grid */}
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground mb-2">Tap any day for details</p>
          <div className="grid grid-cols-7 gap-1.5">
            {allDays.map((d) => {
              const colors = PHASE_COLORS[d.phase];
              const isToday = d.day === cycleDay;
              const isSelected = d.day === selectedDay;
              const isPast = d.day < cycleDay;
              return (
                <button
                  key={d.day}
                  onClick={() => setSelectedDay(isSelected ? null : d.day)}
                  className={`
                    relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all duration-200
                    ${isSelected ? `${colors.bg} ring-2 ${colors.ring} scale-110` : colors.bg}
                    ${isToday && !isSelected ? "ring-2 ring-primary" : ""}
                    ${isPast && !isToday && !isSelected ? "opacity-50" : ""}
                    hover:scale-105 active:scale-95
                  `}
                >
                  <span className={`font-bold ${isToday ? "text-primary" : colors.text}`}>
                    {d.day}
                  </span>
                  {/* Tiny energy indicator */}
                  <div className="flex gap-px mt-0.5">
                    {[1, 2, 3].map((bar) => (
                      <div
                        key={bar}
                        className={`w-0.5 h-0.5 rounded-full ${bar <= Math.ceil(d.energy * 3) ? colors.dot : "bg-muted/30"}`}
                      />
                    ))}
                  </div>
                  {isToday && (
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day detail */}
        {selectedDayData && (
          <div className="px-4 pb-4 animate-in slide-in-from-bottom-4 duration-200">
            <div className={`rounded-xl border ${selectedColors.bg} border-border/30 overflow-hidden`}>
              {/* Day header */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-border/20">
                <div className="flex items-center gap-2">
                  <span className={selectedColors.text}>{PHASE_ICONS[selectedPhase]}</span>
                  <div>
                    <h4 className={`text-sm font-semibold ${selectedColors.text}`}>
                      Day {selectedDayData.day} — {selectedPhase}
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedDayData.day === cycleDay ? "Today" : selectedDayData.day < cycleDay ? `${cycleDay - selectedDayData.day} days ago` : `In ${selectedDayData.day - cycleDay} days`}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Metrics */}
              <div className="px-4 py-3 space-y-2 border-b border-border/20">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-16">Energy</span>
                  <EnergyBar value={selectedDayData.energy} color="bg-phase-follicular" />
                  <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(selectedDayData.energy * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-16">Focus</span>
                  <EnergyBar value={selectedDayData.focus} color="bg-phase-ovulation" />
                  <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(selectedDayData.focus * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-16">Symptom</span>
                  <EnergyBar value={selectedDayData.symptomRisk} color="bg-phase-menstruation" />
                  <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(selectedDayData.symptomRisk * 100)}%</span>
                </div>
              </div>

              {/* Cheat sheet */}
              <div className="grid grid-cols-3 divide-x divide-border/15">
                <div className="px-3 py-2.5">
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
                <div className="px-3 py-2.5">
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

              {/* Anchor symptom callout */}
              {anchorSymptom && selectedDayData.symptomRisk > 0.5 && (
                <div className="px-3 py-2 border-t border-border/15 flex items-center gap-2">
                  <Heart className="w-3 h-3 text-phase-menstruation shrink-0" />
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-foreground font-medium">{anchorSymptom}</span> risk is elevated — plan ahead
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* No day selected prompt */}
        {!selectedDayData && (
          <div className="px-4 pb-4">
            <div className="rounded-xl border border-border/30 bg-card/50 p-6 text-center">
              <p className="text-sm text-muted-foreground">Tap any day above to see your forecast</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Energy, focus, symptom risk, and what to do</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
