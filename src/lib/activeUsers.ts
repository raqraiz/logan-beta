import { supabase } from "@/integrations/supabase/client";

/**
 * Shared active-user definition used by both the admin Overview tab and the
 * Growth "Daily log". Extracted from GrowthTrackerTab so both surfaces agree
 * by construction.
 *
 * Definition (see src/lib/metrics/definitions.ts): a user is "active" on a UTC
 * calendar day if they took at least one user-initiated action that day — sent
 * a chat message, logged a symptom, or produced a click / page_view /
 * tab_switch activity event. Assistant-generated chat rows and any other
 * background writes never mark a user active.
 */

export const SESSION_GAP_MS = 30 * 60 * 1000;
/**
 * Activity-event types that count as user-initiated (see
 * src/lib/metrics/definitions.ts, which re-exports this as the shared rule).
 */
export const USER_INITIATED_EVENT_TYPES: string[] = [
  "click", "page_view", "tab_switch", "widget_interact",
];

/**
 * True for any user-initiated event: the legacy flat types above plus the
 * newer `<tab>.<feature>.<action>` names (sliders, fields, drag-reorder).
 * Automated/background events never use either shape.
 */
export const isUserInitiatedEvent = (eventType: string): boolean =>
  USER_INITIATED_EVENT_TYPES.includes(eventType) || eventType.includes(".");


const PAGE = 1000;
const CHUNK_DAYS = 14;


/** Timezone-safe key: the UTC calendar day of the given instant. */
export const utcKey = (d: Date) => d.toISOString().slice(0, 10);
/** Parse a yyyy-MM-dd key at noon UTC so local-timezone display never shifts the day. */
export const toUTCDate = (s: string) => new Date(s + "T12:00:00Z");
/**
 * Timezone-safe key for a date-picker value: the picker's local calendar day
 * (what the user clicked) as a yyyy-MM-dd key, independent of timezone. Pair
 * with toUTCDate before generating UTC day keys so a local-midnight Date never
 * shifts one day back (UTC+) or the end-of-day Date one day forward (UTC-).
 */
export const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayUTCKey = () => utcKey(new Date());
const addDaysUTC = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

// Paged fetch in time chunks so a single massive range query can't time out.
// Each chunk is half-open [chunkStart, chunkEnd) to avoid duplicate rows.
const fetchAll = async <T,>(
  table: "chat_messages" | "symptom_logs" | "profiles" | "user_activity_events",
  columns: string,
  tsColumn: string,
  since: string,
): Promise<T[]> => {
  const out: T[] = [];
  const now = new Date();
  let chunkStart = new Date(since);
  while (chunkStart < now) {
    let chunkEnd = addDaysUTC(chunkStart, CHUNK_DAYS);
    if (chunkEnd > now) chunkEnd = new Date(now.getTime() + 1); // include current instant
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .gte(tsColumn, chunkStart.toISOString())
        .lt(tsColumn, chunkEnd.toISOString())
        .order(tsColumn, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error(`Failed to load ${table} chunk ${chunkStart.toISOString()}–${chunkEnd.toISOString()}:`, error);
        break;
      }
      const rows = (data ?? []) as unknown as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    chunkStart = chunkEnd;
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
  /**
   * UTC day key -> user id -> sorted timestamps (ms) of EVERY user-initiated
   * action that day (messages she sent, symptom logs, activity events). This
   * is the single event set behind both "active" and "session".
   */
  sessionTsByDay: Map<string, Map<string, number[]>>;
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
  const [msgs, symptoms, profiles, events] = await Promise.all([
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
    fetchAll<{ user_id: string; event_type: string; created_at: string }>(
      "user_activity_events",
      "user_id, event_type, created_at",
      "created_at",
      since,
    ),
  ]);

  const activeByDay = new Map<string, Set<string>>();
  const userMsgsByDay = new Map<string, Map<string, number[]>>();
  const sessionTsByDay = new Map<string, Map<string, number[]>>();
  const signupsByDay = new Map<string, number>();

  const pushTs = (map: Map<string, Map<string, number[]>>, key: string, userId: string, ts: number) => {
    let byUser = map.get(key);
    if (!byUser) { byUser = new Map(); map.set(key, byUser); }
    const arr = byUser.get(userId) ?? [];
    arr.push(ts);
    byUser.set(userId, arr);
  };

  const markActive = (key: string, userId: string, ts: number) => {
    if (!userId) return;
    let set = activeByDay.get(key);
    if (!set) { set = new Set(); activeByDay.set(key, set); }
    set.add(userId);
    // Same event set feeds session reconstruction, so "active" and "has a
    // session" can never disagree.
    pushTs(sessionTsByDay, key, userId, ts);
  };


  for (const m of msgs) {
    if (!m.created_at) continue;
    // Only user-sent messages count as activity — assistant/system rows are
    // generated on the user's behalf and must never mark her active.
    if (m.role !== "user") continue;
    const ts = new Date(m.created_at).getTime();
    const key = utcKey(new Date(m.created_at));
    markActive(key, m.user_id, ts);
    pushTs(userMsgsByDay, key, m.user_id, ts);
  }

  for (const s of symptoms) {
    if (!s.logged_at) continue;
    const ts = new Date(s.logged_at).getTime();
    markActive(utcKey(new Date(s.logged_at)), s.user_id, ts);
  }

  for (const e of events) {
    if (!e.created_at) continue;
    if (!isUserInitiatedEvent(e.event_type)) continue;
    const ts = new Date(e.created_at).getTime();
    markActive(utcKey(new Date(e.created_at)), e.user_id, ts);
  }



  for (const p of profiles) {
    if (!p.created_at) continue;
    const key = utcKey(new Date(p.created_at));
    signupsByDay.set(key, (signupsByDay.get(key) ?? 0) + 1);
  }

  for (const byUser of userMsgsByDay.values()) {
    for (const arr of byUser.values()) arr.sort((a, b) => a - b);
  }
  for (const byUser of sessionTsByDay.values()) {
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

  // Sessions use the same user-initiated event set as "active" (messages she
  // sent + symptom logs + activity events), 30-minute inactivity gap.
  const getSessionsForDay = (date: Date | string) => {
    const byUser = sessionTsByDay.get(keyOf(date));
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
    sessionTsByDay,
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
