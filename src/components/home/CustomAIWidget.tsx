import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw } from "lucide-react";

interface CustomAIWidgetProps {
  title: string;
  prompt: string;
  phase: string;
  cycleDay: number;
  cycleLengthDays: number;
}

export function CustomAIWidget({ title, prompt, phase, cycleDay, cycleLengthDays }: CustomAIWidgetProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-widget", {
        body: { prompt, phase, cycleDay, cycleLengthDays },
      });
      if (fnError) throw fnError;
      setContent(data?.content || "No insight available.");
    } catch (e: any) {
      console.error("Custom widget error:", e);
      setError("Couldn't generate insight right now.");
    } finally {
      setLoading(false);
    }
  }, [prompt, phase, cycleDay, cycleLengthDays]);

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

  return (
    <div
      className={`w-full text-left rounded-xl border border-border/30 border-l-2 ${borderColor}
        bg-card/40 backdrop-blur-sm p-3.5 transition-all duration-200 ${glow}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            {title}
          </span>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors disabled:opacity-30"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex gap-1.5 items-center">
          <div className="h-2 w-2 rounded-full bg-primary/30 animate-pulse" />
          <div className="h-2 w-2 rounded-full bg-primary/30 animate-pulse [animation-delay:150ms]" />
          <div className="h-2 w-2 rounded-full bg-primary/30 animate-pulse [animation-delay:300ms]" />
        </div>
      ) : error ? (
        <p className="text-[13px] text-muted-foreground/60 leading-relaxed">{error}</p>
      ) : (
        <p className="text-[13px] text-foreground/85 leading-relaxed">{content}</p>
      )}
    </div>
  );
}
