import { onboardedProfiles } from "@/lib/onboardedUsers";
import { utcKey, todayUTCKey } from "@/lib/activeUsers";

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
 * Investor Summary panel (server-side weekly counts):
 *
 *   ISO calendar weeks (Monday–Sunday, UTC), distinct active users per week,
 *   averaged across weeks with daysInRange === 7; falls back to day-weighted
 *   partial weeks only if no full week exists in range.
 */
export const computeAvgWeeklyActiveUsers = (
  weeks: { daysInRange: number; activeUsers: number }[],
): { avgWeeklyUsers: number | null; fullWeekCount: number; usedFallback: boolean } => {
  if (weeks.length === 0) return { avgWeeklyUsers: null, fullWeekCount: 0, usedFallback: false };
  const full = weeks.filter((w) => w.daysInRange === 7);
  if (full.length > 0) {
    const avg = full.reduce((a, w) => a + w.activeUsers, 0) / full.length;
    return { avgWeeklyUsers: Math.round(avg * 10) / 10, fullWeekCount: full.length, usedFallback: false };
  }
  const wsum = weeks.reduce((a, w) => a + w.daysInRange / 7, 0);
  const avg = wsum > 0 ? weeks.reduce((a, w) => a + w.activeUsers * (w.daysInRange / 7), 0) / wsum : null;
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
