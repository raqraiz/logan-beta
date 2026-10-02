/**
 * Birth-control METHOD (participants.birth_control_method).
 * NULL = type unknown. This never changes life_stage or phase placement —
 * it only governs how Logan WORDS things about contraception.
 */
import { isHypotheticalOrQuestion, detectBcOrNoPeriod } from "./bcDetection.ts";

export const BC_METHODS = [
  "combined_pill_with_breaks",
  "continuous_pill",
  "progestin_only_pill",
  "hormonal_iud",
  "copper_iud",
  "implant",
  "injection",
  "ring_or_patch",
  "other",
  "not_sure",
] as const;
export type BcMethod = typeof BC_METHODS[number];

export const BC_METHOD_LABELS: Record<BcMethod, string> = {
  combined_pill_with_breaks: "Pill with a monthly break",
  continuous_pill: "Pill every day, no break",
  progestin_only_pill: "Mini pill",
  hormonal_iud: "Hormonal IUD",
  copper_iud: "Copper IUD (non-hormonal)",
  implant: "Implant",
  injection: "Shot",
  ring_or_patch: "Ring or patch",
  other: "Something else",
  not_sure: "Not sure",
};

export function isBcMethod(v: unknown): v is BcMethod {
  return typeof v === "string" && (BC_METHODS as readonly string[]).includes(v);
}

/** Pull "method:<value>" out of an onboarding chip payload. */
export function extractMethodToken(text: string): BcMethod | null | undefined {
  const m = /method:([a-z_]+)/i.exec(text || "");
  if (!m) return undefined; // no token at all
  const v = m[1].toLowerCase();
  if (v === "skip") return null;
  return isBcMethod(v) ? v : null;
}

/**
 * Detect a SPECIFIC method stated in chat. Ambiguous mentions ("the pill",
 * "an IUD") return null — we never guess the type.
 */
export function detectBcMethod(text: string): BcMethod | null {
  const msg = (text || "").trim();
  if (!msg || isHypotheticalOrQuestion(msg)) return null;
  const lower = msg.toLowerCase();
  // Must be a declarative BC statement, or a short direct answer.
  const short = msg.length <= 80;
  if (!short && !detectBcOrNoPeriod(msg).bcPositive) return null;
  if (/\b(?:not|never|no longer|came off|got off|stopped|removed|taken out)\b/.test(lower) && !short) return null;

  if (/\b(?:copper\s+(?:iud|coil)|paragard|non[-\s]?hormonal\s+(?:iud|coil))\b/.test(lower)) return "copper_iud";
  if (/\b(?:mirena|kyleena|skyla|liletta|jaydess|hormonal\s+(?:iud|coil)|levonorgestrel\s+iud)\b/.test(lower)) return "hormonal_iud";
  if (/\b(?:nexplanon|implanon|implant)\b/.test(lower)) return "implant";
  if (/\b(?:depo(?:[-\s]provera)?|the\s+shot|injection|injectable)\b/.test(lower)) return "injection";
  if (/\b(?:nuvaring|annovera|the\s+ring|the\s+patch|xulane|twirla|evra)\b/.test(lower)) return "ring_or_patch";
  if (/\b(?:mini[-\s]?pill|progestin[-\s]only|progestogen[-\s]only|pop\b|slynd)\b/.test(lower)) return "progestin_only_pill";
  if (/\bpill\b/.test(lower) && /\b(?:continuous(?:ly)?|back[-\s]to[-\s]back|skip(?:ping)?\s+(?:the\s+)?(?:placebo|sugar|break)|no\s+break|without\s+a\s+break)\b/.test(lower)) return "continuous_pill";
  if (/\bpill\b/.test(lower) && /\b(?:placebo|sugar\s+pills?|pill[-\s]free|monthly\s+break|week\s+off|break\s+week)\b/.test(lower)) return "combined_pill_with_breaks";
  return null;
}

type ParticipantLike = {
  birth_control_method?: string | null;
  on_hormonal_bc?: boolean | null;
  birth_control_status?: string | null;
} | null | undefined;

/**
 * Prompt rules for contraception wording. Empty string when she has never
 * indicated any birth control. `allowAsk` only for two-way chat.
 */
export function buildBcMethodRule(p: ParticipantLike, opts: { allowAsk?: boolean } = {}): string {
  const method = isBcMethod(p?.birth_control_method) ? p!.birth_control_method as BcMethod : null;
  const ppStatus = p?.birth_control_status ?? null;
  const onBc = p?.on_hormonal_bc === true || ppStatus === "hormonal" || ppStatus === "non_hormonal";
  if (!method && !onBc) return "";

  const lines: string[] = [
    "",
    "",
    `BIRTH CONTROL METHOD (absolute wording rules): ${method ? `${method} (${BC_METHOD_LABELS[method]})` : "type unknown"}.`,
    "- 'Pill break', 'placebo week', 'sugar pills', 'pill-free week' and 'withdrawal bleed' language is ONLY allowed when the method is combined_pill_with_breaks. For every other method (including unknown) never use those terms or ask about them.",
  ];

  switch (method) {
    case "combined_pill_with_breaks":
      lines.push("- She takes a combined pill with a monthly break. Bleeding during the break is a withdrawal bleed; you may reference her pill break.");
      break;
    case "continuous_pill":
      lines.push("- She takes the pill every day with no break. There is no scheduled bleed. Breakthrough spotting can happen and is worth noting; never ask about a pill break.");
      break;
    case "progestin_only_pill":
      lines.push("- She takes a progestin-only (mini) pill daily with no break. Bleeding patterns vary widely and some still ovulate. Never ask about a pill break or placebo week.");
      break;
    case "copper_iud":
      lines.push("- A copper IUD is NON-HORMONAL. She has a natural cycle: treat her like a naturally cycling woman with normal phase language. Never describe her hormones as suppressed, regulated, flattened or modulated by contraception, and never mention BC nutrient depletion. Periods can be heavier or crampier with copper.");
      break;
    case "hormonal_iud":
    case "implant":
    case "injection":
      lines.push(`- ${method === "hormonal_iud" ? "Hormonal IUD" : method === "implant" ? "Implant" : "Shot"}: do NOT assume she bleeds or that she doesn't. Many still ovulate and have an 'invisible' cycle underneath. Spotting is meaningful data. Never say there's no pill, never mention pill breaks, and don't claim her cycle is fully switched off.`);
      break;
    case "ring_or_patch":
      lines.push("- Ring or patch: hormonal. Only reference a ring-free or patch-free week if SHE mentions one. Never use pill wording.");
      break;
    default:
      lines.push("- Method unknown or unsure: say 'your birth control', never 'the pill' or 'your pill'. Don't assume bleeding, breaks or suppression.");
      if (opts.allowAsk && !method) {
        lines.push("- You MAY ask her once, casually, which kind she uses (pill with a break, daily pill, mini pill, hormonal or copper IUD, implant, shot, ring or patch) — only when it's relevant to her question, and only if you haven't already asked in the conversation above. Once she answers, never ask again.");
      }
  }
  return lines.join("\n");
}
