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
  onDownload: () => void;
  downloading: boolean;
}

const PHASE_COLOR: Record<string, string> = {
  Menstruation: "text-[hsl(354,73%,60%)] border-[hsl(354,73%,60%)]/30 bg-[hsl(354,73%,60%)]/10",
  Follicular: "text-[hsl(155,55%,49%)] border-[hsl(155,55%,49%)]/30 bg-[hsl(155,55%,49%)]/10",
  Ovulation: "text-[hsl(40,80%,55%)] border-[hsl(40,80%,55%)]/30 bg-[hsl(40,80%,55%)]/10",
  Luteal: "text-[hsl(270,55%,63%)] border-[hsl(270,55%,63%)]/30 bg-[hsl(270,55%,63%)]/10",
};

export function MealPlanPreviewDialog({ open, onOpenChange, title, preview, onDownload, downloading }: Props) {
  const days = preview?.days ?? [];
  const weeks = preview?.weeks ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {preview?.intro && (
            <DialogDescription className="text-sm leading-relaxed pt-1">
              {preview.intro}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Days */}
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

          {/* Grocery lists */}
          {weeks.length > 0 && (
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
