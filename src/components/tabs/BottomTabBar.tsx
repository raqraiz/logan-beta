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
  const radius = 22;
  const strokeWidth = 1.5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const phaseColor = phase ? (PHASE_HEX[phase] || PHASE_HEX.Follicular) : PHASE_HEX.Follicular;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      <div className="relative border-t border-border/50 bg-card/95 backdrop-blur-md">
        <div className="max-w-md mx-auto flex items-end justify-around h-16 px-6 pb-2">
          {/* Home tab */}
          <button
            onClick={() => onTabChange("home")}
            className={cn(
              "flex flex-col items-center justify-end gap-0.5 flex-1 transition-colors",
              activeTab === "home" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Home className="w-5 h-5" />
            <span className={cn("text-sm font-medium", activeTab === "home" && "font-semibold")}>Home</span>
          </button>

          {/* Ask tab — cycle ring raised above, label aligned with others */}
          <button
            onClick={() => onTabChange("ask")}
            className={cn(
              "flex flex-col items-center justify-end flex-1 transition-colors",
              activeTab === "ask" ? "text-primary" : "text-muted-foreground"
            )}
          >
            {/* Raised circle with ring — Ask text inside, positioned at bottom to align with Home/Plan */}
            <div className={cn(
              "relative w-12 h-12 rounded-full bg-card flex items-center justify-center transition-all duration-200 -mt-6",
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
                "text-sm font-bold relative z-10 transition-colors",
                activeTab === "ask" ? "text-primary" : "text-muted-foreground"
              )}>Ask</span>
            </div>
          </button>

          {/* Plan tab */}
          <button
            onClick={() => onTabChange("plan")}
            className={cn(
              "flex flex-col items-center justify-end gap-0.5 flex-1 transition-colors",
              activeTab === "plan" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Target className="w-5 h-5" />
            <span className={cn("text-sm font-medium", activeTab === "plan" && "font-semibold")}>Plan</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
