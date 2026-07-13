import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, ChevronRight, Sparkles } from "lucide-react";
import { subDays, format } from "date-fns";
import { SymptomHistory } from "./SymptomHistory";
import { SymptomPieChart } from "./SymptomPieChart";

const COLORS = {
  border: "border-l-amber-500",
  bgGradient: "from-amber-500/10 via-amber-500/5 to-transparent",
  iconBg: "bg-amber-500/15",
  iconColor: "text-amber-400",
  labelColor: "text-amber-400/80",
};

interface SymptomEntry {
  name: string;
  severity: number;
}

interface SymptomLog {
  id: string;
  symptoms: SymptomEntry[];
  notes: string | null;
  logged_at: string;
}

interface Props {
  userId: string;
  lastPeriodStart?: string;
  cycleLengthDays?: number;
  isNonCycling?: boolean;
  lifeStage?: string;
}

const SEVERITY_COLORS = [
  "bg-muted-foreground/30",
  "bg-green-400/70",
  "bg-lime-400/70",
  "bg-yellow-400/70",
  "bg-orange-400/70",
  "bg-red-400/70",
];

export function SymptomHistoryWidget({ userId, lastPeriodStart, cycleLengthDays, isNonCycling }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SymptomLog[]>([]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const since = subDays(new Date(), 90).toISOString();
    supabase
      .from("symptom_logs")
      .select("id, symptoms, notes, logged_at")
      .eq("user_id", userId)
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const typed = (data || []).map((d) => ({
          ...d,
          symptoms: (d.symptoms as any as SymptomEntry[]) || [],
        }));
        setLogs(typed);
        setLoading(false);
      });
  }, [userId]);

  // Compute top symptoms
  const freq: Record<string, { count: number; totalSev: number }> = {};
  logs.forEach((log) => {
    log.symptoms.forEach((s) => {
      if (!freq[s.name]) freq[s.name] = { count: 0, totalSev: 0 };
      freq[s.name].count++;
      freq[s.name].totalSev += s.severity;
    });
  });

  const topSymptoms = Object.entries(freq)
    .map(([name, { count, totalSev }]) => ({
      name,
      count,
      avgSeverity: Math.round((totalSev / count) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const totalLogs = logs.length;
  const latestLog = logs[0];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full text-left rounded-2xl border border-border/40 ${COLORS.border} border-l-[3px] bg-card overflow-hidden relative transition-opacity active:opacity-90`}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${COLORS.bgGradient} pointer-events-none`} />
        <div className="relative px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-lg ${COLORS.iconBg} flex items-center justify-center`}>
                <BarChart3 className={`w-4 h-4 ${COLORS.iconColor}`} />
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-widest ${COLORS.labelColor}`}>
                Symptom Patterns
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading patterns…
            </div>
          ) : totalLogs === 0 ? (
            <div className="text-[14px] text-foreground/75 leading-snug">
              No symptoms logged yet. Log a few and your patterns will appear here.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Top symptoms */}
              <div className="space-y-1.5">
                {topSymptoms.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_COLORS[Math.round(s.avgSeverity)] || "bg-muted-foreground/30"}`}
                    />
                    <span className="text-xs text-foreground/80 truncate flex-1">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{s.count}×</span>
                    <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400/70"
                        style={{ width: `${(s.avgSeverity / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Donut chart */}
              {logs.length > 0 && <SymptomPieChart logs={logs} compact />}

              {/* Summary */}
              <div className="flex items-center gap-1.5 pt-1">
                <Sparkles className="w-3 h-3 text-amber-400/70" />
                <span className="text-[10px] text-muted-foreground">
                  {totalLogs} log{totalLogs !== 1 ? "s" : ""} in the last 90 days
                  {latestLog && ` · last ${format(new Date(latestLog.logged_at), "MMM d")}`}
                </span>
              </div>
              {lifeStage === "irregular" && (
                <p className="text-[11px] text-muted-foreground/70 pt-1">
                  Phase estimates are approximate — your cycle may not follow a predictable pattern.
                </p>
              )}
            </div>
          )}
        </div>
      </button>

      {userId && (
        <SymptomHistory
          open={open}
          onOpenChange={setOpen}
          userId={userId}
          lastPeriodStart={lastPeriodStart}
          cycleLengthDays={cycleLengthDays}
          isNonCycling={!!isNonCycling}
          lifeStage={lifeStage}
        />
      )}
    </>
  );
}
