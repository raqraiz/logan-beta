import { call } from "@/lib/adminActivity";

/** Users screens. Every call is a server function that checks super_admin inside. Identity and counts only. */
type Row = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;
const s = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export type UserSort = "last_active" | "messages" | "referrals";
export type UserFilter = "active7" | "quiet14" | "new7" | null;
export interface UserQuery { search: string; sort: UserSort; filter: UserFilter; hideInternal: boolean }

export interface UserListRow {
  id: string; name: string; joinedAt: string; lastActiveAt: string | null;
  msgs30d: number; referrals: number; cameFrom: string; internal: boolean;
}
export interface UserPage { rows: UserListRow[]; total: number }

export interface UserDetail {
  id: string; name: string; email: string; joinedAt: string; cameFrom: string; internal: boolean;
  lastActiveAt: string | null; sessions30d: number; msgs30d: number; headsupsSent: number; feedback: number;
  referralsInvited: number; referralsActive: number; tipsLive: number; tipsReported: number;
  healthConsent: boolean | null; healthConsentAt: string | null;
  togetherConsent: boolean; togetherConsentAt: string | null; togetherConsentVersion: string | null;
  marketingOn: boolean;
}

export const PAGE_SIZE = 50;

const queryArgs = (q: UserQuery) => ({
  _search: q.search.trim() || null, _sort: q.sort, _filter: q.filter, _hide_internal: q.hideInternal,
});

export const fetchUsers = async (q: UserQuery, offset: number): Promise<UserPage> => {
  const rows = (await call<Row[]>("admin_users_list", { ...queryArgs(q), _limit: PAGE_SIZE, _offset: offset })) ?? [];
  return {
    total: rows.length ? n(rows[0].total_count) : 0,
    rows: rows.map((r) => ({
      id: String(r.user_id), name: String(r.display_name ?? ""), joinedAt: String(r.joined_at),
      lastActiveAt: s(r.last_active_at), msgs30d: n(r.msgs_30d), referrals: n(r.referrals),
      cameFrom: String(r.came_from ?? ""), internal: r.is_internal === true,
    })),
  };
};

export interface CsvRow {
  name: string; email: string; joinedAt: string; lastActiveAt: string | null;
  msgs30d: number; referrals: number; cameFrom: string;
}
/** Same filters as the screen, plus email. Logged on the server. */
export const fetchUsersForCsv = async (q: UserQuery): Promise<CsvRow[]> =>
  ((await call<Row[]>("admin_users_export", queryArgs(q))) ?? []).map((r) => ({
    name: String(r.display_name ?? ""), email: String(r.email ?? ""), joinedAt: String(r.joined_at),
    lastActiveAt: s(r.last_active_at), msgs30d: n(r.msgs_30d), referrals: n(r.referrals), cameFrom: String(r.came_from ?? ""),
  }));

export const fetchUserDetail = async (id: string): Promise<UserDetail | null> => {
  const r = (await call<Row[]>("admin_user_detail", { _user_id: id }))?.[0];
  if (!r) return null;
  return {
    id: String(r.user_id), name: String(r.full_name ?? ""), email: String(r.email ?? ""), joinedAt: String(r.joined_at),
    cameFrom: String(r.came_from ?? ""), internal: r.is_internal === true, lastActiveAt: s(r.last_active_at),
    sessions30d: n(r.sessions_30d), msgs30d: n(r.msgs_30d), headsupsSent: n(r.headsups_sent), feedback: n(r.feedback_count),
    referralsInvited: n(r.referrals_invited), referralsActive: n(r.referrals_active),
    tipsLive: n(r.tips_live), tipsReported: n(r.tips_reported),
    healthConsent: r.health_consent === null || r.health_consent === undefined ? null : r.health_consent === true,
    healthConsentAt: s(r.health_consent_at), togetherConsent: r.together_consent === true,
    togetherConsentAt: s(r.together_consent_at), togetherConsentVersion: s(r.together_consent_version),
    marketingOn: r.marketing_on !== false,
  };
};

export const saveUserName = async (id: string, name: string): Promise<void> => {
  await call("admin_user_set_name", { _user_id: id, _name: name });
};
export const setUserInternal = async (id: string, internal: boolean): Promise<void> => {
  await call("admin_user_set_internal", { _user_id: id, _internal: internal });
};
/** Logged before the delete runs; if logging fails, the delete does not run. */
export const logAdminAction = async (action: "delete_user" | "send_data_export", id: string): Promise<void> => {
  await call("admin_log_action", { _action: action, _target: id });
};

// ---- display helpers (days are UTC) ----
const DAY = 86_400_000;
const utcDay = (d: Date) => Math.floor(d.getTime() / DAY);

export const relativeDay = (iso: string | null, now = new Date()): string => {
  if (!iso) return "—";
  const diff = utcDay(now) - utcDay(new Date(iso));
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
};
export const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
export const fmtDateTime = (iso: string | null): string =>
  iso
    ? `${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}, ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`
    : "—";

// ---- CSV ----
export const CSV_HEADER = ["Name", "Email", "Joined", "Last active", "Msgs 30d", "Referrals", "Came from"];

/** Quotes every cell, and defuses spreadsheet formulas in text a person could have typed (e.g. a campaign name). */
const cell = (v: string | number): string => {
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};
const isoDay = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export const buildCsv = (rows: CsvRow[]): string =>
  [CSV_HEADER.map(cell).join(","),
    ...rows.map((r) => [r.name, r.email, isoDay(r.joinedAt), isoDay(r.lastActiveAt), r.msgs30d, r.referrals, r.cameFrom].map(cell).join(","))]
    .join("\r\n");

export const downloadCsv = (csv: string, filename: string) => {
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
