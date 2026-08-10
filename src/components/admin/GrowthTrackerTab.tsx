import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Loader2 } from "lucide-react";
import { format, differenceInDays, addDays } from "date-fns";

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

// Parse a yyyy-MM-dd key at noon UTC so local-timezone display never shifts the day.
const toUTCDate = (s: string) => new Date(s + "T12:00:00Z");
// Timezone-safe key: always the UTC calendar day of the given instant.
const utcKey = (d: Date) => d.toISOString().slice(0, 10);
const todayUTCKey = () => utcKey(new Date());


type DayActivity = {
  dau: number;
  wau: number;
  msgsPerUser: number | null;
  sessionsPerUser: number | null;
};

const SESSION_GAP_MS = 30 * 60 * 1000;
const PAGE = 1000;

// Paged fetch so we never silently truncate at Supabase's 1000-row default.
const fetchAll = async <T,>(
  table: "chat_messages" | "symptom_logs",
  columns: string,
  tsColumn: string,
  since: string
): Promise<T[]> => {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte(tsColumn, since)
      .order(tsColumn, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`Failed to load ${table} for growth activity:`, error);
      break;
    }
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
};

export const GrowthTrackerTab = () => {
  const [signupsByDay, setSignupsByDay] = useState<Map<string, number>>(new Map());
  const [baseline, setBaseline] = useState<number>(START_COUNT);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<Map<string, DayActivity>>(new Map());
  const [activityLoading, setActivityLoading] = useState(true);

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
      const key = utcKey(d);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    setSignupsByDay(byDay);
    setLoading(false);
  };

  const loadActivity = async () => {
    setActivityLoading(true);
    const since = START_DATE.toISOString();

    const [msgs, symptoms] = await Promise.all([
      fetchAll<{ user_id: string; created_at: string }>(
        "chat_messages",
        "user_id, created_at",
        "created_at",
        since
      ),
      fetchAll<{ user_id: string; logged_at: string }>(
        "symptom_logs",
        "user_id, logged_at",
        "logged_at",
        since
      ),
    ]);

    // day -> user -> sorted message timestamps
    const msgsByDay = new Map<string, Map<string, number[]>>();
    const activeByDay = new Map<string, Set<string>>();

    const markActive = (key: string, userId: string) => {
      if (!userId) return;
      let set = activeByDay.get(key);
      if (!set) { set = new Set(); activeByDay.set(key, set); }
      set.add(userId);
    };

    for (const m of msgs) {
      if (!m.created_at) continue;
      const key = utcKey(new Date(m.created_at));
      markActive(key, m.user_id);
      let byUser = msgsByDay.get(key);
      if (!byUser) { byUser = new Map(); msgsByDay.set(key, byUser); }
      const arr = byUser.get(m.user_id) ?? [];
      arr.push(new Date(m.created_at).getTime());
      byUser.set(m.user_id, arr);
    }

    for (const s of symptoms) {
      if (!s.logged_at) continue;
      markActive(utcKey(new Date(s.logged_at)), s.user_id);
    }

    const dayKeys = Array.from(activeByDay.keys()).sort();
    const result = new Map<string, DayActivity>();

    for (const key of dayKeys) {
      const active = activeByDay.get(key)!;
      const dau = active.size;

      // Rolling 7-day window ending on this day.
      const windowStart = utcKey(addDays(toUTCDate(key), -6));
      const wauSet = new Set<string>();
      for (const [k, set] of activeByDay.entries()) {
        if (k >= windowStart && k <= key) for (const u of set) wauSet.add(u);
      }

      const byUser = msgsByDay.get(key);
      let totalMsgs = 0;
      let totalSessions = 0;
      if (byUser) {
        for (const times of byUser.values()) {
          totalMsgs += times.length;
          times.sort((a, b) => a - b);
          let sessions = times.length > 0 ? 1 : 0;
          for (let i = 1; i < times.length; i++) {
            if (times[i] - times[i - 1] >= SESSION_GAP_MS) sessions++;
          }
          totalSessions += sessions;
        }
      }

      result.set(key, {
        dau,
        wau: wauSet.size,
        msgsPerUser: dau > 0 ? totalMsgs / dau : null,
        sessionsPerUser: dau > 0 ? totalSessions / dau : null,
      });
    }

    setActivity(result);
    setActivityLoading(false);
  };

  useEffect(() => { load(); loadActivity(); }, []);


  const { chartData, dailyRows, todayActual, todayKey } = useMemo(() => {
    const today = todayUTCKey();

    // Live cumulative actual per day from July 1 through today.
    const actualByDay = new Map<string, number>();
    let cumulative = baseline;
    for (let d = new Date(START_DATE); utcKey(d) <= today; d = addDays(d, 1)) {
      const key = utcKey(d);
      cumulative += signupsByDay.get(key) ?? 0;
      actualByDay.set(key, cumulative);
    }

    const todayActualVal = actualByDay.get(today) ?? baseline;

    const daysElapsed = Math.max(1, differenceInDays(toUTCDate(today), START_DATE));
    const dailyRate = (todayActualVal - baseline) / daysElapsed;

    const points = new Map<string, { date: string; target: number; actual?: number; trend?: number }>();

    for (let d = new Date(START_DATE); d <= END_DATE; d = addDays(d, 7)) {
      const key = utcKey(d);
      points.set(key, { date: key, target: targetAt(d) });
    }
    const endKey = utcKey(END_DATE);
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
      const key = utcKey(d);
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
                tickFormatter={(v) => format(toUTCDate(v), "MMM d")}
                tick={{ fontSize: 11 }}
              />
              <YAxis domain={[0, yMax]} tick={{ fontSize: 11 }} />
              <ChartTooltip
                trigger="hover"
                content={<ChartTooltipContent labelFormatter={(v) => format(toUTCDate(v as string), "MMM d, yyyy")} />}
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
