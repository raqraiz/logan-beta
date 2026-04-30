import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, ShoppingBasket, Moon, Sun, ThumbsUp, ThumbsDown, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  preview: PreviewData | null;
  previewUrl?: string | null;
  previewLoading?: boolean;
  onReact?: (reaction: "up" | "down") => Promise<void> | void;
  onRefine?: (args: { excludeIngredients: string[]; feedbackText: string }) => Promise<void> | void;
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
  onReact, onRefine, refining = false, initialReaction = null,
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
            <div className="shrink-0 inline-flex items-center rounded-full border border-border/40 bg-card/40 p-0.5 mr-8">
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
                        <div className="grid grid-cols-1 gap-y-1.5 text-xs leading-relaxed">
                          <div><span className={mutedText}>Breakfast · </span>{renderMealLine(d.breakfast)}</div>
                          <div><span className={mutedText}>Lunch · </span>{renderMealLine(d.lunch)}</div>
                          <div><span className={mutedText}>Dinner · </span>{renderMealLine(d.dinner)}</div>
                          <div><span className={mutedText}>Snack · </span>{renderMealLine(d.snack)}</div>
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
                    <div key={w.week_number} className={cn("rounded-xl border p-3", cardSurface)}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <ShoppingBasket className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold">
                          Week {w.week_number} grocery list
                        </span>
                      </div>
                      {w.phase_summary && (
                        <p className={cn("text-[11px] mb-2 italic", mutedText)}>{w.phase_summary}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {w.grocery_list.map(item => {
                          const excluded = excludeSet.has(normalize(item));
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => toggleWord(item)}
                              className={cn(
                                "text-[11px] px-2 py-0.5 rounded-full border transition-all cursor-pointer",
                                excluded
                                  ? "bg-destructive/15 text-destructive border-destructive/40 line-through"
                                  : cn(chipMuted, "hover:border-destructive/50"),
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

          <Button
            onClick={onDownload}
            disabled={downloading || refining}
            variant="premium"
            className="w-full sticky bottom-0"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>

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
