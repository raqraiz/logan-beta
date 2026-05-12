import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, ThumbsUp, ThumbsDown, Sparkles, X, Pencil, Carrot, Lightbulb, Layers, Coffee, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecommendedCategory { category: string; foods: string[]; }
interface MealIdea { name: string; why: string; }
interface AnchorMeal {
  slot: "breakfast" | "lunch" | "dinner";
  name: string;
  why: string;
  ingredients: string[];
}
interface FlexibleSwap { name: string; why: string; }

interface PreviewData {
  mode?: "ideas" | "mix";
  intro?: string;
  phase?: string;
  cycle_day?: number | null;
  life_stage?: string;
  recommended_foods?: RecommendedCategory[];
  meal_ideas?: MealIdea[];
  anchor_meals?: AnchorMeal[];
  flexible_swaps?: FlexibleSwap[];
}

// Legacy export — still referenced by older callers but unused in new UI
export interface MealOption { name: string; ingredients: string[]; recipe: string; }
export interface SwapRequest {
  dayNumber: number;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  unavailable: string[];
  note: string;
}
export interface ApplySwapRequest {
  dayNumber: number;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  option: MealOption;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  preview: PreviewData | null;
  previewUrl?: string | null;        // legacy, ignored
  previewLoading?: boolean;          // legacy, ignored
  onReact?: (reaction: "up" | "down") => Promise<void> | void;
  onRefine?: (args: { excludeIngredients: string[]; feedbackText: string }) => Promise<void> | void;
  onSwapSuggest?: (req: SwapRequest) => Promise<MealOption[]>;  // legacy
  onSwapApply?: (req: ApplySwapRequest) => Promise<void>;        // legacy
  onEditPlan?: () => void;
  refining?: boolean;
  initialReaction?: "up" | "down" | null;
}

const PHASE_CHIP: Record<string, string> = {
  Menstruation: "text-[hsl(354,73%,70%)] border-[hsl(354,73%,60%)]/40 bg-[hsl(354,73%,60%)]/15",
  Follicular:   "text-[hsl(155,55%,60%)] border-[hsl(155,55%,49%)]/40 bg-[hsl(155,55%,49%)]/15",
  Ovulation:    "text-[hsl(40,90%,65%)] border-[hsl(40,80%,55%)]/40 bg-[hsl(40,80%,55%)]/15",
  Luteal:       "text-[hsl(270,55%,73%)] border-[hsl(270,55%,63%)]/40 bg-[hsl(270,55%,63%)]/15",
};

const SLOT_ICON = { breakfast: Coffee, lunch: Sun, dinner: Moon } as const;
const SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" } as const;

const STOP_WORDS = new Set([
  "with","and","or","of","a","an","the","on","in","to","for","over","under","plus",
  "served","topped","drizzled","sprinkled","side","sides","style","mix","slice","slices",
  "fresh","raw","cooked","roasted","grilled","baked","steamed","sauteed","sautéed",
  "chopped","sliced","diced","minced","whole","half","quarter","light","heavy",
]);
const cleanToken = (raw: string) => raw.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
const normalize = (s: string) => s.toLowerCase().trim().replace(/s$/, "");

