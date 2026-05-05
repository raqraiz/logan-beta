import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Sun, Moon, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Length = 1 | 3 | 7;
type Style = "dark" | "light";

export interface MealPlanInitialValues {
  lengthDays?: number;
  style?: string | null;
  dietaryPrefs?: {
    diet_type?: string | null;
    allergies?: string[] | null;
    dislikes?: string[] | null;
    cuisines?: string[] | null;        // repurposed: focus styles
    includes?: string[] | null;        // foods to include
    notes?: string | null;
    macro_preset?: string | null;
    macro_targets?: { calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null } | null;
    free_form?: string | null;
  } | null;
}

interface MealPlanSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onGenerated?: (resourceId: string) => void;
  initialValues?: MealPlanInitialValues | null;
  /** When true, button label/title says "Update" instead of "Generate". */
  editMode?: boolean;
}

const LENGTH_OPTIONS: { value: Length; label: string; sub: string; eta: string }[] = [
  { value: 1, label: "1 day", sub: "Just today", eta: "~5s" },
  { value: 3, label: "3 days", sub: "Quick try", eta: "~10s" },
  { value: 7, label: "1 week", sub: "Most popular", eta: "~20s" },
];

const DIET_TYPES = ["Omnivore", "Pescatarian", "Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Keto", "Paleo", "Kosher", "Halal", "Other"];
const COMMON_ALLERGIES = ["Nuts", "Peanuts", "Shellfish", "Eggs", "Soy", "Gluten", "Dairy"];
const FOCUS_STYLES = [
  "High protein",
  "Anti-inflammatory",
  "Gut-friendly",
  "Hormone-balancing",
  "Low-carb",
  "Low-sugar",
  "Iron-rich",
  "Mediterranean",
  "Quick & simple",
];

const PRESET_DIETS = ["Omnivore", "Pescatarian", "Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Keto", "Paleo", "Kosher", "Halal"];

const MACRO_PRESETS = [
  { id: "balanced", label: "Balanced", desc: "~30% P / 40% C / 30% F" },
  { id: "high_protein", label: "High protein", desc: ">120g protein/day" },
  { id: "low_carb", label: "Low carb", desc: "<100g carbs/day" },
  { id: "mediterranean", label: "Mediterranean", desc: "Healthy fats forward" },
];

