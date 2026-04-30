import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, ShoppingBasket } from "lucide-react";
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

const PHASE_COLOR: Record<string, string> = {
  Menstruation: "text-[hsl(354,73%,60%)] border-[hsl(354,73%,60%)]/30 bg-[hsl(354,73%,60%)]/10",
  Follicular: "text-[hsl(155,55%,49%)] border-[hsl(155,55%,49%)]/30 bg-[hsl(155,55%,49%)]/10",
  Ovulation: "text-[hsl(40,80%,55%)] border-[hsl(40,80%,55%)]/30 bg-[hsl(40,80%,55%)]/10",
  Luteal: "text-[hsl(270,55%,63%)] border-[hsl(270,55%,63%)]/30 bg-[hsl(270,55%,63%)]/10",
};

export function MealPlanPreviewDialog({ open, onOpenChange, title, preview, previewUrl, previewLoading, onDownload, downloading }: Props) {
  const days = preview?.days ?? [];
  const weeks = preview?.weeks ?? [];
  const hasStructuredPreview = days.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed pt-1">
            {preview?.intro || "Preview your meal plan before downloading the PDF."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Days */}
          {hasStructuredPreview ? (
            <div className="space-y-3">
              {days.map(d => (
              <div
                key={d.day_number}
                className="rounded-xl border border-border/40 bg-card/40 p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-foreground">
                    Day {d.day_number}
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      Cycle day {d.cycle_day}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
                      PHASE_COLOR[d.phase] ?? "text-muted-foreground border-border/40 bg-muted/20",
                    )}
                  >
                    {d.phase}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div><span className="text-muted-foreground">Breakfast · </span><span className="text-foreground">{d.breakfast}</span></div>
                  <div><span className="text-muted-foreground">Lunch · </span><span className="text-foreground">{d.lunch}</span></div>
                  <div><span className="text-muted-foreground">Dinner · </span><span className="text-foreground">{d.dinner}</span></div>
                  <div><span className="text-muted-foreground">Snack · </span><span className="text-foreground">{d.snack}</span></div>
                </div>
                {d.hormone_focus && (
                  <div className="text-[11px] text-muted-foreground/80 italic mt-2 pt-2 border-t border-border/30">
                    {d.hormone_focus}
                  </div>
                )}
              </div>
              ))}
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

          {/* Grocery lists */}
          {hasStructuredPreview && weeks.length > 0 && (
            <div className="space-y-3">
              {weeks.map(w => (
                <div key={w.week_number} className="rounded-xl border border-border/40 bg-card/40 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ShoppingBasket className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      Week {w.week_number} grocery list
                    </span>
                  </div>
                  {w.phase_summary && (
                    <p className="text-[11px] text-muted-foreground mb-2 italic">{w.phase_summary}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {w.grocery_list.map(item => (
                      <span
                        key={item}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border/30"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={onDownload}
            disabled={downloading}
            variant="premium"
            className="w-full sticky bottom-0"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
