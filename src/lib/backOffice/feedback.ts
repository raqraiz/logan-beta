import { call } from "@/lib/adminActivity";
import { supabase } from "@/integrations/supabase/client";

/** Feedback screen data. The health rule is enforced in the database functions: what comes back is already what this viewer may read. */
type Row = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;
const s = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export type FeedbackTab = "new" | "handled" | "all";
export type Theme = "bug" | "feature" | "praise" | "content" | "other";
export const THEMES: { value: Theme; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature idea" },
  { value: "praise", label: "Praise" },
  { value: "content", label: "Content" },
  { value: "other", label: "Other" },
];
export const themeLabel = (t: string): string => THEMES.find((x) => x.value === t)?.label ?? "Other";

/** Whether the woman has opened a sent message. seenAt is only filled in for super admins. */
export type SeenState = "none" | "not_seen" | "seen";
export const toSeenState = (v: unknown): SeenState => (v === "seen" || v === "not_seen" ? v : "none");
/** "Seen 3 Oct" / "Seen" (admins) / "Not seen yet". Null when nothing was sent. */
export const seenText = (state: SeenState, seenAt: string | null, fmt: (iso: string) => string): string | null =>
  state === "none" ? null : state === "not_seen" ? "Not seen yet" : seenAt ? `Seen ${fmt(seenAt)}` : "Seen";

export type TextState = "none" | "hidden" | "shared" | "before_question";
export interface FeedbackItem {
  id: string; text: string; state: TextState; firstName: string | null; lastInitial: string | null;
  userId: string | null; channel: string; theme: Theme; createdAt: string; handled: boolean; topic: string | null;
  seen: SeenState; seenAt: string | null;
}
export interface FeedbackCounts { tabs: Record<FeedbackTab, number>; themes: Record<Theme, number>; month: Record<Theme, number> }
export interface WaitingDraft {
  id: string; kind: string; body: string; createdAt: string; feedbackText: string | null;
  firstName: string | null; lastInitial: string | null; userId: string | null; writtenBy: string | null;
  audienceLabel: string | null; recipientCount: number | null; audience: unknown;
}

export const fetchFeedback = async (tab: FeedbackTab, theme: Theme | null): Promise<FeedbackItem[]> =>
  ((await call<Row[]>("admin_feedback_list", { _tab: tab, _theme: theme })) ?? []).map((r) => ({
    id: String(r.id), text: String(r.text_shown ?? ""), state: String(r.text_state) as TextState,
    firstName: s(r.first_name), lastInitial: s(r.last_initial), userId: s(r.user_id), channel: String(r.channel ?? "in_app"),
    theme: String(r.theme ?? "other") as Theme, createdAt: String(r.created_at), handled: Boolean(r.handled), topic: s(r.topic),
    seen: toSeenState(r.reply_state), seenAt: s(r.reply_seen_at),
  }));

const emptyThemes = (): Record<Theme, number> => ({ bug: 0, feature: 0, praise: 0, content: 0, other: 0 });
export const fetchFeedbackCounts = async (tab: FeedbackTab): Promise<FeedbackCounts> => {
  const out: FeedbackCounts = { tabs: { new: 0, handled: 0, all: 0 }, themes: emptyThemes(), month: emptyThemes() };
  for (const r of (await call<Row[]>("admin_feedback_counts", { _tab: tab })) ?? []) {
    const k = String(r.key);
    if (r.scope === "tab") out.tabs[k as FeedbackTab] = n(r.n);
    else if (r.scope === "theme") out.themes[k as Theme] = n(r.n);
    else if (r.scope === "month") out.month[k as Theme] = n(r.n);
  }
  return out;
};

export const setFeedbackTheme = (id: string, theme: Theme) => call("admin_feedback_set_theme", { _id: id, _theme: theme });
export const markFeedbackHandled = (id: string, handled: boolean) => call("admin_feedback_mark_handled", { _id: id, _handled: handled });
export const createReplyDraft = (feedbackId: string, body: string) =>
  call<string>("admin_draft_create", { _kind: "feedback_reply", _body: body, _feedback: feedbackId });
export const sendTeamMessage = (userId: string, feedbackId: string, body: string) =>
  call<string>("admin_send_team_message", { _user: userId, _body: body, _feedback: feedbackId, _kind: "feedback_reply" });

export const fetchWaitingDrafts = async (): Promise<WaitingDraft[]> =>
  ((await call<Row[]>("admin_draft_list_waiting")) ?? []).map((r) => ({
    id: String(r.id), kind: String(r.kind), body: String(r.body), createdAt: String(r.created_at), feedbackText: s(r.feedback_text),
    firstName: s(r.first_name), lastInitial: s(r.last_initial), userId: s(r.user_id), writtenBy: s(r.written_by),
    audienceLabel: s(r.audience_label), recipientCount: r.recipient_count == null ? null : n(r.recipient_count), audience: r.audience ?? null,
  }));
export const editDraft = (id: string, body: string) => call("admin_draft_edit", { _draft: id, _body: body });
export const rejectDraft = (id: string) => call("admin_draft_reject", { _draft: id });
export const approveDraft = (id: string) => call("admin_draft_approve_send", { _draft: id });

/** One-off cleanup of older feedback (super admin only). */
export const backfillWaiting = async (): Promise<number> => {
  const { data, error } = await supabase.functions.invoke("backfill-feedback-clean", { body: { mode: "count" } });
  if (error) throw new Error("count failed");
  return n(data?.waiting);
};
export const backfillBatch = async (): Promise<{ cleaned: number; failed: number; waiting: number }> => {
  const { data, error } = await supabase.functions.invoke("backfill-feedback-clean", { body: { mode: "run" } });
  if (error) throw new Error("run failed");
  return { cleaned: n(data?.cleaned), failed: n(data?.failed), waiting: n(data?.waiting) };
};

// ---- small display helpers (pure) ----
export const displayName = (i: { firstName: string | null; lastInitial: string | null }, superAdmin: boolean): string => {
  if (!i.firstName) return "A member";
  return superAdmin && i.lastInitial ? `${i.firstName} ${i.lastInitial}.` : i.firstName;
};

export const timeAgo = (iso: string, now = Date.now()): string => {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** Label under the text. Admins never get a label: they always see the cleaned text. */
export const stateLabel = (state: TextState, superAdmin: boolean): string | null => {
  if (!superAdmin) return null;
  if (state === "hidden") return "Health details hidden";
  if (state === "shared") return "Health details shared with consent";
  if (state === "before_question") return "Sent before consent question";
  return null;
};

/** Sending is blocked only if this text is still literally in the reply. */
export const REPLY_PLACEHOLDER = "[what it's about]";

/** Used in the starter when a note has no saved topic. */
const THEME_TOPIC: Record<Theme, string> = {
  bug: "the issue you hit",
  feature: "your feature idea",
  praise: "your kind words",
  content: "the content",
  other: "what you shared",
};

export const replyStarter = (firstName: string | null, state: TextState = "none", topic: string | null = null, theme: Theme = "other"): string => {
  const about = topic?.trim() || THEME_TOPIC[theme] || THEME_TOPIC.other;
  const first = `${firstName ? `Hi ${firstName}, ` : "Hi, "}thank you for your feedback! We read your note about ${about}.`;
  return state === "hidden"
    ? `${first}\n\nYou chose to keep some health details private, so we didn't see those parts. That's completely fine.`
    : first;
};
