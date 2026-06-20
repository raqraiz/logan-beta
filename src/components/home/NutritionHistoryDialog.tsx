import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, startOfDay, subDays } from "date-fns";
import { History } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

interface DaySummary {
  dateKey: string;
  date: Date;
  cals: number;
  p: number;
  c: number;
  f: number;
  count: number;
}

const DAYS = 14;

export function NutritionHistoryDialog({ open, onOpenChange, userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DaySummary[]>([]);
  const [target, setTarget] = useState<{ cals: number | null; p: number | null; c: number | null; f: number | null }>({
    cals: null, p: null, c: null, f: null,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = startOfDay(subDays(new Date(), DAYS - 1)).toISOString();
      const [mealsRes, goalRes] = await Promise.all([
        supabase
          .from("meals")
          .select("calories, protein_g, carbs_g, fat_g, logged_at")
          .eq("user_id", userId)
          .gte("logged_at", since)
          .order("logged_at", { ascending: false }),
        supabase
          .from("nutrition_goals")
          .select("calorie_target, protein_target_g, carbs_target_g, fat_target_g")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const buckets = new Map<string, DaySummary>();
      for (let i = 0; i < DAYS; i++) {
        const d = startOfDay(subDays(new Date(), i));
        const key = format(d, "yyyy-MM-dd");
        buckets.set(key, { dateKey: key, date: d, cals: 0, p: 0, c: 0, f: 0, count: 0 });
      }
      (mealsRes.data ?? []).forEach((m: any) => {
        const key = format(startOfDay(new Date(m.logged_at)), "yyyy-MM-dd");
        const b = buckets.get(key);
        if (!b) return;
        b.cals += m.calories || 0;
        b.p += Number(m.protein_g || 0);
        b.c += Number(m.carbs_g || 0);
        b.f += Number(m.fat_g || 0);
        b.count += 1;
      });
      setDays(Array.from(buckets.values()).sort((a, b) => b.date.getTime() - a.date.getTime()));
      setTarget({
        cals: goalRes.data?.calorie_target ?? null,
        p: goalRes.data?.protein_target_g ?? null,
        c: goalRes.data?.carbs_target_g ?? null,
        f: goalRes.data?.fat_target_g ?? null,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  const todayKey = format(startOfDay(new Date()), "yyyy-MM-dd");
  const yesterdayKey = format(startOfDay(subDays(new Date(), 1)), "yyyy-MM-dd");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-orange-400" />
            Nutrition History
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-2">
            {days.map((d) => {
              const label =
                d.dateKey === todayKey ? "Today"
                : d.dateKey === yesterdayKey ? "Yesterday"
                : format(d.date, "EEE, MMM d");
              const calPct = target.cals ? Math.min(100, Math.round((d.cals / target.cals) * 100)) : 0;
              const empty = d.count === 0;
              return (
                <div
                  key={d.dateKey}
                  className={`rounded-xl border border-border/40 bg-card/60 px-3 py-2.5 ${empty ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-medium">{label}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {empty ? "No meals" : `${d.count} meal${d.count > 1 ? "s" : ""}`}
                    </span>
                  </div>

                  {!empty && (
                    <>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] text-muted-foreground w-12">kcal</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-orange-500"
                            style={{ width: `${calPct}%` }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground w-16 text-right">
                          {Math.round(d.cals)}{target.cals ? `/${target.cals}` : ""}
                        </span>
                      </div>
                      <Row label="P" value={d.p} target={target.p} color="bg-rose-500" />
                      <Row label="C" value={d.c} target={target.c} color="bg-amber-500" />
                      <Row label="F" value={d.f} target={target.f} color="bg-sky-500" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, target, color }: { label: string; value: number; target: number | null; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-12">{label}</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-16 text-right">
        {Math.round(value)}{target ? `/${target}` : ""}g
      </span>
    </div>
  );
}
