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

  const chartData = result.phaseStats.map((s) => ({
    phase: s.phase.slice(0, 4),
    avg: Number(s.avg.toFixed(2)),
    count: s.count,
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
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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
                      formatter={(value: number, _name, p: any) => [
                        `${value} (${p.payload.count} logs)`,
                        "Avg intensity",
                      ]}
                    />
                    <Bar dataKey="avg" fill="hsl(173 80% 40%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
