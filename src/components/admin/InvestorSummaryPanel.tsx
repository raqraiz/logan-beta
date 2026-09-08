import { useEffect, useMemo, useState } from "react";
import { onboardedProfiles, countOnboardedUsers } from "@/lib/onboardedUsers";
import { fetchSignupDayKeys, makeUsersAsOf, computeAvgPerUser } from "@/lib/admin/engagementMetrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Loader2, TrendingUp } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import {
  buildActivityIndex,
  utcDayKeysBetween,
  utcKey,
  toUTCDate,
  type ActivityIndex,
} from "@/lib/activeUsers";

const GOAL_COUNT = 1000;
const GOAL_DATE = new Date(Date.UTC(2027, 0, 1));

const chartConfig: ChartConfig = {
  actual: { label: "Actual", color: "hsl(var(--primary))" },
  target: { label: "Target", color: "hsl(0 0% 100%)" },
  trend: { label: "Trend", color: "hsl(25 95% 55%)" },
};

const fmt = (n: number | null) => (n === null ? "—" : String(Math.round(n * 10) / 10));

export const InvestorSummaryPanel = () => {
  const [rangeFrom, setRangeFrom] = useState<Date>(() => startOfMonth(new Date()));
  const [rangeTo, setRangeTo] = useState<Date>(() => {
    const eom = endOfMonth(new Date());
    const now = new Date();
    return eom > now ? endOfDay(now) : eom;
  });

  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState<ActivityIndex | null>(null);
  // Cumulative user count by UTC day (all profiles up to a frozen snapshot instant).
  const [signupDays, setSignupDays] = useState<string[]>([]);
  // Canonical all-time total from the SAME source the top-level "Total Users"
  // card uses (`count_onboarded_users` RPC). The per-day list above is only a
  // shape for the chart; it is paged client-side and can drift by a signup that
  // lands between the two reads, so the headline always defers to this value.
  const [canonicalTotal, setCanonicalTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Freeze the read horizon once so paging can't shift while new signups land.
      const snapshotISO = new Date(Math.max(endOfDay(rangeTo).getTime(), Date.now())).toISOString();
      const [idx, profiles, total] = await Promise.all([
        buildActivityIndex(startOfDay(rangeFrom).toISOString()),
        fetchSignupDayKeys(snapshotISO),
        countOnboardedUsers().catch((e) => {
          console.error("Investor summary canonical total failed:", e);
          return null;
        }),
      ]);
      if (cancelled) return;
      setIndex(idx);
      setSignupDays(profiles);
      setCanonicalTotal(total);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [rangeFrom, rangeTo]);

  const usersAsOf = useMemo(
    () => makeUsersAsOf(signupDays, canonicalTotal),
    [signupDays, canonicalTotal],
  );

  const metrics = useMemo(() => {
    if (!index) return null;
    const days = utcDayKeysBetween(rangeFrom, rangeTo);
    if (days.length === 0) return null;

    const startKey = days[0];
    const endKey = days[days.length - 1];
    const totalAtEnd = usersAsOf(endKey);
    const totalAtStart = usersAsOf(startKey);

    let dailySum = 0;
    let totalMessages = 0;
    let totalSessions = 0;
    let anyActivity = false;
    for (const d of days) {
      const active = index.getActiveUsersForDay(d).size;
      if (active > 0) anyActivity = true;
      dailySum += active;
      totalMessages += index.getUserMessagesForDay(d);
      totalSessions += index.getSessionsForDay(d);
    }

    // Canonical weekly active users (ISO Monday–Sunday weeks) — shared with
    // the Overview tab via the same helper, so the two cards cannot drift.
    const { avgWeeklyUsers: avgWeekly, fullWeekCount } = computeAvgWeeklyActiveUsers({
      activityIndex: index,
      rangeFrom,
      rangeTo,
    });

    // Canonical per-user averages, shared with the Overview tab.
    const { avgMsgsPerUser, avgSessionsPerUser } = computeAvgPerUser({
      totalMessages,
      totalSessions,
      totalUsers: totalAtEnd,
    });

    return {
      startKey,
      endKey,
      totalAtEnd,
      totalAtStart,
      hasData: anyActivity || totalAtEnd > 0,
      avgDaily: dailySum / days.length,
      weekly,
      weeklyFullCount: full.length,
      avgWeekly,
      avgMsgsPerUser,
      avgSessionsPerUser,
    };
  }, [index, rangeFrom, rangeTo, usersAsOf]);


  const chartData = useMemo(() => {
    if (!metrics) return [];
    const todayKey = utcKey(new Date());
    const keys = utcDayKeysBetween(toUTCDate(metrics.startKey), GOAL_DATE);
    const baseline = metrics.totalAtStart;
    const totalSpan = Math.max(1, keys.length - 1);

    // Growth rate per day observed over the range up to today.
    const lastActualKey = metrics.endKey < todayKey ? metrics.endKey : todayKey;
    const actualSpan = Math.max(1, utcDayKeysBetween(toUTCDate(metrics.startKey), toUTCDate(lastActualKey)).length - 1);
    const perDay = (usersAsOf(lastActualKey) - baseline) / actualSpan;

    return keys.map((k, i) => ({
      date: k,
      actual: k <= todayKey ? usersAsOf(k) : null,
      target: Math.round(baseline + ((GOAL_COUNT - baseline) * i) / totalSpan),
      trend: Math.round(baseline + perDay * i),
    }));
  }, [metrics, usersAsOf]);

  // Explicit ticks so the final point (goal date) always renders.
  const xTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    const target = 8;
    const step = Math.max(1, Math.ceil((chartData.length - 1) / target));
    const ticks: string[] = [];
    for (let i = 0; i < chartData.length; i += step) ticks.push(chartData[i].date);
    const last = chartData[chartData.length - 1].date;
    if (ticks[ticks.length - 1] !== last) {
      // Replace a crowded penultimate tick rather than overlapping the last one.
      const lastIdx = chartData.length - 1;
      const prevIdx = chartData.findIndex((d) => d.date === ticks[ticks.length - 1]);
      if (lastIdx - prevIdx < step / 2) ticks.pop();
      ticks.push(last);
    }
    return ticks;
  }, [chartData]);

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader className="pb-3 flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Investor Summary
        </CardTitle>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              {format(rangeFrom, "MMM d, yyyy")} — {format(rangeTo, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="flex flex-col sm:flex-row">
              <div className="p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pb-1">Start</p>
                <Calendar
                  mode="single"
                  selected={rangeFrom}
                  onSelect={(d) => d && setRangeFrom(startOfDay(d))}
                  className="p-3 pointer-events-auto"
                />
              </div>
              <div className="p-2 border-t sm:border-t-0 sm:border-l border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pb-1">End</p>
                <Calendar
                  mode="single"
                  selected={rangeTo}
                  onSelect={(d) => d && setRangeTo(endOfDay(d))}
                  className="p-3 pointer-events-auto"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : !metrics || !metrics.hasData ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No data for this range</p>
        ) : (
          <>
            <div>
              <p className="text-3xl font-bold text-foreground">
                Total Users as of {format(toUTCDate(metrics.endKey), "MMM d, yyyy")}: {metrics.totalAtEnd}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Up from {metrics.totalAtStart} at the start of the period.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Avg daily active users", value: fmt(metrics.avgDaily) },
                {
                  label: `Avg weekly active users${metrics.weeklyFullCount > 0 ? ` (${metrics.weeklyFullCount} full Mon–Sun wks)` : " (day-weighted)"}`,
                  value: fmt(metrics.avgWeekly),
                },

                { label: "Avg messages per user", value: fmt(metrics.avgMsgsPerUser) },
                { label: "Avg session per user", value: fmt(metrics.avgSessionsPerUser) },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-2">Path to 1,000 users</p>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    ticks={xTicks}
                    interval={0}

                    tickFormatter={(v: string) => format(toUTCDate(v), "MMM d")}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, GOAL_COUNT]} className="text-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line type="monotone" dataKey="target" stroke="var(--color-target)" strokeDasharray="6 4" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="trend" stroke="var(--color-trend)" strokeDasharray="6 4" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="actual" stroke="var(--color-actual)" dot={false} strokeWidth={2.5} connectNulls={false} />
                </LineChart>
              </ChartContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
