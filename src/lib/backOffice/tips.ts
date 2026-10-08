import { call } from "@/lib/adminActivity";

/** Tips screen data. No function here returns who wrote a tip or a word. */
type Row = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;

export type TipTab = "review" | "live" | "removed";
export interface TipItem {
  kind: "tip"; id: string; symptom: string; text: string; status: string; reportCount: number; reasons: string[];
  createdAt: string; authorTipCount: number; why: string | null;
}
export interface WordItem { kind: "word"; word: string; reportCount: number; reasons: string[] }
export interface TipTotals {
  tabs: { review: number; live: number };
  month: { shared: number; live: number; turnedDown: number; reported: number; removed: number; helped: number };
}

export const REASON: Record<string, string> = { unsafe: "Unsafe or harmful", off_topic: "Not about this symptom", advertising: "Advertising", other: "Something else" };
export const reasonText = (r: string[]): string => r.map((x) => REASON[x] ?? x).join(", ");

export const fetchTips = async (tab: TipTab): Promise<TipItem[]> =>
  ((await call<Row[]>("admin_tip_queue", { _tab: tab })) ?? []).map((r) => ({
    kind: "tip", id: String(r.id), symptom: String(r.symptom), text: String(r.text), status: String(r.status),
    reportCount: n(r.report_count), reasons: (r.reasons as string[] | null) ?? [], createdAt: String(r.created_at),
    authorTipCount: n(r.author_tip_count), why: r.why ? String(r.why) : null,
  }));

export const fetchReportedWords = async (): Promise<WordItem[]> =>
  ((await call<Row[]>("admin_word_queue")) ?? []).map((r): WordItem => ({
    kind: "word", word: String(r.word ?? ""), reportCount: n(r.report_count), reasons: (r.reasons as string[] | null) ?? [],
  })).filter((w) => w.word);

export const fetchTipTotals = async (): Promise<TipTotals> => {
  const t: Record<string, number> = {};
  for (const r of (await call<Row[]>("admin_tip_totals")) ?? []) t[String(r.status)] = n(r.total);
  return {
    tabs: { review: t.tab_review ?? 0, live: t.tab_live ?? 0 },
    month: { shared: t.month_shared ?? 0, live: t.month_live ?? 0, turnedDown: t.month_turned_down ?? 0, reported: t.month_reported ?? 0, removed: t.month_removed ?? 0, helped: t.month_helped ?? 0 },
  };
};

export const reviewTip = (id: string, action: "approve" | "remove" | "remove_author") => call<number>("admin_review_tip", { _tip_id: id, _action: action });
export const reviewWord = (word: string, action: "approve" | "remove") => call<number>("admin_review_word", { _word: word, _action: action });
