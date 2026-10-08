import { supabase } from "@/integrations/supabase/client";
import { TOGETHER_CHANGED, TOGETHER_CONSENT_VERSION } from "@/lib/together";

/** What a woman sees for a shared word. The server sends only a label, or the count when it is 10 or more. */
export interface TogetherWord { word: string; label: "single" | "few" | "exact"; women_count: number | null; mine: boolean }
export type WordReportReason = "unsafe" | "off_topic" | "advertising" | "other";
export const WORD_REPORT_REASONS: { key: WordReportReason; label: string }[] = [
  { key: "unsafe", label: "Unsafe or harmful" },
  { key: "off_topic", label: "Not about this symptom" },
  { key: "advertising", label: "Advertising" },
  { key: "other", label: "Something else" },
];

export const WORDS_CHANGED = "logan:together-words";
export const WORD_PRIVATE_COPY = "This one stays just yours. It couldn't be shared as written.";
export const WORD_LIMIT_COPY = "This one stays just yours for today. You can add more new words tomorrow.";

/** Never "1 woman" or "2 women", and never a number under 10, even if the server sent one. */
export function wordLabel(w: TogetherWord): string {
  if (w.label === "exact" && (w.women_count ?? 0) >= 10) return `${w.women_count} women`;
  if (w.label === "few" || w.label === "exact") return "A few women";
  return "Named by a woman like you";
}

export async function loadWords(): Promise<TogetherWord[]> {
  const { data, error } = await supabase.rpc("get_together_words" as any);
  if (error) throw error;
  return ((data ?? []) as TogetherWord[]).map((w) => ({
    word: w.word, label: w.label, mine: !!w.mine,
    women_count: w.label === "exact" && (w.women_count ?? 0) >= 10 ? w.women_count : null,
  }));
}

export async function reportWord(word: string, reason: WordReportReason) {
  const { error } = await supabase.rpc("report_word" as any, { _word: word, _reason: reason });
  if (error) throw error;
}

export interface MyWord { word: string; original_word: string; status: "pending" | "shared" | "private" | "rejected"; reject_category: string | null }
/** Her own words and what happened to them. RLS only returns her rows. */
export async function loadMyWords(userId: string): Promise<MyWord[]> {
  const { data, error } = await supabase.from("together_words" as any).select("word, original_word, status, reject_category").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as unknown as MyWord[];
}

export type SubmitOutcome = { status: "shared" | "private" | "rejected" | "library" | "pending"; reason?: string };

/** Asks the server to check and (maybe) share one word. Never throws: a failed call just leaves the word private. */
export async function submitWord(word: string, opts: { source?: string; rename?: boolean } = {}): Promise<SubmitOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke("together-tip-submit", { body: { mode: "word", word, source: opts.source ?? word, rename: !!opts.rename } });
    if (error || !data?.status) return { status: "private", reason: "check_failed" };
    globalThis.dispatchEvent(new Event(WORDS_CHANGED));
    return data as SubmitOutcome;
  } catch { return { status: "private", reason: "check_failed" }; }
}

/** Copy to show a woman when a word did not go to Together. */
export function privateCopy(o: SubmitOutcome): string | null {
  if (o.status === "shared" || o.status === "library" || o.status === "pending") return null;
  if (o.reason === "not_consented") return null;
  if (o.reason === "daily_limit") return WORD_LIMIT_COPY;
  return WORD_PRIVATE_COPY;
}

/** Checks her custom words from her logs in small batches until none are left. */
export async function syncWords(): Promise<void> {
  try {
    for (let i = 0; i < 30; i++) {
      const { data, error } = await supabase.functions.invoke("together-tip-submit", { body: { mode: "sync" } });
      if (error || !data || data.status !== "ok") break;
      if (data.processed > 0) globalThis.dispatchEvent(new Event(WORDS_CHANGED));
      if (!data.remaining || !data.processed) break;
    }
  } catch { /* words stay private until the next try */ }
}

const SYNC_KEY = "logan:words-sync";
/** Background catch-up, at most every 6 hours, for words logged anywhere (chat, imports). */
export function maybeSyncWords() {
  try {
    const last = Number(localStorage.getItem(SYNC_KEY) || 0);
    if (Date.now() - last < 6 * 3600000) return;
    localStorage.setItem(SYNC_KEY, String(Date.now()));
  } catch { /* storage unavailable: just sync */ }
  void syncWords();
}

/** "Keep me in" on the new wording: records together-v2 on the server, then checks her existing words. */
export async function keepTogetherV2(): Promise<boolean> {
  const { data, error } = await supabase.rpc("keep_together_v2" as any);
  if (error || data !== true) return false;
  globalThis.dispatchEvent(new CustomEvent(TOGETHER_CHANGED));
  void syncWords();
  return true;
}

/** "Leave Together" from the update message. Logs and words stop counting at once. */
export async function leaveTogetherV2(): Promise<boolean> {
  const { error } = await supabase.rpc("leave_together_v2" as any);
  if (error) return false;
  globalThis.dispatchEvent(new CustomEvent(TOGETHER_CHANGED));
  return true;
}

export const isCurrentConsent = (version: string | null | undefined) => version === TOGETHER_CONSENT_VERSION;
