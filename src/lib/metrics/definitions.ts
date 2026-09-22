import { supabase } from "@/integrations/supabase/client";
import { onboardedProfiles } from "@/lib/onboardedUsers";
import { utcKey, toUTCDate, utcDayKeysBetween, USER_INITIATED_EVENT_TYPES, type ActivityIndex } from "@/lib/activeUsers";

/**
 * THE single source of truth for what "user" and "active user" mean on the
 * admin Overview tab. Every card reads from here — no card may re-derive a
 * definition of its own.
 *
 * User        = row in the `onboarded_profiles` view (canonical onboarded
 *               user), excluding accounts flagged `profiles.is_internal`.
 * Active      = at least one user-initiated action on the UTC day: a chat
 *               message she sent, a symptom log, or a click / page_view /
 *               tab_switch activity event. Assistant replies, scheduled jobs
 *               and any other background writes never count.
 * Day boundary= UTC, matching the "Today" chip on Total Time Spent.
 */

/** Activity-event types that count as user-initiated. */
export { USER_INITIATED_EVENT_TYPES };


/** One-sentence, plain-language definitions shown in each card's ⓘ tooltip. */
export const METRIC_TOOLTIPS = {
  totalUsers:
    "People who finished onboarding, excluding internal/test accounts. Follows the date range as 'signed up in range'; All time counts everyone.",
  activeToday:
    "People who used Logan at least once today (UTC). Ignores the date range.",
  activeThisWeek:
    "People who used Logan at least once in the last 7 days, including today (UTC). Ignores the date range.",
  activeThisMonth:
    "People who used Logan at least once in the last 30 days, including today (UTC). Ignores the date range.",
  stickiness:
    "Share of the last 30 days' active people who used Logan today (today ÷ last 30 days).",
  avgDailyUsers:
    "Average number of people active per day across every day in the selected range (UTC).",
  avgWeeklyUsers:
    "Average number of people active per week across completed Monday–Sunday weeks in the range; the current part-week is excluded.",
  avgMsgsPerUser: "Messages sent in the range ÷ total users as of the end of the range.",
  avgSessionsPerUser: "Sessions in the range ÷ total users as of the end of the range.",
  totalMessages: "Messages sent by users in the selected range.",
} as const;

/** Ids of onboarded, non-internal users — the denominator/eligibility set. */
export const fetchEligibleUserIds = async (): Promise<Set<string>> => {
  const [onboarded, internal] = await Promise.all([
    Promise.resolve(onboardedProfiles().select("id")),
    supabase.from("profiles").select("id").eq("is_internal", true),
  ]);
  if ((onboarded as any).error) throw (onboarded as any).error;
  if (internal.error) throw internal.error;
  const skip = new Set((internal.data ?? []).map((r: any) => r.id as string));
  const out = new Set<string>();
  for (const r of ((onboarded as any).data ?? []) as { id: string }[]) {
    if (!skip.has(r.id)) out.add(r.id);
  }
  return out;
};

const addDaysUTC = (key: string, n: number) => utcKey(new Date(toUTCDate(key).getTime() + n * 86400000));

/** Distinct eligible users active on a single UTC day. */
export const activeOnDay = (
  index: ActivityIndex,
  dayKey: string,
  eligible: Set<string> | null,
): Set<string> => {
  const out = new Set<string>();
  for (const u of index.getActiveUsersForDay(dayKey)) {
    if (!eligible || eligible.has(u)) out.add(u);
  }
  return out;
};

/**
 * Distinct eligible users active in the rolling window of `days` UTC days
 * ending on (and including) `endKey`.
 */
export const activeInRollingWindow = (
  index: ActivityIndex,
  endKey: string,
  days: number,
  eligible: Set<string> | null,
): Set<string> => {
  const start = addDaysUTC(endKey, -(days - 1));
  const out = new Set<string>();
  for (const [k, set] of index.activeByDay.entries()) {
    if (k < start || k > endKey) continue;
    for (const u of set) if (!eligible || eligible.has(u)) out.add(u);
  }
  return out;
};

/** DAU: distinct active users on the current UTC day. */
export const computeDau = (index: ActivityIndex, eligible: Set<string> | null) =>
  activeOnDay(index, utcKey(new Date()), eligible);

/** WAU: rolling last 7 UTC days, including today. */
export const computeWau = (index: ActivityIndex, eligible: Set<string> | null) =>
  activeInRollingWindow(index, utcKey(new Date()), 7, eligible);

/** MAU: rolling last 30 UTC days, including today. */
export const computeMau = (index: ActivityIndex, eligible: Set<string> | null) =>
  activeInRollingWindow(index, utcKey(new Date()), 30, eligible);

/** Stickiness = DAU ÷ MAU as a percentage, one decimal. */
export const computeStickiness = (dau: number, mau: number): number | null =>
  mau > 0 ? Math.round((dau / mau) * 1000) / 10 : null;

/** Mean DAU across every UTC day in the selected range. */
export const computeAvgDailyUsers = (
  index: ActivityIndex,
  rangeFrom: Date,
  rangeTo: Date,
  eligible: Set<string> | null,
): number | null => {
  const days = utcDayKeysBetween(rangeFrom, rangeTo);
  if (days.length === 0) return null;
  const sum = days.reduce((a, d) => a + activeOnDay(index, d, eligible).size, 0);
  return Math.round((sum / days.length) * 10) / 10;
};

/**
 * Mean distinct weekly active users across COMPLETED ISO weeks (Mon–Sun) that
 * fall entirely inside the range. The current partial week is excluded; if no
 * completed week is in range the value is null.
 */
export const computeAvgWeeklyUsers = (
  index: ActivityIndex,
  rangeFrom: Date,
  rangeTo: Date,
  eligible: Set<string> | null,
): number | null => {
  const days = utcDayKeysBetween(rangeFrom, rangeTo);
  if (days.length === 0) return null;
  const today = utcKey(new Date());

  const buckets = new Map<string, { days: string[]; users: Set<string> }>();
  for (const d of days) {
    const dt = toUTCDate(d);
    const dow = (dt.getUTCDay() + 6) % 7; // 0 = Monday
    const wk = utcKey(new Date(dt.getTime() - dow * 86400000));
    let b = buckets.get(wk);
    if (!b) { b = { days: [], users: new Set<string>() }; buckets.set(wk, b); }
    b.days.push(d);
    for (const u of activeOnDay(index, d, eligible)) b.users.add(u);
  }

  const complete = Array.from(buckets.entries()).filter(
    ([wk, b]) => b.days.length === 7 && addDaysUTC(wk, 6) < today,
  );
  if (complete.length === 0) return null;
  const avg = complete.reduce((a, [, b]) => a + b.users.size, 0) / complete.length;
  return Math.round(avg * 10) / 10;
};
