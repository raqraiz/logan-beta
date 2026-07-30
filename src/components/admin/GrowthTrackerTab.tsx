import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { toast } from "@/hooks/use-toast";
import { Trash2, Pencil, Check, X, Loader2 } from "lucide-react";
import { format, parseISO, differenceInDays, addDays } from "date-fns";

interface Entry {
  id: string;
  date: string;
  actual_user_count: number;
}

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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [signupsByDay, setSignupsByDay] = useState<Map<string, number>>(new Map());
  // Real number of profiles that existed before Jul 1 2026 — the actual baseline.
  // (The hardcoded 100 was the goal-line baseline, not the real one: it caused
  // Growth Tracker to under-report by exactly `baseline - 100` vs Overview.)
  const [baseline, setBaseline] = useState<number>(START_COUNT);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [count, setCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCount, setEditCount] = useState("");


  const load = async () => {
    setLoading(true);

    // Same source as Overview's "Total Users": every row in `profiles`, unfiltered.
    const [{ count: totalProfiles }, { count: preBaselineCount }] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .lt("created_at", START_DATE.toISOString()),
    ]);
    const realBaseline = preBaselineCount ?? START_COUNT;
    setBaseline(realBaseline);

    // Pull all signups since July 1 for the historical actual curve.
    const { data: profs, error: profErr } = await supabase
      .from("profiles")
      .select("created_at")
      .gte("created_at", START_DATE.toISOString());
    if (profErr) {
      console.error("Failed to load profiles for growth:", profErr);
    }
    const byDay = new Map<string, number>();
    for (const p of profs ?? []) {
      if (!p.created_at) continue;
      const d = new Date(p.created_at);
      const key = format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), "yyyy-MM-dd");
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    setSignupsByDay(byDay);

    // Auto-snapshot today's total into growth_tracker — must equal Overview exactly.
    try {
      const today = todayUTCKey();
      const totalSignupsThroughToday = Array.from(byDay.entries())
        .filter(([k]) => k <= today)
        .reduce((s, [, v]) => s + v, 0);
      const derivedToday = totalProfiles ?? realBaseline + totalSignupsThroughToday;

      console.info(
        `[GrowthTracker] total profiles=${totalProfiles} · pre-Jul-1 baseline=${realBaseline} ` +
          `(hardcoded was ${START_COUNT}) · signups since Jul 1=${totalSignupsThroughToday}`
      );

      const { data: existing } = await supabase
        .from("growth_tracker")
        .select("id, actual_user_count")
        .eq("date", today)
        .maybeSingle();
      if (!existing || existing.actual_user_count !== derivedToday) {
        await supabase
          .from("growth_tracker")
          .upsert({ date: today, actual_user_count: derivedToday }, { onConflict: "date" });
      }
    } catch (e) {
      console.error("Auto-snapshot failed:", e);
    }


    const { data, error } = await supabase
      .from("growth_tracker")
      .select("id, date, actual_user_count")
      .order("date", { ascending: true });
    if (error) {
      toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    } else {
      setEntries(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const n = parseInt(count, 10);
    if (!date || isNaN(n) || n < 0) {
      toast({ title: "Enter a valid date and user count", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("growth_tracker")
      .upsert({ date, actual_user_count: n }, { onConflict: "date" });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setCount("");
    toast({ title: "Entry saved" });
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("growth_tracker").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const handleEditSave = async (id: string) => {
    const n = parseInt(editCount, 10);
    if (isNaN(n) || n < 0) {
      toast({ title: "Invalid count", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("growth_tracker").update({ actual_user_count: n }).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    setEditingId(null);
    load();
  };

  const { chartData, todayActual, todayKey } = useMemo(() => {
    const today = todayUTCKey();
    const overrides = new Map(entries.map((e) => [e.date, e.actual_user_count]));

    // Build cumulative actual per day from July 1 through today.
    const actualByDay = new Map<string, number>();
    let cumulative = START_COUNT;
    for (let d = new Date(START_DATE); format(d, "yyyy-MM-dd") <= today; d = addDays(d, 1)) {
      const key = format(d, "yyyy-MM-dd");
      cumulative += signupsByDay.get(key) ?? 0;
      const value = overrides.has(key) ? (overrides.get(key) as number) : cumulative;
      actualByDay.set(key, value);
    }

    const todayActualVal = actualByDay.get(today) ?? START_COUNT;

    // Trend: average daily growth since July 1, extended from today → Jan 1.
    const daysElapsed = Math.max(1, differenceInDays(toUTCDate(today), START_DATE));
    const dailyRate = (todayActualVal - START_COUNT) / daysElapsed;

    // Points: daily up to today (actual), then weekly + endpoint for trend/target.
    const points = new Map<string, { date: string; target: number; actual?: number; trend?: number }>();

    // Weekly target skeleton
    for (let d = new Date(START_DATE); d <= END_DATE; d = addDays(d, 7)) {
      const key = format(d, "yyyy-MM-dd");
      points.set(key, { date: key, target: targetAt(d) });
    }
    const endKey = format(END_DATE, "yyyy-MM-dd");
    points.set(endKey, { date: endKey, target: END_COUNT });

    // Overlay daily actuals
    for (const [key, val] of actualByDay.entries()) {
      const existing = points.get(key) ?? { date: key, target: targetAt(toUTCDate(key)) };
      existing.actual = val;
      points.set(key, existing);
    }

    // Trend line: from today (anchored to actual) forward, weekly + endpoint
    const anchor = points.get(today) ?? { date: today, target: targetAt(toUTCDate(today)) };
    anchor.actual = todayActualVal;
    anchor.trend = todayActualVal;
    points.set(today, anchor);

    for (let d = addDays(toUTCDate(today), 7); d <= END_DATE; d = addDays(d, 7)) {
      const key = format(d, "yyyy-MM-dd");
      const days = differenceInDays(d, START_DATE);
      const trendVal = Math.round(START_COUNT + dailyRate * days);
      const existing = points.get(key) ?? { date: key, target: targetAt(d) };
      existing.trend = trendVal;
      points.set(key, existing);
    }
    // Endpoint
    {
      const days = differenceInDays(END_DATE, START_DATE);
      const trendEnd = Math.round(START_COUNT + dailyRate * days);
      const existing = points.get(endKey)!;
      existing.trend = trendEnd;
    }

    const sorted = Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date));
    return { chartData: sorted, todayActual: todayActualVal, todayKey: today };
  }, [entries, signupsByDay]);

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Growth toward 1,000 users by Jan 1, 2027</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Today: <span className="font-medium text-foreground">{todayActual}</span> users ·
            {" "}Target today: <span className="font-medium">{targetAt(toUTCDate(todayKey))}</span>
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
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backfill or correct a date</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Historical actuals are derived live from signup data. Use this only to override a specific date if the reconstructed number is off.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <Label htmlFor="gt-date">Date</Label>
              <Input id="gt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <Label htmlFor="gt-count">User count</Label>
              <Input
                id="gt-count"
                type="number"
                min={0}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="e.g. 152"
              />
            </div>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add entry"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual overrides</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No overrides yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...entries].reverse().map((e) => {
                  const proj = targetAt(parseISO(e.date));
                  const isEditing = editingId === e.id;
                  return (
                    <TableRow key={e.id}>
                      <TableCell>{format(parseISO(e.date), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            value={editCount}
                            onChange={(ev) => setEditCount(ev.target.value)}
                            className="w-24 h-8"
                          />
                        ) : (
                          <span className={e.actual_user_count >= proj ? "text-primary font-medium" : ""}>
                            {e.actual_user_count}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{proj}</TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" onClick={() => handleEditSave(e.id)}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => { setEditingId(e.id); setEditCount(String(e.actual_user_count)); }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => handleDelete(e.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
