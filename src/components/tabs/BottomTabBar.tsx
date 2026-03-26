import { Home, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabId = "home" | "ask" | "plan";

const PHASE_HEX: Record<string, string> = {
  Menstruation: "#E05262",
  Follicular: "#3DBF8A",
  Ovulation: "#E8A830",
  Luteal: "#9B6DD7",
};

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  cycleDay?: number;
  cycleLengthDays?: number;
  phase?: string;
}

export function BottomTabBar({ activeTab, onTabChange, cycleDay, cycleLengthDays, phase }: BottomTabBarProps) {
  const hasCycle = cycleDay != null && cycleLengthDays != null && phase != null;
  const progress = hasCycle ? (cycleDay! / cycleLengthDays!) * 100 : 0;
  const radius = 26;
  const strokeWidth = 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const phaseColor = phase ? (PHASE_HEX[phase] || PHASE_HEX.Follicular) : PHASE_HEX.Follicular;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Background bar */}
      <div className="relative border-t border-border/50 bg-card/95 backdrop-blur-md">
        <div className="max-w-md mx-auto flex items-end justify-around h-14 px-6">
          {/* Home tab */}
          <button
            onClick={() => onTabChange("home")}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
              activeTab === "home" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Home className="w-5 h-5" />
            <span className={cn("text-[10px] font-medium", activeTab === "home" && "font-semibold")}>Home</span>
          </button>

          {/* Spacer for the raised button */}
          <div className="flex-1" />

          {/* Plan tab */}
          <button
            onClick={() => onTabChange("plan")}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
              activeTab === "plan" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Target className="w-5 h-5" />
            <span className={cn("text-[10px] font-medium", activeTab === "plan" && "font-semibold")}>Plan</span>
          </button>
        </div>
      </div>

      {/* Centered raised Ask button with cycle ring */}
      <button
        onClick={() => onTabChange("ask")}
        className={cn(
          "absolute left-1/2 -translate-x-1/2 -top-5 flex items-center justify-center",
          "w-14 h-14 rounded-full",
          "bg-card transition-all duration-200",
          activeTab === "ask" ? "scale-105" : "hover:scale-105"
        )}
      >
        {/* SVG cycle ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
          {/* Track */}
          <circle
            cx="28" cy="28" r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            stroke="hsl(var(--border) / 0.3)"
          />
          {/* Progress arc */}
          {hasCycle && (
            <circle
              cx="28" cy="28" r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              stroke={phaseColor}
              style={{
                filter: `drop-shadow(0 0 3px ${phaseColor}80)`,
                transition: "stroke-dashoffset 0.6s ease",
              }}
            />
          )}
        </svg>
        <span className={cn(
          "text-sm font-bold transition-colors relative z-10",
          activeTab === "ask" ? "text-primary" : "text-muted-foreground"
        )}>
          Ask
        </span>
      </button>
    </nav>
  );
}
