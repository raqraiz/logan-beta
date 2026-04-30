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
  Legend,
} from "recharts";
import {
  analyzeCorrelation,
  getPhaseForDate,
  PHASES,
  type Phase,
} from "@/lib/cycleCorrelation";
import { toast } from "sonner";
import { getHormoneValue, avg } from "@/lib/hormoneCurves";

interface Tracker {
  id: string;
  name: string;
  emoji: string;
  description?: string | null;
}

interface LogRow {
  id: string;
  intensity: number;
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
  onUpdated?: (t: Tracker) => void;
}

export function CycleCorrelationDetail({
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
        .select("id, intensity, cycle_phase, logged_at")
        .eq("tracker_id", tracker.id)
        .order("logged_at", { ascending: false })
        .limit(200);
      setLogs((data as LogRow[]) || []);
      setLoading(false);
    })();
  }, [open, tracker.id]);

  // For logs missing cycle_phase (legacy / non-cycling), back-fill phase if possible
  const enrichedLogs = useMemo(() => {
    return logs.map((l) => {
      let phase = l.cycle_phase;
      if (!phase && lastPeriodStart && !isNonCycling) {
        try {
          phase = getPhaseForDate(new Date(l.logged_at), lastPeriodStart, cycleLengthDays);
        } catch {
          /* ignore */
        }
      }
      return { phase, intensity: l.intensity };
    });
  }, [logs, lastPeriodStart, cycleLengthDays, isNonCycling]);

  const result = useMemo(
    () => analyzeCorrelation(enrichedLogs, tracker.name),
    [enrichedLogs, tracker.name]
  );

  // Average hormone levels per phase (normalized 0-1, scaled to 0-5 for chart overlay)
  const HORMONES = [
    { key: "estrogen", label: "Estrogen", color: "hsl(187, 100%, 42%)" },
    { key: "progesterone", label: "Progesterone", color: "hsl(270, 60%, 65%)" },
    { key: "fsh", label: "FSH", color: "hsl(40, 85%, 55%)" },
    { key: "lh", label: "LH", color: "hsl(355, 75%, 60%)" },
  ] as const;

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

  const chartData = result.phaseStats.map((s) => ({
    phase: s.phase,
    fullPhase: s.phase,
    avg: Number(s.avg.toFixed(2)),
    count: s.count,
    estrogen: Number(hormoneByPhase[s.phase].estrogen.toFixed(2)),
    progesterone: Number(hormoneByPhase[s.phase].progesterone.toFixed(2)),
    fsh: Number(hormoneByPhase[s.phase].fsh.toFixed(2)),
    lh: Number(hormoneByPhase[s.phase].lh.toFixed(2)),
  }));

  const handleDelete = async () => {
    if (!confirm(`Delete tracker "${tracker.name}" and all its logs?`)) return;
    const { error } = await supabase
      .from("custom_trackers")
      .delete()
      .eq("id", tracker.id);
    if (error) {
      toast.error("Couldn't delete");
      return;
    }
    toast.success("Tracker deleted");
    onDeleted();
  };

  const handleSaveEdit = async () => {
    const name = editName.trim();
    const emoji = (editEmoji || "✨").slice(0, 4);
    if (!name) {
      toast.error("Name can't be empty");
      return;
    }
    if (name === tracker.name && emoji === tracker.emoji) {
      setEditing(false);
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("custom_trackers")
      .update({ name, emoji })
      .eq("id", tracker.id);
    setSavingEdit(false);
    if (error) {
      toast.error("Couldn't save changes");
      return;
    }
    toast.success("Updated");
    setEditing(false);
    onUpdated?.({ ...tracker, name, emoji });
  };

  const recentLogs = logs.slice(0, 7);

  const cancelEdit = () => {
    setEditName(tracker.name);
    setEditEmoji(tracker.emoji);
    setEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle asChild>
            <div className="flex items-center gap-2 pr-8">
              {editing ? (
                <>
                  <Input
                    value={editEmoji}
                    onChange={(e) => setEditEmoji(e.target.value.slice(0, 4))}
                    maxLength={4}
                    className="w-14 h-9 text-center text-base"
                    aria-label="Emoji"
                  />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={60}
                    className="h-9 flex-1"
                    aria-label="Tracker name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    aria-label="Save"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={cancelEdit}
                    disabled={savingEdit}
                    aria-label="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-lg">{tracker.emoji}</span>
                  <span className="text-lg font-semibold leading-none tracking-tight truncate">
                    {tracker.name}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditing(true)}
                    aria-label="Edit tracker"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
          </DialogTitle>
          <DialogDescription>
            {result.totalLogs > 0
              ? `${result.totalLogs} log${result.totalLogs === 1 ? "" : "s"} • confidence: ${result.confidence}`
              : "No data yet"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            {/* Insight */}
            <div className="rounded-xl bg-teal-500/10 border border-teal-500/30 p-3">
              <p
                className="text-sm text-foreground/90 leading-snug"
                dangerouslySetInnerHTML={{
                  __html: result.insight.replace(
                    /\*\*(.+?)\*\*/g,
                    '<strong class="text-teal-400">$1</strong>'
                  ),
                }}
              />
            </div>

            {/* Chart */}
            {!isNonCycling && result.totalLogs > 0 && (
              <div className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/10 backdrop-blur-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">
                    Symptom × Hormones
                  </p>
                  <p className="text-[9px] text-muted-foreground/50">avg per phase</p>
                </div>

                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
                      <defs>
                        <linearGradient id="symptomBarFill" x1="0" y1="0" x2="0" y2="1">
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
                      <CartesianGrid
                        strokeDasharray="2 4"
                        stroke="hsl(var(--border))"
                        strokeOpacity={0.18}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="phase"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        dy={4}
                      />
                      <YAxis
                        domain={[0, 5]}
                        tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--foreground) / 0.04)" }}
                        contentStyle={{
                          background: "hsl(var(--card) / 0.95)",
                          backdropFilter: "blur(12px)",
                          border: "1px solid hsl(var(--border) / 0.5)",
                          borderRadius: 12,
                          fontSize: 11,
                          padding: "8px 10px",
                          boxShadow: "0 8px 24px hsl(0 0% 0% / 0.4)",
                        }}
                        labelStyle={{
                          fontSize: 10,
                          color: "hsl(var(--muted-foreground))",
                          marginBottom: 4,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                        formatter={(value: number, name: string, p: any) => {
                          if (name === "Symptom") return [`${value} · ${p.payload.count} log${p.payload.count === 1 ? "" : "s"}`, "Symptom"];
                          return [value.toFixed(2), name];
                        }}
                      />
                      <Bar
                        dataKey="avg"
                        name="Symptom"
                        fill="url(#symptomBarFill)"
                        radius={[6, 6, 2, 2]}
                        barSize={28}
                      />
                      {HORMONES.map((h) => (
                        <Area
                          key={`area-${h.key}`}
                          type="monotone"
                          dataKey={h.key}
                          stroke="none"
                          fill={`url(#hormoneFill-${h.key})`}
                          isAnimationActive={false}
                          legendType="none"
                          tooltipType="none"
                        />
                      ))}
                      {HORMONES.map((h) => (
                        <Line
                          key={h.key}
                          type="monotone"
                          dataKey={h.key}
                          name={h.label}
                          stroke={h.color}
                          strokeWidth={1.75}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          dot={false}
                          activeDot={{ r: 3, strokeWidth: 0, fill: h.color }}
                          isAnimationActive={false}
                          opacity={0.9}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pt-1 border-t border-white/5">
                  <div className="flex items-center gap-1.5 pt-1.5">
                    <span className="w-2 h-2.5 rounded-sm bg-gradient-to-b from-teal-400 to-teal-600" />
                    <span className="text-[10px] text-foreground/70 font-medium">Symptom</span>
                  </div>
                  {HORMONES.map((h) => (
                    <div key={h.key} className="flex items-center gap-1.5 pt-1.5">
                      <span
                        className="w-3.5 h-[2px] rounded-full"
                        style={{ background: h.color, boxShadow: `0 0 6px ${h.color}40` }}
                      />
                      <span className="text-[10px] text-foreground/70">{h.label}</span>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-muted-foreground/55 text-center leading-snug px-2">
                  Typical hormone curves overlaid on your logged intensity — see which hormones may be driving each pattern.
                </p>
              </div>
            )}

            {isNonCycling && result.totalLogs > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Phase correlation isn't applied in your current life stage. We'll show patterns by week soon.
              </p>
            )}

            {/* Recent logs */}
            {recentLogs.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Recent logs
                </p>
                <div className="space-y-1">
                  {recentLogs.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between text-xs text-foreground/80"
                    >
                      <span>{format(new Date(l.logged_at), "MMM d, h:mm a")}</span>
                      <span className="flex items-center gap-2">
                        {l.cycle_phase && (
                          <span className="text-[10px] text-muted-foreground">
                            {l.cycle_phase}
                          </span>
                        )}
                        <span className="font-medium">{l.intensity}/5</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive gap-1.5"
                onClick={handleDelete}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete tracker
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
