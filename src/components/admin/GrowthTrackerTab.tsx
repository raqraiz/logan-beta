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

const projectedAt = (d: Date) => {
  const days = differenceInDays(d, START_DATE);
  if (days <= 0) return START_COUNT;
  if (days >= TOTAL_DAYS) return END_COUNT;
  return Math.round(START_COUNT + ((END_COUNT - START_COUNT) * days) / TOTAL_DAYS);
};

export const GrowthTrackerTab = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [count, setCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCount, setEditCount] = useState("");

  const load = async () => {
    setLoading(true);
    // Auto-snapshot today's total user count from profiles.
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      if (typeof userCount === "number") {
        const { data: existing } = await supabase
          .from("growth_tracker")
          .select("id, actual_user_count")
          .eq("date", today)
          .maybeSingle();
        if (!existing || existing.actual_user_count !== userCount) {
          await supabase
            .from("growth_tracker")
            .upsert({ date: today, actual_user_count: userCount }, { onConflict: "date" });
        }
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

  const chartData = useMemo(() => {
    // Build one point per week + endpoints + all actual dates
    const points = new Map<string, { date: string; projected: number; actual?: number }>();
    for (let d = new Date(START_DATE); d <= END_DATE; d = addDays(d, 7)) {
      const key = format(d, "yyyy-MM-dd");
      points.set(key, { date: key, projected: projectedAt(d) });
    }
    const endKey = format(END_DATE, "yyyy-MM-dd");
    points.set(endKey, { date: endKey, projected: END_COUNT });
    for (const e of entries) {
      const existing = points.get(e.date);
      if (existing) {
        existing.actual = e.actual_user_count;
      } else {
        points.set(e.date, {
          date: e.date,
          projected: projectedAt(parseISO(e.date)),
          actual: e.actual_user_count,
        });
      }
    }
    return Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [entries]);

  const maxActual = entries.reduce((m, e) => Math.max(m, e.actual_user_count), 0);
  const yMax = Math.max(1000, Math.ceil(maxActual / 100) * 100);

  const chartConfig: ChartConfig = {
    projected: { label: "Projected", color: "hsl(var(--muted-foreground))" },
    actual: { label: "Actual", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Growth toward 1,000 users by Jan 1, 2027</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground mb-4">
              No actual data yet — add your first entry.
            </p>
          )}
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
                dataKey="projected"
                name="Projected"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="6 4"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add entry</CardTitle>
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
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Projected</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...entries].reverse().map((e) => {
                  const proj = projectedAt(parseISO(e.date));
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
