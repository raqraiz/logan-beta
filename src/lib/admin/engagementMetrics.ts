import { onboardedProfiles } from "@/lib/onboardedUsers";
import { utcKey, todayUTCKey, utcDayKeysBetween, toUTCDate, type ActivityIndex } from "@/lib/activeUsers";

/**
 * Shared admin engagement math — the single canonical definition for the
 * "Avg Msgs/User" and "Avg Sessions/User" cards on both the Overview tab and
 * the Investor Summary panel:
 *
 *   avg = (sum over selected range) / (cumulative onboarded users as of range end)
 *
 * The denominator ("users as of range end") comes from the drift-corrected
 * onboarded_profiles logic previously inline in InvestorSummaryPanel — both
 * surfaces now share it by construction.
 */

/**
 * Paged fetch of the UTC signup-day key for every onboarded profile created
 * at or before `snapshotISO` (freeze the read horizon once so paging can't
 * shift while new signups land — pass `new Date().toISOString()` captured a
 * single time). Returns keys sorted ascending.
 */
export const fetchSignupDayKeys = async (snapshotISO: string): Promise<string[]> => {
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await onboardedProfiles()
      .select("created_at, id")
      .lte("created_at", snapshotISO)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error("Signup day keys load failed:", error);
      break;
    }
    const rows = data ?? [];
    for (const r of rows) if (r.created_at) out.push(utcKey(new Date(r.created_at)));
    if (rows.length < 1000) break;
  }
  return out;
};

/**
 * Cumulative onboarded users as of a UTC day key. `signupDays` is the sorted
 * per-day list from fetchSignupDayKeys; any drift between that paged list and
 * the canonical all-time count (count_onboarded_users RPC) is applied from
 * today onwards so "as of today" matches the Total Users card exactly while
 * historical days keep their true per-day cumulative values.
 */
export const makeUsersAsOf =
  (signupDays: string[], canonicalTotal: number | null) =>
  (dayKey: string): number => {
    const drift = canonicalTotal === null ? 0 : canonicalTotal - signupDays.length;
    const today = todayUTCKey();
    return (
      signupDays.reduce((acc, k) => (k <= dayKey ? acc + 1 : acc), 0) +
      (dayKey >= today ? drift : 0)
    );
  };

/**
 * Canonical per-user averages for a selected range. Both values are rounded
 * to one decimal so every surface displays identically. Returns nulls when
 * there are no users as of the range end (matches the "—" display convention).
 */
/**
 * Canonical weekly-active-users average for a selected range, shared by the
 * Overview tab and the Investor Summary panel:
 *
 *   ISO calendar weeks (Monday–Sunday, UTC), distinct active users per week,
 *   averaged across weeks with dayCount === 7 within the range; falls back to
 *   day-weighted partial weeks only if no full week exists in range.
 *
 * Extracted from InvestorSummaryPanel — both surfaces share it by construction.
 */
export const computeAvgWeeklyActiveUsers = ({
  activityIndex,
  rangeFrom,
  rangeTo,
}: {
  activityIndex: ActivityIndex;
  rangeFrom: Date;
  rangeTo: Date;
}): { avgWeeklyUsers: number | null; fullWeekCount: number; usedFallback: boolean } => {
  const days = utcDayKeysBetween(rangeFrom, rangeTo);
  if (days.length === 0) return { avgWeeklyUsers: null, fullWeekCount: 0, usedFallback: false };

  const buckets = new Map<string, { days: string[]; users: Set<string> }>();
  for (const d of days) {
    const dt = toUTCDate(d);
    const dow = (dt.getUTCDay() + 6) % 7; // 0 = Monday
    const monday = new Date(dt.getTime() - dow * 86400000);
    const wk = utcKey(monday);
    let b = buckets.get(wk);
    if (!b) { b = { days: [], users: new Set<string>() }; buckets.set(wk, b); }
    b.days.push(d);
    for (const u of activityIndex.getActiveUsersForDay(d)) b.users.add(u);
  }
  const weekly = Array.from(buckets.values());

  const full = weekly.filter((w) => w.days.length === 7);
  if (full.length > 0) {
    const avg = full.reduce((a, w) => a + w.users.size, 0) / full.length;
    return { avgWeeklyUsers: Math.round(avg * 10) / 10, fullWeekCount: full.length, usedFallback: false };
  }
  const wsum = weekly.reduce((a, w) => a + w.days.length / 7, 0);
  const avg = wsum > 0 ? weekly.reduce((a, w) => a + w.users.size * (w.days.length / 7), 0) / wsum : null;
  return {
    avgWeeklyUsers: avg === null ? null : Math.round(avg * 10) / 10,
    fullWeekCount: 0,
    usedFallback: avg !== null,
  };
};

export const computeAvgPerUser = ({
  totalMessages,
  totalSessions,
  totalUsers,
}: {
  totalMessages: number;
  totalSessions: number;
  totalUsers: number;
}): { avgMsgsPerUser: number | null; avgSessionsPerUser: number | null } => ({
  avgMsgsPerUser: totalUsers > 0 ? Math.round((totalMessages / totalUsers) * 10) / 10 : null,
  avgSessionsPerUser: totalUsers > 0 ? Math.round((totalSessions / totalUsers) * 10) / 10 : null,
});
