// Guardrails for a woman's own symptom word before it can be shared in Together.
// Same rules as the symptom library (length, all caps, blocklist, links), made Unicode-aware:
// apostrophes ("can't sleep") and non-English words (Hebrew, Arabic, ...) are valid.
// A word is never rewritten here. It either passes as typed (spaces tidied) or is refused.

export const MAX_WORD_LENGTH = 60;
export const MIN_WORD_LETTERS = 2;
export const MAX_NEW_WORDS_PER_DAY = 3;

export type WordGuardReason = "too_short" | "too_long" | "all_caps" | "link" | "contact" | "number" | "blocked_term" | "not_words";
export type WordGuardResult = { ok: true; value: string } | { ok: false; reason: WordGuardReason; value: string };

const LINK = /(https?:\/\/|www\.|(^|[^\p{L}\p{N}])[\p{L}\p{N}-]+\.(com|net|org|io|ru|xyz|shop|link|co|me|app|dev|info|biz|il|uk)(?![\p{L}]))/iu;
const EMAIL_OR_HANDLE = /\S+@\S+|(^|\s)@[\p{L}\p{N}_]{2,}/u;
const LONG_DIGITS = /(\p{Nd}[\s().+-]*){7,}/u;
const ANY_DIGIT = /\p{Nd}/u;

// Same blunt list as the symptom library, matched from the start of a word so "grape" is fine.
export const BLOCKED_TERMS = [
  "fuck", "shit", "bitch", "cunt", "asshole", "bastard", "dick", "pussy",
  "whore", "slut", "nigger", "faggot", "rape", "porn", "xxx", "sex cam",
  "viagra", "cialis", "casino", "crypto", "bitcoin", "forex", "free money",
  "click here", "buy now", "subscribe", "discount", "promo code", "telegram",
  "whatsapp me", "dm me", "follow me", "http", "www",
];
const BLOCKED = new RegExp(`(?<![\\p{L}])(${BLOCKED_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "iu");

/** Same rule as the server's together_norm (lowercase, single spaces, simple plural merge). */
export function togetherNorm(s: string): string {
  const n = String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  if (n.length > 4 && n.endsWith("ies")) return n.slice(0, -3) + "y";
  if (n.length > 3 && n.endsWith("s") && !/(ss|us|is)$/.test(n)) return n.slice(0, -1);
  return n;
}

export function guardWord(raw: string): WordGuardResult {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  const bad = (reason: WordGuardReason): WordGuardResult => ({ ok: false, reason, value });
  if (value.length > MAX_WORD_LENGTH) return bad("too_long");
  if (EMAIL_OR_HANDLE.test(value)) return bad("contact");
  if (LINK.test(value)) return bad("link");
  if (ANY_DIGIT.test(value)) return bad(LONG_DIGITS.test(value) ? "contact" : "number");
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return bad("not_words");
  if (letters.length < MIN_WORD_LETTERS) return bad("too_short");
  const latin = value.replace(/[^A-Za-z]/g, "");
  if (latin.length >= 4 && latin.length === letters.length && latin === latin.toUpperCase()) return bad("all_caps");
  if (BLOCKED.test(value)) return bad("blocked_term");
  return { ok: true, value };
}
