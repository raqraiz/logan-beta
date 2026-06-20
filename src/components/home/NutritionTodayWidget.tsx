import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Apple, ChevronRight, Plus, History } from "lucide-react";
import { startOfDay } from "date-fns";
import { NutritionDetailDialog } from "./NutritionDetailDialog";
import { NutritionHistoryDialog } from "./NutritionHistoryDialog";


const COLORS = {
  border: "border-l-orange-500",
  bgGradient: "from-orange-500/10 via-orange-500/5 to-transparent",
  iconBg: "bg-orange-500/15",
  iconColor: "text-orange-400",
  labelColor: "text-orange-400/80",
};

interface Props { userId: string }

export function NutritionTodayWidget({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ cals: 0, p: 0, c: 0, f: 0, count: 0 });
  const [target, setTarget] = useState<{ cals: number | null; p: number | null; c: number | null; f: number | null }>({ cals: null, p: null, c: null, f: null });
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const todayStart = startOfDay(new Date()).toISOString();
    const [mealsRes, goalRes] = await Promise.all([
      supabase.from("meals").select("calories, protein_g, carbs_g, fat_g").eq("user_id", userId).gte("logged_at", todayStart),
      supabase.from("nutrition_goals").select("calorie_target, protein_target_g, carbs_target_g, fat_target_g").eq("user_id", userId).maybeSingle(),
    ]);
    const ms = mealsRes.data ?? [];
    setTotals({
      cals: ms.reduce((a, m) => a + (m.calories || 0), 0),
      p: ms.reduce((a, m) => a + Number(m.protein_g || 0), 0),
      c: ms.reduce((a, m) => a + Number(m.carbs_g || 0), 0),
      f: ms.reduce((a, m) => a + Number(m.fat_g || 0), 0),
      count: ms.length,
    });
    setTarget({
      cals: goalRes.data?.calorie_target ?? null,
      p: goalRes.data?.protein_target_g ?? null,
      c: goalRes.data?.carbs_target_g ?? null,
      f: goalRes.data?.fat_target_g ?? null,
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return null;

  const pct = target.cals ? Math.min(100, Math.round((totals.cals / target.cals) * 100)) : 0;
  const left = target.cals ? Math.max(0, target.cals - totals.cals) : null;
  const radius = 32, stroke = 6, circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;

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
                <Apple className={`w-4 h-4 ${COLORS.iconColor}`} />
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-widest ${COLORS.labelColor}`}>
                Nutrition Today
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
          </div>

          <div className="flex items-center gap-4">
            {/* Calorie ring */}
            <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
              <svg width="80" height="80" className="-rotate-90">
                <circle cx="40" cy="40" r={radius} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
                <circle
                  cx="40" cy="40" r={radius}
                  stroke="hsl(var(--primary))" strokeWidth={stroke} fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circ}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-bold tabular-nums leading-none">{totals.cals}</span>
                <span className="text-[9px] text-muted-foreground leading-tight">kcal</span>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-foreground/85 mb-2">
                {target.cals
                  ? totals.cals >= target.cals
                    ? <>Target hit <span className="text-muted-foreground">({totals.cals - target.cals > 0 ? `+${totals.cals - target.cals}` : "0"} kcal)</span></>
                    : <><span className="font-semibold tabular-nums">{left}</span> kcal left today</>
                  : totals.count > 0 ? `${totals.count} meal${totals.count > 1 ? "s" : ""} logged` : "Tap to set a target & log meals"}
              </p>
              <div className="space-y-1">
                <MiniBar label="Protein" value={totals.p} target={target.p} color="bg-rose-500" />
                <MiniBar label="Carbs" value={totals.c} target={target.c} color="bg-amber-500" />
                <MiniBar label="Fat" value={totals.f} target={target.f} color="bg-sky-500" />
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-primary">
            <Plus className="w-3 h-3" /> Log a meal
          </div>
        </div>
      </button>

      <NutritionDetailDialog
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        onDataChanged={() => setRefreshKey(k => k + 1)}
      />
    </>
  );
}

function MiniBar({ label, value, target, color }: { label: string; value: number; target: number | null; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-12">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-12 text-right">
        {Math.round(value)}{target ? `/${target}` : ""}g
      </span>
    </div>
  );
}
