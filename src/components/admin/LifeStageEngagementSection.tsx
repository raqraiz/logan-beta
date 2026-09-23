import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchLifeStageEngagement, type LifeStageEngagement } from "@/lib/metrics/lifeStage";

const LOW_SAMPLE = 10;

/** "…" while loading, real value when resolved, never 0 as a stand-in. */
const fmt = (v: number | null | undefined, suffix = "", loading = false) => {
  if (loading) return "…";
  if (v === null || v === undefined) return "—";
  return `${v}${suffix}`;
};

export function LifeStageEngagementSection() {
  const [data, setData] = useState<LifeStageEngagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await fetchLifeStageEngagement());
    } catch (e) {
      console.error("Life stage engagement load failed:", e);
      setData(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Engagement by life stage
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <button
            onClick={load}
            className="text-xs text-destructive underline underline-offset-2 py-4"
          >
            Failed — retry
          </button>
        ) : (
          <>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/40">
                    <th className="text-left font-medium py-2 pr-3">Stage</th>
                    <th className="text-right font-medium py-2 px-2">Users</th>
                    <th className="text-right font-medium py-2 px-2">Active 7d</th>
                    <th className="text-right font-medium py-2 px-2">Active 30d</th>
                    <th className="text-right font-medium py-2 px-2">Week-4 retention</th>
                    <th className="text-right font-medium py-2 px-2">Min / active day</th>
                    <th className="text-right font-medium py-2 pl-2">Sessions / week</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? Array.from({ length: 9 }, () => null)).map((row, i) => {
                    const low = !!row && row.stage !== "all" && row.users < LOW_SAMPLE;
                    return (
                      <tr
                        key={row?.stage ?? i}
                        className={cn(
                          "border-b border-border/20 last:border-0",
                          row?.stage === "all" && "font-semibold",
                          low && "text-muted-foreground",
                        )}
                      >
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {row?.label ?? "…"}
                          {low && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide opacity-70">
                              low sample
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">{fmt(row?.users, "", loading)}</td>
                        <td className="text-right py-2 px-2 tabular-nums">{fmt(row?.pctActive7, "%", loading)}</td>
                        <td className="text-right py-2 px-2 tabular-nums">{fmt(row?.pctActive30, "%", loading)}</td>
                        <td className="text-right py-2 px-2 tabular-nums">
                          {fmt(row?.retentionW4, "%", loading)}
                          {row && row.retentionW4 !== null && (
                            <span className="text-muted-foreground"> ({row.retentionW4Base})</span>
                          )}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">{fmt(row?.avgMinutesPerActiveUserDay, "", loading)}</td>
                        <td className="text-right py-2 pl-2 tabular-nums">{fmt(row?.avgSessionsPerActiveUserWeek, "", loading)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
              Stage = current stage, not stage at signup. Time-based metrics only reflect data since
              activity tracking began.
              {data && (
                <> {data.conflictingUsers} user{data.conflictingUsers === 1 ? "" : "s"} had conflicting stage data.</>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
