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
import { ChevronDown, Pencil, Trash2, X, Check, Search, StickyNote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { SymptomPieChart, PIE_COLORS } from "./SymptomPieChart";


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
  const [notesOnly, setNotesOnly] = useState(false);
  const [view, setView] = useState<"timeline" | "summary">("timeline");
  const [groupBy, setGroupBy] = useState<"phase" | "week" | "month">(
    isNonCycling ? "week" : "phase"
  );


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


  // Filter by search query (symptom name or notes) and optionally notes-only
  const q = search.trim().toLowerCase();
  let filteredLogs = logs;
  if (notesOnly) {
    filteredLogs = filteredLogs.filter(l => l.notes && l.notes.trim().length > 0);
  }
  if (q) {
    filteredLogs = filteredLogs.filter(l =>
      (l.notes && l.notes.toLowerCase().includes(q)) ||
      l.symptoms.some(s => s.name.toLowerCase().includes(q))
    );
  }
  const isSearching = q.length > 0 || notesOnly;

  // Highlight matching text
  const highlight = (text: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-primary/30 text-foreground rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  // Group logs by date
  const grouped: Record<string, SymptomLog[]> = {};
  filteredLogs.forEach(log => {
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
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search symptoms or notes (e.g. headache)"
                className="pl-8 pr-8 h-9 text-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter chips */}
            {(() => {
              const notesCount = logs.filter(l => l.notes && l.notes.trim().length > 0).length;
              return (
                <div className="flex items-center gap-2 -mt-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setNotesOnly(v => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                      notesOnly
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={notesOnly}
                  >
                    <StickyNote className="w-3 h-3" />
                    Notes only{notesCount > 0 ? ` · ${notesCount}` : ""}
                  </button>
                  {(notesOnly || search) && filteredLogs.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">No matches</span>
                  )}
                </div>
              );
            })()}

            {/* Top patterns — hidden while searching */}
            {!isSearching && topSymptoms.length > 0 && (
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

            {!isSearching && <Separator />}

            {/* View toggle */}
            {!isSearching && (
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg bg-muted/40 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setView("timeline")}
                    className={`px-2.5 py-1 rounded-md transition-colors ${view === "timeline" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    Timeline
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("summary")}
                    className={`px-2.5 py-1 rounded-md transition-colors ${view === "summary" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    Summary
                  </button>
                </div>
                {view === "summary" && (
                  <div className="inline-flex rounded-lg bg-muted/40 p-0.5 text-[10px]">
                    {(!isNonCycling ? ["phase", "week", "month"] : ["week", "month"]).map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGroupBy(g as any)}
                        className={`px-2 py-1 rounded-md capitalize transition-colors ${groupBy === g ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                      >
                        {g === "phase" ? "By phase" : g === "week" ? "By week" : "By month"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Timeline / Summary */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                {isSearching
                  ? `${filteredLogs.length} match${filteredLogs.length === 1 ? "" : "es"} for "${search.trim()}"`
                  : view === "summary"
                    ? groupBy === "phase" ? "Symptoms by Phase" : groupBy === "week" ? "Symptoms by Week" : "Symptoms by Month"
                    : "Recent Logs"}
              </h3>
              {!isSearching && view === "summary" ? (
                <div className="space-y-5">
                  <SymptomPieChart logs={logs} />
                  <SummaryView logs={logs} groupBy={groupBy} />
                </div>
              ) : isSearching && filteredLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No logs match your search. Try a different keyword.
                </p>
              ) : (
              <div className="space-y-4">
                {(isSearching ? sortedDays : sortedDays.slice(0, 14)).map(day => (
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
                                    {highlight(s.name)}
                                  </span>
                                ))}
                              </div>
                              {log.notes && (
                                <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-border/40 bg-muted/40 px-2 py-1.5">
                                  <StickyNote className="w-3 h-3 text-primary/70 mt-0.5 shrink-0" />
                                  <p className="text-[11px] text-foreground/80 leading-snug whitespace-pre-wrap break-words">
                                    {highlight(log.notes)}
                                  </p>
                                </div>
                              )}

                            </>
                          )}
                        </div>
                      );
                    })}

                  </div>
                ))}
              </div>
              )}
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const PHASE_ORDER = ["Menstrual", "Follicular", "Ovulatory", "Luteal", "Unknown"];



function SummaryView({
  logs,
  groupBy,
}: {
  logs: SymptomLog[];
  groupBy: "phase" | "week" | "month";
}) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No symptoms logged yet.
      </p>
    );
  }

  // Bucket logs
  const buckets: Record<string, { label: string; sortKey: string; logs: SymptomLog[] }> = {};
  logs.forEach(log => {
    let key: string;
    let label: string;
    let sortKey: string;
    const d = new Date(log.logged_at);
    if (groupBy === "phase") {
      const raw = (log.cycle_phase || "Unknown").trim();
      key = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      label = key;
      const idx = PHASE_ORDER.indexOf(key);
      sortKey = String(idx === -1 ? 99 : idx);
    } else if (groupBy === "week") {
      // ISO-ish week start (Monday)
      const dt = new Date(d);
      const day = (dt.getDay() + 6) % 7;
      dt.setDate(dt.getDate() - day);
      dt.setHours(0, 0, 0, 0);
      key = format(dt, "yyyy-MM-dd");
      label = `Week of ${format(dt, "MMM d")}`;
      sortKey = `0-${9999999999999 - dt.getTime()}`;
    } else {
      key = format(d, "yyyy-MM");
      label = format(d, "MMMM yyyy");
      sortKey = `0-${9999999999999 - new Date(d.getFullYear(), d.getMonth(), 1).getTime()}`;
    }
    if (!buckets[key]) buckets[key] = { label, sortKey, logs: [] };
    buckets[key].logs.push(log);
  });

  const ordered = Object.entries(buckets).sort((a, b) =>
    a[1].sortKey.localeCompare(b[1].sortKey)
  );

  // Total logs across buckets (for share %)
  const totalLogs = logs.length;

  return (
    <div className="space-y-3">
      {ordered.map(([key, bucket]) => {
        // Aggregate symptoms in this bucket
        const agg: Record<string, { count: number; totalSev: number; maxSev: number }> = {};
        bucket.logs.forEach(l => {
          l.symptoms.forEach(s => {
            if (!agg[s.name]) agg[s.name] = { count: 0, totalSev: 0, maxSev: 0 };
            agg[s.name].count++;
            agg[s.name].totalSev += s.severity;
            if (s.severity > agg[s.name].maxSev) agg[s.name].maxSev = s.severity;
          });
        });
        const items = Object.entries(agg)
          .map(([name, v]) => ({
            name,
            count: v.count,
            avgSev: v.totalSev / v.count,
            maxSev: v.maxSev,
          }))
          .sort((a, b) => b.count - a.count);

        const maxCount = items[0]?.count || 1;
        const sharePct = Math.round((bucket.logs.length / totalLogs) * 100);

        return (
          <div
            key={key}
            className="rounded-xl border border-border/30 bg-muted/20 p-3"
          >
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs font-semibold text-foreground">{bucket.label}</p>
              <p className="text-[10px] text-muted-foreground">
                {bucket.logs.length} log{bucket.logs.length === 1 ? "" : "s"} · {sharePct}%
              </p>
            </div>
            {items.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70">No symptoms.</p>
            ) : (
              <div className="space-y-1.5">
                {items.slice(0, 6).map(it => (
                  <div key={it.name} className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_COLORS[Math.round(it.avgSev)] || "bg-muted-foreground/30"}`}
                    />
                    <span className="text-[11px] text-foreground/80 w-24 truncate shrink-0">
                      {it.name}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full"
                        style={{ width: `${(it.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-14 text-right shrink-0">
                      {it.count}× · {SEVERITY_LABELS[Math.round(it.avgSev)]}
                    </span>
                  </div>
                ))}
                {items.length > 6 && (
                  <p className="text-[10px] text-muted-foreground/60 pl-3.5">
                    +{items.length - 6} more
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

