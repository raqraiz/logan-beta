import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_GAP_MS = 30 * 60 * 1000; // 30-minute inactivity = new session
const SESSIONS_PER_PROMPT = 15;
const MIN_DAYS_BETWEEN_PROMPTS = 7;

/**
 * Shows a lightweight in-chat feedback prompt after every 15 completed chat
 * sessions, at most once every 7 days. State (last shown / dismissed / session
 * count) is persisted server-side in `feedback_prompt_state`.
 */
export function useFeedbackPrompt(userId?: string) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const { data: state } = await supabase
        .from("feedback_prompt_state")
        .select("last_shown_at, last_dismissed_at, sessions_since_shown")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;

      const lastTouched = state?.last_dismissed_at || state?.last_shown_at;
      if (lastTouched) {
        const daysSince = (Date.now() - new Date(lastTouched).getTime()) / 86400000;
        if (daysSince < MIN_DAYS_BETWEEN_PROMPTS) return;
      }

      const { data, error } = await supabase
        .from("chat_messages")
        .select("created_at")
        .eq("user_id", userId)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .limit(5000);

      if (error || !data || cancelled) return;

      let sessions = 0;
      let prevTs = 0;
      for (const row of data) {
        const ts = new Date(row.created_at as string).getTime();
        if (!prevTs || ts - prevTs > SESSION_GAP_MS) sessions += 1;
        prevTs = ts;
      }

      // New users never see it
      if (sessions < SESSIONS_PER_PROMPT) return;

      const milestone = Math.floor(sessions / SESSIONS_PER_PROMPT) * SESSIONS_PER_PROMPT;
      if ((state?.sessions_since_shown ?? -1) === milestone) return;

      await supabase.from("feedback_prompt_state").upsert(
        {
          user_id: userId,
          last_shown_at: new Date().toISOString(),
          sessions_since_shown: milestone,
        },
        { onConflict: "user_id" },
      );

      if (!cancelled) setVisible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (!userId) return;
    void supabase
      .from("feedback_prompt_state")
      .upsert(
        { user_id: userId, last_dismissed_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  }, [userId]);

  return { showFeedbackPrompt: visible, dismissFeedbackPrompt: dismiss };
}
