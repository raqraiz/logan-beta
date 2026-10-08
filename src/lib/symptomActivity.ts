import { supabase } from "@/integrations/supabase/client";

/**
 * Admin-only: daily symptom-log totals (logs and distinct women per UTC day).
 * Never user IDs, never symptom content. Goes through admin_symptom_log_activity().
 */
export interface SymptomDailyTotal {
  day: string;
  logs: number;
  women: number;
}

export async function fetchSymptomDailyTotals(fromIso?: string | null, toIso?: string | null): Promise<SymptomDailyTotal[]> {
  const { data, error } = await (supabase as any)
    .rpc("admin_symptom_log_activity", { _from: fromIso ?? undefined, _to: toIso ?? undefined });
  if (error) { console.error("symptom activity", error); return []; }
  return ((data ?? []) as any[])
    .filter((r) => typeof r.day === "string")
    .map((r) => ({ day: r.day, logs: Number(r.logs) || 0, women: Number(r.women) || 0 }));
}

/**
 * Per-user symptom activity is no longer available to admins (privacy), so
 * per-user dashboards (sessions, retention, referral activity) no longer count
 * symptom logs. Kept so existing callers keep working; always returns no rows.
 * Use fetchSymptomDailyTotals for totals.
 */
export async function fetchSymptomActivity(_fromIso?: string | null, _toIso?: string | null) {
  return [] as { user_id: string; created_at: string; logged_at: string }[];
}
