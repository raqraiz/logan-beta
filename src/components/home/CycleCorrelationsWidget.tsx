import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, ChevronRight, Sparkles } from "lucide-react";
import { CycleCorrelationDetail } from "./CycleCorrelationDetail";
import { AddTrackerDialog } from "./AddTrackerDialog";
import { toast } from "sonner";

interface Tracker {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
}

interface Props {
  userId: string;
  cyclePhase: string;
  cycleDay: number;
  lastPeriodStart?: string;
  cycleLengthDays: number;
  isNonCycling: boolean;
}

const QUICK_INTENSITIES = [0, 1, 2, 3, 4, 5];

export function CycleCorrelationsWidget({
  userId,
  cyclePhase,
  cycleDay,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
}: Props) {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [activeTracker, setActiveTracker] = useState<Tracker | null>(null);
  const [logging, setLogging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("custom_trackers")
      .select("id, name, emoji, description")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    setTrackers((data as Tracker[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const quickLog = async (trackerId: string, intensity: number) => {
    setLogging(trackerId);
    const { error } = await supabase.from("tracker_logs").insert({
      user_id: userId,
      tracker_id: trackerId,
      intensity,
      cycle_phase: isNonCycling ? null : cyclePhase,
      cycle_day: isNonCycling ? null : cycleDay,
    });
    setLogging(null);
    if (error) {
      toast.error("Couldn't save log");
    } else {
      toast.success("Logged");
    }
  };

  const handleAdded = () => {
    setShowAdd(false);
    load();
  };

  return (
    <div
      className="w-full rounded-2xl border border-border/40 border-l-[3px] border-l-teal-500
        bg-card/50 backdrop-blur-md overflow-hidden relative"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent pointer-events-none" />

      <div className="relative px-5 py-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-lg bg-teal-500/15 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-teal-400/80">
            Cycle Correlations
          </span>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : trackers.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground/80 leading-snug">
              Wondering if something — surfing, mood, focus, loneliness — is tied to your cycle?
              Track it daily and Logan will show you the pattern.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Track something
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {trackers.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-border/30 bg-background/40 p-3 space-y-2"
              >
                <button
                  onClick={() => setActiveTracker(t)}
                  className="w-full flex items-center justify-between gap-2 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{t.emoji}</span>
                    <span className="text-sm font-medium text-foreground truncate">{t.name}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
                    Today
                  </span>
                  {QUICK_INTENSITIES.map((i) => (
                    <button
                      key={i}
                      onClick={() => quickLog(t.id, i)}
                      disabled={logging === t.id}
                      className="flex-1 h-7 rounded-md border border-border/40 bg-background/60
                        hover:bg-teal-500/10 hover:border-teal-500/40 transition-colors
                        text-xs text-foreground/80 disabled:opacity-50"
                      aria-label={`Rate ${i} (0 = none, 5 = max)`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 w-full justify-center text-xs h-8"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Track something else
            </Button>
          </div>
        )}
      </div>

      <AddTrackerDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        userId={userId}
        onAdded={handleAdded}
      />

      {activeTracker && (
        <CycleCorrelationDetail
          tracker={activeTracker}
          userId={userId}
          lastPeriodStart={lastPeriodStart}
          cycleLengthDays={cycleLengthDays}
          isNonCycling={isNonCycling}
          open={!!activeTracker}
          onOpenChange={(o) => !o && setActiveTracker(null)}
          onDeleted={() => {
            setActiveTracker(null);
            load();
          }}
        />
      )}
    </div>
  );
}
