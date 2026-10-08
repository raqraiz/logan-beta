import { supabase } from "@/integrations/supabase/client";

/**
 * Admin-only activity counts, computed on the server from ALL user-initiated
 * sources (chat messages she sent, symptom logs, activity events) for
 * onboarded, non-internal users on UTC days. Counts only, never user IDs.
 * Every call throws on failure so the card can show "Failed, retry".
 */

// The new functions are not in the generated Database types yet, hence the cast.
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
type Row = Record<string, unknown>;

const call = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as unknown as { rpc: Rpc }).rpc(fn, args);
  if (error) throw new Error(error.message || "Failed to load");
  return data as T;
};

export interface ActiveNow { dau: number; wau: number; mau: number }
export interface DailyActivity { day: string; activeUsers: number; userMessages: number; sessions: number }
export interface WeeklyActive { weekStart: string; daysInRange: number; activeUsers: number }
export interface TimeSpent { sessions: number; minutes: number; minutesRounded: number }
export interface LifeStageActivity {
  grp: string; active7: number; active30: number; activeDays30: number;
  minutes30: number; sessions30: number; retentionBase: number; retained: number;
}

/** Today's DAU, rolling 7-day WAU and rolling 30-day MAU (UTC). */
export const fetchActiveUsersNow = async (): Promise<ActiveNow> => {
  const rows = await call<Row[]>("admin_active_users_now");
  const r = rows?.[0];
  return { dau: Number(r?.dau) || 0, wau: Number(r?.wau) || 0, mau: Number(r?.mau) || 0 };
};

/** One row per UTC day (yyyy-MM-dd keys, inclusive), zeros included. */
export const fetchDailyActivity = async (fromKey: string, toKey: string): Promise<DailyActivity[]> => {
  const rows = await call<Row[]>("admin_daily_activity", { _from: fromKey, _to: toKey });
  return (rows ?? []).map((r: Row) => ({
    day: String(r.day), activeUsers: Number(r.active_users) || 0,
    userMessages: Number(r.user_messages) || 0, sessions: Number(r.sessions) || 0,
  }));
};

/** Mon–Sun weeks touching the range, with how many of their days fall inside it. */
export const fetchWeeklyActive = async (fromKey: string, toKey: string): Promise<WeeklyActive[]> => {
  const rows = await call<Row[]>("admin_weekly_active_users", { _from: fromKey, _to: toKey });
  return (rows ?? []).map((r: Row) => ({
    weekStart: String(r.week_start), daysInRange: Number(r.days_in_range) || 0, activeUsers: Number(r.active_users) || 0,
  }));
};

/** Distinct people active at least once in the range. */
export const fetchActiveUsersInRange = async (fromKey: string, toKey: string): Promise<number> =>
  Number(await call<number>("admin_active_users_in_range", { _from: fromKey, _to: toKey })) || 0;

/** Visits and minutes in [fromIso, toIso] (toIso null = open ended). */
export const fetchTimeSpent = async (fromIso: string, toIso: string | null): Promise<TimeSpent> => {
  const rows = await call<Row[]>("admin_time_spent", { _from: fromIso, _to: toIso });
  const r = rows?.[0];
  return { sessions: Number(r?.sessions) || 0, minutes: Number(r?.minutes) || 0, minutesRounded: Number(r?.minutes_rounded) || 0 };
};

/** Per-life-stage activity totals. `groups` maps stage -> user ids; only totals come back. */
export const fetchLifeStageActivity = async (groups: Record<string, string[]>): Promise<LifeStageActivity[]> => {
  const rows = await call<Row[]>("admin_life_stage_activity", { _groups: groups });
  return (rows ?? []).map((r: Row) => ({
    grp: String(r.grp), active7: Number(r.active_7) || 0, active30: Number(r.active_30) || 0,
    activeDays30: Number(r.active_days_30) || 0, minutes30: Number(r.minutes_30) || 0,
    sessions30: Number(r.sessions_30) || 0, retentionBase: Number(r.retention_base) || 0, retained: Number(r.retained) || 0,
  }));
};
