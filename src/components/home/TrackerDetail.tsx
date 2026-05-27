import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  analyzeCorrelation,
  analyzeNominalCorrelation,
  getPhaseForDate,
  PHASES,
} from "@/lib/cycleCorrelation";
import { toast } from "sonner";
import { getHormoneValue, avg } from "@/lib/hormoneCurves";
import type { Tracker } from "./TrackWidget";
import { cn } from "@/lib/utils";

interface LogRow {
  id: string;
  intensity: number | null;
  option_value: string | null;
  cycle_phase: string | null;
  logged_at: string;
}

interface Props {
  tracker: Tracker;
  userId: string;
  lastPeriodStart?: string;
  cycleLengthDays: number;
  isNonCycling: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted: () => void;
  onUpdated?: (t: Partial<Tracker> & { id: string }) => void;
}

const HORMONES = [
  { key: "estrogen", label: "Estrogen", color: "hsl(187, 100%, 42%)" },
  { key: "progesterone", label: "Progesterone", color: "hsl(270, 60%, 65%)" },
  { key: "fsh", label: "FSH", color: "hsl(40, 85%, 55%)" },
  { key: "lh", label: "LH", color: "hsl(355, 75%, 60%)" },
] as const;

export function TrackerDetail({
  tracker,
  userId,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
  open,
  onOpenChange,
  onDeleted,
  onUpdated,
}: Props) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tracker.name);
  const [editEmoji, setEditEmoji] = useState(tracker.emoji);
  const [savingEdit, setSavingEdit] = useState(false);
  const isNominal = tracker.tracker_type === "single_choice";

  useEffect(() => {
    setEditName(tracker.name);
    setEditEmoji(tracker.emoji);
    setEditing(false);
  }, [tracker.id, tracker.name, tracker.emoji]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("tracker_logs")
        .select("id, intensity, option_value, cycle_phase, logged_at")
        .eq("tracker_id", tracker.id)
        .order("logged_at", { ascending: false })
        .limit(300);
      setLogs((data as LogRow[]) || []);
      setLoading(false);
    })();
  }, [open, tracker.id]);

  const enrichedLogs = useMemo(() => {
    return logs.map((l) => {
      let phase = l.cycle_phase;
      if (!phase && lastPeriodStart && !isNonCycling) {
        try { phase = getPhaseForDate(new Date(l.logged_at), lastPeriodStart, cycleLengthDays); } catch { /* ignore */ }
      }
      return { phase, intensity: l.intensity ?? 0, option: l.option_value || "" };
    });
  }, [logs, lastPeriodStart, cycleLengthDays, isNonCycling]);

  const scaleResult = useMemo(
    () => analyzeCorrelation(enrichedLogs.filter((l) => !isNominal), tracker.name),
    [enrichedLogs, isNominal, tracker.name]
  );

  const nominalResult = useMemo(
    () => analyzeNominalCorrelation(
      enrichedLogs.filter((l) => l.option).map((l) => ({ phase: l.phase, option: l.option })),
      tracker.name,
      tracker.options || []
    ),
    [enrichedLogs, tracker.name, tracker.options]
  );

  // For scale: hormone overlay chart data
  const hormoneByPhase = useMemo(() => {
    const len = cycleLengthDays || 28;
    const menEnd = 5;
    const ovDay = len - 14;
    const ovStart = ovDay - 1;
    const ovEnd = ovDay + 2;
    const phaseRanges: Record<string, [number, number]> = {
      Menstruation: [1, menEnd],
      Follicular: [menEnd + 1, ovStart - 1],
      Ovulation: [ovStart, ovEnd],
      Luteal: [ovEnd + 1, len],
    };
    const out: Record<string, Record<string, number>> = {};
    for (const phase of PHASES) {
      const [s, e] = phaseRanges[phase];
      const vals: Record<string, number[]> = { estrogen: [], progesterone: [], fsh: [], lh: [] };
      for (let d = s; d <= e; d++) {
        vals.estrogen.push(getHormoneValue("estrogen", d, len, menEnd, ovDay, ovStart, ovEnd));
        vals.progesterone.push(getHormoneValue("progesterone", d, len, menEnd, ovDay, ovStart, ovEnd));
        vals.fsh.push(getHormoneValue("fsh", d, len, menEnd, ovDay, ovStart, ovEnd));
        vals.lh.push(getHormoneValue("lh", d, len, menEnd, ovDay, ovStart, ovEnd));
      }
      out[phase] = {
        estrogen: avg(vals.estrogen) * 5,
        progesterone: avg(vals.progesterone) * 5,
        fsh: avg(vals.fsh) * 5,
        lh: avg(vals.lh) * 5,
      };
    }
    return out;
  }, [cycleLengthDays]);

  const scaleChartData = scaleResult.phaseStats.map((s) => ({
    phase: s.phase,
    avg: Number(s.avg.toFixed(2)),
    count: s.count,
    estrogen: Number(hormoneByPhase[s.phase].estrogen.toFixed(2)),
    progesterone: Number(hormoneByPhase[s.phase].progesterone.toFixed(2)),
    fsh: Number(hormoneByPhase[s.phase].fsh.toFixed(2)),
    lh: Number(hormoneByPhase[s.phase].lh.toFixed(2)),
  }));

  const totalLogs = isNominal ? nominalResult.totalLogs : scaleResult.totalLogs;
  const insight = isNominal ? nominalResult.insight : scaleResult.insight;
  const confidence = isNominal ? nominalResult.confidence : scaleResult.confidence;

  const handleDelete = async () => {
    if (!confirm(`Delete tracker "${tracker.name}" and all its logs?`)) return;
    const { error } = await supabase.from("custom_trackers").delete().eq("id", tracker.id);
    if (error) { toast.error("Couldn't delete"); return; }
    toast.success("Tracker deleted");
    onDeleted();
  };

  const handleSaveEdit = async () => {
    const name = editName.trim();
    const emoji = (editEmoji || "✨").slice(0, 4);
    if (!name) { toast.error("Name can't be empty"); return; }
    if (name === tracker.name && emoji === tracker.emoji) { setEditing(false); return; }
    setSavingEdit(true);
    const { error } = await supabase.from("custom_trackers").update({ name, emoji }).eq("id", tracker.id);
    setSavingEdit(false);
    if (error) { toast.error("Couldn't save changes"); return; }
    toast.success("Updated");
    setEditing(false);
    onUpdated?.({ id: tracker.id, name, emoji });
  };

  const cancelEdit = () => {
    setEditName(tracker.name);
    setEditEmoji(tracker.emoji);
    setEditing(false);
  };

  const recentLogs = logs.slice(0, 7);

  // For nominal: max count for heatmap intensity
  const maxCell = useMemo(() => {
    let m = 0;
    for (const c of nominalResult.cells) if (c.count > m) m = c.count;
    return m;
  }, [nominalResult.cells]);

  const optionList = tracker.options?.filter((o) => nominalResult.totalsPerOption[o] !== undefined) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle asChild>
            <div className="flex items-center gap-2 pr-8">
              {editing ? (
                <>
                  <Input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value.slice(0, 4))} maxLength={4} className="w-14 h-9 text-center text-base" />
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} className="h-9 flex-1" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") cancelEdit(); }} />
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSaveEdit} disabled={savingEdit}><Check className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={cancelEdit} disabled={savingEdit}><X className="w-4 h-4" /></Button>
                </>
              ) : (
                <>
                  <span className="text-lg">{tracker.emoji}</span>
                  <span className="text-lg font-semibold leading-none tracking-tight truncate">{tracker.name}</span>
                  {tracker.is_fam && <span className="text-[9px] uppercase tracking-wider text-teal-400/70 px-1.5 py-0.5 rounded bg-teal-500/10">FAM</span>}
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" /></Button>
                </>
              )}
            </div>
          </DialogTitle>
          <DialogDescription>
            {totalLogs > 0 ? `${totalLogs} log${totalLogs === 1 ? "" : "s"} • confidence: ${confidence}` : "No data yet"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-teal-500/10 border border-teal-500/30 p-3">
              <p
                className="text-sm text-foreground/90 leading-snug"
                dangerouslySetInnerHTML={{
                  __html: insight.replace(/\*\*(.+?)\*\*/g, '<strong class="text-teal-400">$1</strong>'),
                }}
              />
            </div>

            {/* Scale chart */}
            {!isNominal && !isNonCycling && scaleResult.totalLogs > 0 && (
              <div className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/10 backdrop-blur-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Pattern × Hormones</p>
                  <p className="text-[9px] text-muted-foreground/50">avg per phase</p>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={scaleChartData} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trackerBarFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(173 80% 50%)" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="hsl(173 80% 35%)" stopOpacity={0.55} />
                        </linearGradient>
                        {HORMONES.map((h) => (
                          <linearGradient key={h.key} id={`hormoneFill-${h.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={h.color} stopOpacity={0.18} />
                            <stop offset="100%" stopColor={h.color} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.18} vertical={false} />
                      <XAxis dataKey="phase" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={4} interval={0} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--foreground) / 0.04)" }}
                        contentStyle={{ background: "hsl(var(--card) / 0.95)", backdropFilter: "blur(12px)", border: "1px solid hsl(var(--border) / 0.5)", borderRadius: 12, fontSize: 11, padding: "8px 10px" }}
                      />
                      <Bar dataKey="avg" name="Tracker" fill="url(#trackerBarFill)" radius={[6, 6, 2, 2]} barSize={28} />
                      {HORMONES.map((h) => (
                        <Area key={`area-${h.key}`} type="monotone" dataKey={h.key} stroke="none" fill={`url(#hormoneFill-${h.key})`} isAnimationActive={false} legendType="none" tooltipType="none" />
                      ))}
                      {HORMONES.map((h) => (
                        <Line key={h.key} type="monotone" dataKey={h.key} name={h.label} stroke={h.color} strokeWidth={1.75} dot={false} isAnimationActive={false} opacity={0.9} />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pt-1 border-t border-white/5">
                  <div className="flex items-center gap-1.5 pt-1.5">
                    <span className="w-2 h-2.5 rounded-sm bg-gradient-to-b from-teal-400 to-teal-600" />
                    <span className="text-[10px] text-foreground/70 font-medium">Tracker</span>
                  </div>
                  {HORMONES.map((h) => (
                    <div key={h.key} className="flex items-center gap-1.5 pt-1.5">
                      <span className="w-3.5 h-[2px] rounded-full" style={{ background: h.color, boxShadow: `0 0 6px ${h.color}40` }} />
                      <span className="text-[10px] text-foreground/70">{h.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nominal heatmap */}
            {isNominal && !isNonCycling && nominalResult.totalLogs > 0 && optionList.length > 0 && (
              <div className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/10 backdrop-blur-xl p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium mb-2 px-1">
                  Phase × Option
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border-separate border-spacing-1">
                    <thead>
                      <tr>
                        <th className="text-left text-muted-foreground/60 font-medium pb-1">Phase</th>
                        {optionList.map((opt) => (
                          <th key={opt} className="text-center text-muted-foreground/60 font-medium pb-1 px-1">
                            {opt}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PHASES.map((phase) => (
                        <tr key={phase}>
                          <td className="text-foreground/80 pr-2">{phase}</td>
                          {optionList.map((opt) => {
                            const cell = nominalResult.cells.find((c) => c.phase === phase && c.option === opt);
                            const count = cell?.count || 0;
                            const intensity = maxCell > 0 ? count / maxCell : 0;
                            const phaseTotal = nominalResult.totalsPerPhase[phase];
                            const pct = phaseTotal > 0 ? Math.round((count / phaseTotal) * 100) : 0;
                            return (
                              <td key={opt} className="text-center">
                                <div
                                  className={cn(
                                    "rounded-md h-8 flex flex-col items-center justify-center transition-colors",
                                    count > 0 ? "text-foreground" : "text-muted-foreground/40"
                                  )}
                                  style={{
                                    backgroundColor: count > 0 ? `hsl(173 80% 45% / ${0.15 + intensity * 0.55})` : "hsl(var(--muted) / 0.15)",
                                  }}
                                  title={`${count} log${count === 1 ? "" : "s"} (${pct}% of ${phase})`}
                                >
                                  <span className="text-[11px] font-medium leading-none">{count || "·"}</span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground/55 text-center leading-snug mt-2">
                  Darker cells = more logs of that option in that phase.
                </p>
              </div>
            )}

            {isNonCycling && totalLogs > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Phase correlation isn't applied in your current life stage. We'll show patterns by week soon.
              </p>
            )}

            {recentLogs.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Recent logs</p>
                <div className="space-y-1">
                  {recentLogs.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-xs text-foreground/80">
                      <span>{format(new Date(l.logged_at), "MMM d, h:mm a")}</span>
                      <span className="flex items-center gap-2">
                        {l.cycle_phase && <span className="text-[10px] text-muted-foreground">{l.cycle_phase}</span>}
                        <span className="font-medium">
                          {l.option_value ? l.option_value : l.intensity !== null ? `${l.intensity}/5` : "—"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete tracker
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
