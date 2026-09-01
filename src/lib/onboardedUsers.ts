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

/**
 * Total number of onboarded users (all time).
 * Uses the `count_onboarded_users` security-definer RPC: the view is
 * security_invoker, so counting through it re-evaluates the chat_messages
 * admin RLS check per row (~26k rows) and is orders of magnitude slower.
 */
export const countOnboardedUsers = async (): Promise<number> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("count_onboarded_users");
  if (error) throw error;
  if (data === null || data === undefined) throw new Error("Not authorized to count users");
  return Number(data);
};

