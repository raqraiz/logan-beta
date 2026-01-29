import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, isSameMonth } from "date-fns";

type CyclePhase = "menstruation" | "follicular" | "ovulation" | "luteal";

interface CycleForecastProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  currentCycleDay: number;
}

const phaseColors: Record<CyclePhase, string> = {
  menstruation: "bg-logan-red",
  follicular: "bg-logan-gold",
  ovulation: "bg-logan-cyan",
  luteal: "bg-purple-500",
};

const phaseTextColors: Record<CyclePhase, string> = {
  menstruation: "text-logan-red",
  follicular: "text-logan-gold",
  ovulation: "text-logan-cyan",
  luteal: "text-purple-400",
};

// Mock function to determine cycle phase for a given day
function getPhaseForDay(dayOfCycle: number): CyclePhase {
  if (dayOfCycle <= 5) return "menstruation";
  if (dayOfCycle <= 13) return "follicular";
  if (dayOfCycle <= 16) return "ovulation";
  return "luteal";
}

export function CycleForecast({ selectedDate, onDateSelect, currentCycleDay }: CycleForecastProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Calculate padding for first week
  const startPadding = getDay(monthStart);
  
  const today = new Date();

  // Mock: Calculate day of cycle for each date
  const getDayOfCycle = (date: Date): number => {
    const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const adjustedDay = ((currentCycleDay + diffDays - 1) % 28) + 1;
    return adjustedDay > 0 ? adjustedDay : adjustedDay + 28;
  };

  const selectedPhase = getPhaseForDay(getDayOfCycle(selectedDate));
  const selectedCycleDay = getDayOfCycle(selectedDate);

  return (
    <div className="bg-logan-graphite rounded-2xl p-5 border border-logan-slate/20">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="w-5 h-5 text-logan-blue" />
        <h2 className="text-xl font-display font-semibold text-logan-frost">
          Cycle Forecast
        </h2>
      </div>
      <p className="text-sm text-logan-frost/50 mb-4">
        Tap any date to see insights for that day
      </p>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        {(["menstruation", "follicular", "ovulation", "luteal"] as CyclePhase[]).map((phase) => (
          <div key={phase} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${phaseColors[phase]}`} />
            <span className="text-logan-frost/70 capitalize">{phase}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-logan-slate/20 pt-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 rounded-lg text-logan-frost/50 hover:text-logan-frost hover:bg-logan-slate/30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-display font-medium text-logan-frost">
            {format(currentMonth, "MMMM yyyy")}
          </h3>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 rounded-lg text-logan-frost/50 hover:text-logan-frost hover:bg-logan-slate/30 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
            <div key={day} className="text-center text-xs text-logan-frost/50 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for padding */}
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          
          {/* Day cells */}
          {daysInMonth.map((day) => {
            const dayOfCycle = getDayOfCycle(day);
            const phase = getPhaseForDay(dayOfCycle);
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, currentMonth);

            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect(day)}
                className={`aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
                  isSelected
                    ? "ring-2 ring-logan-gold ring-offset-2 ring-offset-logan-graphite"
                    : ""
                } ${
                  isCurrentMonth
                    ? `${phaseColors[phase]}/80 text-logan-frost hover:opacity-80`
                    : "bg-logan-slate/10 text-logan-frost/30"
                }`}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Info */}
      <div className="mt-4 p-4 rounded-xl border border-logan-red/30 bg-logan-red/5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-logan-frost/60">
              {format(selectedDate, "EEEE, MMM d")}
            </p>
            <p className={`text-lg font-semibold capitalize ${phaseTextColors[selectedPhase]}`}>
              {selectedPhase}
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-display font-bold text-logan-red">
              {selectedCycleDay}
            </span>
            <p className="text-xs text-logan-frost/50">Day</p>
          </div>
        </div>
      </div>
    </div>
  );
}
