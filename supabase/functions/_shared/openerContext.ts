// Rules and inputs for the daily check-in card ("Sound like you?") made by generate-insight.
// The card reflects only what she logged recently. It never assumes a feeling.
// deno-lint-ignore no-explicit-any
type Client = any;

/** A feeling or symptom counts as "recent" for this many days. */
export const RECENT_WINDOW_DAYS = 3;
/** After "Not quite" on a card, avoid that card's theme for this many cards. */
export const REJECTED_THEME_CARDS = 5;

const DAY_MS = 86_400_000;

export function windowStartIso(now = Date.now()): string {
  return new Date(now - RECENT_WINDOW_DAYS * DAY_MS).toISOString();
}

/** Symptom names she logged in the last RECENT_WINDOW_DAYS days (names only, never notes). */
export async function fetchRecentLoggedSymptoms(client: Client, userId: string, now = Date.now()): Promise<string[]> {
  try {
    const { data } = await client.from("symptom_logs").select("symptoms, logged_at")
      .eq("user_id", userId).gte("logged_at", windowStartIso(now))
      .order("logged_at", { ascending: false }).limit(10);
    return namesFromLogs((data ?? []) as { symptoms: unknown }[]);
  } catch { return []; }
}

export function namesFromLogs(rows: { symptoms: unknown }[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (!Array.isArray(r.symptoms)) continue;
    for (const s of r.symptoms as Array<{ name?: string } | string>) {
      const n = (typeof s === "string" ? s : s?.name)?.trim();
      if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
    }
  }
  return out.slice(0, 8);
}

/** Check-in answers from the last RECENT_WINDOW_DAYS days. */
export function recentCheckinLines(
  rows: { metadata: { dimension?: string; response?: string } | null; created_at: string }[],
  now = Date.now(),
): string[] {
  const since = now - RECENT_WINDOW_DAYS * DAY_MS;
  return rows
    .filter((r) => new Date(r.created_at).getTime() >= since && r.metadata?.dimension && r.metadata?.response)
    .map((r) => `${r.metadata!.dimension}: "${r.metadata!.response}"`)
    .slice(0, 6);
}

/** Openers (from her last few cards) that she marked "Not quite". */
export async function fetchRejectedOpeners(client: Client, userId: string): Promise<string[]> {
  try {
    const { data: cards } = await client.from("chat_messages").select("id, content")
      .eq("user_id", userId).eq("role", "assistant").contains("metadata", { insight_type: "proactive" })
      .neq("content", "...").order("created_at", { ascending: false }).limit(REJECTED_THEME_CARDS);
    const list = (cards ?? []) as { id: string; content: string }[];
    if (!list.length) return [];
    const { data: ev } = await client.from("insight_feedback_events").select("message_id")
      .eq("user_id", userId).eq("action", "not_confirmed").in("message_id", list.map((c) => c.id));
    const bad = new Set(((ev ?? []) as { message_id: string }[]).map((e) => e.message_id));
    return list.filter((c) => bad.has(c.id)).map((c) => c.content.slice(0, 200));
  } catch { return []; }
}

const OPENER_STYLES = [
  "Start with the day and phase in a plain sentence, then something this stage is good for.",
  "Start with one simple, specific thing today could be good for, then mention the day.",
  "Start with a short, calm observation about the day, then the question.",
  "Keep the first sentence very short. Let the question carry most of the warmth.",
  "Start with a light, curious note about what today might hold, then the question.",
];

/** Rule block appended to both card prompts. Stage-specific safety wording elsewhere still applies. */
export function buildOpenerRules(opts: { loggedSymptoms: string[]; checkins: string[]; rejected: string[]; styleIdx?: number }): string {
  const { loggedSymptoms, checkins, rejected } = opts;
  const style = OPENER_STYLES[(opts.styleIdx ?? Math.floor(Math.random() * OPENER_STYLES.length)) % OPENER_STYLES.length];
  const logged = [...loggedSymptoms, ...checkins];
  const lines = [
    "",
    "",
    "WHAT SHE HAS SHARED (the only source for how she feels):",
    logged.length
      ? `- In the last ${RECENT_WINDOW_DAYS} days she logged: ${logged.join("; ")}. You may refer to these, plainly and without drama. Do not add feelings or symptoms beyond this list.`
      : `- Nothing in the last ${RECENT_WINDOW_DAYS} days. Do not mention any feeling or symptom at all.`,
    "",
    "OPENER RULES (these override anything above):",
    "- Never state or guess a feeling or symptom she has not logged in the list above. Onboarding answers and older chats are not today's feelings.",
    "- If nothing is logged, or what she logged is neutral or positive, open with something neutral or warm and ask an open question such as \"How's today landing?\". Do not ask a guessing question about a negative state.",
    "- If she logged something hard, acknowledge exactly that, calmly, and ask how it is going. Do not go beyond it.",
    "- Describe her birth control method and her cycle type neutrally and plainly. Never as a burden, fog, a struggle, something to cope with, or something missing.",
    "- Never name any supplement, vitamin, mineral, medication or dose (no magnesium, omega-3, iron pills, painkillers and so on). You are not giving medical advice. Food-free, drug-free, plain wording only.",
    `- Vary the opening. Today's style: ${style} Do not reuse a fixed sentence pattern.`,
    "- Reply options (\"starters\") must fit an open question, for example \"Pretty good\", \"A bit flat\", \"Tell me more\".",
  ];
  if (rejected.length) {
    lines.push(
      "",
      `SHE TAPPED "NOT QUITE" on these recent openers. Avoid their theme, framing and key words for this card:`,
      ...rejected.map((r) => `- ${r}`),
    );
  }
  return lines.join("\n");
}

const MED_OR_SUPPLEMENT_RE =
  /\b(supplements?|vitamins?|magnesium|omega-?3s?|turmeric|zinc|folate|folic|b6|b12|melatonin|ibuprofen|advil|motrin|tylenol|paracetamol|acetaminophen|naproxen|aspirin|painkillers?|\d+\s?(?:mg|mcg|iu))\b/i;

/** True when card text names a supplement, medication or dose, or uses the retired phrase. */
export function breaksOpenerGuardrail(...texts: Array<string | null | undefined>): boolean {
  const t = texts.filter(Boolean).join(" ");
  return MED_OR_SUPPLEMENT_RE.test(t) || /emotionally allergic/i.test(t);
}
