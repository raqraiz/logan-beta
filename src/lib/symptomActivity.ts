import { supabase } from "@/integrations/supabase/client";

/**
 * Admin-only: symptom-log timestamps per user, never symptom content.
 * Admins have no direct read on symptom_logs; this goes through
 * admin_symptom_log_activity().
 */
export async function fetchSymptomActivity(fromIso?: string | null, toIso?: string | null) {
  const out: { user_id: string; created_at: string; logged_at: string }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc("admin_symptom_log_activity", { _from: fromIso ?? undefined, _to: toIso ?? undefined })
      .range(from, from + PAGE - 1);
    if (error) { console.error("symptom activity", error); break; }
    const rows = (data ?? []) as { user_id: string; logged_at: string }[];
    for (const r of rows) out.push({ user_id: r.user_id, logged_at: r.logged_at, created_at: r.logged_at });
    if (rows.length < PAGE) break;
  }
  return out;
}
