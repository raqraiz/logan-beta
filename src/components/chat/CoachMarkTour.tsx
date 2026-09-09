import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Rect = { top: number; left: number; width: number; height: number };

const STEPS = [
  {
    target: "home",
    text: "Quick tour — tap through. 🏠\n\nHome is your daily check-in — log symptoms, meals, and weight, and see what to expect today.",
  },
  {
    target: "ask",
    text: "Ask is right here — anytime something feels off, ask me. No 3am googling.",
  },
  {
    target: "plan",
    text: "Plan lays out your whole week — mood, workouts, and nutrition, built for exactly where you are.",
  },
] as const;

interface CoachMarkTourProps {
  open: boolean;
  anchorSymptom?: string | null;
  onLogNow: () => void;
  onGoHome: () => void;
  onDismiss: () => void;
}

export function CoachMarkTour({ open, anchorSymptom, onLogNow, onGoHome, onDismiss }: CoachMarkTourProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const measure = useCallback(() => {
    if (!open || step >= STEPS.length) return;
    const el = document.querySelector(`[data-tour="${STEPS[step].target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [open, step]);

  useEffect(() => {
    measure();
    const id = window.setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [measure]);

  if (!open) return null;

  const isFinal = step >= STEPS.length;

  if (isFinal) {
    return (
      <Dialog open onOpenChange={(v) => { if (!v) onDismiss(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium leading-relaxed text-left">
              {anchorSymptom
                ? `You told me ${anchorSymptom.toLowerCase()} is the one to watch. Want to log today's now, so I can start finding your pattern?`
                : "Want to log how you're feeling today, so I can start finding your pattern?"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={onLogNow}>Log it now</Button>
            <Button variant="secondary" onClick={onGoHome}>Take me to Home</Button>
            <Button variant="ghost" onClick={onDismiss}>Later</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const pad = 8;
  const hole = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const tooltipBottom = hole ? window.innerHeight - hole.top + 12 : 96;

  return (
    <div
      className="fixed inset-0 z-[80]"
      onClick={() => setStep((s) => s + 1)}
      role="dialog"
      aria-modal="true"
    >
      {hole ? (
        <div
          className="absolute rounded-2xl pointer-events-none transition-all duration-300"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            borderRadius: STEPS[step].target === "ask" ? 9999 : undefined,
            boxShadow: "0 0 0 9999px hsl(240 10% 4% / 0.82), 0 0 24px -2px hsl(var(--primary) / 0.7)",
            border: "1.5px solid hsl(var(--primary))",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-background/85" />
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Skip tour"
        className="absolute top-4 right-4 p-2 rounded-full bg-card/80 border border-border/50 text-muted-foreground hover:text-foreground"
      >
        <X className="w-4 h-4" />
      </button>

      <div
        className="absolute left-4 right-4 max-w-sm mx-auto rounded-2xl border border-border/60 bg-card p-4 shadow-elevated animate-fade-in"
        style={{ bottom: tooltipBottom }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{STEPS[step].text}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{step + 1} of {STEPS.length}</span>
          <Button size="sm" onClick={() => setStep((s) => s + 1)}>
            {step === STEPS.length - 1 ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
