import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for the canonical "user" definition used by all
 * admin display/count metrics.
 *
 * Canonical definition: a "user" is a person who has a chat_messages row with
 * metadata->>'onboarding_complete' = 'true'. This mirrors the server-side gate
 * in generate-insight/index.ts and chat-ai/index.ts.
 *
 * Implemented as the `public.onboarded_profiles` view (security_invoker, so it
 * inherits profiles RLS). Every consumer must go through this module — never
 * re-derive the filter inline.
 */
export const ONBOARDED_PROFILES_VIEW = "onboarded_profiles" as const;

/**
 * Query builder over the onboarded-only row-set. Same shape as
 * `supabase.from("profiles")` — all profile columns are present.
 */
// The view is not in the generated Database types, hence the cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onboardedProfiles = () => (supabase as any).from(ONBOARDED_PROFILES_VIEW);

/** Total number of onboarded users (all time). */
export const countOnboardedUsers = async (): Promise<number | null> => {
  const { count, error } = await onboardedProfiles().select("*", { count: "exact", head: true });
  if (error) {
    console.error("countOnboardedUsers failed:", error);
    return null;
  }
  return count ?? null;
};
