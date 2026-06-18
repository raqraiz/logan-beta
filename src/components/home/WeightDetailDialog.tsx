import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { kgToLbs, lbsToKg } from "@/lib/nutrition";

interface WeightLog {
  id: string;
  weight_kg: number;
  logged_on: string;
  note: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onDataChanged?: () => void;
}

const UNIT_KEY = "logan_weight_unit";

export function WeightDetailDialog({ open, onOpenChange, userId, onDataChanged }: Props) {
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [goalKg, setGoalKg] = useState<number | null>(null);
  const [unit, setUnit] = useState<"kg" | "lbs">((typeof localStorage !== "undefined" && (localStorage.getItem(UNIT_KEY) as "kg" | "lbs")) || "lbs");
  const [value, setValue] = useState<string>("");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: l }, { data: g }] = await Promise.all([
      supabase.from("weight_logs").select("*").eq("user_id", userId).order("logged_on", { ascending: false }).limit(120),
      supabase.from("nutrition_goals").select("weight_goal_kg").eq("user_id", userId).maybeSingle(),
    ]);
    setLogs((l as WeightLog[]) ?? []);
    setGoalKg(g?.weight_goal_kg ? Number(g.weight_goal_kg) : null);
  }, [userId]);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => { localStorage.setItem(UNIT_KEY, unit); }, [unit]);

  const display = (kg: number) => unit === "kg" ? kg : kgToLbs(kg);
  const fromInput = (v: number) => unit === "kg" ? v : lbsToKg(v);

  async function save() {
    const num = Number(value);
    if (!num || num <= 0) { toast({ title: "Enter a weight" }); return; }
    setSaving(true);
    const kg = fromInput(num);
    const { error } = await supabase.from("weight_logs").upsert({
      user_id: userId, weight_kg: kg, logged_on: date,
    }, { onConflict: "user_id,logged_on" });
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setValue("");
    await load();
    onDataChanged?.();
    toast({ title: "Logged" });
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    await supabase.from("weight_logs").delete().eq("id", id);
    await load();
    onDataChanged?.();
  }

  const chartData = [...logs]
    .sort((a, b) => a.logged_on.localeCompare(b.logged_on))
    .map(l => ({ date: format(parseISO(l.logged_on), "MMM d"), value: Number(display(Number(l.weight_kg)).toFixed(1)) }));

  const latest = logs[0];
  const start = logs[logs.length - 1];
  const delta = latest && start ? Number(latest.weight_kg) - Number(start.weight_kg) : 0;
  const goalDelta = latest && goalKg ? Number(latest.weight_kg) - goalKg : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Weight</DialogTitle>
          <DialogDescription>Log a weight and watch the trend.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-3">
          <div className="space-y-4">
            <div className="rounded-xl bg-card border border-border/40 p-3">
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {latest ? display(Number(latest.weight_kg)).toFixed(1) : "—"}
                    <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {latest ? `as of ${format(parseISO(latest.logged_on), "MMM d")}` : "No data yet"}
                  </p>
                </div>
                <div className="text-right text-xs">
                  {logs.length > 1 && (
                    <p className={delta < 0 ? "text-emerald-500" : delta > 0 ? "text-amber-500" : "text-muted-foreground"}>
                      {delta > 0 ? "+" : ""}{display(delta).toFixed(1)} {unit} since start
                    </p>
                  )}
                  {goalKg && goalDelta != null && (
                    <p className="text-muted-foreground">
                      {Math.abs(display(goalDelta)).toFixed(1)} {unit} {goalDelta > 0 ? "above" : goalDelta < 0 ? "below" : "at"} goal
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 items-end">
              <label className="flex-1 space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Weight ({unit})</span>
                <Input type="number" step="0.1" placeholder="0.0" value={value} onChange={(e) => setValue(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Date</span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} />
              </label>
              <Button onClick={save} disabled={saving}>{saving ? "…" : "Log"}</Button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Units:</span>
              <button onClick={() => setUnit("lbs")} className={`px-2 py-0.5 rounded ${unit === "lbs" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>lbs</button>
              <button onClick={() => setUnit("kg")} className={`px-2 py-0.5 rounded ${unit === "kg" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>kg</button>
            </div>

            {chartData.length >= 2 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Trend</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                      {goalKg && (
                        <ReferenceLine y={Number(display(goalKg).toFixed(1))} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "Goal", fontSize: 10, fill: "hsl(var(--primary))" }} />
                      )}
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">History</p>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No entries yet.</p>
              ) : logs.map(l => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div>
                    <p className="text-sm font-medium tabular-nums">{display(Number(l.weight_kg)).toFixed(1)} {unit}</p>
                    <p className="text-[11px] text-muted-foreground">{format(parseISO(l.logged_on), "EEE, MMM d, yyyy")}</p>
                  </div>
                  <button onClick={() => remove(l.id)} className="text-muted-foreground hover:text-rose-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
