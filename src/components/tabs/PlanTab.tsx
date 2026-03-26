import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dumbbell, Brain, Heart, Utensils, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CycleData {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
}

interface PlanTabProps {
  userId: string;
  cycleData: CycleData | null;
}

interface CheckinEntry {
  dimension: string;
  response: string;
  phase: string;
  cycle_day: number;
  created_at: string;
}

const DIMENSION_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  energy: { icon: TrendingUp, label: "Energy", color: "text-phase-follicular" },
  focus: { icon: Brain, label: "Focus", color: "text-phase-ovulation" },
  emotions: { icon: Heart, label: "Emotions", color: "text-phase-menstruation" },
  nutrition: { icon: Utensils, label: "Nutrition", color: "text-phase-luteal" },
};

const PHASE_TIPS: Record<string, { exercise: string; energy: string; mood: string }> = {
  Menstruation: {
    exercise: "Light movement — walks, yoga, stretching. Skip intense workouts.",
    energy: "Lower energy is normal. Protect your schedule and rest more.",
    mood: "You may feel withdrawn or emotional. Honor the need for quiet.",
  },
  Follicular: {
    exercise: "Ramp up intensity — try new workouts, lift heavier, push harder.",
    energy: "Rising energy and motivation. Great time to start projects.",
    mood: "Optimism and creativity peak. Use it for problem-solving.",
  },
  Ovulation: {
    exercise: "Peak performance window — go for PRs, HIIT, competitive sports.",
    energy: "Highest energy of the cycle. Don't waste it on admin.",
    mood: "Social confidence peaks. Schedule important conversations.",
  },
  Luteal: {
    exercise: "Front-load hard sessions early, then taper to moderate/low.",
    energy: "Declining steadily — increase rest, magnesium, complex carbs.",
    mood: "Lower stress tolerance. Avoid big decisions in late luteal.",
  },
};

export function PlanTab({ userId, cycleData }: PlanTabProps) {
  const [checkins, setCheckins] = useState<CheckinEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCheckins = async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("metadata, created_at")
        .eq("user_id", userId)
        .eq("message_type", "checkin")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        const entries: CheckinEntry[] = data
          .filter((d) => d.metadata && typeof d.metadata === "object")
          .map((d) => {
            const m = d.metadata as Record<string, any>;
            return {
              dimension: m.dimension || "",
              response: m.response || "",
              phase: m.phase || "",
              cycle_day: m.cycle_day || 0,
              created_at: d.created_at,
            };
          });
        setCheckins(entries);
      }
      setLoading(false);
    };

    fetchCheckins();
  }, [userId]);

  const currentPhase = cycleData?.phase || "Follicular";
  const tips = PHASE_TIPS[currentPhase] || PHASE_TIPS.Follicular;

  // Get latest check-in per dimension
  const latestByDimension: Record<string, CheckinEntry> = {};
  for (const c of checkins) {
    if (!latestByDimension[c.dimension]) {
      latestByDimension[c.dimension] = c;
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-20">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground">Your Plan</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Phase-aware guidance for{" "}
            <span className={cn(
              "font-medium",
              currentPhase === "Menstruation" && "text-phase-menstruation",
              currentPhase === "Follicular" && "text-phase-follicular",
              currentPhase === "Ovulation" && "text-phase-ovulation",
              currentPhase === "Luteal" && "text-phase-luteal",
            )}>
              {currentPhase}
            </span>
            {cycleData && <span> · Day {cycleData.cycleDay}</span>}
          </p>
        </div>

        {/* Exercise card */}
        <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/20">
            <Dumbbell className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Exercise</h3>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground">{tips.exercise}</p>
          </div>
        </div>

        {/* Energy & Mood cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/30 bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-phase-follicular" />
              <h3 className="text-sm font-semibold text-foreground">Energy</h3>
            </div>
            <p className="text-xs text-muted-foreground">{tips.energy}</p>
          </div>
          <div className="rounded-xl border border-border/30 bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-4 h-4 text-phase-menstruation" />
              <h3 className="text-sm font-semibold text-foreground">Mood</h3>
            </div>
            <p className="text-xs text-muted-foreground">{tips.mood}</p>
          </div>
        </div>

        {/* Recent check-ins */}
        {Object.keys(latestByDimension).length > 0 && (
          <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/20">
              <Brain className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Your Recent Check-ins</h3>
            </div>
            <div className="divide-y divide-border/15">
              {Object.entries(latestByDimension).map(([dim, entry]) => {
                const config = DIMENSION_CONFIG[dim];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <div key={dim} className="flex items-center gap-3 px-4 py-3">
                    <Icon className={cn("w-4 h-4", config.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{config.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{entry.response}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      Day {entry.cycle_day} · {entry.phase}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {Object.keys(latestByDimension).length === 0 && (
          <div className="rounded-xl border border-border/30 bg-card/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Your check-in history will appear here. Respond to the daily cheat sheet questions in your chat to start tracking patterns.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
