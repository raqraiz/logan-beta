import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import type { WidgetConfig } from "@/hooks/useWidgetPreferences";
import { weightTrendLine } from "@/lib/weightPrefs";
import { toast } from "sonner";

interface Props { userId: string; widgets: WidgetConfig[]; onSave: (next: WidgetConfig[]) => Promise<void> | void; onClose: () => void }

export function WeightSettingsPage({ userId, widgets, onSave, onClose }: Props) {
  const current = widgets.find((w) => w.id === "weight_trend");
  const [on, setOn] = useState(!!current?.visible);
  const [exact, setExact] = useState(!!current?.showExact);
  const [doctor, setDoctor] = useState(!!current?.inDoctorSummary);
  const [remind, setRemind] = useState(!!current?.remind);
  const [points, setPoints] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase.from("weight_logs").select("weight_kg, logged_on").eq("user_id", userId).order("logged_on", { ascending: false }).limit(60)
      .then(({ data }) => setPoints((data ?? []).map((r) => Number(r.weight_kg)).reverse()));
  }, [userId]);
  const done = async () => {
    setBusy(true);
    const patch = { visible: on, showExact: exact, inDoctorSummary: doctor, remind };
    const next = widgets.some((w) => w.id === "weight_trend") ? widgets.map((w) => w.id === "weight_trend" ? { ...w, ...patch } : w) : [...widgets, { id: "weight_trend", type: "built-in" as const, ...patch }];
    try { await onSave(next); onClose(); } catch { toast.error("That didn't save. Try again."); } finally { setBusy(false); }
  };
  const row = (label: string, checked: boolean, set: (v: boolean) => void) => <label className="flex items-center justify-between border-b border-border px-5 py-4 last:border-0"><span className="text-sm text-foreground">{label}</span><Switch checked={checked} onCheckedChange={set} aria-label={label} /></label>;
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label="Track weight">
    <div className="mx-auto max-w-lg px-5 pt-5 pb-[calc(120px+env(safe-area-inset-bottom))]">
      <Button variant="outline" size="icon" className="h-11 w-11 rounded-full shadow-none" aria-label="Back" onClick={onClose}><ArrowLeft /></Button>
      <h1 className="mt-6 font-display text-[40px] font-semibold leading-[1.1] text-foreground">Track weight?</h1>
      <p className="mt-2 text-base font-light text-muted-foreground">Only if it helps you. It stays off unless you turn it on.</p>
      <div className="mt-6 overflow-hidden rounded-[22px] bg-card">{row("Track weight", on, setOn)}</div>
      {on && <>
        <h2 className="mb-3 mt-6 text-[13px] font-semibold text-muted-foreground">Your trend</h2>
        <div className="rounded-[22px] bg-card p-5">
          {points.length >= 2 && <div className="h-24"><ResponsiveContainer width="100%" height="100%"><LineChart data={points.map((v) => ({ v }))}><YAxis hide domain={["dataMin - 1", "dataMax + 1"]} /><Line type="basis" dataKey="v" stroke="hsl(var(--primary))" strokeOpacity={0.7} strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>}
          <p className="mt-3 text-sm text-foreground">{weightTrendLine(points)}</p>
        </div>
        <h2 className="mb-3 mt-6 text-[13px] font-semibold text-muted-foreground">Show me</h2>
        <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Show me">
          {([[false, "The trend only"], [true, "Exact numbers"]] as const).map(([v, label]) => <Button key={label} variant="ghost" role="radio" aria-checked={exact === v} className={`rounded-full font-semibold ${exact === v ? "bg-foreground text-background hover:bg-foreground hover:text-background" : "text-foreground"}`} onClick={() => setExact(v)}>{label}</Button>)}
        </div>
        {/* "Include in doctor summary" and "Remind me to weigh in" stay hidden until those features exist. */}
      </>}
      <Button className="mt-8 h-12 w-full rounded-full bg-foreground text-background hover:bg-foreground/90" disabled={busy} onClick={done}>Done</Button>
    </div>
  </div>;
}
