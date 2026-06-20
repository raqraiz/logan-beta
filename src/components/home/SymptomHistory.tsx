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
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { format, subDays } from "date-fns";
import { AllSymptomsChart } from "./AllSymptomsChart";
import { SymptomHormoneChart } from "./SymptomHormoneChart";
import { ChevronDown, Pencil, Trash2, X, Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";


interface SymptomEntry {
  name: string;
  severity: number;
}


interface SymptomLog {
  id: string;
  symptoms: SymptomEntry[];
  notes: string | null;
  cycle_day: number | null;
  cycle_phase: string | null;
  logged_at: string;
}

interface SymptomHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  lastPeriodStart?: string;
  cycleLengthDays?: number;
  isNonCycling?: boolean;
}

const SEVERITY_COLORS = [
  "bg-muted-foreground/30",
  "bg-green-400/70",
  "bg-lime-400/70",
  "bg-yellow-400/70",
  "bg-orange-400/70",
  "bg-red-400/70",
];

const SEVERITY_LABELS = ["None", "Mild", "Light", "Moderate", "Strong", "Severe"];

export function SymptomHistory({
  open,
  onOpenChange,
  userId,
  lastPeriodStart,
  cycleLengthDays = 28,
  isNonCycling = false,
}: SymptomHistoryProps) {
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [topSymptoms, setTopSymptoms] = useState<{ name: string; count: number; avgSeverity: number }[]>([]);
  const [expandedSymptom, setExpandedSymptom] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSymptoms, setEditSymptoms] = useState<SymptomEntry[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [search, setSearch] = useState("");


  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);


    const since = subDays(new Date(), 90).toISOString();

    supabase
      .from("symptom_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const typed = (data || []).map(d => ({
          ...d,
          symptoms: (d.symptoms as any as SymptomEntry[]) || [],
        }));
        setLogs(typed);

        // Compute top symptoms
        const freq: Record<string, { count: number; totalSev: number }> = {};
        typed.forEach(log => {
          log.symptoms.forEach(s => {
            if (!freq[s.name]) freq[s.name] = { count: 0, totalSev: 0 };
            freq[s.name].count++;
            freq[s.name].totalSev += s.severity;
          });
        });

        const sorted = Object.entries(freq)
          .map(([name, { count, totalSev }]) => ({
            name,
            count,
            avgSeverity: Math.round((totalSev / count) * 10) / 10,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);

        setTopSymptoms(sorted);
        setLoading(false);
      });
  }, [open, userId, refreshTick]);

  const startEdit = (log: SymptomLog) => {
    setEditingId(log.id);
    setEditSymptoms(log.symptoms.map(s => ({ ...s })));
    setEditNotes(log.notes || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSymptoms([]);
    setEditNotes("");
  };

  const saveEdit = async (logId: string) => {
    setSaving(true);
    const cleaned = editSymptoms.filter(s => s.severity > 0);
    if (cleaned.length === 0) {
      // Treat as delete
      const { error } = await supabase.from("symptom_logs").delete().eq("id", logId);
      setSaving(false);
      if (error) {
        toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Log removed" });
      cancelEdit();
      setRefreshTick(t => t + 1);
      return;
    }
    const { error } = await supabase
      .from("symptom_logs")
      .update({ symptoms: cleaned as any, notes: editNotes.trim() || null })
      .eq("id", logId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Updated" });
    cancelEdit();
    setRefreshTick(t => t + 1);
  };

  const deleteLog = async (logId: string) => {
    setDeletingId(logId);
    const { error } = await supabase.from("symptom_logs").delete().eq("id", logId);
    setDeletingId(null);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Deleted" });
    setRefreshTick(t => t + 1);
  };


  // Group logs by date
  const grouped: Record<string, SymptomLog[]> = {};
  logs.forEach(log => {
    const day = format(new Date(log.logged_at), "yyyy-MM-dd");
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(log);
  });
  const sortedDays = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Symptom History</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No symptoms logged yet. Start logging to see patterns here.
          </p>
        ) : (
          <div className="space-y-5">
            {/* Top patterns */}
            {topSymptoms.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Your Top Patterns (90 days)
                </h3>
                <div className="space-y-1.5 mb-3">
                  {topSymptoms.map(s => {
                    const isOpen = expandedSymptom === s.name;
                    return (
                      <div
                        key={s.name}
                        className="rounded-xl border border-border/30 bg-muted/30 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedSymptom(isOpen ? null : s.name)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40 transition-colors"
                        >
                          <div className={`w-2 h-2 rounded-full ${SEVERITY_COLORS[Math.round(s.avgSeverity)] || "bg-muted-foreground/30"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {s.count}× · avg {SEVERITY_LABELS[Math.round(s.avgSeverity)] || s.avgSeverity}
                            </p>
                          </div>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        {isOpen && (
                          <div className="px-2 pb-2 pt-1">
                            <SymptomHormoneChart
                              userId={userId}
                              symptomName={s.name}
                              lastPeriodStart={lastPeriodStart}
                              cycleLengthDays={cycleLengthDays}
                              isNonCycling={isNonCycling}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <AllSymptomsChart
                  logs={logs}
                  symptomNames={topSymptoms.map(s => s.name)}
                  lastPeriodStart={lastPeriodStart}
                  cycleLengthDays={cycleLengthDays}
                  isNonCycling={isNonCycling}
                />
              </div>
            )}

            <Separator />

            {/* Timeline */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Recent Logs
              </h3>
              <div className="space-y-4">
                {sortedDays.slice(0, 14).map(day => (
                  <div key={day}>
                    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                      {format(new Date(day + "T12:00:00"), "EEE, MMM d")}
                    </p>
                    {grouped[day].map(log => {
                      const isEditing = editingId === log.id;
                      return (
                        <div key={log.id} className="ml-2 mb-2 border-l-2 border-border/30 pl-3 group">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[10px] text-muted-foreground mb-1">
                              {format(new Date(log.logged_at), "h:mm a")}
                              {log.cycle_phase && (
                                <span className="ml-1.5 text-primary/60">· {log.cycle_phase}</span>
                              )}
                              {log.cycle_day && (
                                <span className="text-muted-foreground/50"> Day {log.cycle_day}</span>
                              )}
                            </p>
                            {!isEditing && (
                              <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => startEdit(log)}
                                  className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                                  aria-label="Edit log"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === log.id}
                                  onClick={() => {
                                    if (confirm("Delete this symptom log?")) deleteLog(log.id);
                                  }}
                                  className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive disabled:opacity-50"
                                  aria-label="Delete log"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2 mt-1 p-2 rounded-lg bg-muted/30 border border-border/30">
                              {editSymptoms.map((s, idx) => (
                                <div key={s.name} className="space-y-1">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-medium text-foreground/80 flex items-center gap-1.5">
                                      <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_COLORS[s.severity]}`} />
                                      {s.name}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {SEVERITY_LABELS[s.severity]}
                                    </span>
                                  </div>
                                  <Slider
                                    value={[s.severity]}
                                    min={0}
                                    max={5}
                                    step={1}
                                    onValueChange={(v) => {
                                      const next = [...editSymptoms];
                                      next[idx] = { ...next[idx], severity: v[0] };
                                      setEditSymptoms(next);
                                    }}
                                  />
                                </div>
                              ))}
                              <p className="text-[10px] text-muted-foreground/70">
                                Set severity to None to remove a symptom.
                              </p>
                              <Textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="Notes (optional)"
                                rows={2}
                                className="text-xs"
                              />
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                                  <X className="w-3 h-3" /> Cancel
                                </Button>
                                <Button size="sm" onClick={() => saveEdit(log.id)} disabled={saving}>
                                  <Check className="w-3 h-3" /> {saving ? "Saving…" : "Save"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap gap-1">
                                {log.symptoms.map(s => (
                                  <span
                                    key={s.name}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-muted/60 text-foreground/70"
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_COLORS[s.severity]}`} />
                                    {s.name}
                                  </span>
                                ))}
                              </div>
                              {log.notes && (
                                <p className="text-[11px] text-muted-foreground/70 mt-1 italic">
                                  {log.notes}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}

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
