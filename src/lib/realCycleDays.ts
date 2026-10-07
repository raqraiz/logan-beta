// Her own symptom stats use her real period dates (cycle_history starts + last_period_start), not stored or estimated cycle days.
import { supabase } from "@/integrations/supabase/client";
import type { LogRow } from "@/lib/patternCycles";

const DAY = 86400000;
/** Her own stats look back 12 months. Together totals keep their own 90-day window server-side. */
export const OWN_LOG_WINDOW_DAYS = 365;
const MAX_CYCLE_DAYS = 60;

const noon = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime();

/** Real period start dates (YYYY-MM-DD), oldest first, deduplicated. */
export async function loadCycleStarts(userId: string): Promise<string[]> {
  const { data: p } = await supabase.from("participants").select("id, last_period_start").eq("user_id", userId).maybeSingle();
  if (!p?.id) return [];
  const { data: hist } = await supabase.from("cycle_history").select("cycle_start_date").eq("participant_id", p.id);
  const all = new Set<string>((hist ?? []).map((h) => h.cycle_start_date));
  if (p.last_period_start) all.add(p.last_period_start);
  return [...all].sort();
}

/** Rewrites cycle_day from the latest real period start on or before each log. Logs more than 60 days after a start get no cycle day. Without any starts, rows are returned unchanged. */
export function withRealCycleDays<T extends LogRow>(rows: T[], starts: string[]): T[] {
  if (!starts.length) return rows;
  const s = starts.map(noon).sort((a, b) => a - b);
  return rows.map((r) => {
    const t = noon(new Date(r.logged_at).toISOString());
    let start: number | null = null;
    for (const x of s) if (x <= t) start = x; else break;
    const day = start === null ? null : Math.round((t - start) / DAY) + 1;
    return { ...r, cycle_day: day !== null && day >= 1 && day <= MAX_CYCLE_DAYS ? day : null };
  });
}
