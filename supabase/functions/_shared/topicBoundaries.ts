// Shared helpers for user topic/behavior boundaries ("don't bring up X").
// Boundaries are persisted in public.user_topic_boundaries and enforced on
// every generated surface: chat replies, on-open insights, daily home insights.

export type TopicBoundary = {
  id: string;
  kind: "topic" | "behavior";
  label: string;
  stage_key: string | null;
  active: boolean;
};

const STAGE_KEYS = [
  "pregnancy_loss",
  "pregnancy",
  "postpartum",
  "perimenopause",
  "menopause",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export function isValidStageKey(v: unknown): v is StageKey {
  return typeof v === "string" && (STAGE_KEYS as readonly string[]).includes(v);
}

/** Load a user's active boundaries. Never throws — returns [] on failure. */
export async function fetchActiveBoundaries(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<TopicBoundary[]> {
  try {
    const { data, error } = await supabase
      .from("user_topic_boundaries")
      .select("id, kind, label, stage_key, active")
      .eq("user_id", userId)
      .eq("active", true);
    if (error) {
      console.error("fetchActiveBoundaries failed:", error.message);
      return [];
    }
    return (data || []) as TopicBoundary[];
  } catch (e) {
    console.error("fetchActiveBoundaries threw:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/** Hard rule block injected into every prompt when boundaries exist. */
export function buildBoundaryRuleBlock(boundaries: TopicBoundary[]): string {
  if (!boundaries.length) return "";
  const labels = boundaries.map((b) => `"${b.label}"`).join(", ");
  return `

USER BOUNDARIES (ABSOLUTE, HIGHEST PRIORITY — overrides every other rule below):
- The user asked you not to bring up: ${labels}.
- Never mention these unless she raises them first in her current message.
- Never apologize for, refer back to, or re-negotiate this boundary. Do not mention that a boundary exists.
- Do not hint at it indirectly either (no "what you've been through", "your situation", "recent events").`;
}

/** True when the user has an active boundary covering this life stage. */
export function hasStageBoundary(boundaries: TopicBoundary[], stageKey: string | null | undefined): boolean {
  if (!stageKey) return false;
  return boundaries.some((b) => b.stage_key === stageKey);
}

// ---------------------------------------------------------------------------
// Loss-keyword guard
// ---------------------------------------------------------------------------
// Deliberately narrow: "weight loss", "hair loss", "blood loss", "loss of
// appetite" must pass through untouched. Bare "loss" is NOT matched.
const LOSS_PATTERNS: RegExp[] = [
  /\bpregnancy loss\b/i,
  /\bmiscarriage\b/i,
  /\bmiscarried\b/i,
  /\blost the baby\b/i,
  /\blost your baby\b/i,
  /\byour loss\b/i,
  /\bgrief\b/i,
  /\bgrieving\b/i,
  /\bhealing from loss\b/i,
];

export function mentionsLoss(text: string | null | undefined): boolean {
  if (!text) return false;
  return LOSS_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// Recent-context sanitising
// ---------------------------------------------------------------------------
// Strip prior boundary disputes and Logan's apologies out of the conversation
// context so the model doesn't reopen the argument on the next app open.
const BOUNDARY_DISPUTE_PATTERNS: RegExp[] = [
  /\b(don'?t|do not|please don'?t|stop|quit|no more)\b[^.?!]{0,40}\b(remind|mention|bring(ing)? (it|that|this)? ?up|talk(ing)? about|say(ing)?|list(ing)?)\b/i,
  /\bi'?m sorry\b[^.?!]{0,60}\b(brought|bringing|mentioned|mentioning|raised)\b/i,
  /\b(i won'?t|i'?ll stop)\b[^.?!]{0,40}\b(bring|mention|remind|talk about|say)\b/i,
];

export function sanitizeRecentMessages<T extends { content?: string | null }>(messages: T[]): T[] {
  return (messages || []).filter((m) => {
    const c = m?.content || "";
    if (!c) return true;
    return !BOUNDARY_DISPUTE_PATTERNS.some((re) => re.test(c));
  });
}

// ---------------------------------------------------------------------------
// Cheap pre-filter for boundary intent (avoids a model call on every message)
// ---------------------------------------------------------------------------
const STOP_ANCHOR = /\b(stop|stopped|don'?t|dont|do not|quit|no more|never again|please don'?t|cut it out|enough)\b/i;
const SPEECH_VERB = /\b(remind|reminding|reminder|mention|mentioning|bring(ing)? up|brought up|talk(ing)? about|say|saying|said|list|listing|reference|referencing|discuss(ing)?|raise|raising)\b/i;

export function mayBeBoundaryRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  if (text.length > 600) return false;
  return STOP_ANCHOR.test(text) && SPEECH_VERB.test(text);
}
