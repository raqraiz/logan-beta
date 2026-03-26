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
      <div className="relative border-t border-border/50 bg-card/95 backdrop-blur-md">
        <div className="max-w-md mx-auto flex items-center justify-around h-16 px-6">
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

          {/* Ask tab — inline with others, cycle ring raised above */}
          <button
            onClick={() => onTabChange("ask")}
            className="flex flex-col items-center justify-center flex-1 h-full relative"
          >
            {/* Raised circle with ring */}
            <div className={cn(
              "relative w-12 h-12 -mt-8 rounded-full bg-card flex items-center justify-center transition-all duration-200",
              activeTab === "ask" ? "scale-105" : ""
            )}>
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
                <circle
                  cx="24" cy="24" r="22"
                  fill="none"
                  strokeWidth="1.5"
                  stroke="hsl(var(--border) / 0.3)"
                />
                {hasCycle && (
                  <circle
                    cx="24" cy="24" r="22"
                    fill="none"
                    strokeWidth="1.5"
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
                "text-xs font-bold relative z-10 transition-colors",
                activeTab === "ask" ? "text-primary" : "text-muted-foreground"
              )}>
                Ask
              </span>
            </div>
          </button>

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
    </nav>
  );
}
