import { supabase } from "@/integrations/supabase/client";

/**
 * Shared active-user definition used by both the admin Overview tab and the
 * Growth "Daily log". Extracted from GrowthTrackerTab so both surfaces agree
 * by construction.
 *
 * Definition: a user is "active" on a UTC calendar day if they have any
 * chat_messages row (any role) or any symptom_logs row on that day.
 */

export const SESSION_GAP_MS = 30 * 60 * 1000;
const PAGE = 1000;

/** Timezone-safe key: the UTC calendar day of the given instant. */
export const utcKey = (d: Date) => d.toISOString().slice(0, 10);
/** Parse a yyyy-MM-dd key at noon UTC so local-timezone display never shifts the day. */
export const toUTCDate = (s: string) => new Date(s + "T12:00:00Z");
export const todayUTCKey = () => utcKey(new Date());
const addDaysUTC = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

// Paged fetch so we never silently truncate at the Data API's 1000-row default.
const fetchAll = async <T,>(
  table: "chat_messages" | "symptom_logs" | "profiles",
  columns: string,
  tsColumn: string,
  since: string,
): Promise<T[]> => {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte(tsColumn, since)
      .order(tsColumn, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`Failed to load ${table} for activity index:`, error);
      break;
    }
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
};

export interface ActivityIndex {
  /** UTC day key -> set of user ids active that day. */
  activeByDay: Map<string, Set<string>>;
  /** UTC day key -> signup count that day. */
  signupsByDay: Map<string, number>;
  /** UTC day key -> user id -> sorted user-sent message timestamps (ms). */
  userMsgsByDay: Map<string, Map<string, number[]>>;
  /** Users with any activity on that UTC day. */
  getActiveUsersForDay: (date: Date | string) => Set<string>;
  /** Users active in the 7 UTC days ending on (and including) the given date. */
  getActiveThisWeek: (date: Date | string) => Set<string>;
  /** Signups on that UTC day. */
  getSignupsForDay: (date: Date | string) => number;
  /** Total user-sent messages that UTC day. */
  getUserMessagesForDay: (date: Date | string) => number;
  /** Total sessions (30m inactivity gap) across all users that UTC day. */
  getSessionsForDay: (date: Date | string) => number;
}

const keyOf = (date: Date | string) => (typeof date === "string" ? date : utcKey(date));

/**
 * Builds the shared activity index from `since` (ISO string) onwards.
 */
export const buildActivityIndex = async (since: string): Promise<ActivityIndex> => {
  const [msgs, symptoms, profiles] = await Promise.all([
    fetchAll<{ user_id: string; role: string; created_at: string }>(
      "chat_messages",
      "user_id, role, created_at",
      "created_at",
      since,
    ),
    fetchAll<{ user_id: string; logged_at: string }>(
      "symptom_logs",
      "user_id, logged_at",
      "logged_at",
      since,
    ),
    fetchAll<{ created_at: string }>("profiles", "created_at", "created_at", since),
  ]);

  const activeByDay = new Map<string, Set<string>>();
  const userMsgsByDay = new Map<string, Map<string, number[]>>();
  const signupsByDay = new Map<string, number>();

  const markActive = (key: string, userId: string) => {
    if (!userId) return;
    let set = activeByDay.get(key);
    if (!set) { set = new Set(); activeByDay.set(key, set); }
    set.add(userId);
  };

  for (const m of msgs) {
    if (!m.created_at) continue;
    const key = utcKey(new Date(m.created_at));
    markActive(key, m.user_id);
    if (m.role !== "user") continue;
    let byUser = userMsgsByDay.get(key);
    if (!byUser) { byUser = new Map(); userMsgsByDay.set(key, byUser); }
    const arr = byUser.get(m.user_id) ?? [];
    arr.push(new Date(m.created_at).getTime());
    byUser.set(m.user_id, arr);
  }

  for (const s of symptoms) {
    if (!s.logged_at) continue;
    markActive(utcKey(new Date(s.logged_at)), s.user_id);
  }

  for (const p of profiles) {
    if (!p.created_at) continue;
    const key = utcKey(new Date(p.created_at));
    signupsByDay.set(key, (signupsByDay.get(key) ?? 0) + 1);
  }

  for (const byUser of userMsgsByDay.values()) {
    for (const arr of byUser.values()) arr.sort((a, b) => a - b);
  }

  const getActiveUsersForDay = (date: Date | string) =>
    activeByDay.get(keyOf(date)) ?? new Set<string>();

  const getActiveThisWeek = (date: Date | string) => {
    const key = keyOf(date);
    const start = utcKey(addDaysUTC(toUTCDate(key), -6));
    const out = new Set<string>();
    for (const [k, set] of activeByDay.entries()) {
      if (k >= start && k <= key) for (const u of set) out.add(u);
    }
    return out;
  };

  const getSignupsForDay = (date: Date | string) => signupsByDay.get(keyOf(date)) ?? 0;

  const getUserMessagesForDay = (date: Date | string) => {
    const byUser = userMsgsByDay.get(keyOf(date));
    if (!byUser) return 0;
    let total = 0;
    for (const arr of byUser.values()) total += arr.length;
    return total;
  };

  const getSessionsForDay = (date: Date | string) => {
    const byUser = userMsgsByDay.get(keyOf(date));
    if (!byUser) return 0;
    let total = 0;
    for (const times of byUser.values()) {
      if (times.length === 0) continue;
      let sessions = 1;
      for (let i = 1; i < times.length; i++) {
        if (times[i] - times[i - 1] >= SESSION_GAP_MS) sessions++;
      }
      total += sessions;
    }
    return total;
  };

  return {
    activeByDay,
    signupsByDay,
    userMsgsByDay,
    getActiveUsersForDay,
    getActiveThisWeek,
    getSignupsForDay,
    getUserMessagesForDay,
    getSessionsForDay,
  };
};

/** Enumerate UTC day keys from `from` to `to` inclusive. */
export const utcDayKeysBetween = (from: Date, to: Date): string[] => {
  const keys: string[] = [];
  const end = utcKey(to);
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12)); utcKey(d) <= end; d = addDaysUTC(d, 1)) {
    keys.push(utcKey(d));
  }
  return keys;
};
