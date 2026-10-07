import { supabase } from "@/integrations/supabase/client";

export interface Tip { id: string; text: string; label: string; same_stage: boolean; helped: number; helped_by_me: boolean; mine: boolean; created_at: string }
export type TipSort = "helpful" | "like_me" | "newest";
export type TipReportReason = "unsafe" | "off_topic" | "advertising" | "other";

export const TIP_MAX = 160;
export const TIPS_CHANGED = "logan:tips-changed";

export async function loadTips(symptom: string): Promise<Tip[]> {
  const { data, error } = await supabase.rpc("get_together_tips", { _symptom: symptom });
  if (error) throw error;
  return (data ?? []) as Tip[];
}

export async function loadTipSummary(symptom: string): Promise<{ count: number; top: number }> {
  const { data, error } = await supabase.rpc("get_tip_summary", { _symptom: symptom });
  if (error) throw error;
  const row = (data as { tip_count: number; top_helped: number }[] | null)?.[0];
  return { count: row?.tip_count ?? 0, top: row?.top_helped ?? 0 };
}

export function sortTips(tips: Tip[], sort: TipSort): Tip[] {
  const list = sort === "like_me" ? tips.filter((t) => t.same_stage) : [...tips];
  if (sort === "newest") return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return list.sort((a, b) => b.helped - a.helped || b.created_at.localeCompare(a.created_at));
}

/** Fixed, reviewed lines. Never name a product, medicine or supplement. Shown only when 2+ tips share the theme. */
const NOTES: { re: RegExp; text: string }[] = [
  { re: /\b(supplement|vitamin|magnes|zinc|iron|omega|capsule|tablet|pill|tea blend|herbal)/i, text: "Several tips mention supplements. Check with your doctor first, especially if you take other medication." },
  { re: /\b(heat|warm|hot water|heating pad|bath|shower)/i, text: "Several tips mention warmth. Gentle heat is a common comfort. Keep it comfortable, never hot enough to burn." },
  { re: /\b(walk|yoga|stretch|move|exercise|swim|run|dance)/i, text: "Several tips mention gentle movement. Go with what your body feels up to today." },
  { re: /\b(sleep|nap|rest|lie down|early night|bed)/i, text: "Several tips mention rest. Extra sleep on harder days is your body asking, not you failing." },
  { re: /\b(water|drink|hydrat|eat|snack|meal|food|salt|sugar|caffeine|coffee)/i, text: "Several tips mention food and drink. Small, regular meals and water often help more than big changes." },
];

export function logansNotes(tips: Tip[]): string[] {
  return NOTES.filter((n) => tips.filter((t) => n.re.test(t.text)).length >= 2).map((n) => n.text);
}

export async function toggleVote(tipId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_tip_vote", { _tip_id: tipId });
  if (error) throw error;
  return !!data;
}

export async function reportTip(tipId: string, reason: TipReportReason) {
  const { error } = await supabase.rpc("report_tip", { _tip_id: tipId, _reason: reason });
  if (error) throw error;
}

export async function hideTipAuthor(tipId: string) {
  const { error } = await supabase.rpc("hide_tip_author", { _tip_id: tipId });
  if (error) throw error;
}

export async function countHiddenAuthors(): Promise<number> {
  const { data, error } = await supabase.rpc("count_hidden_tip_authors");
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function showAllAuthors(userId: string) {
  const { error } = await supabase.from("together_tip_hidden_authors").delete().eq("user_id", userId);
  if (error) throw error;
}

export interface SubmitResult { status: "approved" | "pending" | "rejected"; reason: string | null; id?: string }
export async function submitTip(symptom: string, text: string, tipId?: string): Promise<SubmitResult> {
  const { data, error } = await supabase.functions.invoke("together-tip-submit", { body: { symptom, text, tipId } });
  if (error || !data?.status) throw error ?? new Error(data?.error ?? "failed");
  return data as SubmitResult;
}

/** Same wording the server stores with her tip (together-tip-submit labelFor). */
export async function myTipLabel(userId: string): Promise<string> {
  const { data: p } = await supabase.from("participants").select("life_stage, last_period_start, cycle_length_days").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!p) return "Someone in Together";
  const stage = p.life_stage;
  if (stage === "pregnant") return "Someone who's pregnant";
  if (stage === "postpartum") return "Someone postpartum";
  if (stage === "perimenopause") return "Someone in perimenopause";
  if (stage === "menopause") return "Someone in menopause";
  if (!p.last_period_start) return "Someone in Together";
  const len = Math.min(60, Math.max(20, p.cycle_length_days || 28));
  const start = Date.parse(`${p.last_period_start}T12:00:00Z`);
  const day = ((Math.floor((Date.now() - start) / 86400000) % len) + len) % len + 1;
  const ov = len - 14;
  if (day <= 5) return "Someone on her period";
  if (day < ov - 1) return "Someone in her follicular week";
  if (day <= ov + 1) return "Someone in her ovulation week";
  return "Someone in her luteal week";
}
