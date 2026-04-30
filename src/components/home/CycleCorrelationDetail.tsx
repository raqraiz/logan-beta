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
import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
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
}: Props) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

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
    phase: s.phase.slice(0, 4),
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

  const recentLogs = logs.slice(0, 7);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{tracker.emoji}</span>
            <span>{tracker.name}</span>
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
              <div className="space-y-1.5">
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis dataKey="phase" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string, p: any) => {
                          if (name === "Symptom") return [`${value} (${p.payload.count} logs)`, "Avg intensity"];
                          return [value.toFixed(2), name];
                        }}
                      />
                      <Bar dataKey="avg" name="Symptom" fill="hsl(173 80% 40%)" radius={[4, 4, 0, 0]} />
                      {HORMONES.map((h) => (
                        <Line
                          key={h.key}
                          type="monotone"
                          dataKey={h.key}
                          name={h.label}
                          stroke={h.color}
                          strokeWidth={1.5}
                          dot={{ r: 2, fill: h.color }}
                          activeDot={{ r: 3 }}
                          isAnimationActive={false}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(173 80% 40%)" }} />
                    <span className="text-[10px] text-muted-foreground">Symptom</span>
                  </div>
                  {HORMONES.map((h) => (
                    <div key={h.key} className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 rounded-full" style={{ background: h.color }} />
                      <span className="text-[10px] text-muted-foreground">{h.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/60 text-center leading-tight pt-0.5">
                  Hormone curves are typical patterns — overlay shows when each hormone peaks vs. your symptom intensity.
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
