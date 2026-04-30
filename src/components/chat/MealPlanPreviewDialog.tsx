import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, ShoppingBasket, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface MealDay {
  day_number: number;
  cycle_day: number;
  phase: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  snack: string;
  hormone_focus?: string;
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
  onDownload: () => void;
  downloading: boolean;
}

// Phase chip colors per theme mode (independent of app theme so toggle is meaningful)
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

export function MealPlanPreviewDialog({ open, onOpenChange, title, preview, previewUrl, previewLoading, onDownload, downloading }: Props) {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const days = preview?.days ?? [];
  const weeks = preview?.weeks ?? [];
  const hasStructuredPreview = days.length > 0;

  const isDark = mode === "dark";

  // Themed surface classes for preview content (independent of app theme)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed pt-1">
                {preview?.intro || "Preview your meal plan before downloading the PDF."}
              </DialogDescription>
            </div>
            {/* Light/Dark mode toggle for the PDF preview */}
            <div className="shrink-0 inline-flex items-center rounded-full border border-border/40 bg-card/40 p-0.5 mr-8">
              <button
                type="button"
                onClick={() => setMode("dark")}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  isDark ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={isDark}
                aria-label="Preview in dark mode"
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
                aria-label="Preview in light mode"
              >
                <Sun className="h-3 w-3" /> Light
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {hasStructuredPreview ? (
            <div className={cn("rounded-xl border p-4 space-y-4 transition-colors", surface)}>
              {/* Themed intro inside the preview canvas */}
              {preview?.intro && (
                <p className={cn("text-xs leading-relaxed pb-3 border-b italic", mutedText, introBorder)}>
                  {preview.intro}
                </p>
              )}

              <div className="space-y-3">
                {days.map(d => (
                  <div key={d.day_number} className={cn("rounded-xl border p-3", cardSurface)}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">
                        Day {d.day_number}
                        <span className={cn("text-xs font-normal ml-2", mutedText)}>
                          Cycle day {d.cycle_day}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
                          PHASE_CHIP[mode][d.phase] ?? chipMuted,
                        )}
                      >
                        {d.phase}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div><span className={mutedText}>Breakfast · </span><span>{d.breakfast}</span></div>
                      <div><span className={mutedText}>Lunch · </span><span>{d.lunch}</span></div>
                      <div><span className={mutedText}>Dinner · </span><span>{d.dinner}</span></div>
                      <div><span className={mutedText}>Snack · </span><span>{d.snack}</span></div>
                    </div>
                    {d.hormone_focus && (
                      <div className={cn("text-[11px] italic mt-2 pt-2 border-t", subtleText, introBorder)}>
                        {d.hormone_focus}
                      </div>
                    )}
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
                        {w.grocery_list.map(item => (
                          <span key={item} className={cn("text-[11px] px-2 py-0.5 rounded-full border", chipMuted)}>
                            {item}
                          </span>
                        ))}
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
                <div className="flex flex-col">
                  <object
                    data={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                    type="application/pdf"
                    className="h-[60vh] w-full bg-background"
                  >
                    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        Your browser can't preview PDFs inline.
                      </p>
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline underline-offset-2"
                      >
                        Open PDF in a new tab
                      </a>
                    </div>
                  </object>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 self-end text-xs text-primary/80 hover:text-primary underline underline-offset-2"
                  >
                    Open in new tab ↗
                  </a>
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  Preview is still getting ready. Try again in a moment.
                </div>
              )}
            </div>
          )}

          <Button
            onClick={onDownload}
            disabled={downloading}
            variant="premium"
            className="w-full sticky bottom-0"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download {isDark ? "Dark" : "Light"} PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
