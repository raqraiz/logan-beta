import { supabase } from "@/integrations/supabase/client";

export type InsightAction = "shown" | "confirmed" | "not_confirmed" | "corrected" | "dismissed";

const shownThisSession = new Set<string>();
const PENDING_KEY = "logan.insightCorrection";
export const CORRECTION_PREFIX = "That's not quite right: ";

/** Records an insight action. No message text is ever stored. */
export async function logInsightAction(userId: string, messageId: string, action: InsightAction, insightType?: string | null) {
  if (action === "shown") {
    if (shownThisSession.has(messageId)) return;
    shownThisSession.add(messageId);
  }
  // "shown" is unique per message in the database; ignore duplicate errors.
  await supabase.from("insight_feedback_events").insert({
    user_id: userId, message_id: messageId, action, insight_type: insightType ?? null,
  });
}

/** Remembers which insight a "Not quite" tap refers to, so the next correction message can be linked. */
export function setPendingCorrection(messageId: string, insightType?: string | null) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ messageId, insightType: insightType ?? null, at: Date.now() }));
}

/** Call when she sends a chat message; records "corrected" if it follows a "Not quite" tap within 15 minutes. */
export function consumePendingCorrection(userId: string, text: string) {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return;
  sessionStorage.removeItem(PENDING_KEY);
  try {
    const p = JSON.parse(raw) as { messageId: string; insightType: string | null; at: number };
    const changed = text.trim() !== CORRECTION_PREFIX.trim();
    if (changed && Date.now() - p.at < 15 * 60 * 1000) void logInsightAction(userId, p.messageId, "corrected", p.insightType);
  } catch { /* ignore */ }
}
