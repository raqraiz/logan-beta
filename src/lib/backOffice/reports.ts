import { call } from "@/lib/adminActivity";

/** Investor reports. Every number comes from the server (locked into a snapshot once the month has ended). Counts only. */
type Row = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;
const nn = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export type ReportStatus = "live" | "unlocked" | "locked" | "final";
export interface ReportMonth { month: string; status: ReportStatus; lockedAt: string | null; late: boolean; draftWaiting: boolean }
export interface ReportNotes { highlights: string; lowlights: string; asks: string }
export interface ReportDraft extends ReportNotes { id: string; mine: boolean; writtenBy: string | null }
export interface ReportNumbers {
  asOf: string; totalUsers: number; newUsers: number; prevTotal: number; growthPct: number | null;
  mau: number; wau: number; avgWeeklyActive: number | null; stickiness: number | null;
  /** cohort is -1 when fewer than 10 women joined the month before (the server never sends the real count). */
  retention: { cohort: number; active: number | null; pct: number | null };
  sources: { source: string; signups: number }[]; referralJoins: number;
  feedback: { total: number; themes: Record<string, number> };
  chart: { month: string; total: number }[];
}
export interface Report {
  month: string; status: "live" | "locked" | "final"; lockedAt: string | null; late: boolean;
  numbers: ReportNumbers; notes: ReportNotes & { finalAt: string | null }; draft: ReportDraft | null;
}

/** The functions only exist once the migration has been applied. */
export const isNotSetUp = (e: unknown): boolean => /could not find the function|does not exist|schema cache/i.test(e instanceof Error ? e.message : String(e));

export const fetchReportMonths = async (): Promise<ReportMonth[] | "not_set_up"> => {
  try {
    return ((await call<Row[]>("admin_report_months")) ?? []).map((r) => ({
      month: str(r.month), status: str(r.status) as ReportStatus, lockedAt: r.locked_at ? str(r.locked_at) : null,
      late: Boolean(r.calculated_late), draftWaiting: Boolean(r.draft_waiting),
    }));
  } catch (e) {
    if (isNotSetUp(e)) return "not_set_up";
    throw e;
  }
};

const parseNotes = (o: Row | null | undefined): ReportNotes => ({ highlights: str(o?.highlights), lowlights: str(o?.lowlights), asks: str(o?.asks) });

/** Opening a month that has ended locks it (once, on the server). */
export const fetchReport = async (month: string): Promise<Report> => {
  const r = (await call<Row>("admin_report_get", { _month: month })) as Row;
  const x = (r.numbers ?? {}) as Row;
  const ret = (x.retention ?? {}) as Row;
  const fb = (x.feedback ?? {}) as Row;
  const d = r.draft as Row | null;
  const themes: Record<string, number> = {};
  for (const [k, v] of Object.entries((fb.themes ?? {}) as Row)) themes[k] = n(v);
  return {
    month: str(r.month), status: str(r.status) as Report["status"], lockedAt: r.locked_at ? str(r.locked_at) : null, late: Boolean(r.calculated_late),
    numbers: {
      asOf: str(x.as_of), totalUsers: n(x.total_users), newUsers: n(x.new_users), prevTotal: n(x.prev_total), growthPct: nn(x.growth_pct),
      mau: n(x.mau), wau: n(x.wau), avgWeeklyActive: nn(x.avg_weekly_active), stickiness: nn(x.stickiness),
      retention: { cohort: n(ret.cohort), active: nn(ret.active), pct: nn(ret.pct) },
      sources: ((x.sources ?? []) as Row[]).map((s) => ({ source: str(s.source), signups: n(s.signups) })),
      referralJoins: n(x.referral_joins),
      feedback: { total: n(fb.total), themes },
      chart: ((x.chart ?? []) as Row[]).map((p) => ({ month: str(p.month), total: n(p.total) })),
    },
    notes: { ...parseNotes(r.notes as Row), finalAt: (r.notes as Row)?.final_at ? str((r.notes as Row).final_at) : null },
    draft: d ? { ...parseNotes(d), id: str(d.id), mine: Boolean(d.mine), writtenBy: d.written_by ? str(d.written_by) : null } : null,
  };
};

