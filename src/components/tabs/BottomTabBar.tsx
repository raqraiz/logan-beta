import { Home, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import loganIcon from "@/assets/logan-icon.png";

export type TabId = "home" | "ask" | "plan";

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
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

      {/* Centered raised Ask button — overlaps the bar */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-5 flex flex-col items-center">
        <button
          onClick={() => onTabChange("ask")}
          className={cn(
            "flex items-center justify-center",
            "w-14 h-14 rounded-full",
            "bg-card border-2 transition-all duration-200",
            "shadow-[0_0_20px_hsl(var(--primary)/0.15)]",
            activeTab === "ask"
              ? "border-primary shadow-[0_0_30px_hsl(var(--primary)/0.3)] scale-105"
              : "border-border/50 hover:border-primary/50"
          )}
        >
          <div className={cn(
            "w-10 h-10 rounded-full overflow-hidden transition-all duration-200",
            activeTab === "ask" && "shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
          )}>
            <img
              src={loganIcon}
              alt="Ask Logan"
              className="w-full h-full object-cover"
            />
          </div>
        </button>
        <span className={cn(
          "text-[10px] font-medium mt-0.5 transition-colors",
          activeTab === "ask" ? "text-primary font-semibold" : "text-muted-foreground"
        )}>Ask</span>
      </div>
    </nav>
  );
}