export function MealPlanSetupDialog({
  open, onOpenChange, userId, onGenerated, initialValues, editMode = false,
}: MealPlanSetupDialogProps) {
  const [length, setLength] = useState<Length>(7);
  const [style, setStyle] = useState<Style>("dark");
  const [dietTypes, setDietTypes] = useState<string[]>(["Omnivore"]);
  const [dietOther, setDietOther] = useState<string>("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [includes, setIncludes] = useState("");
  const [focusStyles, setFocusStyles] = useState<string[]>([]);
  const [macroPreset, setMacroPreset] = useState<string>("");
  const [macroCalories, setMacroCalories] = useState<string>("");
  const [macroProtein, setMacroProtein] = useState<string>("");
  const [macroCarbs, setMacroCarbs] = useState<string>("");
  const [macroFat, setMacroFat] = useState<string>("");
  const [freeForm, setFreeForm] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);

  // Apply provided initial values, otherwise fall back to user_dietary_prefs
  useEffect(() => {
    if (!open || !userId) return;
    setLoadingPrefs(true);

    const applyDietType = (raw?: string | null) => {
      if (!raw) return;
      const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
      const presets: string[] = [];
      const customs: string[] = [];
      parts.forEach(p => {
        if (PRESET_DIETS.includes(p)) presets.push(p);
        else customs.push(p);
      });
      const next = [...presets];
      if (customs.length) {
        next.push("Other");
        setDietOther(customs.join(", "));
      } else {
        setDietOther("");
      }
      setDietTypes(next.length ? next : ["Omnivore"]);
    };

    const applyValues = (data: MealPlanInitialValues["dietaryPrefs"], lengthDays?: number, styleVal?: string | null) => {
      if (lengthDays && [1, 3, 7].includes(lengthDays)) setLength(lengthDays as Length);
      if (styleVal === "light" || styleVal === "dark") setStyle(styleVal);
      if (!data) return;
      applyDietType(data.diet_type ?? undefined);
      if (data.allergies?.length) setAllergies(data.allergies);
      if (data.dislikes?.length) setDislikes(data.dislikes.join(", "));
      if (data.cuisines?.length) setFocusStyles(data.cuisines);
      // includes can come from explicit field or from notes (legacy)
      if (data.includes?.length) {
        setIncludes(data.includes.join(", "));
      } else if (data.notes && /^includes:/i.test(data.notes)) {
        setIncludes(data.notes.replace(/^includes:\s*/i, ""));
      }
      if (data.macro_preset) setMacroPreset(data.macro_preset);
      if (data.macro_targets) {
        setMacroCalories(data.macro_targets.calories ? String(data.macro_targets.calories) : "");
        setMacroProtein(data.macro_targets.protein ? String(data.macro_targets.protein) : "");
        setMacroCarbs(data.macro_targets.carbs ? String(data.macro_targets.carbs) : "");
        setMacroFat(data.macro_targets.fat ? String(data.macro_targets.fat) : "");
      }
      if (data.free_form) setFreeForm(data.free_form);
    };

    if (initialValues) {
      applyValues(initialValues.dietaryPrefs ?? null, initialValues.lengthDays, initialValues.style);
      setLoadingPrefs(false);
      return;
    }

    supabase
      .from("user_dietary_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) applyValues({
          diet_type: data.diet_type,
          allergies: data.allergies,
          dislikes: data.dislikes,
          cuisines: data.cuisines,
          notes: data.notes,
        });
        setLoadingPrefs(false);
      });
  }, [open, userId, initialValues]);

  const toggleDiet = (d: string) => {
    setDietTypes(prev => {
      if (prev.includes(d)) {
        const next = prev.filter(x => x !== d);
        return next.length ? next : ["Omnivore"];
      }
      return [...prev, d];
    });
  };

  const toggleAllergy = (a: string) =>
    setAllergies(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const addAllergy = () => {
    const v = allergyInput.trim();
    if (v && !allergies.includes(v)) {
      setAllergies(prev => [...prev, v]);
      setAllergyInput("");
    }
  };

  const toggleFocus = (c: string) =>
    setFocusStyles(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const handleGenerate = async () => {
    setSubmitting(true);
    try {
      const dislikeList = dislikes.split(",").map(s => s.trim()).filter(Boolean);
      const includeList = includes.split(",").map(s => s.trim()).filter(Boolean);
      const resolvedParts = dietTypes.flatMap(d => {
        if (d === "Other") return dietOther.split(",").map(s => s.trim()).filter(Boolean);
        return [d];
      });
      const resolvedDiet = resolvedParts.length ? resolvedParts.join(", ") : "Omnivore";

      const { data, error } = await supabase.functions.invoke("generate-meal-plan", {
        body: {
          lengthDays: length,
          style,
          dietaryPrefs: {
            diet_type: resolvedDiet,
            allergies,
            dislikes: dislikeList,
            cuisines: focusStyles, // server stores into cuisines column
            includes: includeList,
            focus_styles: focusStyles,
          },
        },
      });

      if (error) throw error;
      if (data?.resource?.id) onGenerated?.(data.resource.id);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to start meal plan generation:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {editMode ? "Edit your meal plan" : "Build your meal plan"}
          </DialogTitle>
          <DialogDescription>
            {editMode
              ? "Tweak any setting below — we'll regenerate from your changes."
              : "Each meal will sync to your cycle phase. Takes ~5–20 seconds."}
          </DialogDescription>
        </DialogHeader>

        {loadingPrefs ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Length */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Plan length
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {LENGTH_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLength(opt.value)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left transition-all",
                      length === opt.value
                        ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                        : "border-border/40 bg-card/40 hover:border-border/80",
                    )}
                  >
                    <div className="text-sm font-semibold text-foreground flex items-center justify-between">
                      {opt.label}
                      {length === opt.value && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Diet type */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Diet <span className="text-muted-foreground/60 normal-case tracking-normal">(pick any that apply)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {DIET_TYPES.map(d => {
                  const active = dietTypes.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDiet(d)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs border transition-all flex items-center gap-1",
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border/40 bg-card/40 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                      {d}
                    </button>
                  );
                })}
              </div>
              {dietTypes.includes("Other") && (
                <Input
                  value={dietOther}
                  onChange={e => setDietOther(e.target.value)}
                  placeholder="Describe (e.g. low-FODMAP, raw vegan)"
                  className="h-8 text-xs mt-2"
                />
              )}
            </div>

            {/* Focus */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Focus <span className="text-muted-foreground/60 normal-case tracking-normal">(optional)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {FOCUS_STYLES.map(c => (
                  <button
                    key={c}
                    onClick={() => toggleFocus(c)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs border transition-all",
                      focusStyles.includes(c)
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/40 bg-card/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Allergies */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Allergies
              </Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_ALLERGIES.map(a => (
                  <button
                    key={a}
                    onClick={() => toggleAllergy(a)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs border transition-all",
                      allergies.includes(a)
                        ? "border-destructive/60 bg-destructive/10 text-destructive"
                        : "border-border/40 bg-card/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {a}
                  </button>
                ))}
                {allergies.filter(a => !COMMON_ALLERGIES.includes(a)).map(a => (
                  <button
                    key={a}
                    onClick={() => toggleAllergy(a)}
                    className="rounded-full px-3 py-1 text-xs border border-destructive/60 bg-destructive/10 text-destructive"
                  >
                    {a} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={allergyInput}
                  onChange={e => setAllergyInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAllergy(); } }}
                  placeholder="Add another..."
                  className="h-8 text-xs"
                />
                <Button onClick={addAllergy} size="sm" variant="outline" className="h-8">Add</Button>
              </div>
            </div>

            {/* Foods to include */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Foods you want to include
              </Label>
              <Textarea
                value={includes}
                onChange={e => setIncludes(e.target.value)}
                placeholder="e.g. salmon, sweet potato, lentils"
                className="text-sm min-h-[60px]"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Comma-separated. Logan will work these into the plan.
              </p>
            </div>

            {/* Dislikes */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Foods you'd rather skip
              </Label>
              <Textarea
                value={dislikes}
                onChange={e => setDislikes(e.target.value)}
                placeholder="e.g. mushrooms, cilantro, liver"
                className="text-sm min-h-[60px]"
              />
            </div>

            {/* Visual style */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Visual style
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setStyle("dark")}
                  className={cn(
                    "rounded-xl border px-3 py-3 flex flex-col items-center gap-1.5 transition-all",
                    style === "dark" ? "border-primary bg-primary/10" : "border-border/40 bg-card/40 hover:border-border/80",
                  )}
                >
                  <Moon className="h-4 w-4 text-foreground" />
                  <div className="text-xs font-medium">Dark</div>
                  <div className="text-[10px] text-muted-foreground">Premium look</div>
                </button>
                <button
                  onClick={() => setStyle("light")}
                  className={cn(
                    "rounded-xl border px-3 py-3 flex flex-col items-center gap-1.5 transition-all",
                    style === "light" ? "border-primary bg-primary/10" : "border-border/40 bg-card/40 hover:border-border/80",
                  )}
                >
                  <Sun className="h-4 w-4 text-foreground" />
                  <div className="text-xs font-medium">Light</div>
                  <div className="text-[10px] text-muted-foreground">Bright & airy</div>
                </button>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={submitting}
              variant="premium"
              className="w-full"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> {editMode ? "Update my meal plan" : "Generate my meal plan"}</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
