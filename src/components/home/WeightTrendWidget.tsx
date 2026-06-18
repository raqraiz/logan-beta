import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, ChevronRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { kgToLbs } from "@/lib/nutrition";
import { WeightDetailDialog } from "./WeightDetailDialog";

const COLORS = {
  border: "border-l-indigo-500",
  bgGradient: "from-indigo-500/10 via-indigo-500/5 to-transparent",
  iconBg: "bg-indigo-500/15",
  iconColor: "text-indigo-400",
  labelColor: "text-indigo-400/80",
};

interface Log { id: string; weight_kg: number; logged_on: string }
interface Props { userId: string }

const UNIT_KEY = "logan_weight_unit";

export function WeightTrendWidget({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Log[]>([]);
  const [goalKg, setGoalKg] = useState<number | null>(null);
  const [unit] = useState<"kg" | "lbs">((typeof localStorage !== "undefined" && (localStorage.getItem(UNIT_KEY) as "kg" | "lbs")) || "lbs");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const [{ data: l }, { data: g }] = await Promise.all([
      supabase.from("weight_logs").select("id, weight_kg, logged_on").eq("user_id", userId).order("logged_on", { ascending: false }).limit(30),
      supabase.from("nutrition_goals").select("weight_goal_kg").eq("user_id", userId).maybeSingle(),
    ]);
    setLogs((l as Log[]) ?? []);
    setGoalKg(g?.weight_goal_kg ? Number(g.weight_goal_kg) : null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return null;

  const display = (kg: number) => unit === "kg" ? kg : kgToLbs(kg);
  const latest = logs[0];
  const oldest = logs[logs.length - 1];
  const trendDelta = latest && oldest ? Number(latest.weight_kg) - Number(oldest.weight_kg) : 0;
  const goalDelta = latest && goalKg ? Number(latest.weight_kg) - goalKg : null;
  const trend = trendDelta < -0.1 ? "down" : trendDelta > 0.1 ? "up" : "flat";

  const chart = [...logs].reverse().map(l => ({ v: Number(display(Number(l.weight_kg))) }));

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
                <Scale className={`w-4 h-4 ${COLORS.iconColor}`} />
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-widest ${COLORS.labelColor}`}>
                Weight Trend
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
          </div>

          {!latest ? (
            <div className="text-[14px] text-foreground/75 leading-snug">
              No entries yet. Tap to log your first weight and start tracking.
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="shrink-0">
                <p className="text-2xl font-bold tabular-nums leading-none">
                  {display(Number(latest.weight_kg)).toFixed(1)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {format(parseISO(latest.logged_on), "MMM d")}
                </p>
                {logs.length > 1 && (
                  <div className={`flex items-center gap-0.5 text-[11px] mt-1 ${
                    trend === "down" ? "text-emerald-500" : trend === "up" ? "text-amber-500" : "text-muted-foreground"
                  }`}>
                    {trend === "down" ? <TrendingDown className="w-3 h-3" /> : trend === "up" ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    <span className="tabular-nums">{trendDelta > 0 ? "+" : ""}{display(trendDelta).toFixed(1)}</span>
                  </div>
                )}
              </div>

              {chart.length >= 2 && (
                <div className="flex-1 h-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart}>
                      <YAxis hide domain={["dataMin - 0.5", "dataMax + 0.5"]} />
                      <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {goalKg && goalDelta != null && (
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-muted-foreground">to goal</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {Math.abs(display(goalDelta)).toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </button>

      <WeightDetailDialog
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        onDataChanged={() => setRefreshKey(k => k + 1)}
      />
    </>
  );
}
