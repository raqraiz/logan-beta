import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";

interface CycleAnalyticsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentCycleLength: number;
  currentPhase: string;
  currentCycleDay: number;
}

interface CycleHistoryRow {
  id: string;
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
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [adding, setAdding] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async (pid: string) => {
    const { data } = await supabase
      .from("cycle_history")
      .select("id, cycle_start_date, cycle_end_date, cycle_length_days")
      .eq("participant_id", pid)
      .order("cycle_start_date", { ascending: false })
      .limit(24);
    setHistory((data as CycleHistoryRow[]) || []);
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    (async () => {
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

      setParticipantId(participant.id);
      await reload(participant.id);
      setLoading(false);
    })();
  }, [open, userId]);

  const startEdit = (row: CycleHistoryRow) => {
    setEditingId(row.id);
    setEditStart(row.cycle_start_date);
    setEditEnd(row.cycle_end_date);
    setAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditStart("");
    setEditEnd("");
  };

  const validateDates = (start: string, end: string): number | null => {
    if (!start || !end) {
      toast({ title: "Pick both dates", variant: "destructive" });
      return null;
    }
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      toast({ title: "Invalid date", variant: "destructive" });
      return null;
    }
    const days = differenceInDays(e, s);
    if (days < 15 || days > 90) {
      toast({ title: "Cycle length must be between 15 and 90 days", variant: "destructive" });
      return null;
    }
    return days;
  };

  const saveEdit = async (row: CycleHistoryRow) => {
    const days = validateDates(editStart, editEnd);
    if (days === null || !participantId) return;
    setSaving(true);
    const { error } = await supabase
      .from("cycle_history")
      .update({ cycle_start_date: editStart, cycle_end_date: editEnd, cycle_length_days: days })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cycle updated" });
      cancelEdit();
      await reload(participantId);
    }
  };

  const deleteRow = async (row: CycleHistoryRow) => {
    if (!participantId) return;
    if (!confirm(`Delete this ${row.cycle_length_days}-day cycle (${row.cycle_start_date} → ${row.cycle_end_date})?`)) return;
    const { error } = await supabase.from("cycle_history").delete().eq("id", row.id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cycle deleted" });
      await reload(participantId);
    }
  };

  const addNew = async () => {
    const days = validateDates(newStart, newEnd);
    if (days === null || !participantId) return;
    setSaving(true);
    const { error } = await supabase.from("cycle_history").insert({
      participant_id: participantId,
      cycle_start_date: newStart,
      cycle_end_date: newEnd,
      cycle_length_days: days,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't add", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cycle added" });
      setAdding(false);
      setNewStart("");
      setNewEnd("");
      await reload(participantId);
    }
  };


  // Compute stats — exclude unrealistic outliers (>45d are almost always the
  // onboarding-estimate-to-first-real-reset gap, which inflates the average).
  const allLengths = history.map((h) => h.cycle_length_days);
  const lengths = allLengths.filter((l) => l >= 15 && l <= 45);
  const excludedCount = allLengths.length - lengths.length;

  const sortedLengths = [...lengths].sort((a, b) => a - b);
  const medianLength = sortedLengths.length > 0
    ? sortedLengths.length % 2 === 1
      ? sortedLengths[Math.floor(sortedLengths.length / 2)]
      : Math.round((sortedLengths[sortedLengths.length / 2 - 1] + sortedLengths[sortedLengths.length / 2]) / 2)
    : null;

  const avgLength = medianLength; // headline = median (more robust)
  const minLength = sortedLengths[0] ?? null;
  const maxLength = sortedLengths[sortedLengths.length - 1] ?? null;

  const meanForVariance = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length > 1
    ? Math.round(Math.sqrt(lengths.reduce((sum, l) => sum + Math.pow(l - meanForVariance, 2), 0) / (lengths.length - 1)) * 10) / 10
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
                <StatCard label="Typical" value={avgLength ? `${avgLength}d` : "—"} />
                <StatCard label="Variance" value={variance !== null ? `±${variance}d` : "—"} />
              </div>
              {lengths.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Based on {lengths.length} tracked cycle{lengths.length !== 1 ? "s" : ""}
                  {minLength !== null && maxLength !== null && minLength !== maxLength ? ` · range ${minLength}–${maxLength}d` : ""}
                  {excludedCount > 0 ? ` · excluded ${excludedCount} outlier${excludedCount !== 1 ? "s" : ""} (>45d)` : ""}
                </p>
              )}
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
