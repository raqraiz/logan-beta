import { Sparkles } from "lucide-react";

type CyclePhase = "menstruation" | "follicular" | "ovulation" | "luteal";

interface SmartCycleMapProps {
  currentDay: number;
  phase: CyclePhase;
}

const phaseColors: Record<CyclePhase, string> = {
  menstruation: "#E63946",
  follicular: "#F2A900",
  ovulation: "#00F5D4",
  luteal: "#8B5CF6",
};

export function SmartCycleMap({ currentDay, phase }: SmartCycleMapProps) {
  const totalDays = 28;
  const progress = (currentDay / totalDays) * 100;
  const phaseColor = phaseColors[phase];

  return (
    <div className="bg-logan-graphite rounded-2xl p-6 border border-logan-slate/20">
      <h2 className="text-xl font-display font-semibold text-logan-frost mb-6">
        Smart Cycle Map
      </h2>

      {/* Circular Progress */}
      <div className="flex justify-center mb-6">
        <div className="relative w-48 h-48">
          {/* Background circle */}
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="hsl(210, 7%, 26%)"
              strokeWidth="6"
            />
            {/* Progress arc */}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={phaseColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${progress * 2.64} 264`}
              className="transition-all duration-500"
            />
          </svg>
          
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-display font-bold text-logan-frost">
              {currentDay}
            </span>
            <span className="text-sm text-logan-red capitalize">
              {phase}
            </span>
          </div>
        </div>
      </div>

      {/* Day Insights Label */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-logan-cyan" />
        <span className="font-medium text-logan-frost">
          Day {currentDay} Insights
        </span>
      </div>
      <p className="text-sm text-logan-frost/50 mt-1">
        Tap to mark as not relevant, or edit to personalize
      </p>
    </div>
  );
}
