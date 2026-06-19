import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Camera, Type, Trash2, Sparkles, X, CalendarDays } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, startOfDay, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, ReferenceLine,
} from "recharts";
import { calcNutritionTargets, type ActivityLevel, type GoalDirection } from "@/lib/nutrition";

interface Meal {
  id: string;
  name: string;
  description: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  image_path: string | null;
  source: string;
  ai_confidence: string | null;
  logged_at: string;
}

interface Goal {
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  height_cm: number | null;
  age: number | null;
  activity_level: ActivityLevel | null;
  weight_goal_kg: number | null;
  weight_goal_direction: GoalDirection | null;
  auto_calculated: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onDataChanged?: () => void;
}

export function NutritionDetailDialog({ open, onOpenChange, userId, onDataChanged }: Props) {
  const [tab, setTab] = useState<"log" | "today" | "trends" | "goals">("log");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [historyMeals, setHistoryMeals] = useState<Meal[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);

  // log state
  const [mode, setMode] = useState<"photo" | "text">("photo");
  const [description, setDescription] = useState("");
  const [portionNote, setPortionNote] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [pending, setPending] = useState<null | {
    name: string; description: string;
    calories: number; protein_g: number; carbs_g: number; fat_g: number;
    confidence: string;
  }>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logDate, setLogDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const loadAll = useCallback(async () => {
    setLoading(true);
    const since = startOfDay(subDays(new Date(), 30)).toISOString();
    const todayStart = startOfDay(new Date()).toISOString();
    const [todayRes, historyRes, goalRes] = await Promise.all([
      supabase.from("meals").select("*").eq("user_id", userId).gte("logged_at", todayStart).order("logged_at", { ascending: false }),
      supabase.from("meals").select("*").eq("user_id", userId).gte("logged_at", since).order("logged_at", { ascending: false }),
      supabase.from("nutrition_goals").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    setMeals((todayRes.data as Meal[]) ?? []);
    setHistoryMeals((historyRes.data as Meal[]) ?? []);
    setGoal(goalRes.data as Goal | null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { if (open) loadAll(); }, [open, loadAll]);

  function resetLogForm() {
    setDescription(""); setPortionNote(""); setPhotoPreview(null); setPhotoFile(null); setPending(null);
    setLogDate(format(new Date(), "yyyy-MM-dd"));
  }

  function pickPhoto(file: File) {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function analyze() {
    if (!photoFile && !description.trim()) {
      toast({ title: "Add a photo or description first" });
      return;
    }
    setAnalyzing(true); setPending(null);
    try {
      const payload: any = { description: description.trim() || undefined, portionNote: portionNote.trim() || undefined };
      if (photoFile) {
        payload.imageBase64 = await fileToBase64(photoFile);
        payload.imageMimeType = photoFile.type;
      }
      const { data, error } = await supabase.functions.invoke("analyze-meal", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPending(data);
    } catch (e: any) {
      toast({ title: "Couldn't analyze", description: e.message || String(e), variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveMeal() {
    if (!pending) return;
    setAnalyzing(true);
    try {
      let imagePath: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("meal-photos").upload(path, photoFile, {
          contentType: photoFile.type, upsert: false,
        });
        if (upErr) throw upErr;
        imagePath = path;
      }
      const today = format(new Date(), "yyyy-MM-dd");
      let loggedAt: string | undefined;
      if (logDate !== today) {
        // Backdated: log at noon local time on chosen date
        const d = new Date(`${logDate}T12:00:00`);
        loggedAt = d.toISOString();
      }
      const { error } = await supabase.from("meals").insert({
        user_id: userId,
        name: pending.name,
        description: pending.description,
        calories: pending.calories,
        protein_g: pending.protein_g,
        carbs_g: pending.carbs_g,
        fat_g: pending.fat_g,
        image_path: imagePath,
        source: photoFile ? "photo" : "text",
        ai_confidence: pending.confidence,
        ...(loggedAt ? { logged_at: loggedAt } : {}),
      });
      if (error) throw error;
      toast({ title: "Logged", description: `${pending.name} · ${pending.calories} kcal${logDate !== today ? ` · ${format(new Date(`${logDate}T12:00:00`), "MMM d")}` : ""}` });
      resetLogForm();
      setTab("today");
      await loadAll();
      onDataChanged?.();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  async function deleteMeal(m: Meal) {
    if (!confirm(`Delete "${m.name}"?`)) return;
    await supabase.from("meals").delete().eq("id", m.id);
    if (m.image_path) await supabase.storage.from("meal-photos").remove([m.image_path]);
    await loadAll();
    onDataChanged?.();
  }

  const todayTotals = meals.reduce((a, m) => ({
    cals: a.cals + m.calories, p: a.p + Number(m.protein_g), c: a.c + Number(m.carbs_g), f: a.f + Number(m.fat_g),
  }), { cals: 0, p: 0, c: 0, f: 0 });

  // 14-day calorie trend
  const trendData = (() => {
    const days: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "MMM d");
      days[d] = 0;
    }
    for (const m of historyMeals) {
      const d = format(new Date(m.logged_at), "MMM d");
      if (d in days) days[d] += m.calories;
    }
    return Object.entries(days).map(([day, calories]) => ({ day, calories }));
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Nutrition</DialogTitle>
          <DialogDescription>Log meals, track macros, hit your daily target.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-4 w-full shrink-0">
            <TabsTrigger value="log">Log</TabsTrigger>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-3 -mr-3 pr-3 overflow-y-auto">
            <TabsContent value="log" className="space-y-3 mt-0">
              <div className="flex gap-2">
                <Button variant={mode === "photo" ? "default" : "outline"} size="sm" onClick={() => setMode("photo")} className="flex-1 gap-1">
                  <Camera className="w-4 h-4" /> Photo
                </Button>
                <Button variant={mode === "text" ? "default" : "outline"} size="sm" onClick={() => setMode("text")} className="flex-1 gap-1">
                  <Type className="w-4 h-4" /> Text
                </Button>
              </div>

              {mode === "photo" && (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); }}
                  />
                  {photoPreview ? (
                    <div className="relative">
                      <img src={photoPreview} alt="Meal" className="w-full rounded-xl border border-border/40" />
                      <button
                        onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                        className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5"
                      ><X className="w-4 h-4 text-white" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full aspect-video rounded-xl border-2 border-dashed border-border/50 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 transition-colors"
                    >
                      <Camera className="w-8 h-8" />
                      <span className="text-sm">Take or upload a photo</span>
                    </button>
                  )}
                </div>
              )}

              <Textarea
                placeholder={mode === "photo" ? "Optional: anything not visible (sauce, oil, drink…)" : "What did you eat? E.g. 'Two scrambled eggs, slice of sourdough, avocado'"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
              <Input
                placeholder="Optional portion note (e.g. 'large bowl', '1.5 cups')"
                value={portionNote}
                onChange={(e) => setPortionNote(e.target.value)}
              />

              <label className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">When did you eat this?</span>
                <Input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                  className="w-auto h-8 text-sm"
                />
              </label>

              {!pending ? (
                <Button onClick={analyze} disabled={analyzing || (!photoFile && !description.trim())} className="w-full gap-2">
                  {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {analyzing ? "Analyzing…" : "Estimate calories & macros"}
                </Button>
              ) : (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{pending.name}</p>
                      <p className="text-xs text-muted-foreground">{pending.description}</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted">{pending.confidence}</span>
                  </div>
                  <EditableMacros pending={pending} onChange={setPending} />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPending(null)} className="flex-1">Redo</Button>
                    <Button size="sm" onClick={saveMeal} disabled={analyzing} className="flex-1">
                      {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save meal"}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="today" className="space-y-3 mt-0">
              <TodaySummary totals={todayTotals} goal={goal} />
              {meals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No meals logged today.</p>
              ) : meals.map((m) => (
                <MealRow key={m.id} meal={m} userId={userId} onDelete={() => deleteMeal(m)} />
              ))}
            </TabsContent>

            <TabsContent value="trends" className="space-y-4 mt-0">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">14-day calories</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={1} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                      {goal?.calorie_target && (
                        <ReferenceLine y={goal.calorie_target} stroke="hsl(var(--primary))" strokeDasharray="3 3" />
                      )}
                      <Bar dataKey="calories" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {historyMeals.length} meals logged in the last 30 days.
              </p>
            </TabsContent>

            <TabsContent value="goals" className="space-y-3 mt-0">
              <GoalsEditor userId={userId} goal={goal} onSaved={(g) => { setGoal(g); onDataChanged?.(); }} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function EditableMacros({ pending, onChange }: { pending: any; onChange: (p: any) => void }) {
  const fields: Array<["calories" | "protein_g" | "carbs_g" | "fat_g", string, string]> = [
    ["calories", "kcal", ""],
    ["protein_g", "Protein", "g"],
    ["carbs_g", "Carbs", "g"],
    ["fat_g", "Fat", "g"],
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {fields.map(([k, label, unit]) => (
        <label key={k} className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">{label}{unit && ` (${unit})`}</span>
          <input
            type="number"
            value={pending[k]}
            onChange={(e) => onChange({ ...pending, [k]: Number(e.target.value) || 0 })}
            className="bg-background border border-border/50 rounded px-1.5 py-1 text-sm w-full"
          />
        </label>
      ))}
    </div>
  );
}

function TodaySummary({ totals, goal }: { totals: { cals: number; p: number; c: number; f: number }; goal: Goal | null }) {
  const target = goal?.calorie_target ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((totals.cals / target) * 100)) : 0;
  return (
    <div className="rounded-xl bg-card border border-border/40 p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-2xl font-bold tabular-nums">{totals.cals}</p>
          <p className="text-xs text-muted-foreground">{target > 0 ? `of ${target} kcal · ${pct}%` : "kcal today (no target set)"}</p>
        </div>
        {target > 0 && (
          <p className="text-sm tabular-nums text-muted-foreground">{Math.max(0, target - totals.cals)} left</p>
        )}
      </div>
      {target > 0 && (
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <MacroBar label="P" value={totals.p} target={goal?.protein_target_g ?? 0} color="bg-rose-500" />
        <MacroBar label="C" value={totals.c} target={goal?.carbs_target_g ?? 0} color="bg-amber-500" />
        <MacroBar label="F" value={totals.f} target={goal?.fat_target_g ?? 0} color="bg-sky-500" />
      </div>
    </div>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
        <span>{label}</span><span className="tabular-nums">{Math.round(value)}{target > 0 ? `/${target}` : ""}g</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MealRow({ meal, userId, onDelete }: { meal: Meal; userId: string; onDelete: () => void }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!meal.image_path) return;
    supabase.storage.from("meal-photos").createSignedUrl(meal.image_path, 3600).then(({ data }) => {
      if (!cancelled) setImgUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [meal.image_path]);

  return (
    <div className="flex gap-3 rounded-xl bg-card border border-border/40 p-3">
      {imgUrl && <img src={imgUrl} alt={meal.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{meal.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{meal.description}</p>
          </div>
          <button onClick={onDelete} className="text-muted-foreground hover:text-rose-500 shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex gap-3 text-[11px] mt-1 tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{meal.calories} kcal</span>
          <span>P {Math.round(Number(meal.protein_g))}g</span>
          <span>C {Math.round(Number(meal.carbs_g))}g</span>
          <span>F {Math.round(Number(meal.fat_g))}g</span>
          <span className="ml-auto">{format(new Date(meal.logged_at), "h:mm a")}</span>
        </div>
      </div>
    </div>
  );
}

function GoalsEditor({ userId, goal, onSaved }: { userId: string; goal: Goal | null; onSaved: (g: Goal) => void }) {
  const [age, setAge] = useState<number | "">(goal?.age ?? "");
  const [heightCm, setHeightCm] = useState<number | "">(goal?.height_cm ?? "");
  const [activity, setActivity] = useState<ActivityLevel>(goal?.activity_level ?? "moderate");
  const [direction, setDirection] = useState<GoalDirection>(goal?.weight_goal_direction ?? "maintain");
  const [weightGoal, setWeightGoal] = useState<number | "">(goal?.weight_goal_kg ?? "");
  const [calorieTarget, setCalorieTarget] = useState<number | "">(goal?.calorie_target ?? "");
  const [proteinTarget, setProteinTarget] = useState<number | "">(goal?.protein_target_g ?? "");
  const [carbsTarget, setCarbsTarget] = useState<number | "">(goal?.carbs_target_g ?? "");
  const [fatTarget, setFatTarget] = useState<number | "">(goal?.fat_target_g ?? "");
  const [auto, setAuto] = useState(goal?.auto_calculated ?? true);
  const [saving, setSaving] = useState(false);

  async function autoCalc() {
    if (!age || !heightCm) { toast({ title: "Add age and height first" }); return; }
    // get most recent weight
    const { data: w } = await supabase.from("weight_logs").select("weight_kg").eq("user_id", userId).order("logged_on", { ascending: false }).limit(1).maybeSingle();
    const weightKg = w?.weight_kg ? Number(w.weight_kg) : null;
    if (!weightKg) { toast({ title: "Log a weight first so we can calculate" }); return; }
    const t = calcNutritionTargets({ weightKg, heightCm: Number(heightCm), age: Number(age), activity, goal: direction });
    setCalorieTarget(t.calories); setProteinTarget(t.protein_g); setCarbsTarget(t.carbs_g); setFatTarget(t.fat_g);
    toast({ title: "Auto-calculated", description: `${t.calories} kcal · ${t.protein_g}P / ${t.carbs_g}C / ${t.fat_g}F` });
  }

  async function save() {
    setSaving(true);
    const payload = {
      user_id: userId,
      age: age === "" ? null : Number(age),
      height_cm: heightCm === "" ? null : Number(heightCm),
      activity_level: activity,
      weight_goal_direction: direction,
      weight_goal_kg: weightGoal === "" ? null : Number(weightGoal),
      calorie_target: calorieTarget === "" ? null : Number(calorieTarget),
      protein_target_g: proteinTarget === "" ? null : Number(proteinTarget),
      carbs_target_g: carbsTarget === "" ? null : Number(carbsTarget),
      fat_target_g: fatTarget === "" ? null : Number(fatTarget),
      auto_calculated: auto,
    };
    const { data, error } = await supabase.from("nutrition_goals").upsert(payload, { onConflict: "user_id" }).select().single();
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    onSaved(data as Goal);
    toast({ title: "Goals saved" });
  }

  const labelCls = "text-[11px] font-medium text-muted-foreground";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className={labelCls}>Age</span><Input type="number" value={age} onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))} /></label>
        <label className="space-y-1"><span className={labelCls}>Height (cm)</span><Input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value === "" ? "" : Number(e.target.value))} /></label>
      </div>
      <label className="space-y-1 block">
        <span className={labelCls}>Activity</span>
        <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="sedentary">Sedentary (desk job)</option>
          <option value="light">Light (1–3 workouts/wk)</option>
          <option value="moderate">Moderate (3–5 workouts/wk)</option>
          <option value="active">Active (6–7 workouts/wk)</option>
          <option value="very_active">Very active (twice daily)</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className={labelCls}>Goal</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as GoalDirection)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="lose">Lose weight</option>
            <option value="maintain">Maintain</option>
            <option value="gain">Gain weight</option>
          </select>
        </label>
        <label className="space-y-1"><span className={labelCls}>Target weight (kg)</span><Input type="number" step="0.1" value={weightGoal} onChange={(e) => setWeightGoal(e.target.value === "" ? "" : Number(e.target.value))} /></label>
      </div>

      <Button onClick={autoCalc} variant="outline" size="sm" className="w-full gap-2">
        <Sparkles className="w-4 h-4" /> Auto-calculate targets from profile
      </Button>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className={labelCls}>Calorie target</span><Input type="number" value={calorieTarget} onChange={(e) => { setCalorieTarget(e.target.value === "" ? "" : Number(e.target.value)); setAuto(false); }} /></label>
        <label className="space-y-1"><span className={labelCls}>Protein (g)</span><Input type="number" value={proteinTarget} onChange={(e) => { setProteinTarget(e.target.value === "" ? "" : Number(e.target.value)); setAuto(false); }} /></label>
        <label className="space-y-1"><span className={labelCls}>Carbs (g)</span><Input type="number" value={carbsTarget} onChange={(e) => { setCarbsTarget(e.target.value === "" ? "" : Number(e.target.value)); setAuto(false); }} /></label>
        <label className="space-y-1"><span className={labelCls}>Fat (g)</span><Input type="number" value={fatTarget} onChange={(e) => { setFatTarget(e.target.value === "" ? "" : Number(e.target.value)); setAuto(false); }} /></label>
      </div>

      <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save goals"}</Button>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