const fields = (m: string, p: ReportNotes) => ({ _month: m, _highlights: p.highlights, _lowlights: p.lowlights, _asks: p.asks });
export const saveReportDraft = (month: string, p: ReportNotes) => call("admin_report_draft_save", fields(month, p));
export const saveReportNotes = (month: string, p: ReportNotes) => call("admin_report_notes_save", fields(month, p));
export const editReportDraft = (id: string, p: ReportNotes) =>
  call("admin_report_draft_edit", { _draft: id, _highlights: p.highlights, _lowlights: p.lowlights, _asks: p.asks });
export const approveReportDraft = (id: string) => call("admin_report_draft_approve", { _draft: id });
export const rejectReportDraft = (id: string) => call("admin_report_draft_reject", { _draft: id });
export const finalizeReport = (month: string) => call("admin_report_finalize", { _month: month });
export const logReportCopy = (month: string) => call("admin_report_log_copy", { _month: month });

// ---- Plain-text report for the investor email ------------------------------------------------------------------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-09-01" -> "September 2026" */
export const monthTitle = (m: string): string => `${MONTHS[Number(m.slice(5, 7)) - 1] ?? ""} ${m.slice(0, 4)}`;
/** The month before, as a name only: "2026-01-01" -> "December". */
export const prevMonthName = (m: string): string => MONTHS[(Number(m.slice(5, 7)) + 10) % 12];
export const longDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (v: number): string => v.toLocaleString("en-GB");

/** "13.9%" or "n/a" when nobody had joined by the end of the month before. */
export const growthText = (pct: number | null): string => (pct === null ? "n/a (no users the month before)" : `${pct}%`);
/** "62%, 31 of 50", or "Fewer than 10 joined" when last month's group was too small to show. */
export const retentionText = (r: ReportNumbers["retention"]): string =>
  r.pct === null || r.active === null || r.cohort < 10 ? "Fewer than 10 joined" : `${r.pct}%, ${fmt(r.active)} of ${fmt(r.cohort)}`;

const THEME_LABELS: [string, string][] = [["bug", "Bug"], ["feature", "Feature idea"], ["praise", "Praise"], ["content", "Content"], ["other", "Other"]];
export { THEME_LABELS };

/** Em dashes never leave Logan: any in the notes become hyphens. */
export const noEmDash = (s: string): string => s.replace(/—/g, "-");

/** Plain text, ready to paste into an email: month title, numbers with clear labels, then the three notes. */
export function reportToText(r: Report): string {
  const x = r.numbers;
  const live = r.status === "live";
  const state = live ? "So far this month, not locked" : r.late ? "Calculated after the month ended" : r.lockedAt ? `Locked on ${longDate(r.lockedAt)}` : "Locked";
  const src = x.sources.length
    ? x.sources.map((s, i) => `  ${i + 1}. ${s.source}: ${fmt(s.signups)}`).join("\n")
    : "  None this month";
  const when = live ? "so far" : "at month end";
  const note = (s: string) => (s.trim() ? s.trim() : "None this month.");
  const lines = [
    `Logan update, ${monthTitle(r.month)}`,
    state,
    "",
    "GROWTH",
    `Total users ${when}: ${fmt(x.totalUsers)}`,
    `New users this month: ${fmt(x.newUsers)}`,
    `Growth vs previous month: ${growthText(x.growthPct)}`,
    "",
    "ENGAGEMENT",
    `Monthly active users (last 30 days ${when}): ${fmt(x.mau)}`,
    `Average weekly active users: ${x.avgWeeklyActive === null ? "n/a" : x.avgWeeklyActive}`,
    `Stickiness (7 day / 30 day) ${when}: ${x.stickiness === null ? "n/a" : x.stickiness.toFixed(2)}`,
    `Still active the next month (women who joined in ${prevMonthName(r.month)}): ${retentionText(x.retention)}`,
    "",
    "SIGNUPS",
    "Top signup sources:",
    src,
    `Referral joins this month: ${fmt(x.referralJoins)}`,
    "",
    "FEEDBACK",
    `Feedback received this month: ${fmt(x.feedback.total)}`,
    ...THEME_LABELS.map(([k, l]) => `  ${l}: ${fmt(x.feedback.themes[k] ?? 0)}`),
    "",
    "HIGHLIGHTS",
    note(r.notes.highlights),
    "",
    "LOWLIGHTS",
    note(r.notes.lowlights),
    "",
    "ASKS",
    note(r.notes.asks),
  ];
  return noEmDash(lines.join("\n"));
}
