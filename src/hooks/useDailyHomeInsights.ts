import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DailyInsightContext {
  userId?: string;
  lifeStage?: string;
  phase?: string;
  cycleDay?: number;
  cycleLengthDays?: number;
  postpartumPhase?: string;
  postpartumWeeks?: number | null;
  anchorSymptom?: string | null;
  /** When false the hook never calls the model (e.g. postpartum with no birth date). */
  enabled: boolean;
}

export interface DailyInsights {
  succeed: string[];
  dontMessUp: string[];
  /** Partner-facing lists from the same generation call; empty means fall back to static. */
  succeedPartner: string[];
  dontMessUpPartner: string[];
  /** Her-voice versions of the top 2 partner succeed tips / top 1 don't tip (verb kept, no "Don't"). */
  helpMe: string[];
  dontMe: string[];
}

function localDateKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

function buildContextKey(ctx: DailyInsightContext): string {
  return [
    ctx.lifeStage ?? "cycling",
    ctx.phase ?? "",
    ctx.cycleDay ?? "",
    ctx.cycleLengthDays ?? "",
    ctx.postpartumPhase ?? "",
    ctx.postpartumWeeks ?? "",
    ctx.anchorSymptom ?? "",
  ].join("|");
}

/**
 * HER-facing "How to succeed today" / "How not to mess up today" copy.
 * Cached one row per user per local calendar day; regenerated (and upserted
 * over the same day's row) whenever the context key changes.
 * Returns null while loading or when generation isn't possible — callers fall
 * back to the static tip arrays.
 */
export function useDailyHomeInsights(ctx: DailyInsightContext) {
  const [insights, setInsights] = useState<DailyInsights | null>(null);
  const [loading, setLoading] = useState(false);

  const userId = ctx.userId;
  const enabled = ctx.enabled;
  const contextKey = buildContextKey(ctx);

  useEffect(() => {
    if (!userId || !enabled) {
      setInsights(null);
      return;
    }
    let cancelled = false;
    const localDate = localDateKey();

    (async () => {
      setLoading(true);
      try {
        const { data: row } = await supabase
          .from("daily_home_insights")
          .select("succeed_text, dont_mess_up_text, succeed_partner_text, dont_mess_up_partner_text, help_me_text, dont_me_text, context_key")
          .eq("user_id", userId)
          .eq("local_date", localDate)
          .maybeSingle();

        if (row && row.context_key === contextKey) {
          if (!cancelled) {
            setInsights({
              succeed: String(row.succeed_text).split("\n").filter(Boolean),
              dontMessUp: String(row.dont_mess_up_text).split("\n").filter(Boolean),
              succeedPartner: String(row.succeed_partner_text ?? "").split("\n").filter(Boolean),
              dontMessUpPartner: String(row.dont_mess_up_partner_text ?? "").split("\n").filter(Boolean),
              helpMe: String(row.help_me_text ?? "").split("\n").filter(Boolean),
              dontMe: String(row.dont_me_text ?? "").split("\n").filter(Boolean),
            });
          }
          return;
        }

        const { data, error } = await supabase.functions.invoke("generate-daily-insights", {
          body: {
            localDate,
            contextKey,
            lifeStage: ctx.lifeStage,
            phase: ctx.phase,
            cycleDay: ctx.cycleDay,
            cycleLengthDays: ctx.cycleLengthDays,
            postpartumPhase: ctx.postpartumPhase,
            postpartumWeeks: ctx.postpartumWeeks,
            anchorSymptom: ctx.anchorSymptom,
          },
        });

        if (cancelled) return;
        if (error || !data?.succeed?.length || !data?.dontMessUp?.length) {
          setInsights(null);
          return;
        }
        setInsights({
          succeed: data.succeed,
          dontMessUp: data.dontMessUp,
          succeedPartner: Array.isArray(data.succeedPartner) ? data.succeedPartner : [],
          dontMessUpPartner: Array.isArray(data.dontMessUpPartner) ? data.dontMessUpPartner : [],
          helpMe: Array.isArray(data.helpMe) ? data.helpMe : [],
          dontMe: Array.isArray(data.dontMe) ? data.dontMe : [],
        });
      } catch {
        if (!cancelled) setInsights(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, enabled, contextKey]);

  return { insights, loading };
}
