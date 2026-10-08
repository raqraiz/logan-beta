import { call } from "@/lib/adminActivity";

/** Back office data. Every call is a server totals function with the admin role checked inside; counts only. */
type Row = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;
/** Keeps null (not available) apart from 0. */
const nn = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export interface Goal { count: number; date: string }
export interface WeekToDate { weekStart: string; activeWeek: number; newWeek: number }
export interface NeedsYou {
  newFeedback: number; tipsWaiting: number; tipsReported: number;
  messageFailures7d: number | null; newReferrersWeek: number; linkClicksTotal: number | null; linkCount: number | null;
}
export interface TogetherStrip {
  womenJoined: number; symptoms10Plus: number; tipsLive: number; tipsWaiting: number; tipsReported: number; newWordsWeek: number;
}
export interface DayTotal { day: string; newUsers: number; total: number }
export interface WeeklyRow {
  weekStart: string; newUsers: number; activeUsers: number; returnedBase: number | null; returned: number | null;
  headsupsOpened: number; feedback: number;
}
export interface SourceRow { source: string; clicks: number | null; signups: number; active14Base: number; active14: number }
export interface CampaignLink {
  slug: string; targetUrl: string; campaign: string | null; source: string | null; medium: string | null;
  clicks: number; signups: number; createdAt: string;
}

export const fetchGoal = async (): Promise<Goal> => {
  const r = (await call<Row[]>("admin_get_goal"))?.[0];
  return { count: n(r?.goal_count), date: String(r?.goal_date ?? "") };
};
export const saveGoal = async (count: number, date: string): Promise<void> => {
  await call("admin_set_goal", { _count: count, _date: date });
};
export const fetchWeekToDate = async (): Promise<WeekToDate> => {
  const r = (await call<Row[]>("admin_week_to_date"))?.[0];
  return { weekStart: String(r?.week_start ?? ""), activeWeek: n(r?.active_week), newWeek: n(r?.new_week) };
};
export const fetchNeedsYou = async (): Promise<NeedsYou> => {
  const r = (await call<Row[]>("admin_needs_you"))?.[0];
  return {
    newFeedback: n(r?.new_feedback), tipsWaiting: n(r?.tips_waiting), tipsReported: n(r?.tips_reported),
    messageFailures7d: nn(r?.message_failures_7d), newReferrersWeek: n(r?.new_referrers_week),
    linkClicksTotal: nn(r?.link_clicks_total), linkCount: nn(r?.link_count),
  };
};
export const fetchTogetherStrip = async (): Promise<TogetherStrip> => {
  const r = (await call<Row[]>("admin_together_strip"))?.[0];
  return {
    womenJoined: n(r?.women_joined), symptoms10Plus: n(r?.symptoms_10_plus), tipsLive: n(r?.tips_live),
    tipsWaiting: n(r?.tips_waiting), tipsReported: n(r?.tips_reported), newWordsWeek: n(r?.new_words_week),
  };
};
export const fetchOnboardedByDay = async (from: string | null, to: string): Promise<DayTotal[]> =>
  ((await call<Row[]>("admin_onboarded_by_day", { _from: from, _to: to })) ?? []).map((r) => ({
    day: String(r.day), newUsers: n(r.new_users), total: n(r.total_users),
  }));
export const fetchWeeklyMeasurement = async (from: string | null, to: string, stage: string | null): Promise<WeeklyRow[]> =>
  ((await call<Row[]>("admin_weekly_measurement", { _from: from, _to: to, _stage: stage })) ?? []).map((r) => ({
    weekStart: String(r.week_start), newUsers: n(r.new_users), activeUsers: n(r.active_users),
    returnedBase: nn(r.returned_base), returned: nn(r.returned), headsupsOpened: n(r.headsups_opened), feedback: n(r.feedback),
  }));
export const fetchSignupSources = async (from: string | null, to: string, by: "campaign" | "channel", stage: string | null): Promise<SourceRow[]> =>
  ((await call<Row[]>("admin_signup_sources", { _from: from, _to: to, _by: by, _stage: stage })) ?? []).map((r) => ({
    source: String(r.source), clicks: nn(r.clicks), signups: n(r.signups), active14Base: n(r.active_14d_base), active14: n(r.active_14d),
  }));
export const fetchCampaignLinks = async (): Promise<CampaignLink[]> =>
  ((await call<Row[]>("admin_campaign_links")) ?? []).map((r) => ({
    slug: String(r.slug), targetUrl: String(r.target_url), campaign: (r.utm_campaign as string) ?? null,
    source: (r.utm_source as string) ?? null, medium: (r.utm_medium as string) ?? null,
    clicks: n(r.clicks), signups: n(r.signups), createdAt: String(r.created_at),
  }));
