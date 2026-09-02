import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for the referred-signup population.
 *
 * This is the exact query the Referrals panel ("By referrer" tab) uses:
 * every `profiles` row with a non-null `referred_by`. Any surface that ranks or
 * counts referrals MUST go through here — never write a second independent
 * referral-counting query (that's what caused the Referrals vs. Signup
 * attribution population mismatch).
 *
 * NOTE: this intentionally counts raw profiles, not `onboarded_profiles`. When
 * the Referrals panel switches to the onboarded definition, change it HERE and
 * every consumer follows automatically.
 */
export interface ReferredSignupRow {
  id: string;
  email: string | null;
  created_at: string;
  referred_by: string;
}

export const fetchReferredSignups = async (): Promise<ReferredSignupRow[]> => {
  const { data } = await supabase
    .from("profiles")
    .select("id, email, created_at, referred_by")
    .not("referred_by", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  return (data ?? []) as ReferredSignupRow[];
};

/** referrer user id -> number of signups they brought in. */
export const referralCountsByReferrer = (rows: ReferredSignupRow[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.referred_by, (counts.get(r.referred_by) ?? 0) + 1);
  return counts;
};
