import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Loader2 } from "lucide-react";
import { format, parseISO, differenceInDays, addDays } from "date-fns";

const START_DATE = new Date(Date.UTC(2026, 6, 1)); // Jul 1 2026
const END_DATE = new Date(Date.UTC(2027, 0, 1)); // Jan 1 2027
const START_COUNT = 100;
const END_COUNT = 1000;
const TOTAL_DAYS = differenceInDays(END_DATE, START_DATE);

const targetAt = (d: Date) => {
  const days = differenceInDays(d, START_DATE);
  if (days <= 0) return START_COUNT;
  if (days >= TOTAL_DAYS) return END_COUNT;
  return Math.round(START_COUNT + ((END_COUNT - START_COUNT) * days) / TOTAL_DAYS);
};

const toUTCDate = (s: string) => new Date(s + "T00:00:00Z");
const todayUTCKey = () => {
  const now = new Date();
  return format(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), "yyyy-MM-dd");
};

export const GrowthTrackerTab = () => {
  const [signupsByDay, setSignupsByDay] = useState<Map<string, number>>(new Map());
  const [baseline, setBaseline] = useState<number>(START_COUNT);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);

    // Same source as Overview's "Total Users": every row in `profiles`, unfiltered.
    const { count: preBaselineCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .lt("created_at", START_DATE.toISOString());
    const realBaseline = preBaselineCount ?? START_COUNT;
    setBaseline(realBaseline);

    const { data: profs, error: profErr } = await supabase
      .from("profiles")
      .select("created_at")
      .gte("created_at", START_DATE.toISOString());
    if (profErr) console.error("Failed to load profiles for growth:", profErr);

    const byDay = new Map<string, number>();
    for (const p of profs ?? []) {
      if (!p.created_at) continue;
      const d = new Date(p.created_at);
      const key = format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), "yyyy-MM-dd");
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    setSignupsByDay(byDay);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const { chartData, dailyRows, todayActual, todayKey } = useMemo(() => {
    const today = todayUTCKey();

    // Live cumulative actual per day from July 1 through today.
    const actualByDay = new Map<string, number>();
    let cumulative = baseline;
    for (let d = new Date(START_DATE); format(d, "yyyy-MM-dd") <= today; d = addDays(d, 1)) {
      const key = format(d, "yyyy-MM-dd");
      cumulative += signupsByDay.get(key) ?? 0;
      actualByDay.set(key, cumulative);
    }

    const todayActualVal = actualByDay.get(today) ?? baseline;

    const daysElapsed = Math.max(1, differenceInDays(toUTCDate(today), START_DATE));
    const dailyRate = (todayActualVal - baseline) / daysElapsed;

    const points = new Map<string, { date: string; target: number; actual?: number; trend?: number }>();

    for (let d = new Date(START_DATE); d <= END_DATE; d = addDays(d, 7)) {
      const key = format(d, "yyyy-MM-dd");
      points.set(key, { date: key, target: targetAt(d) });
    }
    const endKey = format(END_DATE, "yyyy-MM-dd");
    points.set(endKey, { date: endKey, target: END_COUNT });

    for (const [key, val] of actualByDay.entries()) {
      const existing = points.get(key) ?? { date: key, target: targetAt(toUTCDate(key)) };
      existing.actual = val;
      points.set(key, existing);
    }

    const anchor = points.get(today) ?? { date: today, target: targetAt(toUTCDate(today)) };
    anchor.actual = todayActualVal;
    anchor.trend = todayActualVal;
    points.set(today, anchor);

    for (let d = addDays(toUTCDate(today), 7); d <= END_DATE; d = addDays(d, 7)) {
      const key = format(d, "yyyy-MM-dd");
      const days = differenceInDays(d, START_DATE);
      const trendVal = Math.round(baseline + dailyRate * days);
      const existing = points.get(key) ?? { date: key, target: targetAt(d) };
      existing.trend = trendVal;
      points.set(key, existing);
    }
    {
      const days = differenceInDays(END_DATE, START_DATE);
      const trendEnd = Math.round(baseline + dailyRate * days);
      const existing = points.get(endKey)!;
      existing.trend = trendEnd;
    }

    const sorted = Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date));

    const rows = Array.from(actualByDay.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, users]) => {
        const target = targetAt(toUTCDate(date));
        return { date, users, target, delta: users - target };
      });

    return { chartData: sorted, dailyRows: rows, todayActual: todayActualVal, todayKey: today };
  }, [signupsByDay, baseline]);

  const maxVal = chartData.reduce(
    (m, p) => Math.max(m, p.actual ?? 0, p.target ?? 0, p.trend ?? 0),
    0
  );
  const yMax = Math.max(1000, Math.ceil(maxVal / 100) * 100);

  const chartConfig: ChartConfig = {
    target: { label: "Target", color: "hsl(var(--muted-foreground))" },
    actual: { label: "Actual", color: "hsl(var(--primary))" },
    trend: { label: "Trend", color: "hsl(35 92% 55%)" },
  };

  const fmtDelta = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Growth toward 1,000 users by Jan 1, 2027</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Today ({format(toUTCDate(todayKey), "MMM d, yyyy")}):{" "}
            <span className="font-medium text-foreground">{todayActual}</span> users ·
            {" "}Target today: <span className="font-medium">{targetAt(toUTCDate(todayKey))}</span> ·
            {" "}<span className="font-medium">{fmtDelta(todayActual - targetAt(toUTCDate(todayKey)))}</span> vs target
          </p>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[360px] w-full">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => format(parseISO(v), "MMM d")}
                tick={{ fontSize: 11 }}
              />
              <YAxis domain={[0, yMax]} tick={{ fontSize: 11 }} />
              <ChartTooltip
                trigger="hover"
                content={<ChartTooltipContent labelFormatter={(v) => format(parseISO(v as string), "MMM d, yyyy")} />}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="target"
                name="Target"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="6 4"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="trend"
                name="Trend"
                stroke="hsl(35 92% 55%)"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
                connectNulls
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                connectNulls
                dot={(props: any) => {
                  const isToday = props?.payload?.date === todayKey;
                  return (
                    <g key={`actual-dot-${props.payload?.date}`}>
                      <circle cx={props.cx} cy={props.cy} r={18} fill="transparent" style={{ pointerEvents: "all" }} />
                      {isToday && (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={5}
                          fill="hsl(var(--primary))"
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        />
                      )}
                    </g>
                  );
                }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily log</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Live from signup data — one row per day since Jul 1, 2026.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyRows.map((r) => (
                  <TableRow key={r.date}>
                    <TableCell>{format(toUTCDate(r.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{r.users}</TableCell>
                    <TableCell className="text-muted-foreground">{r.target}</TableCell>
                    <TableCell className={`text-right font-medium ${r.delta >= 0 ? "text-primary" : "text-muted-foreground"}`}>
                      {fmtDelta(r.delta)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
