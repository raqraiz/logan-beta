import { Sparkles } from "lucide-react";

interface DayInsightsProps {
  dayNumber: number;
}

const insights = [
  "Energy is naturally lower — honor rest over hustle",
  "Iron levels may dip; consider iron-rich foods",
  "Pain sensitivity heightened — go gentler on workouts",
  "Intuition and reflection are strongest now",
  "Social battery may be lower — solo time is okay",
];

export function DayInsights({ dayNumber }: DayInsightsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-logan-cyan" />
        <h3 className="font-medium text-logan-frost">
          Day {dayNumber} Insights
        </h3>
      </div>
      <p className="text-sm text-logan-frost/50">
        Tap to mark as not relevant, or edit to personalize
      </p>

      <div className="space-y-2">
        {insights.map((insight, index) => (
          <button
            key={index}
            className="w-full text-left bg-logan-graphite rounded-xl p-4 border border-logan-slate/20 hover:border-logan-slate/40 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-logan-red mt-2 flex-shrink-0" />
              <p className="text-logan-frost/80 group-hover:text-logan-frost transition-colors">
                {insight}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
