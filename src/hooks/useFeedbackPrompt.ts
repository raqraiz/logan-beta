import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_GAP_MS = 30 * 60 * 1000; // 30-minute inactivity = new session
const SESSIONS_PER_PROMPT = 15;
const MIN_DAYS_BETWEEN_PROMPTS = 7;

type State = { lastShownAt?: string; lastPromptedSessionCount?: number };

const storageKey = (userId: string) => `logan_feedback_prompt_${userId}`;

function readState(userId: string): State {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) || "{}");
  } catch {
    return {};
  }
}

function writeState(userId: string, state: State) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * Shows a lightweight in-chat feedback prompt after every 15 completed chat
 * sessions, at most once every 7 days. Dismissal is remembered per user and
 * the prompt never re-appears in the same session once dismissed.
 */
export function useFeedbackPrompt(userId?: string) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const state = readState(userId);

      if (state.lastShownAt) {
        const daysSince =
          (Date.now() - new Date(state.lastShownAt).getTime()) / 86400000;
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

      const milestone =
        Math.floor(sessions / SESSIONS_PER_PROMPT) * SESSIONS_PER_PROMPT;
      if (state.lastPromptedSessionCount === milestone) return;

      writeState(userId, {
        lastShownAt: new Date().toISOString(),
        lastPromptedSessionCount: milestone,
      });
      setVisible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismiss = useCallback(() => setVisible(false), []);

  return { showFeedbackPrompt: visible, dismissFeedbackPrompt: dismiss };
}
