import { Home, MessageCircle, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabId = "home" | "ask" | "plan";

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "ask", label: "Ask", icon: MessageCircle },
  { id: "plan", label: "Plan", icon: Target },
];

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/95 backdrop-blur-md safe-area-bottom">
      <div className="max-w-3xl mx-auto flex items-center justify-around h-14">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_hsl(var(--primary))]")} />
              <span className={cn("text-[10px] font-medium", isActive && "font-semibold")}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