export function MealPlanPreviewDialog({
  open, onOpenChange, title, preview,
  onReact, onRefine, onEditPlan, refining = false, initialReaction = null,
}: Props) {
  const [reaction, setReaction] = useState<"up" | "down" | null>(initialReaction);
  const [excludes, setExcludes] = useState<string[]>([]);
  const refineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setExcludes([]);
    setReaction(initialReaction);
    if (refineTimer.current) clearTimeout(refineTimer.current);
  }, [title, initialReaction]);

  const excludeSet = useMemo(() => new Set(excludes.map(normalize)), [excludes]);

  const mode = preview?.mode ?? "ideas";
  const phase = preview?.phase;
  const cycleDay = preview?.cycle_day;
  const lifeStage = preview?.life_stage;

  const toggleExclude = (raw: string) => {
    const clean = cleanToken(raw);
    if (!clean) return;
    const norm = normalize(clean);
    if (norm.length < 3 || STOP_WORDS.has(norm)) return;
    setExcludes(prev => {
      const exists = prev.some(p => normalize(p) === norm);
      const next = exists ? prev.filter(p => normalize(p) !== norm) : [...prev, clean.toLowerCase()];
      if (refineTimer.current) clearTimeout(refineTimer.current);
      if (next.length > 0 && onRefine) {
        refineTimer.current = setTimeout(() => {
          onRefine({ excludeIngredients: next, feedbackText: "" });
        }, 1200);
      }
      return next;
    });
  };

  const removeExclude = (item: string) =>
    setExcludes(prev => prev.filter(p => normalize(p) !== normalize(item)));

  const handleReact = async (next: "up" | "down") => {
    setReaction(next);
    try { await onReact?.(next); } catch (err) { console.error("Reaction failed:", err); }
  };

  const renderClickableLine = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\s+)/);
    return parts.map((part, i) => {
      if (/^\s+$/.test(part)) return <span key={i}>{part}</span>;
      const clean = cleanToken(part);
      const norm = normalize(clean);
      const excludable = clean.length >= 3 && !STOP_WORDS.has(norm);
      const excluded = excludeSet.has(norm);
      if (!excludable) return <span key={i}>{part}</span>;
      return (
        <button
          key={i}
          type="button"
          onClick={() => toggleExclude(part)}
          className={cn(
            "rounded px-0.5 -mx-0.5 transition-colors cursor-pointer",
            excluded
              ? "line-through text-destructive/80 bg-destructive/10"
              : "hover:bg-destructive/15 hover:text-destructive",
          )}
          title={excluded ? `Click to keep "${clean}"` : `Click to remove "${clean}"`}
        >
          {part}
        </button>
      );
    });
  };

  const phaseChip = phase && PHASE_CHIP[phase];
  const isCycling = lifeStage === "cycling";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-2">
                {mode === "mix"
                  ? <Layers className="h-4 w-4 text-primary shrink-0" />
                  : <Lightbulb className="h-4 w-4 text-primary shrink-0" />}
                <span className="truncate">{title}</span>
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed pt-1">
                {preview?.intro || "Tailored to where you are right now. Tap any ingredient to swap it out."}
              </DialogDescription>
              {phase && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    phaseChip || "bg-muted/40 text-muted-foreground border-border/40",
                  )}>
                    {phase}
                  </span>
                  {isCycling && cycleDay != null && (
                    <span className="text-[10px] text-muted-foreground">Cycle day {cycleDay}</span>
                  )}
                </div>
              )}
            </div>
            {onEditPlan && (
              <button
                type="button"
                onClick={() => { onEditPlan(); onOpenChange(false); }}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 text-[11px] font-medium transition-colors mr-8"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Sticky excludes / refining bar */}
        {(excludes.length > 0 || refining) && (
          <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-background/95 backdrop-blur border-b border-border/30">
            <div className="flex items-center gap-2 flex-wrap">
              {refining ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating your menu…
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Removing:</span>
              )}
              {!refining && excludes.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => removeExclude(item)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-1"
                >
                  {item} <X className="h-2.5 w-2.5" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4 py-2">
          {mode === "ideas" ? (
            <IdeasView preview={preview} renderClickableLine={renderClickableLine} toggleExclude={toggleExclude} excludeSet={excludeSet} />
          ) : (
            <MixView preview={preview} renderClickableLine={renderClickableLine} toggleExclude={toggleExclude} excludeSet={excludeSet} />
          )}

          {onReact && (
            <div className="rounded-xl border border-border/40 bg-card/40 p-3 flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">How does this look?</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleReact("up")}
                  className={cn(
                    "h-8 w-8 rounded-full border flex items-center justify-center transition-colors",
                    reaction === "up"
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border/40 text-muted-foreground hover:text-foreground",
                  )}
                  aria-label="Love it"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleReact("down")}
                  className={cn(
                    "h-8 w-8 rounded-full border flex items-center justify-center transition-colors",
                    reaction === "down"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border/40 text-muted-foreground hover:text-foreground",
                  )}
                  aria-label="Not quite"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-center text-muted-foreground/70 flex items-center justify-center gap-1">
            <Sparkles className="h-2.5 w-2.5" /> Tap any ingredient to swap it out instantly
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IdeasView({
  preview, renderClickableLine, toggleExclude, excludeSet,
}: {
  preview: PreviewData | null;
  renderClickableLine: (s: string) => React.ReactNode;
  toggleExclude: (s: string) => void;
  excludeSet: Set<string>;
}) {
  const cats = preview?.recommended_foods ?? [];
  const ideas = preview?.meal_ideas ?? [];

  return (
    <div className="space-y-4">
      {cats.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Carrot className="h-3 w-3" /> Recommended foods
          </div>
          <div className="space-y-3">
            {cats.map((c, i) => (
              <div key={`${c.category}-${i}`}>
                <div className="text-xs font-semibold text-foreground mb-1.5">{c.category}</div>
                <div className="flex flex-wrap gap-1">
                  {c.foods.map(f => {
                    const excluded = excludeSet.has(f.toLowerCase().trim().replace(/s$/, ""));
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => toggleExclude(f)}
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                          excluded
                            ? "bg-destructive/15 text-destructive border-destructive/40 line-through"
                            : "bg-card/60 text-foreground/85 border-border/50 hover:border-destructive/40",
                        )}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ideas.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Lightbulb className="h-3 w-3" /> Meal ideas
          </div>
          <div className="space-y-2">
            {ideas.map((m, i) => (
              <div key={`${m.name}-${i}`} className="rounded-lg border border-border/30 bg-background/40 px-3 py-2">
                <div className="text-sm font-medium leading-snug">{renderClickableLine(m.name)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{m.why}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MixView({
  preview, renderClickableLine, toggleExclude, excludeSet,
}: {
  preview: PreviewData | null;
  renderClickableLine: (s: string) => React.ReactNode;
  toggleExclude: (s: string) => void;
  excludeSet: Set<string>;
}) {
  const anchors = preview?.anchor_meals ?? [];
  const swaps = preview?.flexible_swaps ?? [];

  return (
    <div className="space-y-4">
      {anchors.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3 w-3" /> Today's anchors
          </div>
          <div className="space-y-2.5">
            {anchors.map((m, i) => {
              const Icon = SLOT_ICON[m.slot] ?? Sun;
              return (
                <div key={`${m.slot}-${i}`} className="rounded-lg border border-border/30 bg-background/40 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    <Icon className="h-3 w-3" /> {SLOT_LABEL[m.slot] ?? m.slot}
                  </div>
                  <div className="text-sm font-semibold leading-snug">{renderClickableLine(m.name)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{m.why}</div>
                  {m.ingredients?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {m.ingredients.map(ing => {
                        const excluded = excludeSet.has(ing.toLowerCase().trim().replace(/s$/, ""));
                        return (
                          <button
                            key={ing}
                            type="button"
                            onClick={() => toggleExclude(ing)}
                            className={cn(
                              "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                              excluded
                                ? "bg-destructive/15 text-destructive border-destructive/40 line-through"
                                : "bg-card/60 text-foreground/85 border-border/50 hover:border-destructive/40",
                            )}
                          >
                            {ing}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {swaps.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Flexible swaps
          </div>
          <div className="space-y-2">
            {swaps.map((s, i) => (
              <div key={`${s.name}-${i}`} className="rounded-lg border border-border/30 bg-background/40 px-3 py-2">
                <div className="text-sm font-medium leading-snug">{renderClickableLine(s.name)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{s.why}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
