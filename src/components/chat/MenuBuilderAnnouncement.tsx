import { useEffect, useState } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";

interface MenuBuilderAnnouncementProps {
  userId: string;
  onOpenPlan: () => void;
}

const STORAGE_KEY = "logan_menu_builder_announcement_dismissed_v1";

/**
 * One-time dismissible announcement introducing the new Menu Builder.
 * Appears on first open after launch; persists dismissal per user in localStorage.
 */
export function MenuBuilderAnnouncement({ userId, onOpenPlan }: MenuBuilderAnnouncementProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const dismissed = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (!dismissed) setVisible(true);
  }, [userId]);

  const dismiss = () => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="relative rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/40 to-card/20 backdrop-blur-sm p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">New</p>
            <h3 className="text-sm font-semibold text-foreground mt-0.5">Meet the Menu Builder</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Generate a personalized meal plan tailored to your cycle, goals, and preferences. Find it in your Plan tab under Nutrition.
          </p>
          <button
            onClick={() => {
              dismiss();
              onOpenPlan();
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-1"
          >
            Try it now
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
