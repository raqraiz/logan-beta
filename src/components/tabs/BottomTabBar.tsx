import type React from "react";
import { User, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabId = "home" | "ask" | "plan";

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  cycleDay?: number;
  cycleLengthDays?: number;
  phase?: string;
}

const GRAD_ID = "logan-tab-grad";

function RingIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} style={style}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

const TABS: { id: TabId; label: string; tour: string; Icon: any }[] = [
  { id: "home", label: "You", tour: "home", Icon: User },
  { id: "ask", label: "Logan", tour: "ask", Icon: RingIcon },
  { id: "plan", label: "Plan", tour: "plan", Icon: Target },
];

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Shared gradient for active icon strokes */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id={GRAD_ID} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF2E92" />
            <stop offset="50%" stopColor="#A22BE8" />
            <stop offset="100%" stopColor="#2BD4D9" />
          </linearGradient>
        </defs>
      </svg>
      <div className="relative bg-card border-t border-border">
        <div className="max-w-md mx-auto flex items-center justify-around h-16 px-6">
          {TABS.map(({ id, label, tour, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className="flex flex-col items-center justify-center flex-1 h-full"
                aria-current={active ? "page" : undefined}
              >
                <span data-tour={tour} className="flex flex-col items-center gap-1">
                  <Icon
                    className={cn("w-6 h-6", active ? "tab-icon-active" : "text-muted-foreground")}
                    style={active ? { stroke: `url(#${GRAD_ID})` } : undefined}
                  />
                  <span
                    className={cn(
                      "text-xs",
                      active ? "text-foreground font-bold" : "text-muted-foreground font-medium"
                    )}
                  >
                    {label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
