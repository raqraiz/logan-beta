import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, startOfDay, subDays } from "date-fns";
import { History, ChevronDown, ChevronUp, Pencil, Trash2, Check, X, Loader2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

interface Meal {
  id: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged_at: string;
}

interface DaySummary {
  dateKey: string;
  date: Date;
  cals: number;
  p: number;
  c: number;
  f: number;
  meals: Meal[];
}

const DAYS = 14;

export function NutritionHistoryDialog({ open, onOpenChange, userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DaySummary[]>([]);
  const [target, setTarget] = useState<{ cals: number | null; p: number | null; c: number | null; f: number | null }>({
    cals: null, p: null, c: null, f: null,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; calories: string; p: string; c: string; f: string }>({
    name: "", calories: "", p: "", c: "", f: "",
  });
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<{ name: string; calories: string; p: string; c: string; f: string }>({
    name: "", calories: "", p: "", c: "", f: "",
  });
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = startOfDay(subDays(new Date(), DAYS - 1)).toISOString();
      const [mealsRes, goalRes] = await Promise.all([
        supabase
          .from("meals")
          .select("id, name, calories, protein_g, carbs_g, fat_g, logged_at")
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
        buckets.set(key, { dateKey: key, date: d, cals: 0, p: 0, c: 0, f: 0, meals: [] });
      }
      ((mealsRes.data as Meal[]) ?? []).forEach((m) => {
        const key = format(startOfDay(new Date(m.logged_at)), "yyyy-MM-dd");
        const b = buckets.get(key);
        if (!b) return;
        b.cals += m.calories || 0;
        b.p += Number(m.protein_g || 0);
        b.c += Number(m.carbs_g || 0);
        b.f += Number(m.fat_g || 0);
        b.meals.push(m);
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
  }, [open, userId, refreshKey]);

  const todayKey = format(startOfDay(new Date()), "yyyy-MM-dd");
  const yesterdayKey = format(startOfDay(subDays(new Date(), 1)), "yyyy-MM-dd");

  function startEdit(m: Meal) {
    setEditingId(m.id);
    setDraft({
      name: m.name ?? "",
      calories: String(m.calories ?? 0),
      p: String(m.protein_g ?? 0),
      c: String(m.carbs_g ?? 0),
      f: String(m.fat_g ?? 0),
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    const { error } = await supabase
      .from("meals")
      .update({
        name: draft.name.trim() || "Meal",
        calories: Math.max(0, Math.round(Number(draft.calories) || 0)),
        protein_g: Math.max(0, Number(draft.p) || 0),
        carbs_g: Math.max(0, Number(draft.c) || 0),
        fat_g: Math.max(0, Number(draft.f) || 0),
      })
      .eq("id", id)
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    setEditingId(null);
    setRefreshKey((k) => k + 1);
  }

  async function deleteMeal(id: string) {
    const { error } = await supabase.from("meals").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  function startAdd(dayKey: string) {
    setAddingDay(dayKey);
    setNewDraft({ name: "", calories: "", p: "", c: "", f: "" });
    setEditingId(null);
  }

  async function saveNewMeal(dayKey: string) {
    const d = new Date(`${dayKey}T12:00:00`);
    setSaving(true);
    const { error } = await supabase.from("meals").insert({
      user_id: userId,
      name: newDraft.name.trim() || "Meal",
      calories: Math.max(0, Math.round(Number(newDraft.calories) || 0)),
      protein_g: Math.max(0, Number(newDraft.p) || 0),
      carbs_g: Math.max(0, Number(newDraft.c) || 0),
      fat_g: Math.max(0, Number(newDraft.f) || 0),
      source: "text",
      logged_at: d.toISOString(),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't add meal", description: error.message, variant: "destructive" });
      return;
    }
    setAddingDay(null);
    setRefreshKey((k) => k + 1);
  }

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
              const empty = d.meals.length === 0;
              const isOpen = expanded === d.dateKey;
              return (
                <div
                  key={d.dateKey}
                  className={`rounded-xl border border-border/40 bg-card/60 px-3 py-2.5 ${empty ? "opacity-60" : ""}`}
                >
                  <button
                    type="button"
                    disabled={empty}
                    onClick={() => setExpanded(isOpen ? null : d.dateKey)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-3">
                      <CalorieRing cals={d.cals} target={target.cals} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-medium">{label}</span>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                            {empty ? "No meals" : `${d.meals.length} meal${d.meals.length > 1 ? "s" : ""}`}
                            {!empty && (isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </span>
                        </div>
                        <Row label="P" value={d.p} target={target.p} color="bg-rose-500" />
                        <Row label="C" value={d.c} target={target.c} color="bg-amber-500" />
                        <Row label="F" value={d.f} target={target.f} color="bg-sky-500" />
                      </div>
                    </div>
                  </button>

                  {isOpen && !empty && (
                    <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                      {d.meals.map((m) => (
                        <div key={m.id} className="rounded-lg bg-background/40 px-2.5 py-2">
                          {editingId === m.id ? (
                            <div className="space-y-1.5">
                              <Input
                                value={draft.name}
                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                placeholder="Meal name"
                                className="h-7 text-[12px]"
                              />
                              <div className="grid grid-cols-4 gap-1.5">
                                <NumField label="kcal" v={draft.calories} on={(v) => setDraft({ ...draft, calories: v })} />
                                <NumField label="P" v={draft.p} on={(v) => setDraft({ ...draft, p: v })} />
                                <NumField label="C" v={draft.c} on={(v) => setDraft({ ...draft, c: v })} />
                                <NumField label="F" v={draft.f} on={(v) => setDraft({ ...draft, f: v })} />
                              </div>
                              <div className="flex items-center justify-end gap-1 pt-0.5">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)} disabled={saving}>
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" className="h-7 px-2" onClick={() => saveEdit(m.id)} disabled={saving}>
                                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-medium truncate">{m.name || "Meal"}</div>
                                <div className="text-[10px] text-muted-foreground tabular-nums">
                                  {Math.round(m.calories)} kcal · P {Math.round(m.protein_g)}g · C {Math.round(m.carbs_g)}g · F {Math.round(m.fat_g)}g
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(m)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteMeal(m.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
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

function CalorieRing({ cals, target }: { cals: number; target: number | null }) {
  const radius = 20, stroke = 4, circ = 2 * Math.PI * radius;
  const pct = target ? Math.min(100, (cals / target) * 100) : 0;
  const dash = (pct / 100) * circ;
  return (
    <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
      <svg width="52" height="52" className="-rotate-90">
        <circle cx="26" cy="26" r={radius} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
        <circle
          cx="26" cy="26" r={radius}
          stroke="hsl(var(--primary))" strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-bold tabular-nums leading-none">{Math.round(cals)}</span>
        <span className="text-[7px] text-muted-foreground leading-tight">kcal</span>
      </div>
    </div>
  );
}

function Row({ label, value, target, color }: { label: string; value: number; target: number | null; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-4">{label}</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-14 text-right">
        {Math.round(value)}{target ? `/${target}` : ""}g
      </span>
    </div>
  );
}

function NumField({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        value={v}
        onChange={(e) => on(e.target.value)}
        className="h-7 text-[12px] px-2"
      />
    </label>
  );
}
