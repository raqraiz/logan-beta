import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface CycleAnalyticsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentCycleLength: number;
  currentPhase: string;
  currentCycleDay: number;
}

interface CycleHistoryRow {
  cycle_start_date: string;
  cycle_end_date: string;
  cycle_length_days: number;
}

export function CycleAnalytics({
  open,
  onOpenChange,
  userId,
  currentCycleLength,
  currentPhase,
  currentCycleDay,
}: CycleAnalyticsProps) {
  const [history, setHistory] = useState<CycleHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    // Look up participant_id from email match or direct id
    (async () => {
      // Get participant linked to this user
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single();

      if (!profile?.email) {
        setLoading(false);
        return;
      }

      const { data: participant } = await supabase
        .from("participants")
        .select("id")
        .eq("email", profile.email)
        .single();

      if (!participant?.id) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("cycle_history")
        .select("cycle_start_date, cycle_end_date, cycle_length_days")
        .eq("participant_id", participant.id)
        .order("cycle_start_date", { ascending: false })
        .limit(12);

      setHistory(data || []);
      setLoading(false);
    })();
  }, [open, userId]);

  // Compute stats
  const lengths = history.map((h) => h.cycle_length_days);
  const avgLength = lengths.length > 0 ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null;
  const variance = lengths.length > 1
    ? Math.round(Math.sqrt(lengths.reduce((sum, l) => sum + Math.pow(l - (avgLength || 0), 2), 0) / (lengths.length - 1)) * 10) / 10
    : null;

  // Estimated period length (menstruation = 5 days by default; could be refined)
  const periodLength = 5;

  // Regularity score: 100 = perfectly regular, lower = more variable
  const regularityScore = variance !== null && avgLength
    ? Math.max(0, Math.round(100 - (variance / avgLength) * 100))
    : null;

  const regularityLabel = regularityScore !== null
    ? regularityScore >= 80
      ? "Very regular"
      : regularityScore >= 60
        ? "Fairly regular"
        : regularityScore >= 40
          ? "Somewhat irregular"
          : "Irregular"
    : null;

  // Phase segmentation for current cycle
  const menstruationDays = periodLength;
  const ovulationDay = currentCycleLength - 14;
  const follicularDays = Math.max(0, ovulationDay - 1 - menstruationDays);
  const ovulationDays = 3;
  const lutealDays = currentCycleLength - (menstruationDays + follicularDays + ovulationDays);

  const phases = [
    { name: "Menstruation", days: menstruationDays, color: "bg-phase-menstruation" },
    { name: "Follicular", days: follicularDays, color: "bg-phase-follicular" },
    { name: "Ovulation", days: ovulationDays, color: "bg-phase-ovulation" },
    { name: "Luteal", days: lutealDays, color: "bg-phase-luteal" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">Cycle Analytics</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Cycle Length */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Cycle Length</h3>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Current" value={`${currentCycleLength}d`} />
                <StatCard label="Average" value={avgLength ? `${avgLength}d` : "—"} />
                <StatCard label="Variance" value={variance !== null ? `±${variance}d` : "—"} />
              </div>
            </div>

            <Separator />

            {/* Period Length */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Period Length</h3>
              <StatCard label="Estimated" value={`${periodLength} days`} />
            </div>

            <Separator />

            {/* Regularity Score */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Cycle Regularity</h3>
              {regularityScore !== null ? (
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="14" fill="none" strokeWidth="3" className="stroke-muted" />
                      <circle
                        cx="18" cy="18" r="14" fill="none" strokeWidth="3"
                        strokeLinecap="round"
                        className="stroke-primary"
                        strokeDasharray={`${(regularityScore / 100) * 88} 88`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
                      {regularityScore}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{regularityLabel}</p>
                    <p className="text-xs text-muted-foreground">Based on {lengths.length} recorded cycle{lengths.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not enough data yet</p>
              )}
            </div>

            <Separator />

            {/* Phase Segmentation */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Phase Breakdown</h3>
              {/* Bar */}
              <div className="flex rounded-full overflow-hidden h-3 mb-3">
                {phases.map((p) => (
                  <div
                    key={p.name}
                    className={`${p.color} transition-all`}
                    style={{ width: `${(p.days / currentCycleLength) * 100}%` }}
                  />
                ))}
              </div>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-2">
                {phases.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
                    <span className="text-xs text-muted-foreground">
                      {p.name} <span className="text-foreground font-medium">{p.days}d</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2 text-center">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  );
}
