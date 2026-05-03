import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, ShoppingBasket, Moon, Sun, ThumbsUp, ThumbsDown, Sparkles, X, ChevronDown, Utensils, Carrot, Replace, Check, Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface MealRecipe {
  ingredients: string[];
  recipe: string;
}

interface MealDay {
  day_number: number;
  cycle_day: number;
  phase: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  snack: string;
  hormone_focus?: string;
  image_path?: string | null;
  recipes?: {
    breakfast?: MealRecipe;
    lunch?: MealRecipe;
    dinner?: MealRecipe;
    snack?: MealRecipe;
  };
}

interface WeekBlock {
  week_number: number;
  phase_summary: string;
  grocery_list: string[];
}

interface PreviewData {
  intro?: string;
  days?: MealDay[];
  weeks?: WeekBlock[];
}

export interface MealOption {
  name: string;
  ingredients: string[];
  recipe: string;
}

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
  previewUrl?: string | null;
  previewLoading?: boolean;
  onReact?: (reaction: "up" | "down") => Promise<void> | void;
  onRefine?: (args: { excludeIngredients: string[]; feedbackText: string }) => Promise<void> | void;
  onSwapSuggest?: (req: SwapRequest) => Promise<MealOption[]>;
  onSwapApply?: (req: ApplySwapRequest) => Promise<void>;
  onEditPlan?: () => void;
  refining?: boolean;
  initialReaction?: "up" | "down" | null;
}

const PHASE_CHIP: Record<"dark" | "light", Record<string, string>> = {
  dark: {
    Menstruation: "text-[hsl(354,73%,70%)] border-[hsl(354,73%,60%)]/40 bg-[hsl(354,73%,60%)]/15",
    Follicular: "text-[hsl(155,55%,60%)] border-[hsl(155,55%,49%)]/40 bg-[hsl(155,55%,49%)]/15",
    Ovulation: "text-[hsl(40,90%,65%)] border-[hsl(40,80%,55%)]/40 bg-[hsl(40,80%,55%)]/15",
    Luteal: "text-[hsl(270,55%,73%)] border-[hsl(270,55%,63%)]/40 bg-[hsl(270,55%,63%)]/15",
  },
  light: {
    Menstruation: "text-[hsl(354,73%,40%)] border-[hsl(354,73%,50%)]/40 bg-[hsl(354,73%,60%)]/15",
    Follicular: "text-[hsl(155,55%,30%)] border-[hsl(155,55%,40%)]/40 bg-[hsl(155,55%,49%)]/15",
    Ovulation: "text-[hsl(35,90%,35%)] border-[hsl(40,80%,45%)]/40 bg-[hsl(40,80%,55%)]/15",
    Luteal: "text-[hsl(270,55%,40%)] border-[hsl(270,55%,50%)]/40 bg-[hsl(270,55%,63%)]/15",
  },
};

// Words that aren't real ingredients — never excludable
const STOP_WORDS = new Set([
  "with","and","or","of","a","an","the","on","in","to","for","over","under","plus",
  "served","topped","drizzled","sprinkled","side","sides","style","mix","slice","slices",
  "cup","cups","tbsp","tsp","oz","g","ml","handful","pinch","small","large","medium",
  "fresh","raw","cooked","roasted","grilled","baked","steamed","sauteed","sautéed",
  "chopped","sliced","diced","minced","whole","half","quarter","light","heavy",
]);

// Strip basic punctuation around a token to get a clean ingredient candidate
const cleanToken = (raw: string) => raw.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");

// Normalize for excludes set (lowercase, singular-ish)
const normalize = (s: string) => s.toLowerCase().trim().replace(/s$/, "");

