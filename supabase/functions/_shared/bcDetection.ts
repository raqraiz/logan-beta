/**
 * Shared hormonal-BC / IUD / no-period detection.
 *
 * Used by BOTH the chat-side life-stage detector (chat-ai) and the onboarding
 * answer processor (chat-onboarding), so a user who mentions her IUD while
 * answering the last-period-date question is routed the same way as one who
 * says it in normal chat. There is only ONE flag: participants.on_hormonal_bc
 * (+ life_stage = "irregular"). Nothing new is introduced here.
 *
 * Matching is intentionally broad: it catches descriptive/negative phrasing
 * ("I don't really get a period with my IUD", "I only get some staining, no
 * real period", "no period since my IUD") as well as declarative statements
 * ("I got an IUD", "I'm on the pill"). Hypothetical / question-shaped talk
 * ("what if I had an IUD?") never fires, matching the existing standard.
 */

/** Hormonal-BC device / method terms (source string so it can be embedded). */
export const BC_TERM_SRC =
  "(?:the\\s+)?(?:pill|mini[-\\s]?pill|combined\\s+pill|birth\\s+control(?:\\s+pill)?|bc|hormonal\\s+(?:birth\\s+control|bc|iud|contracepti(?:on|ve))|contracepti(?:on|ves?)|nuvaring|the\\s+ring|the\\s+patch|nexplanon|the\\s+implant|implant|depo(?:[-\\s]provera)?|mirena|kyleena|skyla|liletta|iud|coil)";

/** Question / hypothetical shaped talk — never flips anything. */
export function isHypotheticalOrQuestion(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  return (
    /^(?:what|would|could|should|can|do|does|is|are|if|how|why|when)\b/i.test(t) ||
    /\b(?:what\s+if|if\s+i\s+(?:had|were|got|was)|hypothetically|in\s+theory|suppose|supposing|should\s+i\s+get|thinking\s+about\s+getting|considering\s+(?:an?\s+)?iud|what\s+would\s+happen)\b/i.test(t) ||
    /\?\s*$/.test(t)
  );
}

export type BcDetection = {
  /** She is on hormonal birth control (device/method named affirmatively). */
  bcPositive: boolean;
  /** She describes having no real period (or spotting only). */
  noRealPeriod: boolean;
  /** Either of the above — she should not be run through cycling phase math. */
  irregular: boolean;
};

const NONE: BcDetection = { bcPositive: false, noRealPeriod: false, irregular: false };

export function detectBcOrNoPeriod(text: string): BcDetection {
  const msg = (text || "").trim();
  if (!msg || isHypotheticalOrQuestion(msg)) return NONE;

  const BC = BC_TERM_SRC;

  // --- Explicitly NOT on hormonal BC → never fire here.
  const bcNegative =
    new RegExp(`\\bi\\s+(?:don'?t|do\\s+not)\\s+(?:use|take|have)\\s+(?:any\\s+)?${BC}\\b`, "i").test(msg) ||
    new RegExp(`\\bi'?m\\s+not\\s+(?:currently\\s+)?(?:on|using|taking)\\s+(?:any\\s+)?${BC}\\b`, "i").test(msg) ||
    new RegExp(`\\bi\\s+(?:came|went|got)\\s+off\\s+(?:of\\s+)?${BC}\\b`, "i").test(msg) ||
    new RegExp(`\\b(?:i\\s+)?(?:had|got)\\s+(?:my|the)\\s+${BC}\\s+(?:taken\\s+out|removed)\\b`, "i").test(msg);
  if (bcNegative) return NONE;

  // --- Declarative: "I'm on the pill", "I got an IUD", "I have a hormonal IUD"
  const declarative =
    new RegExp(`\\b(?:i'?m|i\\s+am|just\\s+(?:started|got)|started|recently\\s+started|switched\\s+to|now\\s+on|currently\\s+on|going\\s+on)\\s+(?:on\\s+)?${BC}\\b`, "i").test(msg) ||
    new RegExp(`\\b(?:i\\s+have|i'?ve\\s+got|got|just\\s+got|just\\s+had)\\s+(?:an?\\s+)?(?:hormonal\\s+)?${BC}\\b`, "i").test(msg) ||
    new RegExp(`\\b(?:change|switch|update|set)\\s+(?:my\\s+)?(?:settings?|account|life\\s+stage|profile)\\s+(?:to|for)\\s+(?:hormonal\\s+(?:birth\\s+control|bc)|birth\\s+control|irregular|the\\s+pill|iud)\\b`, "i").test(msg);

  // --- Descriptive "no real period" phrasing.
  // e.g. "I don't really get a period", "no period since my IUD",
  //      "my periods stopped with the coil", "haven't had a period in months"
  const noPeriodPhrase =
    /\b(?:i\s+)?(?:don'?t|do\s+not|hardly|barely|rarely)\s+(?:really\s+)?(?:get|have)\s+(?:a\s+|my\s+|any\s+|real\s+)*periods?\b/i.test(msg) ||
    /\b(?:i\s+)?(?:haven'?t|have\s+not|hasn'?t)\s+(?:had|gotten)\s+(?:a\s+|my\s+|any\s+)?(?:real\s+)?periods?\b/i.test(msg) ||
    /\bno\s+(?:real\s+|proper\s+|actual\s+|true\s+)?periods?\b/i.test(msg) ||
    /\b(?:my\s+)?periods?\s+(?:have\s+|has\s+)?(?:stopped|gone\s+away|disappeared|went\s+away)\b/i.test(msg) ||
    /\bwithout\s+(?:a\s+|my\s+|any\s+)?periods?\b/i.test(msg);

  // --- Spotting / staining only (implies no true bleed to anchor a cycle on).
  const spottingOnly =
    /\b(?:only|just|some|a\s+bit\s+of|a\s+little)\s+(?:light\s+)?(?:spotting|staining|stains?|brown\s+discharge)\b/i.test(msg) ||
    (/\b(?:spotting|staining)\b/i.test(msg) &&
      /\b(?:no|not\s+a|never\s+a)\s+(?:real|proper|actual|true|full)?\s*periods?\b/i.test(msg));

  const mentionsBc = new RegExp(`\\b${BC}\\b`, "i").test(msg);

  const noRealPeriod = noPeriodPhrase || spottingOnly;
  const bcPositive = declarative || ((noRealPeriod) && mentionsBc);
  const irregular = bcPositive || noRealPeriod;

  return { bcPositive, noRealPeriod, irregular };
}
