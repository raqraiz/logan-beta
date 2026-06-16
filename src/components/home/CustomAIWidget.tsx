import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw } from "lucide-react";
import { MiniPhaseArc, CustomWidgetGraphic } from "@/components/home/WidgetGraphics";

interface CustomAIWidgetProps {
  title: string;
  prompt: string;
  phase: string;
  cycleDay: number;
  cycleLengthDays: number;
  targetUserId?: string;
  lifeStage?: "cycling" | "irregular" | "postpartum" | "menopause";
  postpartumStartDate?: string;
  postpartumActive?: boolean;
}

export function CustomAIWidget({
  title,
  prompt,
  phase,
  cycleDay,
  cycleLengthDays,
  targetUserId,
  lifeStage,
  postpartumStartDate,
  postpartumActive,
}: CustomAIWidgetProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-widget", {
        body: { prompt, phase, cycleDay, cycleLengthDays, targetUserId, lifeStage, postpartumStartDate, postpartumActive },
      });
      if (fnError) throw fnError;
      setContent(data?.content || "No insight available.");
    } catch (e: any) {
      console.error("Custom widget error:", e);
      setError("Couldn't generate insight right now.");
    } finally {
      setLoading(false);
    }
  }, [prompt, phase, cycleDay, cycleLengthDays, targetUserId, lifeStage, postpartumStartDate, postpartumActive]);

  useEffect(() => {
    generate();
  }, [generate]);

  const PHASE_BORDER: Record<string, string> = {
    Menstruation: "border-l-phase-menstruation",
    Follicular: "border-l-phase-follicular",
    Ovulation: "border-l-phase-ovulation",
    Luteal: "border-l-phase-luteal",
  };

  const PHASE_GLOW: Record<string, string> = {
    Menstruation: "shadow-[0_0_20px_-6px_hsl(355,78%,60%,0.15)]",
    Follicular: "shadow-[0_0_20px_-6px_hsl(152,60%,52%,0.15)]",
    Ovulation: "shadow-[0_0_20px_-6px_hsl(40,90%,56%,0.15)]",
    Luteal: "shadow-[0_0_20px_-6px_hsl(270,60%,65%,0.15)]",
  };

  const borderColor = PHASE_BORDER[phase] || "border-l-primary";
  const glow = PHASE_GLOW[phase] || "";

  const PHASE_BG_ACCENT: Record<string, string> = {
    Menstruation: "from-phase-menstruation/8 to-transparent",
    Follicular: "from-phase-follicular/8 to-transparent",
    Ovulation: "from-phase-ovulation/8 to-transparent",
    Luteal: "from-phase-luteal/8 to-transparent",
  };

  const bgAccent = PHASE_BG_ACCENT[phase] || "from-primary/5 to-transparent";

  return (
    <div
      className={`w-full text-left rounded-2xl border border-border/30 border-l-2 ${borderColor}
        bg-card overflow-hidden transition-colors duration-200 ${glow} relative`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${bgAccent} pointer-events-none`} />

      <div className="relative px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary/60" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {title}
            </span>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors disabled:opacity-30"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex gap-1.5 items-center py-3">
            <div className="h-2 w-2 rounded-full bg-primary/30 animate-pulse" />
            <div className="h-2 w-2 rounded-full bg-primary/30 animate-pulse [animation-delay:150ms]" />
            <div className="h-2 w-2 rounded-full bg-primary/30 animate-pulse [animation-delay:300ms]" />
          </div>
        ) : error ? (
          <p className="text-[14px] text-muted-foreground/70 leading-snug">{error}</p>
        ) : (
          <p className="text-[15px] text-foreground/90 leading-snug font-medium">{content}</p>
        )}
      </div>
    </div>
  );
}