export function MealPlanPreviewDialog({
  open, onOpenChange, title, preview, previewUrl, previewLoading,
  onReact, onRefine, onSwapSuggest, onSwapApply, onEditPlan,
  refining = false, initialReaction = null,
}: Props) {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [reaction, setReaction] = useState<"up" | "down" | null>(initialReaction);
  const [excludes, setExcludes] = useState<string[]>([]);
  const refineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset transient state whenever a new resource is loaded
  useEffect(() => {
    setExcludes([]);
    setReaction(initialReaction);
    if (refineTimer.current) clearTimeout(refineTimer.current);
  }, [title, initialReaction]);

  // Normalized set for fast strikethrough lookup
  const excludeSet = useMemo(
    () => new Set(excludes.map(normalize)),
    [excludes],
  );

  const days = preview?.days ?? [];
  const weeks = preview?.weeks ?? [];
  const hasStructuredPreview = days.length > 0;

  // Resolve signed URLs for each day's hero photo (image_path -> https url)
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    let active = true;
    const paths = days
      .map(d => ({ day: d.day_number, path: d.image_path }))
      .filter(p => !!p.path) as { day: number; path: string }[];
    if (paths.length === 0) {
      setImageUrls({});
      return;
    }
    (async () => {
      const entries = await Promise.all(
        paths.map(async ({ day, path }) => {
          const { data } = await supabase.storage
            .from("resources")
            .createSignedUrl(path, 60 * 60);
          return [day, data?.signedUrl ?? ""] as const;
        }),
      );
      if (!active) return;
      const next: Record<number, string> = {};
      entries.forEach(([day, url]) => { if (url) next[day] = url; });
      setImageUrls(next);
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.map(d => `${d.day_number}:${d.image_path ?? ""}`).join("|")]);

  const isDark = mode === "dark";
  const surface = isDark
    ? "bg-[hsl(220,15%,8%)] text-[hsl(0,0%,95%)] border-white/10"
    : "bg-[hsl(40,30%,97%)] text-[hsl(220,15%,15%)] border-black/10";
  const cardSurface = isDark
    ? "bg-white/[0.03] border-white/10"
    : "bg-white border-black/10 shadow-sm";
  const mutedText = isDark ? "text-white/60" : "text-black/55";
  const subtleText = isDark ? "text-white/50" : "text-black/50";
  const chipMuted = isDark
    ? "bg-white/5 text-white/70 border-white/10"
    : "bg-black/5 text-black/70 border-black/10";
  const introBorder = isDark ? "border-white/10" : "border-black/10";
  const wordHover = isDark
    ? "hover:bg-destructive/20 hover:text-destructive-foreground"
    : "hover:bg-destructive/15 hover:text-destructive";

  // Toggle a word — debounced auto-regenerate
  const toggleWord = (raw: string) => {
    const clean = cleanToken(raw);
    if (!clean) return;
    const norm = normalize(clean);
    if (norm.length < 3 || STOP_WORDS.has(norm)) return;

    setExcludes(prev => {
      const exists = prev.some(p => normalize(p) === norm);
      const next = exists ? prev.filter(p => normalize(p) !== norm) : [...prev, clean.toLowerCase()];

      // Schedule a debounced regenerate
      if (refineTimer.current) clearTimeout(refineTimer.current);
      if (next.length > 0 && onRefine) {
        refineTimer.current = setTimeout(() => {
          onRefine({ excludeIngredients: next, feedbackText: "" });
        }, 1200);
      }
      return next;
    });
  };

  const removeExclude = (item: string) => {
    setExcludes(prev => prev.filter(p => normalize(p) !== normalize(item)));
  };

  const handleReact = async (next: "up" | "down") => {
    setReaction(next);
    try {
      await onReact?.(next);
    } catch (err) {
      console.error("Reaction failed:", err);
    }
  };

  // Render meal text as tappable words. Excluded words get strikethrough.
  const renderMealLine = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\s+)/); // keep whitespace
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
          onClick={() => toggleWord(part)}
          className={cn(
            "rounded px-0.5 -mx-0.5 transition-colors cursor-pointer",
            excluded
              ? "line-through text-destructive/80 bg-destructive/10"
              : wordHover,
          )}
          title={excluded ? `Click to keep "${clean}"` : `Click to remove "${clean}"`}
        >
          {part}
        </button>
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed pt-1">
                {preview?.intro || "Tap any ingredient to remove it — your plan updates automatically."}
              </DialogDescription>
            </div>
            <div className="shrink-0 flex items-center gap-2 mr-8">
              {onEditPlan && (
                <button
                  type="button"
                  onClick={() => { onEditPlan(); onOpenChange(false); }}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 text-[11px] font-medium transition-colors"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
              <div className="inline-flex items-center rounded-full border border-border/40 bg-card/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("dark")}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    isDark ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={isDark}
                >
                  <Moon className="h-3 w-3" /> Dark
                </button>
                <button
                  type="button"
                  onClick={() => setMode("light")}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    !isDark ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={!isDark}
                >
                  <Sun className="h-3 w-3" /> Light
                </button>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Sticky excludes + status bar */}
        {(excludes.length > 0 || refining) && (
          <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-background/95 backdrop-blur border-b border-border/30">
            <div className="flex items-center gap-2 flex-wrap">
              {refining ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating your plan…
                </span>
              ) : excludes.length > 0 ? (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Removing:
                </span>
              ) : null}
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

        <div className="space-y-5 py-2">
          {hasStructuredPreview ? (
            <div className={cn("rounded-xl border p-4 space-y-4 transition-colors", surface)}>
              {preview?.intro && (
                <p className={cn("text-xs leading-relaxed pb-3 border-b italic", mutedText, introBorder)}>
                  {preview.intro}
                </p>
              )}

              <div className="space-y-3">
                {days.map(d => (
                  <div key={d.day_number} className={cn("rounded-xl border overflow-hidden", cardSurface)}>
                    <div className="flex items-stretch">
                      {d.image_path && (
                        <div className="relative w-1/2 shrink-0 self-stretch bg-black/20 min-h-[140px]">
                          {imageUrls[d.day_number] ? (
                            <img
                              src={imageUrls[d.day_number]}
                              alt={`Day ${d.day_number} ${d.phase} dinner`}
                              className="absolute inset-0 w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
                            </div>
                          )}
                        </div>
                      )}
                      <div className={cn("p-3 flex-1 min-w-0", d.image_path && "w-1/2")}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="text-sm font-semibold truncate">
                            Day {d.day_number}
                            <span className={cn("text-xs font-normal ml-2", mutedText)}>
                              Cycle day {d.cycle_day}
                            </span>
                          </div>
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0",
                              PHASE_CHIP[mode][d.phase] ?? chipMuted,
                            )}
                          >
                            {d.phase}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {(["breakfast", "lunch", "dinner", "snack"] as const).map(slot => (
                            <MealRow
                              key={slot}
                              dayNumber={d.day_number}
                              slot={slot}
                              mealText={d[slot]}
                              recipe={d.recipes?.[slot]}
                              renderMealLine={renderMealLine}
                              toggleWord={toggleWord}
                              excludeSet={excludeSet}
                              isDark={isDark}
                              mutedText={mutedText}
                              subtleText={subtleText}
                              introBorder={introBorder}
                              onSwapSuggest={onSwapSuggest}
                              onSwapApply={onSwapApply}
                            />
                          ))}
                        </div>
                        {d.hormone_focus && (
                          <div className={cn("text-[11px] italic mt-2 pt-2 border-t", subtleText, introBorder)}>
                            {d.hormone_focus}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {weeks.length > 0 && (
                <div className="space-y-3">
                  {weeks.map(w => (
                    <GroceryListCard
                      key={w.week_number}
                      week={w}
                      excludeSet={excludeSet}
                      toggleWord={toggleWord}
                      cardSurface={cardSurface}
                      chipMuted={chipMuted}
                      mutedText={mutedText}
                      isDark={isDark}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/40 bg-card/40">
              {previewLoading ? (
                <div className="flex h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
                </div>
              ) : previewUrl ? (
                <object
                  data={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                  type="application/pdf"
                  className="h-[60vh] w-full bg-background"
                >
                  <div className="flex h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-sm text-muted-foreground">Your browser can't preview PDFs inline.</p>
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-2">
                      Open PDF in a new tab
                    </a>
                  </div>
                </object>
              ) : (
                <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  Preview is still getting ready. Try again in a moment.
                </div>
              )}
            </div>
          )}

          {/* Reactions */}
          {hasStructuredPreview && onReact && (
            <div className="rounded-xl border border-border/40 bg-card/40 p-3 flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">How does this plan look?</div>
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

          {!hasStructuredPreview ? null : (
            <p className="text-[10px] text-center text-muted-foreground/70 -mt-2 flex items-center justify-center gap-1">
              <Sparkles className="h-2.5 w-2.5" /> Tap any ingredient to swap it out instantly
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MealRow — collapsible per-meal row showing ingredients + a short recipe
// ──────────────────────────────────────────────────────────────────────────
interface MealRowProps {
  dayNumber: number;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  mealText: string;
  recipe?: MealRecipe;
  renderMealLine: (text: string) => React.ReactNode;
  toggleWord: (raw: string) => void;
  excludeSet: Set<string>;
  isDark: boolean;
  mutedText: string;
  subtleText: string;
  introBorder: string;
  onSwapSuggest?: (req: SwapRequest) => Promise<MealOption[]>;
  onSwapApply?: (req: ApplySwapRequest) => Promise<void>;
}

const SLOT_LABEL: Record<MealRowProps["slot"], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function MealRow({
  dayNumber, slot, mealText, recipe, renderMealLine, toggleWord, excludeSet,
  isDark, mutedText, subtleText, introBorder, onSwapSuggest, onSwapApply,
}: MealRowProps) {
  const [open, setOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [note, setNote] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [options, setOptions] = useState<MealOption[] | null>(null);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null);

  const hasRecipe = !!recipe && (recipe.ingredients?.length || recipe.recipe);
  const swapEnabled = !!onSwapSuggest && !!onSwapApply;

  const headerHover = isDark ? "hover:bg-white/[0.04]" : "hover:bg-black/[0.03]";
  const recipeSurface = isDark ? "bg-white/[0.02]" : "bg-black/[0.02]";
  const swapSurface = isDark ? "bg-primary/5 border-primary/20" : "bg-primary/5 border-primary/20";

  const toggleUnavailable = (ing: string) => {
    const norm = ing.toLowerCase().trim();
    setUnavailable(prev =>
      prev.some(p => p.toLowerCase().trim() === norm)
        ? prev.filter(p => p.toLowerCase().trim() !== norm)
        : [...prev, ing],
    );
  };

  const addCustom = () => {
    const v = customInput.trim();
    if (!v) return;
    if (!unavailable.some(u => u.toLowerCase() === v.toLowerCase())) {
      setUnavailable(prev => [...prev, v]);
    }
    setCustomInput("");
  };

  const findAlternatives = async () => {
    if (!onSwapSuggest) return;
    setLoadingOptions(true);
    setOptions(null);
    setAppliedIdx(null);
    try {
      const res = await onSwapSuggest({
        dayNumber,
        slot,
        unavailable,
        note,
      });
      setOptions(res || []);
    } catch (err) {
      console.error("Swap suggest failed:", err);
      setOptions([]);
    } finally {
      setLoadingOptions(false);
    }
  };

  const useOption = async (idx: number) => {
    if (!onSwapApply || !options) return;
    setApplyingIdx(idx);
    try {
      await onSwapApply({ dayNumber, slot, option: options[idx] });
      setAppliedIdx(idx);
      // Auto-close after a short beat
      setTimeout(() => {
        setSwapOpen(false);
        setOptions(null);
        setUnavailable([]);
        setNote("");
        setAppliedIdx(null);
      }, 900);
    } catch (err) {
      console.error("Apply swap failed:", err);
    } finally {
      setApplyingIdx(null);
    }
  };

  const openSwap = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSwapOpen(true);
    setOpen(true);
    // Pre-seed unavailable with empty so user starts fresh
    setUnavailable([]);
    setOptions(null);
  };

  return (
    <div className={cn("rounded-lg overflow-hidden border-0", hasRecipe && "border")} style={hasRecipe ? { borderColor: "transparent" } : undefined}>
      <div
        className={cn(
          "flex items-start gap-2 py-1.5 px-1.5 -mx-1.5 rounded-md transition-colors text-xs leading-relaxed",
          hasRecipe && cn("cursor-pointer", headerHover),
        )}
        onClick={hasRecipe ? () => setOpen(o => !o) : undefined}
        role={hasRecipe ? "button" : undefined}
        aria-expanded={hasRecipe ? open : undefined}
      >
        <div className="flex-1 min-w-0">
          <span className={cn("font-medium", mutedText)}>{SLOT_LABEL[slot]} · </span>
          {renderMealLine(mealText)}
        </div>
        {hasRecipe && (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 mt-0.5 shrink-0 transition-transform opacity-60",
              mutedText,
              open && "rotate-180",
            )}
          />
        )}
      </div>

      {hasRecipe && open && (
        <div className={cn("rounded-md mt-1 mb-1 px-3 py-2.5 space-y-2.5 border", recipeSurface, introBorder)}>
          {recipe!.ingredients?.length > 0 && (
            <div>
              <div className={cn("flex items-center gap-1 text-[10px] uppercase tracking-wider mb-1.5", subtleText)}>
                <Carrot className="h-2.5 w-2.5" /> Ingredients
              </div>
              <div className="flex flex-wrap gap-1">
                {recipe!.ingredients.map(ing => {
                  const excluded = excludeSet.has(ing.toLowerCase().trim().replace(/s$/, ""));
                  return (
                    <button
                      key={ing}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleWord(ing); }}
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                        excluded
                          ? "bg-destructive/15 text-destructive border-destructive/40 line-through"
                          : isDark
                            ? "bg-white/5 text-white/80 border-white/10 hover:border-destructive/40"
                            : "bg-black/5 text-black/75 border-black/10 hover:border-destructive/40",
                      )}
                    >
                      {ing}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {recipe!.recipe && (
            <div>
              <div className={cn("flex items-center gap-1 text-[10px] uppercase tracking-wider mb-1", subtleText)}>
                <Utensils className="h-2.5 w-2.5" /> How to make it
              </div>
              <p className={cn("text-[11.5px] leading-relaxed", isDark ? "text-white/80" : "text-black/75")}>
                {recipe!.recipe}
              </p>
            </div>
          )}

          {/* Swap controls */}
          {swapEnabled && (
            <div className="pt-1">
              {!swapOpen ? (
                <button
                  type="button"
                  onClick={openSwap}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                    isDark
                      ? "border-primary/30 text-primary hover:bg-primary/10"
                      : "border-primary/40 text-primary hover:bg-primary/10",
                  )}
                >
                  <Replace className="h-3 w-3" /> Swap this meal
                </button>
              ) : (
                <div className={cn("rounded-md p-3 space-y-2.5 border", swapSurface)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn("text-[10px] uppercase tracking-wider font-medium", subtleText)}>
                      Want a different meal?
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSwapOpen(false); }}
                      className={cn("opacity-60 hover:opacity-100", mutedText)}
                      aria-label="Cancel swap"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Tap-to-mark from current ingredients */}
                  {recipe!.ingredients?.length > 0 && (
                    <div>
                      <div className={cn("text-[10px] mb-1.5", subtleText)}>
                        Optional — tap any ingredient you want to avoid (or just hit "Find alternatives" below):
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {recipe!.ingredients.map(ing => {
                          const marked = unavailable.some(u => u.toLowerCase() === ing.toLowerCase());
                          return (
                            <button
                              key={`u-${ing}`}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleUnavailable(ing); }}
                              className={cn(
                                "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                                marked
                                  ? "bg-destructive/20 text-destructive border-destructive/50"
                                  : isDark
                                    ? "bg-white/5 text-white/80 border-white/10 hover:border-destructive/40"
                                    : "bg-black/5 text-black/75 border-black/10 hover:border-destructive/40",
                              )}
                            >
                              {ing}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Custom add */}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addCustom(); }
                      }}
                      placeholder="Add another ingredient (e.g. quinoa)"
                      className={cn(
                        "flex-1 text-[11px] px-2 py-1 rounded-md border bg-transparent outline-none",
                        isDark ? "border-white/15 placeholder:text-white/40" : "border-black/15 placeholder:text-black/40",
                      )}
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); addCustom(); }}
                      className={cn(
                        "text-[11px] px-2 py-1 rounded-md border inline-flex items-center gap-1",
                        isDark ? "border-white/15 hover:bg-white/5" : "border-black/15 hover:bg-black/5",
                      )}
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>

                  {unavailable.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {unavailable.map(u => (
                        <span
                          key={`tag-${u}`}
                          className="text-[10.5px] px-2 py-0.5 rounded-full border border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-1"
                        >
                          {u}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleUnavailable(u); }}
                            aria-label={`Remove ${u}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Optional note */}
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Optional: tell Logan what you'd prefer (e.g. lighter, more protein, no fish)"
                    className={cn(
                      "w-full text-[11px] px-2 py-1 rounded-md border bg-transparent outline-none",
                      isDark ? "border-white/15 placeholder:text-white/40" : "border-black/15 placeholder:text-black/40",
                    )}
                  />

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); findAlternatives(); }}
                    disabled={loadingOptions}
                    className={cn(
                      "w-full text-[11.5px] px-3 py-1.5 rounded-md font-medium inline-flex items-center justify-center gap-1.5 transition-colors",
                      "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    {loadingOptions ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Finding alternatives…</>
                    ) : (
                      <><Sparkles className="h-3 w-3" /> Find alternative meals</>
                    )}
                  </button>

                  {/* Options */}
                  {options && options.length === 0 && !loadingOptions && (
                    <p className={cn("text-[11px] italic", subtleText)}>
                      Couldn't find alternatives. Try adjusting your ingredients.
                    </p>
                  )}

                  {options && options.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className={cn("text-[10px] uppercase tracking-wider", subtleText)}>
                        Pick one to replace this meal:
                      </div>
                      {options.map((opt, idx) => {
                        const isApplying = applyingIdx === idx;
                        const isApplied = appliedIdx === idx;
                        return (
                          <div
                            key={`${opt.name}-${idx}`}
                            className={cn(
                              "rounded-md border p-2.5 space-y-1.5",
                              isDark ? "bg-white/[0.03] border-white/10" : "bg-white border-black/10",
                            )}
                          >
                            <div className="text-[12px] font-semibold leading-tight">{opt.name}</div>
                            {opt.ingredients?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {opt.ingredients.map(i => (
                                  <span
                                    key={`${idx}-${i}`}
                                    className={cn(
                                      "text-[10.5px] px-1.5 py-0.5 rounded-full border",
                                      isDark ? "bg-white/5 text-white/70 border-white/10" : "bg-black/5 text-black/70 border-black/10",
                                    )}
                                  >
                                    {i}
                                  </span>
                                ))}
                              </div>
                            )}
                            {opt.recipe && (
                              <p className={cn("text-[11px] leading-relaxed", isDark ? "text-white/75" : "text-black/70")}>
                                {opt.recipe}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); useOption(idx); }}
                              disabled={isApplying || appliedIdx !== null}
                              className={cn(
                                "text-[11px] px-2.5 py-1 rounded-md font-medium inline-flex items-center gap-1 transition-colors",
                                isApplied
                                  ? "bg-primary/15 text-primary border border-primary/30"
                                  : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
                              )}
                            >
                              {isApplied ? (
                                <><Check className="h-3 w-3" /> Saved</>
                              ) : isApplying ? (
                                <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                              ) : (
                                <>Use this meal</>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// GroceryListCard — categorized, prettier weekly grocery layout
// ──────────────────────────────────────────────────────────────────────────
interface GroceryListCardProps {
  week: WeekBlock;
  excludeSet: Set<string>;
  toggleWord: (raw: string) => void;
  cardSurface: string;
  chipMuted: string;
  mutedText: string;
  isDark: boolean;
}

const CATEGORY_RULES: { name: string; emoji: string; match: RegExp }[] = [
  { name: "Produce", emoji: "🥬", match: /\b(spinach|kale|lettuce|arugula|chard|broccoli|cauliflower|cabbage|carrot|celery|onion|shallot|garlic|leek|tomato|cucumber|pepper|bell pepper|zucchini|squash|sweet potato|potato|beet|radish|mushroom|asparagus|green bean|pea|corn|avocado|lemon|lime|orange|apple|banana|berry|berries|strawberr|blueberr|raspberr|blackberr|grape|melon|peach|plum|pear|pineapple|mango|kiwi|herb|parsley|cilantro|basil|mint|dill|rosemary|thyme|sage|ginger|chili|fennel|artichoke|brussels|eggplant)\b/i },
  { name: "Protein", emoji: "🍗", match: /\b(chicken|turkey|beef|lamb|pork|bacon|sausage|salmon|tuna|cod|sardine|mackerel|trout|shrimp|prawn|fish|egg|tofu|tempeh|lentil|chickpea|bean|black bean|kidney bean|edamame)\b/i },
  { name: "Dairy & alternatives", emoji: "🥛", match: /\b(milk|yogurt|cheese|feta|parmesan|cheddar|mozzarella|ricotta|cottage cheese|butter|cream|kefir|almond milk|oat milk|soy milk|coconut milk)\b/i },
  { name: "Pantry & grains", emoji: "🌾", match: /\b(rice|quinoa|oat|oats|barley|farro|bulgur|couscous|pasta|noodle|bread|tortilla|wrap|cracker|flour|sugar|honey|maple|salt|pepper|spice|cumin|paprika|turmeric|cinnamon|vanilla|baking|yeast|broth|stock|sauce|vinegar|oil|olive oil|tahini|nut butter|peanut butter|almond butter|seed|chia|flax|pumpkin seed|sunflower seed|sesame|walnut|almond|cashew|pecan|pistachio|hazelnut|raisin|date|granola)\b/i },
];

function categorize(items: string[]) {
  const buckets = new Map<string, string[]>();
  const order = [...CATEGORY_RULES.map(r => r.name), "Other"];
  order.forEach(o => buckets.set(o, []));
  for (const item of items) {
    const rule = CATEGORY_RULES.find(r => r.match.test(item));
    const key = rule?.name ?? "Other";
    buckets.get(key)!.push(item);
  }
  return order
    .map(name => ({
      name,
      emoji: CATEGORY_RULES.find(r => r.name === name)?.emoji ?? "🧂",
      items: buckets.get(name) ?? [],
    }))
    .filter(b => b.items.length > 0);
}

function GroceryListCard({
  week, excludeSet, toggleWord, cardSurface, chipMuted, mutedText, isDark,
}: GroceryListCardProps) {
  const categories = useMemo(() => categorize(week.grocery_list), [week.grocery_list]);
  const totalCount = week.grocery_list.length;

  return (
    <div className={cn("rounded-xl border overflow-hidden", cardSurface)}>
      <div className={cn(
        "px-4 py-3 border-b flex items-center justify-between gap-3",
        isDark ? "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-white/10" : "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-black/10",
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center",
            isDark ? "bg-primary/20" : "bg-primary/15",
          )}>
            <ShoppingBasket className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Week {week.week_number} grocery list</div>
            <div className={cn("text-[10px] uppercase tracking-wider", mutedText)}>
              {totalCount} item{totalCount === 1 ? "" : "s"} · {categories.length} categor{categories.length === 1 ? "y" : "ies"}
            </div>
          </div>
        </div>
      </div>

      {week.phase_summary && (
        <p className={cn("text-[11px] italic px-4 pt-3", mutedText)}>{week.phase_summary}</p>
      )}

      <div className="p-4 space-y-3.5">
        {categories.map(cat => (
          <div key={cat.name}>
            <div className={cn("flex items-center gap-1.5 mb-1.5 text-[10.5px] uppercase tracking-wider font-medium", mutedText)}>
              <span aria-hidden>{cat.emoji}</span>
              <span>{cat.name}</span>
              <span className="opacity-50">· {cat.items.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cat.items.map(item => {
                const excluded = excludeSet.has(item.toLowerCase().trim().replace(/s$/, ""));
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleWord(item)}
                    className={cn(
                      "text-[11.5px] px-2.5 py-1 rounded-full border transition-all cursor-pointer",
                      excluded
                        ? "bg-destructive/15 text-destructive border-destructive/40 line-through"
                        : cn(chipMuted, "hover:border-primary/50 hover:text-primary"),
                    )}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
