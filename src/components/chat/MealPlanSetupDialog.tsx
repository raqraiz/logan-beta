import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Sun, Moon, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Length = 1 | 3 | 7 | 14 | 28;
type Style = "dark" | "light";

interface MealPlanSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onGenerated?: (resourceId: string) => void;
}

const LENGTH_OPTIONS: { value: Length; label: string; sub: string; eta: string }[] = [
  { value: 1, label: "1 day", sub: "Just today", eta: "~5s" },
  { value: 3, label: "3 days", sub: "Quick try", eta: "~10s" },
  { value: 7, label: "1 week", sub: "Most popular", eta: "~20s" },
  { value: 14, label: "2 weeks", sub: "Half a cycle", eta: "~35s" },
  { value: 28, label: "4 weeks", sub: "Full cycle", eta: "~60s" },
];

const DIET_TYPES = ["Omnivore", "Pescatarian", "Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Keto", "Paleo", "Kosher", "Halal", "Other"];
const COMMON_ALLERGIES = ["Nuts", "Peanuts", "Shellfish", "Eggs", "Soy", "Gluten", "Dairy"];
const CUISINE_VIBES = ["Mediterranean", "Asian", "Mexican", "Middle Eastern", "Italian", "Comfort food", "Quick & simple"];

const PRESET_DIETS = ["Omnivore", "Pescatarian", "Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Keto", "Paleo", "Kosher", "Halal"];

export function MealPlanSetupDialog({ open, onOpenChange, userId, onGenerated }: MealPlanSetupDialogProps) {
  const [length, setLength] = useState<Length>(7);
  const [style, setStyle] = useState<Style>("dark");
  const [dietTypes, setDietTypes] = useState<string[]>(["Omnivore"]);
  const [dietOther, setDietOther] = useState<string>("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);

  useEffect(() => {
    if (!open || !userId) return;
    setLoadingPrefs(true);
    supabase
      .from("user_dietary_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          if (data.diet_type) {
            // diet_type is stored as comma-separated string; split + map back to chips
            const parts = data.diet_type.split(",").map((s: string) => s.trim()).filter(Boolean);
            const presets: string[] = [];
            const customs: string[] = [];
            parts.forEach((p: string) => {
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
          }
          if (data.allergies?.length) setAllergies(data.allergies);
          if (data.dislikes?.length) setDislikes(data.dislikes.join(", "));
          if (data.cuisines?.length) setCuisines(data.cuisines);
        }
        setLoadingPrefs(false);
      });
  }, [open, userId]);

  const toggleDiet = (d: string) => {
    setDietTypes(prev => {
      if (prev.includes(d)) {
        const next = prev.filter(x => x !== d);
        return next.length ? next : ["Omnivore"];
      }
      return [...prev, d];
    });
  };

  const toggleAllergy = (a: string) => {
    setAllergies(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  };

  const addAllergy = () => {
    const v = allergyInput.trim();
    if (v && !allergies.includes(v)) {
      setAllergies(prev => [...prev, v]);
      setAllergyInput("");
    }
  };

  const toggleCuisine = (c: string) => {
    setCuisines(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  const handleGenerate = async () => {
    setSubmitting(true);
    try {
      const dislikeList = dislikes.split(",").map(s => s.trim()).filter(Boolean);
      const resolvedParts = dietTypes.flatMap(d => {
        if (d === "Other") {
          return dietOther.split(",").map(s => s.trim()).filter(Boolean);
        }
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
            cuisines,
          },
        },
      });

      if (error) throw error;
      if (data?.resource?.id) {
        onGenerated?.(data.resource.id);
      }
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
            Build your meal plan
          </DialogTitle>
          <DialogDescription>
            Each meal will sync to your cycle phase. Takes ~10–60 seconds.
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
              <div className="grid grid-cols-2 gap-2">
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
                    <div className="text-[11px] text-muted-foreground mt-0.5">{opt.sub} · {opt.eta}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Diet type — multi select */}
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

            {/* Cuisines */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Cuisine vibes (optional)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {CUISINE_VIBES.map(c => (
                  <button
                    key={c}
                    onClick={() => toggleCuisine(c)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs border transition-all",
                      cuisines.includes(c)
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/40 bg-card/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
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
                    style === "dark"
                      ? "border-primary bg-primary/10"
                      : "border-border/40 bg-card/40 hover:border-border/80",
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
                    style === "light"
                      ? "border-primary bg-primary/10"
                      : "border-border/40 bg-card/40 hover:border-border/80",
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
                <><Sparkles className="h-4 w-4" /> Generate my meal plan</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
