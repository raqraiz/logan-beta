import { call } from "@/lib/adminActivity";
import { LIFE_STAGE_LABELS, type LifeStageKey } from "@/lib/metrics/lifeStage";

/** Send screen data. The 10-woman rule and the role checks are enforced in the database functions. */
type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export const MAX_BODY = 4000;

/** IUD is left out: the database records no birth control device, so it can't be told apart from other hormonal birth control. */
export const SEND_STAGES = (Object.keys(LIFE_STAGE_LABELS) as LifeStageKey[]).filter((k) => k !== "bc_iud");

export type Audience = { type: "all" } | { type: "stages"; stages: LifeStageKey[] };
export const EVERYONE: Audience = { type: "all" };

export const audienceKey = (a: Audience): string => (a.type === "all" ? "all" : [...a.stages].sort().join(","));

/** Count from the server: a number, or "small" for -1 (a filtered group under 10 women). */
export type CountResult = { kind: "n"; n: number } | { kind: "small" };
export const toCount = (raw: unknown): CountResult => {
  const n = Number(raw);
  return n < 0 ? { kind: "small" } : { kind: "n", n: Number.isFinite(n) ? n : 0 };
};
/** Can this audience be drafted or sent? */
export const canSend = (c: CountResult | null): boolean => !!c && c.kind === "n" && c.n > 0;

export const FEEDBACK_ASK_STARTER =
  "Hi, it's the Logan team. We'd love to know how Logan is working for you. What's helping, and what isn't?\n\n" +
  "You can tell us any time with the Send feedback button in this inbox. We read every note. Thank you for being here.";

export interface BroadcastRow {
  id: string; status: "waiting" | "sent"; audienceLabel: string; recipientCount: number | null;
  createdAt: string; sentAt: string | null; writtenBy: string | null; sentBy: string | null; body: string | null;
  openedCount: number | null; deliveredCount: number | null;
}

export const fetchBroadcastCount = async (a: Audience): Promise<CountResult> =>
  toCount(await call<number>("admin_broadcast_count", { _audience: a }));
export const createBroadcastDraft = (a: Audience, body: string) =>
  call<string>("admin_broadcast_draft_create", { _audience: a, _body: body });
export const approveBroadcast = (draft: string) => call<number>("admin_broadcast_approve_send", { _draft: draft });
export const sendBroadcastDirect = (id: string, a: Audience, body: string) =>
  call<number>("admin_broadcast_send_direct", { _id: id, _audience: a, _body: body });
export const sendBroadcastTest = (body: string) => call("admin_broadcast_send_test", { _body: body });
export const fetchBroadcastHistory = async (): Promise<BroadcastRow[]> =>
  ((await call<Row[]>("admin_broadcast_history")) ?? []).map((r) => ({
    id: String(r.id), status: r.status === "sent" ? "sent" : "waiting", audienceLabel: String(r.audience_label ?? "Everyone"),
    recipientCount: r.recipient_count == null ? null : Number(r.recipient_count), createdAt: String(r.created_at), sentAt: s(r.sent_at),
    writtenBy: s(r.written_by), sentBy: s(r.sent_by), body: s(r.body),
    openedCount: r.opened_count == null ? null : Number(r.opened_count), deliveredCount: r.delivered_count == null ? null : Number(r.delivered_count),
  }));

/** "Opened by X of Y (Z%)". Totals only. Null when the count isn't there. */
export const openedLabel = (opened: number | null, delivered: number | null): string | null =>
  opened == null || delivered == null || delivered <= 0 ? null : `Opened by ${opened} of ${delivered} (${Math.round((opened / delivered) * 100)}%)`;

/** Plain-words versions of the database's refusals. */
export const sendErrorText = (e: unknown): string => {
  const m = e instanceof Error ? e.message : "";
  if (m.includes("audience too small")) return "That group has fewer than 10 women, so it can't be sent.";
  if (m.includes("nobody to send to")) return "Nobody is in that group right now.";
  if (m.includes("already sent")) return "This message was already sent. Check the Sent list.";
  if (m.includes("draft not waiting")) return "Someone already handled this draft.";
  return "That didn't work. Please try again.";
};
