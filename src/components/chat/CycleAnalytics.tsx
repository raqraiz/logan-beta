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
import { Pencil, Trash2, Check, X, Plus, Sliders } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

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
  menstruation_days: number | null;
  follicular_days: number | null;
  ovulation_days: number | null;
  luteal_days: number | null;
}

type PhaseDraft = {
  menstruation: string;
  follicular: string;
  ovulation: string;
  luteal: string;
};

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
  const [currentMenstruationDays, setCurrentMenstruationDays] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [adding, setAdding] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [phaseEditId, setPhaseEditId] = useState<string | null>(null);
  const [phaseDraft, setPhaseDraft] = useState<PhaseDraft>({
    menstruation: "",
    follicular: "",
    ovulation: "",
    luteal: "",
  });

  const reload = async (pid: string) => {
    const { data } = await supabase
      .from("cycle_history")
      .select("id, cycle_start_date, cycle_end_date, cycle_length_days, menstruation_days, follicular_days, ovulation_days, luteal_days")
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
        .select("id, last_period_start, current_period_end_date")
        .eq("email", profile.email)
        .single();

      if (!participant?.id) {
        setLoading(false);
        return;
      }

      setParticipantId(participant.id);
      // Derive current cycle's menstruation length from the reported end date
      const start = (participant as any).last_period_start as string | null;
      const end = (participant as any).current_period_end_date as string | null;
      if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
        const [sy, sm, sd] = start.split("-").map(Number);
        const [ey, em, ed] = end.split("-").map(Number);
        const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1;
        if (days >= 1 && days <= 14) setCurrentMenstruationDays(days);
        else setCurrentMenstruationDays(null);
      } else {
        setCurrentMenstruationDays(null);
      }
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

  const startPhaseEdit = (row: CycleHistoryRow) => {
    setPhaseEditId(row.id);
    setEditingId(null);
    setAdding(false);
    // Defaults: use stored values, otherwise typical biology proportional to this cycle
    const menstruation = row.menstruation_days ?? MENSTRUATION_RANGE.typical;
    const ovulation = row.ovulation_days ?? OVULATION_RANGE.typical;
    const luteal = row.luteal_days ?? LUTEAL_RANGE.typical;
    const follicular = row.follicular_days ?? Math.max(0, row.cycle_length_days - menstruation - ovulation - luteal);
    setPhaseDraft({
      menstruation: String(menstruation),
      follicular: String(follicular),
      ovulation: String(ovulation),
      luteal: String(luteal),
    });
  };

  const cancelPhaseEdit = () => {
    setPhaseEditId(null);
  };

  const savePhases = async (row: CycleHistoryRow) => {
    const parse = (s: string) => {
      const n = parseInt(s, 10);
      return isNaN(n) || n < 0 ? null : n;
    };
    const m = parse(phaseDraft.menstruation);
    const f = parse(phaseDraft.follicular);
    const o = parse(phaseDraft.ovulation);
    const l = parse(phaseDraft.luteal);
    if (m === null || f === null || o === null || l === null) {
      toast({ title: "Enter valid day counts (0+)", variant: "destructive" });
      return;
    }
    const sum = m + f + o + l;
    if (Math.abs(sum - row.cycle_length_days) > 2) {
      toast({
        title: `Phases sum to ${sum}d but cycle is ${row.cycle_length_days}d`,
        description: "Adjust phase lengths so they roughly match cycle length.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("cycle_history")
      .update({ menstruation_days: m, follicular_days: f, ovulation_days: o, luteal_days: l })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save phases", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Phases updated" });
      setPhaseEditId(null);
      if (participantId) await reload(participantId);
    }
  };

  const resetPhases = async (row: CycleHistoryRow) => {
    if (!participantId) return;
    const { error } = await supabase
      .from("cycle_history")
      .update({ menstruation_days: null, follicular_days: null, ovulation_days: null, luteal_days: null })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Couldn't reset", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Phases reset to typical" });
      setPhaseEditId(null);
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

  // Phase ranges based on biological norms (not rigid fixed days)
  const MENSTRUATION_RANGE = { min: 3, typical: 5, max: 7 };
  const OVULATION_RANGE = { min: 1, typical: 2, max: 3 };
  const LUTEAL_RANGE = { min: 10, typical: 14, max: 16 };

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

  // Phase segmentation for current cycle.
  // If the most recent tracked cycle has custom phase overrides, use them.
  // Otherwise fall back to typical biology, scaled to current cycle length.
  const latestWithPhases = history.find(
    (h) =>
      h.menstruation_days != null &&
      h.follicular_days != null &&
      h.ovulation_days != null &&
      h.luteal_days != null
  );

  const usingCustomPhases = !!latestWithPhases || currentMenstruationDays !== null;
  const menstruationDays = currentMenstruationDays ?? latestWithPhases?.menstruation_days ?? MENSTRUATION_RANGE.typical;
  const ovulationDays = latestWithPhases?.ovulation_days ?? OVULATION_RANGE.typical;
  const lutealDays = latestWithPhases?.luteal_days ?? LUTEAL_RANGE.typical;
  const follicularDays = latestWithPhases && currentMenstruationDays === null
    ? latestWithPhases.follicular_days ?? Math.max(0, currentCycleLength - menstruationDays - ovulationDays - lutealDays)
    : Math.max(0, currentCycleLength - menstruationDays - ovulationDays - lutealDays);
  const phaseTotal = menstruationDays + follicularDays + ovulationDays + lutealDays;

  const phases = [
    { name: "Menstruation", days: menstruationDays, color: "bg-phase-menstruation", range: usingCustomPhases ? `${menstruationDays}` : `${MENSTRUATION_RANGE.min}–${MENSTRUATION_RANGE.max}` },
    { name: "Follicular", days: follicularDays, color: "bg-phase-follicular", range: usingCustomPhases ? `${follicularDays}` : "varies" },
    { name: "Ovulation", days: ovulationDays, color: "bg-phase-ovulation", range: usingCustomPhases ? `${ovulationDays}` : `${OVULATION_RANGE.min}–${OVULATION_RANGE.max}` },
    { name: "Luteal", days: lutealDays, color: "bg-phase-luteal", range: usingCustomPhases ? `${lutealDays}` : `${LUTEAL_RANGE.min}–${LUTEAL_RANGE.max}` },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl max-h-[90vh] overflow-y-auto">
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

            {lengths.length >= 2 && (
              <>
                <Separator />
                <CycleLengthChart history={history} median={medianLength} />
              </>
            )}

            <Separator />

            {/* Period Length */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Period Length</h3>
              <StatCard label="Estimated" value="3–7 days" />
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
                    style={{ width: `${(p.days / Math.max(1, phaseTotal)) * 100}%` }}
                  />
                ))}
              </div>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-2">
                {phases.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
                    <span className="text-xs text-muted-foreground">
                      {p.name} <span className="text-foreground font-medium">{usingCustomPhases ? "" : "~"}{p.range}d</span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-2">
                {usingCustomPhases
                  ? `Using your custom phase lengths from ${format(new Date(latestWithPhases!.cycle_start_date), "MMM d")}. Edit any tracked cycle below to adjust.`
                  : "Based on typical cycle biology. Tap the sliders icon on any tracked cycle to set your own phase lengths."}
              </p>
            </div>

            <Separator />

            {/* Editable cycle history */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tracked Cycles
                </h3>
                {!adding && participantId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 text-[11px] px-2"
                    onClick={() => { setAdding(true); cancelEdit(); }}
                  >
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                )}
              </div>

              {adding && (
                <div className="rounded-lg border border-border/40 bg-muted/30 p-2 mb-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="date"
                      value={newEnd}
                      onChange={(e) => setNewEnd(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={addNew} disabled={saving}>
                      Save
                    </Button>
                  </div>
                </div>
              )}

              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No cycles tracked yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {history.map((row) => {
                    const isEditing = editingId === row.id;
                    const isEditingPhases = phaseEditId === row.id;
                    const isOutlier = row.cycle_length_days > 45 || row.cycle_length_days < 15;
                    const hasCustomPhases =
                      row.menstruation_days != null &&
                      row.follicular_days != null &&
                      row.ovulation_days != null &&
                      row.luteal_days != null;
                    if (isEditing) {
                      return (
                        <div key={row.id} className="rounded-lg border border-primary/40 bg-muted/30 p-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                              className="h-8 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">→</span>
                            <Input
                              type="date"
                              value={editEnd}
                              onChange={(e) => setEditEnd(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>
                              <X className="w-3 h-3" />
                            </Button>
                            <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(row)} disabled={saving}>
                              <Check className="w-3 h-3 mr-1" /> Save
                            </Button>
                          </div>
                        </div>
                      );
                    }
                    if (isEditingPhases) {
                      const draftSum =
                        (parseInt(phaseDraft.menstruation, 10) || 0) +
                        (parseInt(phaseDraft.follicular, 10) || 0) +
                        (parseInt(phaseDraft.ovulation, 10) || 0) +
                        (parseInt(phaseDraft.luteal, 10) || 0);
                      const sumMismatch = Math.abs(draftSum - row.cycle_length_days) > 2;
                      return (
                        <div key={row.id} className="rounded-lg border border-primary/40 bg-muted/30 p-2.5 space-y-2">
                          <p className="text-[11px] text-muted-foreground">
                            Phase lengths for {format(new Date(row.cycle_start_date), "MMM d")} cycle ({row.cycle_length_days}d total)
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              { key: "menstruation", label: "Menstruation", color: "bg-phase-menstruation" },
                              { key: "follicular", label: "Follicular", color: "bg-phase-follicular" },
                              { key: "ovulation", label: "Ovulation", color: "bg-phase-ovulation" },
                              { key: "luteal", label: "Luteal", color: "bg-phase-luteal" },
                            ] as const).map((p) => (
                              <label key={p.key} className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${p.color} shrink-0`} />
                                <span className="text-[10px] text-muted-foreground flex-1 truncate">{p.label}</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={45}
                                  value={phaseDraft[p.key]}
                                  onChange={(e) => setPhaseDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                                  className="h-7 w-12 text-xs text-center"
                                />
                              </label>
                            ))}
                          </div>
                          <p className={`text-[10px] ${sumMismatch ? "text-destructive" : "text-muted-foreground"}`}>
                            Sum: {draftSum}d / {row.cycle_length_days}d
                            {sumMismatch ? " — adjust to match" : " ✓"}
                          </p>
                          <div className="flex justify-between gap-1.5">
                            {hasCustomPhases ? (
                              <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground" onClick={() => resetPhases(row)}>
                                Reset
                              </Button>
                            ) : <span />}
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelPhaseEdit}>
                                <X className="w-3 h-3" />
                              </Button>
                              <Button size="sm" className="h-7 text-xs" onClick={() => savePhases(row)} disabled={saving}>
                                <Check className="w-3 h-3 mr-1" /> Save
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-foreground truncate">
                            {format(new Date(row.cycle_start_date), "MMM d, yyyy")} → {format(new Date(row.cycle_end_date), "MMM d")}
                          </p>
                          <p className={`text-[10px] ${isOutlier ? "text-destructive" : "text-muted-foreground"}`}>
                            {row.cycle_length_days} days
                            {hasCustomPhases ? ` · ${row.menstruation_days}/${row.follicular_days}/${row.ovulation_days}/${row.luteal_days}` : ""}
                            {isOutlier ? " · likely inaccurate" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => startPhaseEdit(row)}
                            className={`p-1.5 rounded-md hover:bg-muted ${hasCustomPhases ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            aria-label="Edit phases"
                            title={hasCustomPhases ? "Custom phases set" : "Set phase lengths"}
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => startEdit(row)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                            aria-label="Edit cycle"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteRow(row)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            aria-label="Delete cycle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

function CycleLengthChart({
  history,
  median,
}: {
  history: CycleHistoryRow[];
  median: number | null;
}) {
  const data = [...history]
    .filter((h) => h.cycle_length_days >= 15 && h.cycle_length_days <= 45)
    .sort((a, b) => a.cycle_start_date.localeCompare(b.cycle_start_date))
    .map((h, i) => ({
      idx: i + 1,
      length: h.cycle_length_days,
      label: format(new Date(h.cycle_start_date), "MMM d"),
    }));

  if (data.length < 2) return null;

  const lengths = data.map((d) => d.length);
  const minY = Math.max(15, Math.min(...lengths) - 3);
  const maxY = Math.min(45, Math.max(...lengths) + 3);
  const bandTop = Math.min(35, maxY);
  const bandBottom = Math.max(21, minY);

  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Cycle Length Over Time
      </h3>
      <div className="rounded-xl bg-muted/30 border border-border/30 p-2">
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <ReferenceArea y1={bandBottom} y2={bandTop} fill="hsl(var(--primary))" fillOpacity={0.08} />
              {median !== null && (
                <ReferenceLine y={median} stroke="hsl(var(--foreground))" strokeOpacity={0.4} strokeDasharray="3 3" />
              )}
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                domain={[minY, maxY]}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={28}
                tickFormatter={(v) => `${v}d`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 11,
                  padding: "4px 8px",
                }}
                labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 10 }}
                formatter={(v: number) => [`${v} days`, "Cycle"]}
              />
              <Line
                type="monotone"
                dataKey="length"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 px-1">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-1.5 rounded-sm bg-primary/15" />
            Typical range (21–35d)
          </span>
          {median !== null && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 bg-foreground/50" />
              Your median ({median}d)
            </span>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {data.length} cycle{data.length === 1 ? "" : "s"} shown, oldest to newest.
      </p>
    </div>
  );
}
