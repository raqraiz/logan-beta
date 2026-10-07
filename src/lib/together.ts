import { supabase } from "@/integrations/supabase/client";
import { getAnalyticsConsent } from "@/lib/thirdPartyAnalytics";

export const TOGETHER_CONSENT_VERSION = "together-v1";
export const TOGETHER_CHANGED = "logan:together-consent";
export const TOGETHER_BODY =
  "Together shows what women like you are feeling, so you can see you're not the only one. If you join, the symptoms you log are added to anonymous totals. No one sees your name, your logs or your messages. Numbers only show when at least 10 women share something. You can leave anytime in Settings, and your logs stop counting from that day.";

export type TogetherEvent =
  | "together_consent_shown"
  | "together_consent_yes"
  | "together_consent_not_now"
  | "together_consent_left"
  | "invite_opened"
  | "invite_copied"
  | "invite_shared"
  | "tip_shared"
  | "tip_helped"
  | "tip_reported";

/** Event name only, no content. Respects analytics consent. */
export async function trackTogether(event: TogetherEvent) {
  if (getAnalyticsConsent() !== "granted") return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("feature_events").insert({ user_id: user.id, feature_name: event } as any);
}

export interface TogetherState { consent: boolean; shownAt: string | null }

export async function loadTogether(userId: string): Promise<TogetherState> {
  const { data } = await supabase
    .from("profiles")
    .select("together_consent, together_consent_shown_at")
    .eq("id", userId)
    .maybeSingle();
  const d = data as any;
  return { consent: !!d?.together_consent, shownAt: d?.together_consent_shown_at ?? null };
}

export async function markTogetherShown(userId: string) {
  await supabase.from("profiles").update({ together_consent_shown_at: new Date().toISOString() } as any).eq("id", userId);
}

/** Saves and re-reads; returns true only if the stored value matches. */
export async function setTogetherConsent(userId: string, on: boolean): Promise<boolean> {
  const patch: any = on
    ? { together_consent: true, together_consent_at: new Date().toISOString(), together_consent_version: TOGETHER_CONSENT_VERSION }
    : { together_consent: false };
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) return false;
  const s = await loadTogether(userId);
  const ok = s.consent === on;
  if (ok) globalThis.dispatchEvent(new CustomEvent(TOGETHER_CHANGED));
  return ok;
}
