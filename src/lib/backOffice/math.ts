/** Pure helpers for the back office. No data access here. */

export type RangeKey = "7d" | "30d" | "all";
export const RANGE_LABELS: Record<RangeKey, string> = { "7d": "7 days", "30d": "30 days", all: "All time" };

const DAY = 864e5;
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
export const todayKey = (now = new Date()): string => dayKey(now);
export const addDays = (key: string, n: number): string => dayKey(new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY));
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** [from, to] day keys for a range. from is null for "All time". Days are UTC. */
export const rangeDates = (range: RangeKey, now = new Date()): { from: string | null; to: string } => {
  const to = todayKey(now);
  if (range === "all") return { from: null, to };
  return { from: addDays(to, range === "7d" ? -6 : -29), to };
};

/** Stickiness = women active in the last 7 days ÷ women active in the last 30 days. Null when nobody was active. */
export const stickiness = (wau: number, mau: number): number | null => (mau > 0 ? Math.round((wau / mau) * 100) / 100 : null);

export interface PathPoint { day: string; actual: number | null; goal: number }
export interface GoalPace {
  /** Women still needed per day, rounded up to one decimal. Null when the goal is reached or the date has passed. */
  perDay: number | null;
  status: "on" | "reached" | "passed";
}

export const goalPace = (current: number, goalCount: number, goalDate: string, today: string): GoalPace => {
  if (current >= goalCount) return { perDay: null, status: "reached" };
  const left = daysBetween(today, goalDate);
  if (left <= 0) return { perDay: null, status: "passed" };
  return { perDay: Math.ceil(((goalCount - current) / left) * 10) / 10, status: "on" };
};

/**
 * Chart series from the first day anyone finished onboarding to the goal date.
 * `actual` stops at today; `goal` is a straight line from 0 on the first day to the goal on the goal date.
 * `windowFrom` (null = all time) trims the left edge only.
 */
export const buildPath = (
  series: { day: string; total: number }[], goalCount: number, goalDate: string, today: string, windowFrom: string | null,
): PathPoint[] => {
  if (series.length === 0) return [];
  const first = series[0].day;
  const span = Math.max(1, daysBetween(first, goalDate));
  const byDay = new Map(series.map((s) => [s.day, s.total]));
  const start = windowFrom && windowFrom > first ? windowFrom : first;
  const end = goalDate > today ? goalDate : today;
  const out: PathPoint[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const g = Math.min(goalCount, Math.max(0, (daysBetween(first, d) / span) * goalCount));
    out.push({ day: d, actual: d <= today ? byDay.get(d) ?? null : null, goal: Math.round(g * 10) / 10 });
  }
  return out;
};

/** Server marker: with a life stage chosen, counts under 10 come back as -1. */
export const SUPPRESSED = -1;
export const FEWER_THAN_10 = "Fewer than 10";

/** One table cell. null → "—", -1 → "Fewer than 10". */
export const cell = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return "—";
  if (v === SUPPRESSED) return FEWER_THAN_10;
  return v.toLocaleString("en-GB");
};

/** Returned-next-week %: needs both numbers to be real. */
export const returnedPct = (base: number | null, returned: number | null): string => {
  if (base === null || returned === null) return "—";
  if (base === SUPPRESSED || returned === SUPPRESSED) return FEWER_THAN_10;
  if (base === 0) return "—";
  return `${Math.round((returned / base) * 100)}%`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 – 11 Oct" for the Monday-to-Sunday week starting at `weekStart`. */
export const weekLabel = (weekStart: string): string => {
  const end = addDays(weekStart, 6);
  const [d1, m1] = [Number(weekStart.slice(8)), MONTHS[Number(weekStart.slice(5, 7)) - 1]];
  const [d2, m2] = [Number(end.slice(8)), MONTHS[Number(end.slice(5, 7)) - 1]];
  return m1 === m2 ? `${d1} – ${d2} ${m2}` : `${d1} ${m1} – ${d2} ${m2}`;
};

/** "3 of 8"; "—" when no signup has finished its 14 days yet; "Fewer than 10" when suppressed. */
export const active14 = (base: number, active: number): string => {
  if (base === SUPPRESSED || active === SUPPRESSED) return FEWER_THAN_10;
  if (base === 0) return "—";
  return `${active} of ${base}`;
};
