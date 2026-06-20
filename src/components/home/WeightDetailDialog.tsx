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
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea, ScatterChart, Scatter } from "recharts";
import { kgToLbs, lbsToKg } from "@/lib/nutrition";
import { getPhaseForDate, PHASES, type Phase } from "@/lib/cycleCorrelation";

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
  unit?: "kg" | "lbs";
  onUnitChange?: (u: "kg" | "lbs") => void;
}

const UNIT_KEY = "logan_weight_unit";

export function WeightDetailDialog({ open, onOpenChange, userId, onDataChanged, unit: propUnit, onUnitChange }: Props) {
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [goalKg, setGoalKg] = useState<number | null>(null);
  const [lastPeriodStart, setLastPeriodStart] = useState<string | null>(null);
  const [cycleLengthDays, setCycleLengthDays] = useState<number | null>(null);
  const [view, setView] = useState<"trend" | "phase" | "cycleDay">("trend");
  const [localUnit, setLocalUnit] = useState<"kg" | "lbs">((typeof localStorage !== "undefined" && (localStorage.getItem(UNIT_KEY) as "kg" | "lbs")) || "lbs");
  const unit = propUnit ?? localUnit;
  const setUnit = onUnitChange ?? setLocalUnit;
  const [value, setValue] = useState<string>("");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const lRes = await supabase.from("weight_logs").select("*").eq("user_id", userId).order("logged_on", { ascending: false }).limit(120);
    const gRes: any = await supabase.from("nutrition_goals").select("weight_goal_kg").eq("user_id", userId).maybeSingle();
    const { data: authData } = await supabase.auth.getUser();
    const email = authData?.user?.email;
    const pRes: any = email
      ? await (supabase.from("participants") as any).select("last_period_start, cycle_length_days").eq("email", email).maybeSingle()
      : { data: null };
    setLogs((lRes.data as WeightLog[]) ?? []);
    setGoalKg(gRes.data?.weight_goal_kg ? Number(gRes.data.weight_goal_kg) : null);
    setLastPeriodStart(pRes.data?.last_period_start ?? null);
    setCycleLengthDays(pRes.data?.cycle_length_days ?? null);
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

  const sortedAsc = [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  const chartData = sortedAsc.map(l => ({
    date: format(parseISO(l.logged_on), "MMM d"),
    value: Number(display(Number(l.weight_kg)).toFixed(1)),
    phase: lastPeriodStart && cycleLengthDays
      ? getPhaseForDate(parseISO(l.logged_on), lastPeriodStart, cycleLengthDays)
      : null,
  }));


  const hasCycle = !!(lastPeriodStart && cycleLengthDays && cycleLengthDays > 0);

  const PHASE_COLORS: Record<Phase, string> = {
    Menstruation: "#E11D48",
    Follicular: "#F59E0B",
    Ovulation: "#15B88C",
    Luteal: "#8B5CF6",
  };

  // Per-log phase + cycle day
  const logsWithCycle = hasCycle
    ? sortedAsc.map(l => {
        const d = parseISO(l.logged_on);
        const phase = getPhaseForDate(d, lastPeriodStart!, cycleLengthDays!);
        const msPerDay = 24 * 60 * 60 * 1000;
        const diff = Math.floor((d.getTime() - new Date(lastPeriodStart!).getTime()) / msPerDay);
        const cycleDay = ((diff % cycleLengthDays!) + cycleLengthDays!) % cycleLengthDays! + 1;
        return { ...l, phase, cycleDay, value: Number(display(Number(l.weight_kg)).toFixed(1)) };
      })
    : [];

  const phaseAverages = hasCycle
    ? PHASES.map(p => {
        const items = logsWithCycle.filter(l => l.phase === p);
        const avg = items.length ? items.reduce((s, x) => s + x.value, 0) / items.length : 0;
        return { phase: p, avg: Number(avg.toFixed(1)), count: items.length };
      })
    : [];

  const cycleDayPoints = logsWithCycle.map(l => ({ cycleDay: l.cycleDay, value: l.value, phase: l.phase }));

  const phaseWithData = phaseAverages.filter(p => p.count > 0);
  const phaseSpread = phaseWithData.length >= 2
    ? Math.max(...phaseWithData.map(p => p.avg)) - Math.min(...phaseWithData.map(p => p.avg))
    : 0;
  const peakPhase = phaseWithData.length ? [...phaseWithData].sort((a, b) => b.avg - a.avg)[0] : null;
  const lowPhase = phaseWithData.length ? [...phaseWithData].sort((a, b) => a.avg - b.avg)[0] : null;

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
                <div className="flex items-center justify-between mb-2 gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {view === "trend" ? "Trend" : view === "phase" ? "By cycle phase" : "By cycle day"}
                  </p>
                  {hasCycle && (
                    <div className="flex items-center gap-1 text-[10px]">
                      <button onClick={() => setView("trend")} className={`px-2 py-0.5 rounded ${view === "trend" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Date</button>
                      <button onClick={() => setView("phase")} className={`px-2 py-0.5 rounded ${view === "phase" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Phase</button>
                      <button onClick={() => setView("cycleDay")} className={`px-2 py-0.5 rounded ${view === "cycleDay" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Cycle day</button>
                    </div>
                  )}
                </div>

                {view === "trend" && (
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
                )}

                {view === "phase" && hasCycle && (() => {
                  const ovDay = cycleLengthDays! - 14;
                  const phaseRanges: Record<Phase, string> = {
                    Menstruation: "Days 1–5",
                    Follicular: `Days 6–${ovDay - 2}`,
                    Ovulation: `Days ${ovDay - 1}–${ovDay + 1}`,
                    Luteal: `Days ${ovDay + 2}–${cycleLengthDays}`,
                  };
                  const overallAvg = logsWithCycle.length
                    ? logsWithCycle.reduce((s, x) => s + x.value, 0) / logsWithCycle.length
                    : 0;
                  return (
                    <>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Your average weight in each phase of your cycle. Compared to your overall average of <span className="font-medium text-foreground">{overallAvg.toFixed(1)} {unit}</span>.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {phaseAverages.map(p => {
                          const delta = p.count ? p.avg - overallAvg : 0;
                          const deltaStr = delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${unit}`;
                          const deltaColor = !p.count ? "text-muted-foreground" : Math.abs(delta) < 0.2 ? "text-muted-foreground" : delta > 0 ? "text-amber-500" : "text-emerald-500";
                          return (
                            <div key={p.phase} className="rounded-xl border border-border/40 p-3 bg-card/60">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PHASE_COLORS[p.phase] }} />
                                <span className="text-[11px] font-medium">{p.phase}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mb-1">{phaseRanges[p.phase]}</p>
                              {p.count ? (
                                <>
                                  <p className="text-lg font-bold tabular-nums leading-none">{p.avg.toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground ml-1">{unit}</span></p>
                                  <p className={`text-[10px] mt-0.5 ${deltaColor}`}>{deltaStr} vs avg</p>
                                  <p className="text-[10px] text-muted-foreground">{p.count} log{p.count === 1 ? "" : "s"}</p>
                                </>
                              ) : (
                                <p className="text-[11px] text-muted-foreground italic mt-1">No logs yet</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {peakPhase && lowPhase && peakPhase.phase !== lowPhase.phase && phaseSpread > 0.2 ? (
                        <p className="text-[11px] text-muted-foreground mt-3">
                          You weigh about <span className="font-medium text-foreground">{phaseSpread.toFixed(1)} {unit}</span> more on average in <span className="font-medium" style={{ color: PHASE_COLORS[peakPhase.phase] }}>{peakPhase.phase}</span> than in <span className="font-medium" style={{ color: PHASE_COLORS[lowPhase.phase] }}>{lowPhase.phase}</span> — common, mostly water retention.
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-3">
                          Weight stays pretty steady across your cycle so far. Keep logging to see patterns emerge.
                        </p>
                      )}
                    </>
                  );
                })()}

                {view === "cycleDay" && hasCycle && (() => {
                  const ovDay = cycleLengthDays! - 14;
                  const bands: { phase: Phase; x1: number; x2: number }[] = [
                    { phase: "Menstruation", x1: 1, x2: 5 },
                    { phase: "Follicular", x1: 5, x2: ovDay - 1 },
                    { phase: "Ovulation", x1: ovDay - 1, x2: ovDay + 1 },
                    { phase: "Luteal", x1: ovDay + 1, x2: cycleLengthDays! },
                  ];
                  const points = logsWithCycle.map(l => ({
                    cycleDay: l.cycleDay,
                    value: l.value,
                    phase: l.phase,
                    date: format(parseISO(l.logged_on), "MMM d"),
                  }));
                  return (
                    <>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Each dot is one weigh-in, placed on the day of your cycle. Day 1 is the first day of your period. Background colors show each phase.
                      </p>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 8, right: 8, bottom: 18, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                            <XAxis type="number" dataKey="cycleDay" name="Cycle day" domain={[1, cycleLengthDays!]} ticks={[1, 5, ovDay, cycleLengthDays!]} tick={{ fontSize: 10 }} label={{ value: "Day of cycle", fontSize: 10, position: "insideBottom", offset: -8 }} />
                            <YAxis type="number" dataKey="value" name={unit} domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 10 }} width={32} />
                            {bands.map(b => (
                              <ReferenceArea key={b.phase} x1={b.x1} x2={b.x2} fill={PHASE_COLORS[b.phase]} fillOpacity={0.08} stroke="none" />
                            ))}
                            <ReferenceLine x={ovDay} stroke={PHASE_COLORS.Ovulation} strokeDasharray="2 3" label={{ value: "ovulation", fontSize: 9, fill: PHASE_COLORS.Ovulation, position: "top" }} />
                            <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const d: any = payload[0].payload;
                                return (
                                  <div className="rounded-md bg-background border border-border/60 px-2 py-1.5 text-[11px]">
                                    <p className="font-medium">{d.value} {unit}</p>
                                    <p className="text-muted-foreground">Day {d.cycleDay} · <span style={{ color: PHASE_COLORS[d.phase as Phase] }}>{d.phase}</span></p>
                                    <p className="text-muted-foreground">{d.date}</p>
                                  </div>
                                );
                              }} />
                            {PHASES.map((p) => (
                              <Scatter key={p} name={p} data={points.filter(c => c.phase === p)} fill={PHASE_COLORS[p]} />
                            ))}
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px]">
                        {PHASES.map(p => (
                          <span key={p} className="flex items-center gap-1 text-muted-foreground">
                            <span className="w-2 h-2 rounded-full" style={{ background: PHASE_COLORS[p] }} />
                            {p}
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
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
